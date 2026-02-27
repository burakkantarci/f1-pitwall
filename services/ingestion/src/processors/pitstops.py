import structlog
from sqlalchemy.orm import Session as DBSession
from opentelemetry import trace

from src.db.models import PitStop, Driver
from src.publisher import publish_event

logger = structlog.get_logger()
tracer = trace.get_tracer("pitwall-ingestion.processors.pitstops")


def process_pitstop_data(
    db: DBSession,
    session_id: int,
    pitstop_data: list[dict],
    driver_map: dict[int, int],
) -> int:
    """Process pit stop data from OpenF1 and store in DB. Returns count of records created."""
    with tracer.start_as_current_span("process_pitstops") as span:
        span.set_attribute("session_id", session_id)
        span.set_attribute("input_count", len(pitstop_data))

        created = 0
        for entry in pitstop_data:
            driver_number = entry.get("driver_number")
            driver_id = driver_map.get(driver_number)
            if not driver_id:
                continue

            lap_number = entry.get("lap_number")
            if not lap_number:
                continue

            duration = entry.get("pit_duration")
            duration_ms = int(duration * 1000) if duration else None

            ps = PitStop(
                session_id=session_id,
                driver_id=driver_id,
                lap=lap_number,
                duration_ms=duration_ms,
            )
            db.add(ps)
            created += 1

            driver = db.query(Driver).filter_by(id=driver_id).first()
            publish_event("pit_stop", session_id, {
                "driver_id": driver_id,
                "driver_name": driver.name if driver else "Unknown",
                "lap": lap_number,
                "duration_ms": duration_ms,
            })

        db.commit()
        span.set_attribute("created_count", created)
        logger.info("Processed pitstops", session_id=session_id, created=created)
        return created
