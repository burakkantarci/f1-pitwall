import asyncio
import json
from datetime import datetime

import structlog
import redis as redis_lib
from opentelemetry import trace

from src.config import settings
from src.db.database import SessionLocal
from src.db.models import Position, Lap, PitStop, Driver

logger = structlog.get_logger()
tracer = trace.get_tracer("pitwall-ingestion.workers.replay")

_running = False
_redis = redis_lib.Redis.from_url(settings.redis_url)

CHANNELS = {
    "position": "f1:position-change",
    "lap": "f1:fastest-lap",
    "pit_stop": "f1:pit-stop",
    "session_status": "f1:session-status",
}


async def start_replay(session_id: int, speed: float = 10.0):
    """Replay historical session data at accelerated speed."""
    global _running
    _running = True

    with tracer.start_as_current_span("replay_session") as span:
        span.set_attribute("session_id", session_id)
        span.set_attribute("speed", speed)

        db = SessionLocal()
        try:
            # Publish session start
            _redis.publish(
                CHANNELS["session_status"],
                json.dumps({
                    "event_type": "session_status",
                    "session_id": session_id,
                    "timestamp": datetime.utcnow().isoformat(),
                    "data": {"status": "live"},
                }),
            )

            # Load all events sorted by time
            positions = (
                db.query(Position)
                .filter_by(session_id=session_id)
                .order_by(Position.recorded_at)
                .all()
            )

            laps = (
                db.query(Lap)
                .filter_by(session_id=session_id)
                .order_by(Lap.lap_number)
                .all()
            )

            pit_stops = (
                db.query(PitStop)
                .filter_by(session_id=session_id)
                .order_by(PitStop.lap)
                .all()
            )

            # Build a driver ID -> name map
            drivers = {d.id: d for d in db.query(Driver).all()}

            # Compute race time range from positions
            race_start = None
            race_end = None
            for pos in positions:
                if pos.recorded_at:
                    if race_start is None or pos.recorded_at < race_start:
                        race_start = pos.recorded_at
                    if race_end is None or pos.recorded_at > race_end:
                        race_end = pos.recorded_at

            race_duration = (race_end - race_start).total_seconds() if race_start and race_end else 3600

            # Find max lap number to distribute laps across race duration
            max_lap = max((lap.lap_number for lap in laps), default=1)

            # Build a unified timeline of all events
            events = []

            for pos in positions:
                driver = drivers.get(pos.driver_id)
                events.append({
                    "time": pos.recorded_at or race_start or datetime.min,
                    "channel": CHANNELS["position"],
                    "payload": {
                        "event_type": "position_change",
                        "session_id": session_id,
                        "data": {
                            "driver_id": pos.driver_id,
                            "driver_name": driver.name if driver else "Unknown",
                            "abbreviation": driver.abbreviation if driver else "",
                            "team": driver.team if driver else "",
                            "number": driver.number if driver else pos.driver_id,
                            "position": pos.position,
                            "gap_to_leader_ms": pos.gap_to_leader_ms,
                            "interval_ms": pos.interval_ms,
                            "last_lap_ms": pos.last_lap_ms if hasattr(pos, "last_lap_ms") else None,
                        },
                    },
                })

            # Distribute laps evenly across race duration based on lap number
            from datetime import timedelta
            for lap in laps:
                driver = drivers.get(lap.driver_id)
                frac = lap.lap_number / max_lap
                lap_time = race_start + timedelta(seconds=race_duration * frac) if race_start else datetime.min
                events.append({
                    "time": lap_time,
                    "channel": CHANNELS["lap"],
                    "payload": {
                        "event_type": "lap_complete",
                        "session_id": session_id,
                        "data": {
                            "driver_id": lap.driver_id,
                            "driver_name": driver.name if driver else "Unknown",
                            "abbreviation": driver.abbreviation if driver else "",
                            "lap_number": lap.lap_number,
                            "time_ms": lap.time_ms,
                            "position": lap.position,
                            "compound": lap.compound,
                        },
                    },
                })

            # Distribute pit stops based on their lap number
            for ps in pit_stops:
                driver = drivers.get(ps.driver_id)
                frac = ps.lap / max_lap
                ps_time = race_start + timedelta(seconds=race_duration * frac) if race_start else datetime.min
                events.append({
                    "time": ps_time,
                    "channel": CHANNELS["pit_stop"],
                    "payload": {
                        "event_type": "pit_stop",
                        "session_id": session_id,
                        "data": {
                            "driver_id": ps.driver_id,
                            "driver_name": driver.name if driver else "Unknown",
                            "abbreviation": driver.abbreviation if driver else "",
                            "lap": ps.lap,
                            "duration_ms": ps.duration_ms,
                            "tire_old": ps.tire_compound_old,
                            "tire_new": ps.tire_compound_new,
                        },
                    },
                })

            events.sort(key=lambda e: e["time"])

            logger.info(
                "Replay loaded",
                session_id=session_id,
                total_events=len(events),
                positions=len(positions),
                laps=len(laps),
                pit_stops=len(pit_stops),
            )

            # Replay all events with timing
            prev_time = None
            for evt in events:
                if not _running:
                    break

                evt_time = evt["time"]
                if prev_time and evt_time and evt_time != datetime.min:
                    delta = (evt_time - prev_time).total_seconds()
                    wait = delta / speed
                    if 0 < wait < 30:
                        await asyncio.sleep(wait)

                payload = evt["payload"]
                payload["timestamp"] = datetime.utcnow().isoformat()
                _redis.publish(evt["channel"], json.dumps(payload))

                if evt_time and evt_time != datetime.min:
                    prev_time = evt_time

            # Publish session end
            _redis.publish(
                CHANNELS["session_status"],
                json.dumps({
                    "event_type": "session_status",
                    "session_id": session_id,
                    "timestamp": datetime.utcnow().isoformat(),
                    "data": {"status": "completed"},
                }),
            )

            logger.info("Replay complete", session_id=session_id)

        except Exception as e:
            span.record_exception(e)
            logger.error("Replay error", error=str(e))
            raise
        finally:
            db.close()
            _running = False


def stop_replay():
    global _running
    _running = False
