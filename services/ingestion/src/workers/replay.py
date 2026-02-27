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

            logger.info(
                "Replay loaded",
                session_id=session_id,
                positions=len(positions),
                laps=len(laps),
                pit_stops=len(pit_stops),
            )

            # Replay positions with timing
            prev_time = None
            for pos in positions:
                if not _running:
                    break

                if prev_time and pos.recorded_at:
                    delta = (pos.recorded_at - prev_time).total_seconds()
                    wait = delta / speed
                    if wait > 0:
                        await asyncio.sleep(wait)

                driver = drivers.get(pos.driver_id)
                _redis.publish(
                    CHANNELS["position"],
                    json.dumps({
                        "event_type": "position_change",
                        "session_id": session_id,
                        "timestamp": datetime.utcnow().isoformat(),
                        "data": {
                            "driver_id": pos.driver_id,
                            "driver_name": driver.name if driver else "Unknown",
                            "position": pos.position,
                            "gap_to_leader_ms": pos.gap_to_leader_ms,
                            "interval_ms": pos.interval_ms,
                        },
                    }),
                )

                if pos.recorded_at:
                    prev_time = pos.recorded_at

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
