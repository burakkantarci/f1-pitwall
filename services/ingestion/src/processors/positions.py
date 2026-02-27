import structlog
from sqlalchemy.orm import Session as DBSession
from opentelemetry import trace

from src.db.models import Position, Driver
from src.publisher import publish_event

logger = structlog.get_logger()
tracer = trace.get_tracer("pitwall-ingestion.processors.positions")


def process_position_data(
    db: DBSession,
    session_id: int,
    position_data: list[dict],
    driver_map: dict[int, int],
) -> int:
    """Process position data from OpenF1 and store in DB. Returns count of records created."""
    with tracer.start_as_current_span("process_positions") as span:
        span.set_attribute("session_id", session_id)
        span.set_attribute("input_count", len(position_data))

        created = 0
        prev_positions: dict[int, int] = {}

        for entry in position_data:
            driver_number = entry.get("driver_number")
            driver_id = driver_map.get(driver_number)
            if not driver_id:
                continue

            position = entry.get("position")
            recorded_at = entry.get("date")
            if not position or not recorded_at:
                continue

            pos = Position(
                session_id=session_id,
                driver_id=driver_id,
                position=position,
                gap_to_leader_ms=int(entry["gap_to_leader"] * 1000) if entry.get("gap_to_leader") else None,
                interval_ms=int(entry["interval"] * 1000) if entry.get("interval") else None,
                recorded_at=recorded_at,
            )
            db.add(pos)
            created += 1

            # Check for position change
            old_pos = prev_positions.get(driver_number)
            if old_pos and old_pos != position:
                driver = db.query(Driver).filter_by(id=driver_id).first()
                publish_event("position_change", session_id, {
                    "driver_id": driver_id,
                    "driver_name": driver.name if driver else "Unknown",
                    "old_position": old_pos,
                    "new_position": position,
                })
            prev_positions[driver_number] = position

        db.commit()
        span.set_attribute("created_count", created)
        logger.info("Processed positions", session_id=session_id, created=created)
        return created
