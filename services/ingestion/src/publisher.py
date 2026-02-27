import json
from datetime import datetime, timezone

import redis as redis_lib
import structlog

from src.config import settings

logger = structlog.get_logger()

_redis = redis_lib.Redis.from_url(settings.redis_url)

CHANNELS = {
    "position_change": "f1:position-change",
    "pit_stop": "f1:pit-stop",
    "fastest_lap": "f1:fastest-lap",
    "safety_car": "f1:safety-car",
    "session_status": "f1:session-status",
}


def publish_event(event_type: str, session_id: int, data: dict) -> None:
    channel = CHANNELS.get(event_type)
    if not channel:
        logger.warning("Unknown event type", event_type=event_type)
        return

    payload = {
        "event_type": event_type,
        "session_id": session_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "data": data,
    }

    _redis.publish(channel, json.dumps(payload))
    logger.info("Published event", channel=channel, event_type=event_type, session_id=session_id)
