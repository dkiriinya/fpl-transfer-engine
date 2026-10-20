"""
FPL Leaks & Early Team News Ingestion Engine
Handles Tier 2 (Automated Webhook/Parser) and Tier 3 (1-Click Override):
1. Ingests confirmed lineup leaks from Telegram, Twitter/X, or direct manual reporting.
2. Directly overrides expected minutes (0m for out, 15m for benched cameo) in PostgreSQL.
3. Recalculates expected points immediately so MILP solver instantly adapts without waiting for scheduled runs.
"""

import re
import logging
from typing import Optional, List, Dict, Any, Union
import httpx
import psycopg2
import psycopg2.extras
from openfpl_engine import get_db_connection

logger = logging.getLogger(__name__)


def init_leaks_table():
    """Ensure the player_leaks audit and tracking table exists."""
    query = """
        CREATE TABLE IF NOT EXISTS player_leaks (
            id SERIAL PRIMARY KEY,
            player_id INT NOT NULL,
            player_name VARCHAR(100) NOT NULL,
            team_name VARCHAR(50),
            gameweek INT NOT NULL,
            status VARCHAR(30) NOT NULL, -- 'benched', 'out', 'starting'
            override_minutes FLOAT NOT NULL,
            source VARCHAR(100) DEFAULT 'manual',
            raw_message TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            UNIQUE(player_id, gameweek)
        );
    """
    try:
        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                cur.execute(query)
                conn.commit()
        finally:
            conn.close()
    except Exception as e:
        logger.error(f"[Leaks] Failed to initialize player_leaks table: {e}")


def get_current_planning_gw() -> int:
    """Fetch active/upcoming gameweek from official FPL API."""
    try:
        with httpx.Client(timeout=6.0) as client:
            res = client.get("https://fantasy.premierleague.com/api/bootstrap-static/")
            if res.is_success:
                events = res.json().get("events", [])
                for ev in events:
                    if ev.get("is_next") or (ev.get("is_current") and not ev.get("finished")):
                        return ev["id"]
    except Exception as e:
        logger.warning(f"[Leaks] Could not fetch current GW from API: {e}")
    return 7


def find_player_in_db(identifier: Union[int, str]) -> Optional[Dict[str, Any]]:
    """Finds player by ID or fuzzy name in the players database table."""
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            if isinstance(identifier, int) or (isinstance(identifier, str) and identifier.isdigit()):
                cur.execute(
                    """
                    SELECT p.id, p.web_name, p.first_name, p.second_name, t.short_name AS team
                    FROM players p
                    JOIN teams t ON p.team_id = t.id
                    WHERE p.id = %s
                    """,
                    (int(identifier),)
                )
                return cur.fetchone()

            # Name search: exact web_name or partial match
            name = str(identifier).strip()
            cur.execute(
                """
                SELECT p.id, p.web_name, p.first_name, p.second_name, t.short_name AS team
                FROM players p
                JOIN teams t ON p.team_id = t.id
                WHERE p.web_name ILIKE %s
                   OR (p.first_name || ' ' || p.second_name) ILIKE %s
                   OR p.second_name ILIKE %s
                ORDER BY
                    CASE WHEN p.web_name ILIKE %s THEN 1 ELSE 2 END,
                    p.now_cost DESC
                LIMIT 1
                """,
                (f"%{name}%", f"%{name}%", f"%{name}%", name)
            )
            return cur.fetchone()
    finally:
        conn.close()


def record_player_leak(
    identifier: Union[int, str],
    status: str,
    gameweek: Optional[int] = None,
    source: str = "manual",
    raw_message: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Records a leak and adjusts the player's projections in DB immediately:
    - status = 'benched'  -> sets xM = 15.0 (cameo sub) and scales xP
    - status = 'out'      -> sets xM = 0.0, xP = 0.0 (misses match entirely)
    - status = 'starting' -> clears leak override and restores full projection
    """
    init_leaks_table()
    player = find_player_in_db(identifier)
    if not player:
        raise ValueError(f"Player '{identifier}' not found in database.")

    pid = player["id"]
    pname = player["web_name"]
    team = player["team"]
    gw = gameweek or get_current_planning_gw()
    normalized_status = status.lower().strip()

    if normalized_status in ("benched", "bench", "sub"):
        override_mins = 15.0
        canonical_status = "benched"
    elif normalized_status in ("out", "injured", "dropped", "not_in_squad", "absent"):
        override_mins = 0.0
        canonical_status = "out"
    elif normalized_status in ("starting", "starts", "start", "fit"):
        override_mins = 80.0
        canonical_status = "starting"
    else:
        override_mins = 15.0
        canonical_status = normalized_status

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            # Upsert into player_leaks
            cur.execute(
                """
                INSERT INTO player_leaks (player_id, player_name, team_name, gameweek, status, override_minutes, source, raw_message, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NOW())
                ON CONFLICT (player_id, gameweek)
                DO UPDATE SET
                    status = EXCLUDED.status,
                    override_minutes = EXCLUDED.override_minutes,
                    source = EXCLUDED.source,
                    raw_message = EXCLUDED.raw_message,
                    created_at = NOW();
                """,
                (pid, pname, team, gw, canonical_status, override_mins, source, raw_message)
            )

            # Update player_projections in PostgreSQL immediately
            if canonical_status == "out":
                cur.execute(
                    """
                    UPDATE player_projections
                    SET expected_points = 0.0, expected_minutes = 0.0, updated_at = NOW()
                    WHERE player_id = %s AND gameweek = %s AND source = 'openfpl_ai'
                    RETURNING expected_points, expected_minutes;
                    """,
                    (pid, gw)
                )
            elif canonical_status == "benched":
                # Cameo substitute: appearance pts (~1.0) + minimal attacking potential
                cur.execute(
                    """
                    UPDATE player_projections
                    SET expected_points = ROUND(GREATEST(0.5, expected_points * 0.22), 2),
                        expected_minutes = 15.0,
                        updated_at = NOW()
                    WHERE player_id = %s AND gameweek = %s AND source = 'openfpl_ai'
                    RETURNING expected_points, expected_minutes;
                    """,
                    (pid, gw)
                )
            else:
                # Restored to starting: if projection was 0, restore base calculation
                cur.execute(
                    """
                    UPDATE player_projections
                    SET expected_minutes = 80.0, updated_at = NOW()
                    WHERE player_id = %s AND gameweek = %s AND source = 'openfpl_ai'
                      AND expected_minutes < 40.0
                    RETURNING expected_points, expected_minutes;
                    """,
                    (pid, gw)
                )

            updated_proj = cur.fetchone()
            conn.commit()

        logger.info(
            f"[Leaks] Applied {canonical_status.upper()} leak for {pname} (ID: {pid}, GW{gw}): "
            f"new xM={override_mins}, result={dict(updated_proj) if updated_proj else 'unchanged'}"
        )

        return {
            "player_id": pid,
            "player_name": pname,
            "team": team,
            "gameweek": gw,
            "status": canonical_status,
            "override_minutes": override_mins,
            "updated_projection": dict(updated_proj) if updated_proj else None,
            "source": source,
        }
    finally:
        conn.close()


def get_active_leaks(gameweek: Optional[int] = None) -> List[Dict[str, Any]]:
    """Returns list of active leaks for given gameweek or all recent leaks."""
    init_leaks_table()
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            if gameweek:
                cur.execute(
                    """
                    SELECT id, player_id, player_name, team_name, gameweek, status, override_minutes, source, raw_message, created_at
                    FROM player_leaks
                    WHERE gameweek = %s
                    ORDER BY created_at DESC
                    """,
                    (gameweek,)
                )
            else:
                cur.execute(
                    """
                    SELECT id, player_id, player_name, team_name, gameweek, status, override_minutes, source, raw_message, created_at
                    FROM player_leaks
                    WHERE created_at >= NOW() - INTERVAL '4 days'
                    ORDER BY created_at DESC
                    """
                )
            return [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


def delete_player_leak(player_id: int, gameweek: int) -> bool:
    """Removes a recorded leak and clears the override."""
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM player_leaks WHERE player_id = %s AND gameweek = %s",
                (player_id, gameweek)
            )
            deleted = cur.rowcount > 0
            conn.commit()
            return deleted
    finally:
        conn.close()


def parse_and_apply_leak_message(message: str, source: str = "telegram_channel") -> List[Dict[str, Any]]:
    """
    Parses natural language leak text (e.g. from Telegram bot or Twitter feed):
    Examples:
      - "[TeamNewsAndTix] Cherki benched vs Ipswich"
      - "Haaland starts, Diaz not in squad"
    Splits message into clauses and matches player names to their specific clause context.
    """
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id, web_name, second_name FROM players WHERE now_cost >= 5.0")
            notable_players = cur.fetchall()
    finally:
        conn.close()

    results = []
    # Split text by punctuation or conjunctions to isolate player context
    clauses = re.split(r'[,;.\n]|\band\b|\bbut\b', message)

    for clause in clauses:
        clause_lower = clause.lower().strip()
        if not clause_lower:
            continue

        for p in notable_players:
            web_name = p["web_name"].lower()
            sec_name = p["second_name"].lower()

            matches_player = (
                re.search(r'\b' + re.escape(web_name) + r'\b', clause_lower)
                or (len(sec_name) > 4 and re.search(r'\b' + re.escape(sec_name) + r'\b', clause_lower))
            )

            if matches_player:
                # Check sentiment specifically inside this player's clause
                if any(k in clause_lower for k in ["benched", "on the bench", "bench", "dropped", "sub"]):
                    status = "benched"
                elif any(k in clause_lower for k in ["not in squad", "out", "injured", "misses out", "absent", "no sign of"]):
                    status = "out"
                elif any(k in clause_lower for k in ["starts", "starting", "in the xi", "lineup", "fit"]):
                    status = "starting"
                else:
                    continue

                try:
                    leak_res = record_player_leak(
                        identifier=p["id"],
                        status=status,
                        source=source,
                        raw_message=clause.strip()[:250],
                    )
                    results.append(leak_res)
                except Exception as e:
                    logger.warning(f"[Leaks] Error applying parsed leak for {p['web_name']}: {e}")

    return results
