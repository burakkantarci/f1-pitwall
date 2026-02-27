import asyncio

import structlog
from fastapi import FastAPI, BackgroundTasks, Depends
from sqlalchemy.orm import Session as DBSession

from src.config import settings
from src.telemetry.tracing import setup_telemetry
from src.db.database import get_db, SessionLocal
from src.workers.historical_sync import sync_season
from src.workers.replay import start_replay, stop_replay

# Setup telemetry before anything else
setup_telemetry(settings.service_name)

structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.JSONRenderer(),
    ],
)

logger = structlog.get_logger()

app = FastAPI(title="PitWall Ingestion Service", version="1.0.0")


@app.get("/health")
async def health():
    return {"status": "ok", "service": "pitwall-ingestion"}


@app.post("/sync/season/{year}")
async def sync_season_endpoint(year: int, background_tasks: BackgroundTasks):
    """Trigger historical season sync from Ergast API."""
    def _sync():
        db = SessionLocal()
        try:
            result = sync_season(db, year)
            logger.info("Season sync triggered", year=year, result=result)
        finally:
            db.close()

    background_tasks.add_task(_sync)
    return {"status": "started", "year": year}


@app.post("/sync/openf1/session/{session_key}")
async def sync_openf1_session(session_key: int, background_tasks: BackgroundTasks):
    """Trigger OpenF1 session data sync."""
    from src.openf1.client import OpenF1Client
    from src.db.models import Session, Driver
    from src.processors.positions import process_position_data
    from src.processors.laps import process_lap_data
    from src.processors.pitstops import process_pitstop_data

    def _sync():
        db = SessionLocal()
        client = OpenF1Client()
        try:
            session = db.query(Session).filter(
                Session.external_id.like(f"%{session_key}%")
            ).first()
            if not session:
                logger.warning("Session not found for key", session_key=session_key)
                return

            drivers = db.query(Driver).all()
            driver_map = {d.number: d.id for d in drivers if d.number}

            positions = client.get_positions(session_key)
            laps = client.get_laps(session_key)
            pits = client.get_pit_stops(session_key)

            process_position_data(db, session.id, positions, driver_map)
            process_lap_data(db, session.id, laps, driver_map)
            process_pitstop_data(db, session.id, pits, driver_map)

            logger.info("OpenF1 session sync complete", session_key=session_key)
        finally:
            client.close()
            db.close()

    background_tasks.add_task(_sync)
    return {"status": "started", "session_key": session_key}


@app.post("/replay")
async def replay_endpoint(session_id: int, speed: float = 10.0):
    """Start replaying a historical session."""
    asyncio.create_task(start_replay(session_id, speed))
    return {"status": "started", "session_id": session_id, "speed": speed}


@app.post("/replay/stop")
async def stop_replay_endpoint():
    """Stop the current replay."""
    stop_replay()
    return {"status": "stopped"}
