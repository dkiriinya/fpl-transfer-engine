"""
FPL Transfer Decision Engine — Backend Solver Microservice
FastAPI + PuLP MILP solver. Reads from Neon PostgreSQL tables.
Supports multi-gameweek horizons (1, 3, 5 GWs) and multi-chip simulation:
Standard, Wildcard, Free Hit, Bench Boost, Triple Captain.
"""

import os
import logging
from contextlib import asynccontextmanager
from typing import Optional, List, Dict, Tuple, Any

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import pulp
from openfpl_engine import run_openfpl_pipeline

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

DATABASE_URL = os.environ["DATABASE_URL"]

# ─────────────────────────────────────────────────────────────────────────────
# Pydantic Schemas
# ─────────────────────────────────────────────────────────────────────────────

class OptimizeRequest(BaseModel):
    team_id: int
    gameweek: int
    current_squad: List[int]      # 15 FPL player element IDs
    bank: float                    # Available budget in millions
    free_transfers: int            # 1 or 2
    wildcard_active: bool = False
    chip: Optional[str] = "none"   # "none" | "wildcard" | "freehit" | "benchboost" | "triplecaptain"
    horizon: int = 1               # Planning horizon in gameweeks: 1, 3, 5


class PlayerRec(BaseModel):
    player_id: int
    web_name: str
    team: str
    position: str                  # GKP, DEF, MID, FWD
    price: float
    projected_points: float
    is_captain: bool = False
    is_vice_captain: bool = False
    is_starter: bool = True
    multiplier: int = 1


class TransferDelta(BaseModel):
    out: PlayerRec
    in_: PlayerRec
    points_gain: float
    hit_cost: int


class ChipEvaluation(BaseModel):
    chip_id: str                   # "none" | "wildcard" | "freehit" | "benchboost" | "triplecaptain"
    chip_name: str
    description: str
    projected_points: float
    hit_penalty: int
    net_points: float
    points_gain_vs_standard: float
    transfers_made: int
    verdict: str                   # "RECOMMENDED" | "CONSIDER" | "HOLD / SAVE" | "STANDARD"
    reasoning: str
    transfers: List[TransferDelta]
    final_squad: List[PlayerRec]
    starting_xi: List[PlayerRec]
    bench: List[PlayerRec]
    captain: Optional[PlayerRec] = None
    vice_captain: Optional[PlayerRec] = None
    bank_remaining: float


class OptimizeResponse(BaseModel):
    status: str
    chip_active: str
    horizon: int = 1
    transfers: List[TransferDelta]
    final_squad: List[PlayerRec]
    starting_xi: List[PlayerRec]
    bench: List[PlayerRec]
    captain: Optional[PlayerRec] = None
    vice_captain: Optional[PlayerRec] = None
    total_projected_points: float
    transfers_made: int
    hit_penalty: int
    net_points: float
    bank_remaining: float
    chip_evaluations: List[ChipEvaluation]


# ─────────────────────────────────────────────────────────────────────────────
# Database Layer
# ─────────────────────────────────────────────────────────────────────────────

def get_connection():
    """Create a new psycopg2 connection to Neon PostgreSQL."""
    return psycopg2.connect(DATABASE_URL, connect_timeout=5, cursor_factory=psycopg2.extras.RealDictCursor)


def fetch_player_pool(start_gw: int, horizon: int = 1) -> List[dict]:
    """
    Fetch all available players with their aggregate projected points
    over [start_gw, start_gw + horizon - 1].
    Includes all active players in DB (with 0.0 xP for flagged/injured)
    so current squad members can always be processed.
    """
    end_gw = start_gw + horizon - 1
    query = """
        SELECT
            p.id                    AS player_id,
            p.web_name,
            p.position              AS position_code,
            p.now_cost,
            t.short_name            AS team,
            COALESCE(
                SUM(
                    CASE 
                        WHEN p.status IN ('u', 'i') THEN 0.0
                        ELSE pp.expected_points 
                    END
                ),
                0.0
            ) AS projected_points
        FROM players p
        JOIN teams t ON p.team_id = t.id
        LEFT JOIN player_projections pp
            ON pp.player_id = p.id AND pp.gameweek BETWEEN %s AND %s
        WHERE p.now_cost > 0
        GROUP BY p.id, p.web_name, p.position, p.now_cost, t.short_name
        ORDER BY projected_points DESC
    """
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(query, (start_gw, end_gw))
            rows = cur.fetchall()
    finally:
        conn.close()

    position_map = {1: "GKP", 2: "DEF", 3: "MID", 4: "FWD"}
    players = []
    for row in rows:
        players.append({
            "player_id": row["player_id"],
            "web_name": row["web_name"],
            "team": row["team"],
            "position": position_map.get(row["position_code"], "UNK"),
            "price": float(row["now_cost"]),
            "projected_points": round(float(row["projected_points"]), 2),
        })
    return players


# ─────────────────────────────────────────────────────────────────────────────
# 3-Tier MILP Solver (Squad, Starting XI, Captain)
# ─────────────────────────────────────────────────────────────────────────────

HIT_PENALTY = 4
MAX_PER_TEAM = 3

def solve_chip_plan(
    req: OptimizeRequest,
    player_pool: List[dict],
    chip_mode: str,
) -> Dict[str, Any]:
    """
    Solves optimal squad, starting XI, and captaincy using a 3-tier MILP model:
      s[i] ∈ {0, 1}: 15 players in Squad
      x[i] ∈ {0, 1}: 11 players in Starting XI (x[i] <= s[i])
      c[i] ∈ {0, 1}: 1 Captain (c[i] <= x[i])
    Objective:
      Maximize Starting XI xP + Captain xP + 0.05 * Bench xP - Hit Penalty.
    """
    current_ids = set(req.current_squad)
    pool_by_id = {p["player_id"]: p for p in player_pool}

    current_squad_value = sum(
        pool_by_id[pid]["price"]
        for pid in req.current_squad
        if pid in pool_by_id
    )
    total_budget = current_squad_value + req.bank

    prob = pulp.LpProblem(f"FPL_Solve_{chip_mode}_gw{req.gameweek}_h{req.horizon}", pulp.LpMaximize)

    s = {p["player_id"]: pulp.LpVariable(f"s_{p['player_id']}", cat="Binary") for p in player_pool}
    x = {p["player_id"]: pulp.LpVariable(f"x_{p['player_id']}", cat="Binary") for p in player_pool}
    c = {p["player_id"]: pulp.LpVariable(f"c_{p['player_id']}", cat="Binary") for p in player_pool}

    # Hierarchy constraints
    for p in player_pool:
        pid = p["player_id"]
        prob += x[pid] <= s[pid]
        prob += c[pid] <= x[pid]

    # Squad counts
    prob += pulp.lpSum(s.values()) == 15
    prob += pulp.lpSum(x.values()) == 11
    prob += pulp.lpSum(c.values()) == 1

    # 15-man squad position constraints
    for pos, cnt in [("GKP", 2), ("DEF", 5), ("MID", 5), ("FWD", 3)]:
        prob += pulp.lpSum(s[p["player_id"]] for p in player_pool if p["position"] == pos) == cnt

    # Starting XI formation constraints (1 GKP, 3-5 DEF, 2-5 MID, 1-3 FWD)
    prob += pulp.lpSum(x[p["player_id"]] for p in player_pool if p["position"] == "GKP") == 1
    prob += pulp.lpSum(x[p["player_id"]] for p in player_pool if p["position"] == "DEF") >= 3
    prob += pulp.lpSum(x[p["player_id"]] for p in player_pool if p["position"] == "DEF") <= 5
    prob += pulp.lpSum(x[p["player_id"]] for p in player_pool if p["position"] == "MID") >= 2
    prob += pulp.lpSum(x[p["player_id"]] for p in player_pool if p["position"] == "MID") <= 5
    prob += pulp.lpSum(x[p["player_id"]] for p in player_pool if p["position"] == "FWD") >= 1
    prob += pulp.lpSum(x[p["player_id"]] for p in player_pool if p["position"] == "FWD") <= 3

    # Squad budget
    prob += pulp.lpSum(p["price"] * s[p["player_id"]] for p in player_pool) <= total_budget

    # Max 3 players per club
    teams_in_pool = {p["team"] for p in player_pool}
    for team in teams_in_pool:
        prob += pulp.lpSum(s[p["player_id"]] for p in player_pool if p["team"] == team) <= MAX_PER_TEAM

    is_unlimited = chip_mode in ("wildcard", "freehit") or req.wildcard_active

    if not is_unlimited:
        transfers_in = pulp.lpSum(
            s[p["player_id"]] for p in player_pool if p["player_id"] not in current_ids
        )
        h = pulp.LpVariable("hit_transfers", lowBound=0, cat="Integer")
        prob += h >= transfers_in - req.free_transfers
        # Cap hits in standard play / BB / TC to at most 1 hit (max free_transfers + 1 transfers)
        prob += h <= 1
        hit_cost = h * HIT_PENALTY
    else:
        h = 0
        hit_cost = 0

    # Objective Function
    if chip_mode == "benchboost":
        # All 15 players score + captain bonus
        prob += (
            pulp.lpSum(p["projected_points"] * s[p["player_id"]] for p in player_pool)
            + pulp.lpSum(p["projected_points"] * c[p["player_id"]] for p in player_pool)
            - hit_cost
        )
    elif chip_mode == "triplecaptain":
        # Starters score + 2x captain bonus + bench tiebreaker
        prob += (
            pulp.lpSum(p["projected_points"] * x[p["player_id"]] for p in player_pool)
            + 2 * pulp.lpSum(p["projected_points"] * c[p["player_id"]] for p in player_pool)
            + 0.05 * pulp.lpSum(p["projected_points"] * (s[p["player_id"]] - x[p["player_id"]]) for p in player_pool)
            - hit_cost
        )
    else:
        # Standard, Wildcard, Free Hit
        prob += (
            pulp.lpSum(p["projected_points"] * x[p["player_id"]] for p in player_pool)
            + pulp.lpSum(p["projected_points"] * c[p["player_id"]] for p in player_pool)
            + 0.05 * pulp.lpSum(p["projected_points"] * (s[p["player_id"]] - x[p["player_id"]]) for p in player_pool)
            - hit_cost
        )

    solver = pulp.PULP_CBC_CMD(msg=0, timeLimit=15)
    status = prob.solve(solver)

    if pulp.LpStatus[status] not in ("Optimal", "Not Solved"):
        raise HTTPException(status_code=500, detail=f"Solver status: {pulp.LpStatus[status]}")

    final_squad_ids = {
        pid for pid, var in s.items() if pulp.value(var) and pulp.value(var) > 0.5
    }
    final_xi_ids = {
        pid for pid, var in x.items() if pulp.value(var) and pulp.value(var) > 0.5
    }
    cap_id = next(
        (pid for pid, var in c.items() if pulp.value(var) and pulp.value(var) > 0.5),
        None
    )

    hit_val = int(pulp.value(h) or 0) if not is_unlimited else 0
    hit_penalty_pts = hit_val * HIT_PENALTY
    transfers_made = int(sum(1 for pid in final_squad_ids if pid not in current_ids))

    raw_xi = [pool_by_id[pid] for pid in final_xi_ids if pid in pool_by_id]
    raw_bench = [pool_by_id[pid] for pid in final_squad_ids if pid not in final_xi_ids and pid in pool_by_id]

    # Sort starters: GKP first, then DEF, MID, FWD
    pos_order = {"GKP": 1, "DEF": 2, "MID": 3, "FWD": 4}
    raw_xi.sort(key=lambda p: (pos_order.get(p["position"], 99), -p["projected_points"]))

    # Sort bench: backup GKP first, then outfield by descending xP
    bench_gk = [p for p in raw_bench if p["position"] == "GKP"]
    bench_outfield = sorted([p for p in raw_bench if p["position"] != "GKP"], key=lambda p: -p["projected_points"])
    raw_bench = bench_gk + bench_outfield

    # Identify Captain & Vice-Captain
    if cap_id and cap_id in pool_by_id:
        cap_player = pool_by_id[cap_id]
    else:
        cap_player = sorted(raw_xi, key=lambda p: -p["projected_points"])[0]

    # Vice captain: highest xP starter other than captain
    other_starters = [p for p in raw_xi if p["player_id"] != cap_player["player_id"]]
    vc_player = sorted(other_starters, key=lambda p: -p["projected_points"])[0] if other_starters else None

    def to_player_rec(p_dict: dict, is_starter: bool) -> PlayerRec:
        is_cap = (p_dict["player_id"] == cap_player["player_id"])
        is_vc = (vc_player is not None and p_dict["player_id"] == vc_player["player_id"])
        if is_starter:
            if is_cap and chip_mode == "triplecaptain":
                mult = 3
            elif is_cap:
                mult = 2
            else:
                mult = 1
        else:
            mult = 1 if chip_mode == "benchboost" else 0

        return PlayerRec(
            player_id=p_dict["player_id"],
            web_name=p_dict["web_name"],
            team=p_dict["team"],
            position=p_dict["position"],
            price=p_dict["price"],
            projected_points=p_dict["projected_points"],
            is_captain=is_cap,
            is_vice_captain=is_vc,
            is_starter=is_starter,
            multiplier=mult,
        )

    starting_xi = [to_player_rec(p, is_starter=True) for p in raw_xi]
    bench = [to_player_rec(p, is_starter=False) for p in raw_bench]
    final_squad = starting_xi + bench

    base_xi_points = sum(p.projected_points for p in starting_xi)
    cap_points = cap_player["projected_points"]
    bench_points = sum(p.projected_points for p in bench)

    if chip_mode == "triplecaptain":
        total_proj = base_xi_points + (2 * cap_points)
    elif chip_mode == "benchboost":
        total_proj = base_xi_points + bench_points + cap_points
    else:
        total_proj = base_xi_points + cap_points

    net_pts = round(total_proj - hit_penalty_pts, 2)
    total_proj = round(total_proj, 2)

    out_ids = [pid for pid in current_ids if pid not in final_squad_ids and pid in pool_by_id]
    in_ids = [pid for pid in final_squad_ids if pid not in current_ids]

    # LIKE-FOR-LIKE POSITION MATCHING: GKP->GKP, DEF->DEF, MID->MID, FWD->FWD
    transfer_deltas: List[TransferDelta] = []
    for pos in ["GKP", "DEF", "MID", "FWD"]:
        pos_out = sorted([pool_by_id[pid] for pid in out_ids if pool_by_id[pid]["position"] == pos], key=lambda p: p["projected_points"])
        pos_in = sorted([pool_by_id[pid] for pid in in_ids if pool_by_id[pid]["position"] == pos], key=lambda p: p["projected_points"], reverse=True)
        for out_p, in_p in zip(pos_out, pos_in):
            transfer_deltas.append(TransferDelta(
                out=to_player_rec(out_p, is_starter=True),
                in_=to_player_rec(in_p, is_starter=True),
                points_gain=round(in_p["projected_points"] - out_p["projected_points"], 2),
                hit_cost=0,
            ))

    final_cost = sum(p.price for p in final_squad)
    bank_remaining = round(total_budget - final_cost, 1)

    captain_rec = next((p for p in starting_xi if p.is_captain), None)
    vice_captain_rec = next((p for p in starting_xi if p.is_vice_captain), None)

    return {
        "chip_id": chip_mode,
        "transfers": transfer_deltas,
        "final_squad": final_squad,
        "starting_xi": starting_xi,
        "bench": bench,
        "captain": captain_rec,
        "vice_captain": vice_captain_rec,
        "total_projected_points": total_proj,
        "transfers_made": transfers_made,
        "hit_penalty": hit_penalty_pts,
        "net_points": net_pts,
        "bank_remaining": bank_remaining,
        "bench_points": round(bench_points, 2),
        "cap_points": round(cap_points, 2),
    }


def evaluate_all_chips(
    req: OptimizeRequest,
    player_pool: List[dict],
) -> Tuple[Dict[str, Any], List[ChipEvaluation]]:
    """
    Evaluates all 5 chip strategies (Standard, Wildcard, Free Hit, Bench Boost, Triple Captain).
    Enforces strict FPL single-chip exclusivity: only ONE strategy is marked RECOMMENDED per gameweek.
    """
    chip_defs = [
        ("none", "Standard Play", "Use standard free transfers and at most 1 tactical hit for steady squad progression."),
        ("wildcard", "Wildcard", "Rebuild your entire 15-man squad with zero transfer point deductions."),
        ("freehit", "Free Hit", "Completely custom 15-player squad for 1 gameweek only (reverts next GW)."),
        ("benchboost", "Bench Boost", "All 15 players in your squad score points this gameweek."),
        ("triplecaptain", "Triple Captain", "Your captain's score is multiplied by 3 instead of 2."),
    ]

    solved_plans: Dict[str, Dict[str, Any]] = {}
    for chip_id, _, _ in chip_defs:
        solved_plans[chip_id] = solve_chip_plan(req, player_pool, chip_id)

    standard_net = solved_plans["none"]["net_points"]

    wc_gain = round(solved_plans["wildcard"]["net_points"] - standard_net, 2)
    fh_gain = round(solved_plans["freehit"]["net_points"] - standard_net, 2)
    bb_bench_pts = solved_plans["benchboost"]["bench_points"]
    tc_cap_pts = solved_plans["triplecaptain"]["cap_points"]

    # In FPL, chips are only recommended if high strategic thresholds are met (scaled by horizon)
    recommended_chip_id = "none"
    h_scale = req.horizon

    if bb_bench_pts >= (24.0 * h_scale):
        recommended_chip_id = "benchboost"
    elif tc_cap_pts >= (18.0 * h_scale):
        recommended_chip_id = "triplecaptain"
    elif wc_gain >= (20.0 * h_scale) and solved_plans["wildcard"]["transfers_made"] >= 6:
        recommended_chip_id = "wildcard"
    elif fh_gain >= (22.0 * h_scale):
        recommended_chip_id = "freehit"

    evaluations: List[ChipEvaluation] = []
    for chip_id, chip_name, description in chip_defs:
        plan = solved_plans[chip_id]
        net = plan["net_points"]
        gain = round(net - standard_net, 2)

        if chip_id == "none":
            verdict = "RECOMMENDED" if recommended_chip_id == "none" else "STANDARD"
            reasoning = f"Optimal play: {plan['transfers_made']} strategic transfer(s) yielding {net:.1f} net points over {req.horizon} GW(s)."

        elif chip_id == "wildcard":
            if recommended_chip_id == "wildcard":
                verdict = "RECOMMENDED"
                reasoning = f"Urgent squad overhaul: {plan['transfers_made']} transfers yield +{gain:.1f} pt swing with zero hit penalties."
            elif gain >= (12.0 * h_scale) and plan["transfers_made"] >= 5:
                verdict = "CONSIDER"
                reasoning = f"Provides +{gain:.1f} pts across {plan['transfers_made']} transfers over {req.horizon} GW(s)."
            else:
                verdict = "HOLD / SAVE"
                reasoning = f"+{gain:.1f} pts gain is insufficient to spend your Wildcard. Preserve it for upcoming fixture swings."

        elif chip_id == "freehit":
            if recommended_chip_id == "freehit":
                verdict = "RECOMMENDED"
                reasoning = f"Exceptional single-gameweek spike (+{gain:.1f} pts). Ideal fixture targeting."
            elif gain >= (14.0 * h_scale):
                verdict = "CONSIDER"
                reasoning = f"Provides a +{gain:.1f} pt projection boost. Better preserved for major Blank Gameweeks (BGWs)."
            else:
                verdict = "HOLD / SAVE"
                reasoning = f"Save Free Hit for major Blank Gameweeks when several key teams blank."

        elif chip_id == "benchboost":
            if recommended_chip_id == "benchboost":
                verdict = "RECOMMENDED"
                reasoning = f"Elite bench projection of {bb_bench_pts:.1f} points over {req.horizon} GW(s). Optimal timing for Bench Boost."
            elif bb_bench_pts >= (16.0 * h_scale):
                verdict = "CONSIDER"
                reasoning = f"Bench contributes {bb_bench_pts:.1f} points. Strong, but maximum value is achieved during a Double Gameweek."
            else:
                verdict = "HOLD / SAVE"
                reasoning = f"Bench projection is {bb_bench_pts:.1f} pts. Save Bench Boost for a confirmed Double Gameweek (DGW)."

        elif chip_id == "triplecaptain":
            cap_name = plan["captain"].web_name if plan["captain"] else "Captain"
            if recommended_chip_id == "triplecaptain":
                verdict = "RECOMMENDED"
                reasoning = f"Elite captain {cap_name} with {tc_cap_pts:.1f} pts projection (+{tc_cap_pts:.1f} extra points). Prime TC window."
            elif tc_cap_pts >= (14.0 * h_scale):
                verdict = "CONSIDER"
                reasoning = f"{cap_name} is projected for {tc_cap_pts:.1f} pts (+{tc_cap_pts:.1f} boost). Viable, but Double Gameweeks offer higher ceilings."
            else:
                verdict = "HOLD / SAVE"
                reasoning = f"Captain ceiling is {tc_cap_pts:.1f} pts over {req.horizon} GW(s). Save Triple Captain for a Double Gameweek (DGW)."
        else:
            verdict = "HOLD / SAVE"
            reasoning = "Chip evaluated."

        evaluations.append(ChipEvaluation(
            chip_id=chip_id,
            chip_name=chip_name,
            description=description,
            projected_points=plan["total_projected_points"],
            hit_penalty=plan["hit_penalty"],
            net_points=net,
            points_gain_vs_standard=gain,
            transfers_made=plan["transfers_made"],
            verdict=verdict,
            reasoning=reasoning,
            transfers=plan["transfers"],
            final_squad=plan["final_squad"],
            starting_xi=plan["starting_xi"],
            bench=plan["bench"],
            captain=plan["captain"],
            vice_captain=plan["vice_captain"],
            bank_remaining=plan["bank_remaining"],
        ))

    target_chip = req.chip if req.chip in solved_plans else "none"
    chosen_plan = solved_plans[target_chip]

    return chosen_plan, evaluations


def solve_transfers(req: OptimizeRequest, player_pool: List[dict]) -> OptimizeResponse:
    chosen_plan, evaluations = evaluate_all_chips(req, player_pool)

    return OptimizeResponse(
        status="optimal",
        chip_active=chosen_plan["chip_id"],
        horizon=req.horizon,
        transfers=chosen_plan["transfers"],
        final_squad=chosen_plan["final_squad"],
        starting_xi=chosen_plan["starting_xi"],
        bench=chosen_plan["bench"],
        captain=chosen_plan["captain"],
        vice_captain=chosen_plan["vice_captain"],
        total_projected_points=chosen_plan["total_projected_points"],
        transfers_made=chosen_plan["transfers_made"],
        hit_penalty=chosen_plan["hit_penalty"],
        net_points=chosen_plan["net_points"],
        bank_remaining=chosen_plan["bank_remaining"],
        chip_evaluations=evaluations,
    )


# ─────────────────────────────────────────────────────────────────────────────
# FastAPI App
# ─────────────────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("FPL Solver starting up — connecting to Neon DB")
    try:
        conn = get_connection()
        conn.close()
        logger.info("Database connection: OK")
    except Exception as e:
        logger.error(f"Database connection failed: {e}")
    yield
    logger.info("FPL Solver shutting down")


app = FastAPI(
    title="FPL Transfer Decision Engine",
    description="MILP-based FPL squad & chip optimiser with multi-horizon support. Reads from Neon PostgreSQL.",
    version="2.2.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://frontend:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/optimize", response_model=OptimizeResponse)
async def optimize(req: OptimizeRequest):
    logger.info(f"Optimize request: team={req.team_id} gw={req.gameweek} horizon={req.horizon} ft={req.free_transfers} chip={req.chip}")

    if len(req.current_squad) != 15:
        raise HTTPException(
            status_code=422,
            detail=f"current_squad must contain exactly 15 player IDs, got {len(req.current_squad)}"
        )

    try:
        player_pool = fetch_player_pool(req.gameweek, req.horizon)
    except Exception as e:
        logger.error(f"DB fetch failed: {e}")
        raise HTTPException(status_code=503, detail="Database unavailable")

    if len(player_pool) < 15:
        raise HTTPException(
            status_code=503,
            detail="Insufficient player data in database for this gameweek"
        )

    result = solve_transfers(req, player_pool)
    logger.info(f"Solve complete: chip={result.chip_active}, transfers={result.transfers_made}, net_pts={result.net_points}, cap={result.captain.web_name if result.captain else 'None'}")
    return result


@app.post("/projections/generate")
async def generate_projections_endpoint(
    start_gw: Optional[int] = None,
    horizon: int = 5
):
    """
    Triggers OpenFPL multi-gameweek forecasting engine:
    Calculates fixture-based xG/xA and clean sheet expectations,
    and updates the player_projections table in PostgreSQL.
    """
    try:
        result = run_openfpl_pipeline(start_gw=start_gw, horizon=horizon)
        return result
    except Exception as e:
        logger.error(f"OpenFPL projection pipeline failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

