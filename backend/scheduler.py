"""
FPL Background Scheduler
Autonomous in-process scheduler for OpenFPL forecasts and data synchronization:
1. Startup freshness check: auto-refreshes if projections in DB are older than 12 hours.
2. Daily sync: runs every evening (~19:00 EAT / 16:00 UTC, or if last sync > 20h ago).
3. Pre-deadline intelligence: automatically triggers a fresh forecast 2 hours before
   any gameweek deadline to catch last-minute team news, press conference leaks, and price changes.
4. Non-blocking & concurrency-locked: runs via asyncio.to_thread with mutex protection.
"""

import os
import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, Set

import httpx
from openfpl_engine import run_openfpl_pipeline, get_db_connection

logger = logging.getLogger(__name__)

FPL_BOOTSTRAP_URL = "https://fantasy.premierleague.com/api/bootstrap-static/"


class FPLBackgroundScheduler:
    def __init__(self):
        self.is_running: bool = False
        self.last_run: Optional[datetime] = None
        self.last_status: str = "uninitialized"
        self.last_error: Optional[str] = None
        self.last_reason: Optional[str] = None
        self.last_duration_sec: float = 0.0
        self.total_runs: int = 0
        self.pre_deadline_synced_gws: Set[int] = set()
        self._task: Optional[asyncio.Task] = None
        self._lock = asyncio.Lock()

    def get_latest_db_projection_time(self) -> Optional[datetime]:
        """Check PostgreSQL for timestamp of most recent OpenFPL projection."""
        try:
            conn = get_db_connection()
            try:
                with conn.cursor() as cur:
                    cur.execute(
                        "SELECT MAX(updated_at) AS latest FROM player_projections WHERE source = %s",
                        ("openfpl_ai",)
                    )
                    row = cur.fetchone()
                    if row and row.get("latest"):
                        return row["latest"]
            finally:
                conn.close()
        except Exception as e:
            logger.warning(f"[Scheduler] Failed to query latest projection time: {e}")
        return None

    def get_next_deadline_info(self) -> Optional[Dict[str, Any]]:
        """Fetch next upcoming FPL gameweek deadline from official API."""
        try:
            with httpx.Client(timeout=8.0) as client:
                res = client.get(
                    FPL_BOOTSTRAP_URL,
                    headers={"User-Agent": "FPL-Decision-Engine/Scheduler"}
                )
                if res.is_success:
                    data = res.json()
                    events = data.get("events", [])
                    now = datetime.now(timezone.utc)
                    for ev in events:
                        deadline_str = ev.get("deadline_time")
                        if not deadline_str:
                            continue
                        dt = datetime.fromisoformat(deadline_str.replace("Z", "+00:00"))
                        if dt > now:
                            return {
                                "id": ev["id"],
                                "name": ev.get("name", f"Gameweek {ev['id']}"),
                                "deadline": dt,
                                "hours_remaining": round((dt - now).total_seconds() / 3600.0, 1),
                            }
        except Exception as e:
            logger.warning(f"[Scheduler] Failed to fetch next deadline: {e}")
        return None

    async def run_sync(self, reason: str = "manual", horizon: int = 8) -> Dict[str, Any]:
        """Executes OpenFPL forecast pipeline in background thread with lock protection."""
        if self._lock.locked():
            return {
                "status": "skipped",
                "message": "Projection update already in progress",
                "current_status": self.last_status,
            }

        async with self._lock:
            self.is_running = True
            self.last_status = "running"
            self.last_reason = reason
            start_time = asyncio.get_event_loop().time()
            logger.info(f"[Scheduler] Starting OpenFPL sync (reason: {reason}, horizon: {horizon})")

            try:
                # Run CPU/network blocking ETL pipeline in worker thread
                result = await asyncio.to_thread(run_openfpl_pipeline, horizon=horizon)
                duration = asyncio.get_event_loop().time() - start_time
                self.last_run = datetime.now(timezone.utc)
                self.last_status = "success"
                self.last_error = None
                self.last_duration_sec = round(duration, 2)
                self.total_runs += 1
                logger.info(f"[Scheduler] Sync completed successfully in {self.last_duration_sec}s (reason: {reason})")
                return {
                    "status": "success",
                    "reason": reason,
                    "duration_seconds": self.last_duration_sec,
                    "result": result,
                }
            except Exception as e:
                duration = asyncio.get_event_loop().time() - start_time
                self.last_status = "error"
                self.last_error = str(e)
                self.last_duration_sec = round(duration, 2)
                logger.error(f"[Scheduler] Sync failed after {self.last_duration_sec}s: {e}")
                return {
                    "status": "error",
                    "reason": reason,
                    "error": str(e),
                    "duration_seconds": self.last_duration_sec,
                }
            finally:
                self.is_running = False

    async def _startup_check(self):
        """On app boot, check if DB projections are missing or stale (>12h old)."""
        logger.info("[Scheduler] Checking startup projection freshness...")
        latest = self.get_latest_db_projection_time()
        now = datetime.now(timezone.utc)

        if latest is None:
            logger.info("[Scheduler] No projections found in DB. Triggering initial generation...")
            await self.run_sync(reason="initial_empty_db")
        else:
            self.last_run = latest
            age_hours = (now - latest).total_seconds() / 3600.0
            logger.info(f"[Scheduler] Latest projection is {age_hours:.1f} hours old (timestamp: {latest.isoformat()})")
            if age_hours >= 12.0:
                logger.info("[Scheduler] Projections are older than 12 hours. Triggering startup refresh...")
                await self.run_sync(reason="startup_stale_data")
            else:
                self.last_status = "fresh (startup verified)"

    async def _loop(self):
        """
        Background monitoring loop. Evaluates every 10 minutes:
        1. Pre-deadline sync: runs between 1.0 and 2.5 hours before next gameweek deadline.
        2. Daily evening sync: runs if last sync was > 20 hours ago, or at ~19:00 EAT (16:00 UTC).
        """
        logger.info("[Scheduler] Autonomous background monitor started.")
        while True:
            try:
                await asyncio.sleep(600)  # Check every 10 minutes
                now = datetime.now(timezone.utc)

                # ── 1. Check Upcoming Deadline ──
                deadline_info = self.get_next_deadline_info()
                if deadline_info:
                    gw_id = deadline_info["id"]
                    hours_to_deadline = deadline_info["hours_remaining"]
                    # If deadline is between 0.5h and 2.5h away and we haven't synced for this deadline yet
                    if 0.5 <= hours_to_deadline <= 2.5 and gw_id not in self.pre_deadline_synced_gws:
                        logger.info(
                            f"[Scheduler] Pre-deadline window detected for GW{gw_id} "
                            f"({hours_to_deadline}h remaining). Triggering pre-deadline refresh..."
                        )
                        self.pre_deadline_synced_gws.add(gw_id)
                        await self.run_sync(reason=f"pre_deadline_gw{gw_id}")
                        continue

                # ── 2. Check Daily Refresh Window ──
                hours_since_last = None
                if self.last_run:
                    hours_since_last = (now - self.last_run).total_seconds() / 3600.0

                is_evening_utc = (now.hour == 16)  # 16:00 UTC == 19:00 East Africa Time (EAT)
                has_run_recently = (hours_since_last is not None and hours_since_last < 8.0)

                should_daily_sync = False
                if hours_since_last is None or hours_since_last >= 22.0:
                    should_daily_sync = True
                elif is_evening_utc and not has_run_recently:
                    should_daily_sync = True

                if should_daily_sync:
                    logger.info("[Scheduler] Daily refresh window triggered.")
                    await self.run_sync(reason="daily_evening_sync")

            except asyncio.CancelledError:
                logger.info("[Scheduler] Background monitor loop cancelled.")
                break
            except Exception as e:
                logger.warning(f"[Scheduler] Error in scheduler loop: {e}")

    def start(self):
        """Starts the startup check and background task."""
        asyncio.create_task(self._startup_check())
        self._task = asyncio.create_task(self._loop())

    def stop(self):
        """Stops the scheduler task gracefully."""
        if self._task and not self._task.done():
            self._task.cancel()

    def get_status(self) -> Dict[str, Any]:
        """Status summary for diagnostic endpoints."""
        now = datetime.now(timezone.utc)
        hours_since = round((now - self.last_run).total_seconds() / 3600.0, 1) if self.last_run else None
        deadline_info = self.get_next_deadline_info()

        return {
            "is_running": self.is_running,
            "status": self.last_status,
            "last_reason": self.last_reason,
            "last_run": self.last_run.isoformat() if self.last_run else None,
            "hours_since_last_run": hours_since,
            "last_duration_sec": self.last_duration_sec,
            "last_error": self.last_error,
            "total_runs": self.total_runs,
            "next_deadline": {
                "name": deadline_info["name"],
                "deadline": deadline_info["deadline"].isoformat(),
                "hours_remaining": deadline_info["hours_remaining"],
            } if deadline_info else None,
            "pre_deadline_synced_gws": list(self.pre_deadline_synced_gws),
        }


# Singleton instance
scheduler = FPLBackgroundScheduler()
