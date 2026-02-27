import asyncio
import structlog
from opentelemetry import trace

from src.config import settings
from src.db.database import SessionLocal
from src.db.models import Session, Driver
from src.openf1.client import OpenF1Client
from src.processors.positions import process_position_data
from src.processors.laps import process_lap_data
from src.processors.pitstops import process_pitstop_data

logger = structlog.get_logger()
tracer = trace.get_tracer("pitwall-ingestion.workers.live_poller")

_running = False


async def start_polling(session_id: int, interval: float = 10.0):
    """Poll OpenF1 for live session data."""
    global _running
    _running = True
    client = OpenF1Client()

    logger.info("Starting live polling", session_id=session_id, interval=interval)

    while _running:
        with tracer.start_as_current_span("live_poll_cycle") as span:
            span.set_attribute("session_id", session_id)

            db = SessionLocal()
            try:
                session = db.query(Session).filter_by(id=session_id).first()
                if not session or not session.external_id:
                    logger.warning("Session not found or no external_id", session_id=session_id)
                    break

                session_key = int(session.external_id.replace("openf1-", ""))

                # Build driver number -> DB id mapping
                drivers = db.query(Driver).all()
                driver_map = {d.number: d.id for d in drivers if d.number}

                # Fetch and process new data
                positions = client.get_positions(session_key)
                laps = client.get_laps(session_key)
                pits = client.get_pit_stops(session_key)

                process_position_data(db, session_id, positions, driver_map)
                process_lap_data(db, session_id, laps, driver_map)
                process_pitstop_data(db, session_id, pits, driver_map)

            except Exception as e:
                span.record_exception(e)
                logger.error("Live poll error", error=str(e))
            finally:
                db.close()

        await asyncio.sleep(interval)

    client.close()
    logger.info("Stopped live polling")


def stop_polling():
    global _running
    _running = False
