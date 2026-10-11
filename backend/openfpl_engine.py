"""
OpenFPL Predictive Forecasting Engine (v3.0 — Multi-Factor Ensemble)
Calculates expected points (xP) and expected minutes (xM) per gameweek by combining:
1. Real team attacking (GF/g) & defensive (GA/g) performance + official FPL Fixture Difficulty (FDR)
2. Equal blend of actual Goals/Assists per 90 and underlying xG90/xA90
3. Clinical finishing / conversion efficiency multiplier (actual GI vs expected GI)
4. Empirical Form & Season Points-Per-Game (PPG) anchor with cold-streak & consistency modifiers
5. Actual Bonus & BPS per 90 rates + ICT Index involvement + active set-piece duty
6. 2025/26+ FPL Defensive Contribution bonus (+2 pts for 10+ DEF / 12+ MID,FWD actions)
7. Poisson clean sheet probability, goals conceded deductions, and goalkeeper save points
"""

import os
import math
import logging
from typing import Dict, List, Any, Optional, Tuple

import httpx
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

if os.path.exists(".env"):
    load_dotenv(".env")
elif os.path.exists("../.env"):
    load_dotenv("../.env")
logger = logging.getLogger(__name__)

DATABASE_URL = os.environ.get("DATABASE_URL")
FPL_BASE = "https://fantasy.premierleague.com/api"


def get_db_connection():
    return psycopg2.connect(DATABASE_URL, connect_timeout=5, cursor_factory=psycopg2.extras.RealDictCursor)


def fetch_live_fpl_data() -> Tuple[dict, list]:
    """Fetch official bootstrap-static and fixtures from FPL API."""
    headers = {"User-Agent": "FPL-Decision-Engine/3.0 (OpenFPL-MultiFactor)"}
    with httpx.Client(timeout=15.0) as client:
        b_res = client.get(f"{FPL_BASE}/bootstrap-static/", headers=headers)
        b_res.raise_for_status()
        bootstrap = b_res.json()

        f_res = client.get(f"{FPL_BASE}/fixtures/", headers=headers)
        f_res.raise_for_status()
        fixtures = f_res.json()

    return bootstrap, fixtures


def compute_team_ratings(teams: List[dict], fixtures: List[dict]) -> Dict[int, Dict[str, Any]]:
    """
    Computes data-driven team attacking (GF/game) and defensive (GA/game) ratings
    from finished/provisional fixtures smoothed with league table priors.
    Fixes the FPL API issue where strength_attack_* and strength_defence_* are 0.
    """
    team_stats: Dict[int, Dict[str, Any]] = {}
    for t in teams:
        tid = t["id"]
        pos_rank = float(t.get("position") or 10)
        # Prior GF/GA per match from league table standing
        prior_gf = 1.95 - (pos_rank - 1.0) * (0.95 / 19.0)
        prior_ga = 0.90 + (pos_rank - 1.0) * (0.95 / 19.0)
        team_stats[tid] = {
            "id": tid,
            "name": t["name"],
            "short_name": t["short_name"],
            "gf": 0.0,
            "ga": 0.0,
            "gp": 0.0,
            "prior_gf": prior_gf,
            "prior_ga": prior_ga,
        }

    for f in fixtures:
        if f.get("finished") or f.get("finished_provisional"):
            th, ta = f.get("team_h"), f.get("team_a")
            sh = float(f.get("team_h_score") or 0.0)
            sa = float(f.get("team_a_score") or 0.0)
            if th in team_stats:
                team_stats[th]["gf"] += sh
                team_stats[th]["ga"] += sa
                team_stats[th]["gp"] += 1.0
            if ta in team_stats:
                team_stats[ta]["gf"] += sa
                team_stats[ta]["ga"] += sh
                team_stats[ta]["gp"] += 1.0

    for tid, st in team_stats.items():
        gp = st["gp"]
        w = min(1.0, gp / 6.0)
        actual_gf = (st["gf"] / gp) if gp > 0 else st["prior_gf"]
        actual_ga = (st["ga"] / gp) if gp > 0 else st["prior_ga"]
        st["att_rating"] = round(w * actual_gf + (1.0 - w) * st["prior_gf"], 3)
        st["def_weakness"] = round(w * actual_ga + (1.0 - w) * st["prior_ga"], 3)

    avg_att = sum(s["att_rating"] for s in team_stats.values()) / max(1, len(team_stats))
    avg_def = sum(s["def_weakness"] for s in team_stats.values()) / max(1, len(team_stats))

    for tid, st in team_stats.items():
        st["avg_att"] = avg_att
        st["avg_def"] = avg_def
        # Also compute 950-1350 integer strength ratings for DB persistence
        att_scale = st["att_rating"] / max(0.6, avg_att)
        def_scale = max(0.6, avg_def) / max(0.5, st["def_weakness"])
        st["strength_attack_home"] = int(round(max(900, min(1400, 1120 * (att_scale ** 0.35)))))
        st["strength_attack_away"] = int(round(max(900, min(1400, 1080 * (att_scale ** 0.35)))))
        st["strength_defence_home"] = int(round(max(900, min(1400, 1120 * (def_scale ** 0.35)))))
        st["strength_defence_away"] = int(round(max(900, min(1400, 1080 * (def_scale ** 0.35)))))

    return team_stats


def calculate_expected_minutes(player: dict, team_gp: float = 6.0) -> float:
    """
    Calculate player expected minutes using availability, starts share across
    team games played, minutes per start, and recent form.
    Prevents cameo substitutes from getting 90 expected minutes.
    """
    status = player.get("status", "a")
    chance_raw = player.get("chance_of_playing_next_round")

    if chance_raw is not None:
        chance = float(chance_raw) / 100.0
    elif status == "a":
        chance = 1.0
    elif status == "d":
        chance = 0.75
    elif status in ("s", "i", "u", "n"):
        chance = 0.0
    else:
        chance = 0.5

    if chance <= 0.0:
        return 0.0

    minutes = float(player.get("minutes") or 0.0)
    starts = float(player.get("starts") or 0.0)
    eff_gp = max(1.0, team_gp)

    if minutes <= 0.0:
        return 0.0

    start_rate = min(1.0, starts / eff_gp)
    mins_per_team_game = min(90.0, minutes / eff_gp)
    avg_start_mins = min(90.0, minutes / max(1.0, starts))
    form_val = float(player.get("form") or 0.0)

    if starts >= eff_gp:
        # Started every match for their club
        base_mins = max(75.0, avg_start_mins)
    elif starts >= eff_gp - 1.0 and avg_start_mins >= 78.0 and form_val >= 4.0:
        # First-choice starter who missed at most 1 match and is in active form
        base_mins = max(74.0, 0.75 * avg_start_mins + 0.25 * mins_per_team_game)
    elif starts >= 2.0:
        # Rotation starter or frequent substitute
        base_mins = 0.65 * mins_per_team_game + 0.35 * (avg_start_mins * start_rate)
    elif starts == 1.0:
        base_mins = max(20.0, mins_per_team_game)
    elif minutes >= 45.0:
        base_mins = min(30.0, max(12.0, mins_per_team_game))
    else:
        base_mins = 6.0 if status == "a" else 0.0

    return round(min(90.0, base_mins) * chance, 1)


def calculate_single_fixture_xp(
    player: dict,
    fixture: dict,
    is_home: bool,
    team_stat: dict,
    opp_stat: dict,
    expected_mins: float,
) -> float:
    """
    Multi-Factor OpenFPL scoring model for a single fixture:
    - Real team GF/GA + official FPL Fixture Difficulty (FDR)
    - 50/50 blend of actual G90/A90 and expected xG90/xA90
    - Finishing/conversion efficiency modifier (actual returns vs xGI)
    - Clean sheet Poisson model + goalkeeper saves + 2025/26+ defensive contribution points
    - Actual bonus/BPS rate + ICT index + active penalty duty
    - Empirical Form & PPG anchor with cold-streak penalty and consistency bonus
    """
    if expected_mins <= 0.0:
        return 0.0

    pos = int(player.get("element_type", 3))  # 1=GKP, 2=DEF, 3=MID, 4=FWD
    mins_played = float(player.get("minutes") or 0.0)
    mins_factor = expected_mins / 90.0
    sample_weight = min(1.0, mins_played / 270.0)

    # ── 1. Team & Fixture Difficulty Scaling (Real GF/GA + Official FDR) ──
    avg_gf = team_stat.get("avg_att", 1.35)
    avg_ga = team_stat.get("avg_def", 1.35)
    team_gf = team_stat.get("att_rating", avg_gf)
    team_ga = team_stat.get("def_weakness", avg_ga)
    opp_gf = opp_stat.get("att_rating", avg_gf)
    opp_ga = opp_stat.get("def_weakness", avg_ga)

    fdr = int(fixture.get("team_h_difficulty" if is_home else "team_a_difficulty") or 3)
    fdr_att_map = {1: 1.16, 2: 1.08, 3: 1.00, 4: 0.90, 5: 0.80}
    fdr_att_mult = fdr_att_map.get(fdr, 1.00)

    team_att_factor = (team_gf / max(0.6, avg_gf)) ** 0.32
    opp_def_factor = (opp_ga / max(0.6, avg_ga)) ** 0.30
    venue_att = 1.05 if is_home else 0.95
    offence_factor = max(0.65, min(1.42, team_att_factor * opp_def_factor * fdr_att_mult * venue_att))

    # ── 2. Blended Actual + Expected Attacking Output & Clinical Conversion ──
    raw_xg90 = min(1.20, float(player.get("expected_goals_per_90") or 0.0))
    raw_xa90 = min(0.90, float(player.get("expected_assists_per_90") or 0.0))

    goals_scored = float(player.get("goals_scored") or 0.0)
    assists = float(player.get("assists") or 0.0)
    actual_g90 = min(1.35, (goals_scored / mins_played) * 90.0) if mins_played >= 60.0 else 0.0
    actual_a90 = min(1.10, (assists / mins_played) * 90.0) if mins_played >= 60.0 else 0.0

    # Equal 50/50 weight between proven actual returns (G90/A90) and underlying xG90/xA90
    blended_g90 = 0.50 * actual_g90 + 0.50 * raw_xg90
    blended_a90 = 0.50 * actual_a90 + 0.50 * raw_xa90

    pos_priors = {
        1: (0.00, 0.01),
        2: (0.04, 0.06),
        3: (0.15, 0.13),
        4: (0.28, 0.11),
    }
    prior_g, prior_a = pos_priors.get(pos, (0.14, 0.11))

    eff_g90 = (blended_g90 * sample_weight) + (prior_g * (1.0 - sample_weight))
    eff_a90 = (blended_a90 * sample_weight) + (prior_a * (1.0 - sample_weight))

    # Finishing / Conversion Efficiency Modifier:
    # Penalizes chronic xGI underperformers and rewards clinical finishers/creators
    total_xgi = float(player.get("expected_goal_involvements") or 0.0)
    actual_gi = goals_scored + assists
    if mins_played >= 180.0 and total_xgi >= 1.0:
        gi_ratio = (actual_gi + 0.8) / (total_xgi + 0.8)
        conversion_mult = max(0.70, min(1.18, gi_ratio ** 0.35))
    else:
        conversion_mult = 1.0

    pen_missed = float(player.get("penalties_missed") or 0.0)
    if pen_missed > 0:
        conversion_mult *= 0.90

    fixture_g = eff_g90 * conversion_mult * mins_factor * offence_factor
    fixture_a = eff_a90 * conversion_mult * mins_factor * offence_factor

    # ── 3. Appearance Points ──
    if expected_mins >= 60.0:
        appearance_pts = 2.0
    else:
        appearance_pts = max(0.4, round((expected_mins / 60.0) * 2.0, 2))

    # ── 4. Goal & Assist Points ──
    goal_pts_map = {1: 10.0, 2: 6.0, 3: 5.0, 4: 4.0}
    goal_pts = fixture_g * goal_pts_map.get(pos, 5.0)
    assist_pts = fixture_a * 3.0

    # ── 5. Clean Sheet & Goals Conceded Model ──
    opp_att_ratio = opp_gf / max(0.6, avg_gf)
    team_def_ratio = team_ga / max(0.6, avg_ga)
    venue_def = 0.88 if is_home else 1.12
    fdr_def_map = {1: 0.78, 2: 0.90, 3: 1.00, 4: 1.16, 5: 1.34}
    lambda_conceded = (
        1.25
        * (opp_att_ratio ** 0.50)
        * (team_def_ratio ** 0.50)
        * venue_def
        * fdr_def_map.get(fdr, 1.0)
    )
    lambda_conceded = max(0.42, min(3.10, lambda_conceded))
    p_clean_sheet = math.exp(-lambda_conceded)

    cs_prob_eligible = min(1.0, expected_mins / 60.0)
    if pos in (1, 2):
        clean_sheet_pts = 4.0 * p_clean_sheet * cs_prob_eligible
        conceded_penalty = -0.5 * max(0.0, lambda_conceded - 0.85) * mins_factor
    elif pos == 3:
        clean_sheet_pts = 1.0 * p_clean_sheet * cs_prob_eligible
        conceded_penalty = 0.0
    else:
        clean_sheet_pts = 0.0
        conceded_penalty = 0.0

    saves_per_90 = float(player.get("saves_per_90") or 0.0)
    save_pts = (saves_per_90 / 3.0) * mins_factor if pos == 1 else 0.0

    # ── 6. 2025/26+ Defensive Contribution Points (+2 pts for 10+ DEF / 12+ MID,FWD) ──
    def_contrib_90 = float(player.get("defensive_contribution_per_90") or 0.0)
    if pos == 2:
        p_def_bonus = min(0.60, max(0.0, (def_contrib_90 - 4.5) / 10.0)) * cs_prob_eligible
        def_contrib_pts = 2.0 * p_def_bonus
    elif pos in (3, 4):
        p_def_bonus = min(0.50, max(0.0, (def_contrib_90 - 5.5) / 11.0)) * cs_prob_eligible
        def_contrib_pts = 2.0 * p_def_bonus
    else:
        def_contrib_pts = 0.0

    # ── 7. Actual Bonus / BPS + ICT Involvement ──
    actual_bonus = float(player.get("bonus") or 0.0)
    actual_bps = float(player.get("bps") or 0.0)
    bonus_per_90 = min(1.5, (actual_bonus / mins_played) * 90.0) if mins_played >= 90.0 else 0.0
    bps_per_90 = min(42.0, (actual_bps / mins_played) * 90.0) if mins_played >= 90.0 else 12.0

    model_bonus = (fixture_g * 1.25 + fixture_a * 0.85) * {1: 0.15, 2: 0.25, 3: 0.35, 4: 0.40}.get(pos, 0.25)
    empirical_bonus = (0.60 * bonus_per_90 + 0.40 * max(0.0, (bps_per_90 - 15.0) / 20.0)) * mins_factor
    bonus_pts = sample_weight * (0.55 * empirical_bonus + 0.45 * model_bonus) + (1.0 - sample_weight) * model_bonus

    form_val = float(player.get("form") or 0.0)
    ppg_val = float(player.get("points_per_game") or 0.0)
    ict_per_90 = min(14.0, (float(player.get("ict_index") or 0.0) / mins_played) * 90.0) if mins_played >= 90.0 else 3.0
    ict_pts = max(0.0, (ict_per_90 - 4.0) * 0.035) * mins_factor

    pen_order = player.get("penalties_order")
    set_piece_pts = 0.15 * mins_factor if (pen_order == 1 and form_val >= 3.5 and pen_missed == 0) else 0.0

    card_penalty = -0.12 * mins_factor

    component_xp = (
        appearance_pts
        + goal_pts
        + assist_pts
        + clean_sheet_pts
        + conceded_penalty
        + save_pts
        + def_contrib_pts
        + bonus_pts
        + ict_pts
        + set_piece_pts
        + card_penalty
    )

    # ── 8. Empirical Form & PPG Anchor (Regressed to Mean + Fixture Adjusted) ──
    regressed_form = form_val if form_val <= 6.0 else (6.0 + 0.55 * (form_val - 6.0))
    regressed_ppg = ppg_val if ppg_val <= 6.0 else (6.0 + 0.65 * (ppg_val - 6.0))
    empirical_rate = 0.55 * regressed_form + 0.45 * regressed_ppg

    if pos in (1, 2):
        raw_scalar = 0.55 * (1.25 / max(0.65, lambda_conceded)) + 0.45 * offence_factor
    else:
        raw_scalar = offence_factor
    fixture_scalar = max(0.80, min(1.18, 1.0 + 0.55 * (raw_scalar - 1.0)))

    empirical_xp = empirical_rate * fixture_scalar * min(1.0, expected_mins / 78.0)

    # Cold-streak penalty for regular starters who repeatedly blank (form <= 2.6)
    cold_penalty = 0.0
    if mins_played >= 270.0 and form_val <= 2.6:
        cold_penalty = -0.45 * (2.7 - form_val)

    # Consistency bonus for players delivering in both recent form AND season PPG
    consistency_bonus = 0.0
    if mins_played >= 270.0 and form_val >= 5.5 and ppg_val >= 5.5:
        consistency_bonus = min(0.55, 0.10 * ((0.5 * regressed_form + 0.5 * regressed_ppg) - 5.0))

    blend_w = 0.42 * sample_weight
    total_pts = (1.0 - blend_w) * component_xp + (blend_w * empirical_xp) + cold_penalty + consistency_bonus

    return max(0.0, round(total_pts, 2))


def generate_openfpl_projections(
    start_gw: Optional[int] = None,
    horizon: int = 8,
) -> Dict[str, Any]:
    """
    Generates multi-gameweek fixture-based OpenFPL predictions
    and returns projections + live team/player metadata ready for database persistence.
    """
    logger.info("Fetching FPL API live data...")
    bootstrap, fixtures = fetch_live_fpl_data()

    elements = bootstrap.get("elements", [])
    events = bootstrap.get("events", [])
    teams = bootstrap.get("teams", [])

    team_stats = compute_team_ratings(teams, fixtures)

    # Resolve start gameweek
    if start_gw is None:
        next_event = next((e for e in events if e.get("is_next")), None)
        curr_event = next((e for e in events if e.get("is_current")), None)
        if curr_event and not curr_event.get("finished"):
            start_gw = curr_event["id"]
        elif next_event:
            start_gw = next_event["id"]
        elif curr_event:
            start_gw = curr_event["id"] + 1
        else:
            start_gw = 6

    end_gw = min(38, start_gw + horizon - 1)
    target_gws = list(range(start_gw, end_gw + 1))
    logger.info(f"Generating Multi-Factor OpenFPL projections for GW{start_gw} to GW{end_gw} ({len(target_gws)} GWs)")

    # Group fixtures by gameweek and team (including current GW even if partially finished so GW lookup works)
    team_fixtures_map: Dict[Tuple[int, int], List[Tuple[dict, bool, int]]] = {}
    for f in fixtures:
        gw = f.get("event")
        if gw and start_gw <= gw <= end_gw:
            h_team = f["team_h"]
            a_team = f["team_a"]
            team_fixtures_map.setdefault((h_team, gw), []).append((f, True, a_team))
            team_fixtures_map.setdefault((a_team, gw), []).append((f, False, h_team))

    projections_to_insert = []
    players_to_sync = []

    for player in elements:
        pid = player["id"]
        team_id = player["team"]
        t_stat = team_stats.get(team_id, {})

        players_to_sync.append({
            "id": pid,
            "web_name": player.get("web_name", ""),
            "first_name": player.get("first_name", ""),
            "second_name": player.get("second_name", ""),
            "team_id": team_id,
            "position": int(player.get("element_type", 3)),
            "now_cost": round(float(player.get("now_cost", 40)) / 10.0, 1),
            "status": player.get("status", "a"),
            "chance_of_playing": player.get("chance_of_playing_next_round"),
            "news": player.get("news", "") or "",
            "selected_by_percent": float(player.get("selected_by_percent") or 0.0),
        })

        x_mins = calculate_expected_minutes(player, t_stat.get("gp", 6.0))

        for gw in target_gws:
            fixtures_in_gw = team_fixtures_map.get((team_id, gw), [])

            if not fixtures_in_gw:
                gw_xp = 0.0
                gw_xm = 0.0
            else:
                gw_xp = 0.0
                gw_xm = x_mins * len(fixtures_in_gw)
                for f, is_home, opp_id in fixtures_in_gw:
                    opp_stat = team_stats.get(opp_id, {})
                    f_xp = calculate_single_fixture_xp(
                        player=player,
                        fixture=f,
                        is_home=is_home,
                        team_stat=t_stat,
                        opp_stat=opp_stat,
                        expected_mins=x_mins,
                    )
                    gw_xp += f_xp

            projections_to_insert.append({
                "player_id": pid,
                "gameweek": gw,
                "expected_points": round(gw_xp, 2),
                "expected_minutes": round(gw_xm, 1),
                "source": "openfpl_ai",
            })

    return {
        "start_gw": start_gw,
        "end_gw": end_gw,
        "horizon": len(target_gws),
        "total_players": len(elements),
        "teams_to_sync": list(team_stats.values()),
        "players_to_sync": players_to_sync,
        "projections": projections_to_insert,
    }


def save_projections_to_db(
    projections: List[dict],
    teams_to_sync: Optional[List[dict]] = None,
    players_to_sync: Optional[List[dict]] = None,
) -> int:
    """Upsert teams, players, and multi-factor projections into Neon PostgreSQL."""
    team_query = """
        INSERT INTO teams (id, name, short_name, strength_attack_home, strength_attack_away, strength_defence_home, strength_defence_away)
        VALUES (%(id)s, %(name)s, %(short_name)s, %(strength_attack_home)s, %(strength_attack_away)s, %(strength_defence_home)s, %(strength_defence_away)s)
        ON CONFLICT (id)
        DO UPDATE SET
            name = EXCLUDED.name,
            short_name = EXCLUDED.short_name,
            strength_attack_home = EXCLUDED.strength_attack_home,
            strength_attack_away = EXCLUDED.strength_attack_away,
            strength_defence_home = EXCLUDED.strength_defence_home,
            strength_defence_away = EXCLUDED.strength_defence_away;
    """
    player_query = """
        INSERT INTO players (id, web_name, first_name, second_name, team_id, position, now_cost, status, chance_of_playing, news, selected_by_percent, updated_at)
        VALUES (%(id)s, %(web_name)s, %(first_name)s, %(second_name)s, %(team_id)s, %(position)s, %(now_cost)s, %(status)s, %(chance_of_playing)s, %(news)s, %(selected_by_percent)s, NOW())
        ON CONFLICT (id)
        DO UPDATE SET
            web_name = EXCLUDED.web_name,
            first_name = EXCLUDED.first_name,
            second_name = EXCLUDED.second_name,
            team_id = EXCLUDED.team_id,
            position = EXCLUDED.position,
            now_cost = EXCLUDED.now_cost,
            status = EXCLUDED.status,
            chance_of_playing = EXCLUDED.chance_of_playing,
            news = EXCLUDED.news,
            selected_by_percent = EXCLUDED.selected_by_percent,
            updated_at = NOW();
    """
    proj_query = """
        INSERT INTO player_projections (player_id, gameweek, expected_points, expected_minutes, source, updated_at)
        VALUES (%(player_id)s, %(gameweek)s, %(expected_points)s, %(expected_minutes)s, %(source)s, NOW())
        ON CONFLICT (player_id, gameweek, source)
        DO UPDATE SET
            expected_points = EXCLUDED.expected_points,
            expected_minutes = EXCLUDED.expected_minutes,
            updated_at = NOW();
    """
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            if teams_to_sync:
                psycopg2.extras.execute_batch(cur, team_query, teams_to_sync, page_size=50)
            if players_to_sync:
                psycopg2.extras.execute_batch(cur, player_query, players_to_sync, page_size=500)
            psycopg2.extras.execute_batch(cur, proj_query, projections, page_size=500)
            conn.commit()
            return len(projections)
    finally:
        conn.close()


def run_openfpl_pipeline(start_gw: Optional[int] = None, horizon: int = 8) -> Dict[str, Any]:
    """Complete end-to-end execution of OpenFPL multi-factor forecast and DB persistence."""
    data = generate_openfpl_projections(start_gw=start_gw, horizon=horizon)
    written = save_projections_to_db(
        projections=data["projections"],
        teams_to_sync=data.get("teams_to_sync"),
        players_to_sync=data.get("players_to_sync"),
    )
    logger.info(f"Successfully upserted {written} multi-factor OpenFPL projections into PostgreSQL")

    return {
        "status": "success",
        "start_gw": data["start_gw"],
        "end_gw": data["end_gw"],
        "horizon": data["horizon"],
        "total_players": data["total_players"],
        "projections_written": written,
    }


if __name__ == "__main__":
    res = run_openfpl_pipeline(start_gw=6, horizon=8)
    print(res)
