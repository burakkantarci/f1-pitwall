import structlog
from sqlalchemy.orm import Session as DBSession
from sqlalchemy.dialects.postgresql import insert
from opentelemetry import trace

from src.db.models import Lap, Driver
from src.publisher import publish_event

logger = structlog.get_logger()
tracer = trace.get_tracer("pitwall-ingestion.processors.laps")


def _seconds_to_ms(val: float | None) -> int | None:
    if val is None:
        return None
    return int(val * 1000)


def process_lap_data(
    db: DBSession,
    session_id: int,
    lap_data: list[dict],
    driver_map: dict[int, int],
) -> int:
    """Process lap data from OpenF1 and store in DB. Returns count of records created."""
    with tracer.start_as_current_span("process_laps") as span:
        span.set_attribute("session_id", session_id)
        span.set_attribute("input_count", len(lap_data))

        created = 0
        fastest_lap_ms: int | None = None

        for entry in lap_data:
            driver_number = entry.get("driver_number")
            driver_id = driver_map.get(driver_number)
            if not driver_id:
                continue

            lap_number = entry.get("lap_number")
            if not lap_number:
                continue

            time_ms = _seconds_to_ms(entry.get("lap_duration"))

            stmt = insert(Lap).values(
                session_id=session_id,
                driver_id=driver_id,
                lap_number=lap_number,
                time_ms=time_ms,
                sector_1_ms=_seconds_to_ms(entry.get("duration_sector_1")),
                sector_2_ms=_seconds_to_ms(entry.get("duration_sector_2")),
                sector_3_ms=_seconds_to_ms(entry.get("duration_sector_3")),
                is_pit_out=entry.get("is_pit_out_lap", False),
            ).on_conflict_do_nothing()

            result = db.execute(stmt)
            if result.rowcount > 0:
                created += 1

                # Check fastest lap
                if time_ms and (fastest_lap_ms is None or time_ms < fastest_lap_ms):
                    fastest_lap_ms = time_ms
                    driver = db.query(Driver).filter_by(id=driver_id).first()
                    publish_event("fastest_lap", session_id, {
                        "driver_id": driver_id,
                        "driver_name": driver.name if driver else "Unknown",
                        "lap_number": lap_number,
                        "time_ms": time_ms,
                    })

        db.commit()
        span.set_attribute("created_count", created)
        logger.info("Processed laps", session_id=session_id, created=created)
        return created
