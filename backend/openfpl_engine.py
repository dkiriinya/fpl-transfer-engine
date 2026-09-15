"""
OpenFPL Predictive Forecasting Engine
Calculates true expected points (xP) and expected minutes (xM) per gameweek
using fixture-adjusted expected goal involvement (xGI), Poisson clean sheet
probabilities, and positional scoring rules.
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
    return psycopg2.connect(DATABASE_URL, cursor_factory=psycopg2.extras.RealDictCursor)


def fetch_live_fpl_data() -> Tuple[dict, list]:
    """Fetch official bootstrap-static and fixtures from FPL API."""
    headers = {"User-Agent": "FPL-Decision-Engine/2.0 (OpenFPL-Predictor)"}
    with httpx.Client(timeout=15.0) as client:
        b_res = client.get(f"{FPL_BASE}/bootstrap-static/", headers=headers)
        b_res.raise_for_status()
        bootstrap = b_res.json()

        f_res = client.get(f"{FPL_BASE}/fixtures/", headers=headers)
        f_res.raise_for_status()
        fixtures = f_res.json()

    return bootstrap, fixtures


def calculate_expected_minutes(player: dict) -> float:
    """
    Calculate player expected minutes based on status, chance of playing,
    and historical rotation patterns.
    """
    status = player.get("status", "a")
    chance_raw = player.get("chance_of_playing_next_round")

    if chance_raw is not None:
        chance = float(chance_raw) / 100.0
    elif status == "a":
        chance = 1.0
    elif status == "d":
        chance = 0.75
    elif status in ("s", "i", "u"):
        chance = 0.0
    else:
        chance = 0.5

    if chance <= 0.0:
        return 0.0

    minutes = float(player.get("minutes") or 0.0)
    starts = float(player.get("starts") or 0.0)

    # Base minutes expectation
    if starts >= 2:
        # Regular starter
        avg_mins = minutes / starts if starts > 0 else 85.0
        base_mins = max(70.0, min(90.0, avg_mins))
    elif starts == 1:
        base_mins = 65.0
    elif minutes > 45:
        # Regular impact substitute
        base_mins = 30.0
    else:
        # Deep reserve / sporadic
        base_mins = 10.0 if status == "a" else 0.0

    return round(base_mins * chance, 1)


def calculate_single_fixture_xp(
    player: dict,
    fixture: dict,
    is_home: bool,
    team_info: dict,
    opponent_info: dict,
    expected_mins: float,
) -> float:
    """
    OpenFPL scoring model for a single fixture:
    - Fixture attacking coefficient: team_attack / opp_defence
    - Goal expectancy: xG90 * (xM / 90) * offence_coeff
    - Assist expectancy: xA90 * (xM / 90) * offence_coeff
    - Poisson clean sheet probability: exp(-lambda)
    - Conceded goal penalties & bonus estimation
    """
    if expected_mins <= 0.0:
        return 0.0

    pos = int(player.get("element_type", 3))  # 1=GKP, 2=DEF, 3=MID, 4=FWD
    now_cost = float(player.get("now_cost", 50)) / 10.0

    # Team strengths
    team_att = float(team_info.get("strength_attack_home" if is_home else "strength_attack_away") or 1100)
    team_def = max(1.0, float(team_info.get("strength_defence_home" if is_home else "strength_defence_away") or 1100))
    opp_att = float(opponent_info.get("strength_attack_away" if is_home else "strength_attack_home") or 1100)
    opp_def = max(1.0, float(opponent_info.get("strength_defence_away" if is_home else "strength_defence_home") or 1100))

    # Attacking & defensive scaling
    offence_ratio = max(0.6, min(1.8, team_att / opp_def))
    home_boost = 1.08 if is_home else 0.92
    offence_factor = offence_ratio * home_boost

    # Base xG90 / xA90 from FPL
    raw_xg90 = float(player.get("expected_goals_per_90") or 0.0)
    raw_xa90 = float(player.get("expected_assists_per_90") or 0.0)

    # Bayesian positional priors to avoid zero-sample distortion
    pos_priors = {
        1: (0.00, 0.01),   # GKP
        2: (0.05, 0.08),   # DEF
        3: (0.18, 0.15),   # MID
        4: (0.35, 0.15),   # FWD
    }
    prior_xg, prior_xa = pos_priors.get(pos, (0.15, 0.12))

    # Weight player stats vs prior (more minutes = more weight on actual stats)
    mins_played = float(player.get("minutes") or 0.0)
    sample_weight = min(1.0, mins_played / 270.0)  # full weight after ~3 games
    xg90 = (raw_xg90 * sample_weight) + (prior_xg * (1.0 - sample_weight))
    xa90 = (raw_xa90 * sample_weight) + (prior_xa * (1.0 - sample_weight))

    # Cost-adjusted floor for premium attackers
    if pos in (3, 4) and now_cost >= 7.0:
        xg90 = max(xg90, 0.22)
        xa90 = max(xa90, 0.18)

    # Match xG / xA
    mins_factor = expected_mins / 90.0
    fixture_xg = xg90 * mins_factor * offence_factor
    fixture_xa = xa90 * mins_factor * offence_factor

    # 1. Appearance Points
    if expected_mins >= 60.0:
        appearance_pts = 2.0
    else:
        appearance_pts = max(0.5, round((expected_mins / 60.0) * 2.0, 2))

    # 2. Attacking Points (by position)
    goal_pts_map = {1: 10.0, 2: 6.0, 3: 5.0, 4: 4.0}
    goal_pts = fixture_xg * goal_pts_map.get(pos, 5.0)
    assist_pts = fixture_xa * 3.0

    # 3. Clean Sheet Probability (Poisson model: P(CS) = exp(-lambda))
    lambda_conceded = 1.32 * (opp_att / team_def) * (0.86 if is_home else 1.15)
    lambda_conceded = max(0.35, min(3.2, lambda_conceded))
    p_clean_sheet = math.exp(-lambda_conceded)

    # Clean Sheet Points
    cs_prob_eligible = min(1.0, expected_mins / 60.0)
    if pos in (1, 2):
        clean_sheet_pts = 4.0 * p_clean_sheet * cs_prob_eligible
        # Goals conceded deduction (-1 per 2 goals)
        conceded_penalty = -0.5 * max(0.0, lambda_conceded - 1.0) * mins_factor
    elif pos == 3:
        clean_sheet_pts = 1.0 * p_clean_sheet * cs_prob_eligible
        conceded_penalty = 0.0
    else:
        clean_sheet_pts = 0.0
        conceded_penalty = 0.0

    # 4. Bonus Points Potential (BPS model)
    # Attackers with high xGI generate much higher bonus expectation
    bonus_factor = {1: 0.15, 2: 0.20, 3: 0.35, 4: 0.40}.get(pos, 0.25)
    bonus_pts = (fixture_xg * 1.5 + fixture_xa * 1.0) * bonus_factor + (p_clean_sheet * 0.25 if pos in (1, 2) else 0.0)

    # 5. Discipline deduction (yellow/red card risk)
    card_penalty = -0.15 * mins_factor

    total_pts = (
        appearance_pts
        + goal_pts
        + assist_pts
        + clean_sheet_pts
        + conceded_penalty
        + bonus_pts
        + card_penalty
    )

    return max(0.0, round(total_pts, 2))


def generate_openfpl_projections(
    start_gw: Optional[int] = None,
    horizon: int = 5,
) -> Dict[str, Any]:
    """
    Generates multi-gameweek fixture-based OpenFPL predictions
    and returns projections ready for database insertion.
    """
    logger.info("Fetching FPL API live data...")
    bootstrap, fixtures = fetch_live_fpl_data()

    elements = bootstrap.get("elements", [])
    events = bootstrap.get("events", [])
    teams = bootstrap.get("teams", [])

    teams_map = {t["id"]: t for t in teams}

    # Resolve start gameweek
    if start_gw is None:
        next_event = next((e for e in events if e.get("is_next")), None)
        curr_event = next((e for e in events if e.get("is_current")), None)
        if next_event:
            start_gw = next_event["id"]
        elif curr_event and not curr_event.get("finished"):
            start_gw = curr_event["id"]
        elif curr_event:
            start_gw = curr_event["id"] + 1
        else:
            start_gw = 4

    end_gw = start_gw + horizon - 1
    target_gws = list(range(start_gw, end_gw + 1))
    logger.info(f"Generating OpenFPL projections for GW{start_gw} to GW{end_gw} ({horizon} GWs)")

    # Group upcoming fixtures by gameweek and team
    # Map: (team_id, gameweek) -> List of (fixture, is_home, opponent_team_id)
    team_fixtures_map: Dict[Tuple[int, int], List[Tuple[dict, bool, int]]] = {}
    for f in fixtures:
        gw = f.get("event")
        if gw and start_gw <= gw <= end_gw and not f.get("finished"):
            h_team = f["team_h"]
            a_team = f["team_a"]
            team_fixtures_map.setdefault((h_team, gw), []).append((f, True, a_team))
            team_fixtures_map.setdefault((a_team, gw), []).append((f, False, h_team))

    projections_to_insert = []

    for player in elements:
        pid = player["id"]
        team_id = player["team"]
        team_info = teams_map.get(team_id, {})

        x_mins = calculate_expected_minutes(player)

        for gw in target_gws:
            fixtures_in_gw = team_fixtures_map.get((team_id, gw), [])

            if not fixtures_in_gw:
                # Blank Gameweek (BGW)
                gw_xp = 0.0
                gw_xm = 0.0
            else:
                # Can be 1 fixture (standard) or 2 fixtures (Double Gameweek)
                gw_xp = 0.0
                gw_xm = x_mins * len(fixtures_in_gw)
                for f, is_home, opp_id in fixtures_in_gw:
                    opp_info = teams_map.get(opp_id, {})
                    f_xp = calculate_single_fixture_xp(
                        player=player,
                        fixture=f,
                        is_home=is_home,
                        team_info=team_info,
                        opponent_info=opp_info,
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
        "horizon": horizon,
        "total_players": len(elements),
        "projections": projections_to_insert,
    }


def save_projections_to_db(projections: List[dict]) -> int:
    """Upsert projections into Neon PostgreSQL table player_projections."""
    query = """
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
            psycopg2.extras.execute_batch(cur, query, projections, page_size=500)
            conn.commit()
            return len(projections)
    finally:
        conn.close()


def run_openfpl_pipeline(start_gw: Optional[int] = None, horizon: int = 5) -> Dict[str, Any]:
    """Complete end-to-end execution of OpenFPL forecast and DB persistence."""
    data = generate_openfpl_projections(start_gw=start_gw, horizon=horizon)
    written = save_projections_to_db(data["projections"])
    logger.info(f"Successfully upserted {written} OpenFPL projections into PostgreSQL")

    return {
        "status": "success",
        "start_gw": data["start_gw"],
        "end_gw": data["end_gw"],
        "horizon": data["horizon"],
        "total_players": data["total_players"],
        "projections_written": written,
    }


if __name__ == "__main__":
    res = run_openfpl_pipeline(start_gw=4, horizon=5)
    print(res)
