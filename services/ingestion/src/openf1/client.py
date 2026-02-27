import httpx
import structlog
from opentelemetry import trace
from typing import Any

from src.config import settings

logger = structlog.get_logger()
tracer = trace.get_tracer("pitwall-ingestion.openf1")

# Simple circuit breaker state
_circuit_breaker = {"failures": 0, "open": False, "threshold": 5}


class OpenF1Client:
    def __init__(self):
        self.base_url = settings.openf1_base_url
        self.client = httpx.Client(base_url=self.base_url, timeout=30.0)

    def _request(self, path: str, params: dict | None = None) -> list[dict[str, Any]]:
        if _circuit_breaker["open"]:
            logger.warning("Circuit breaker open, skipping request", path=path)
            return []

        with tracer.start_as_current_span(f"openf1.get {path}") as span:
            span.set_attribute("http.url", f"{self.base_url}{path}")
            try:
                response = self.client.get(path, params=params)
                response.raise_for_status()
                _circuit_breaker["failures"] = 0
                data = response.json()
                span.set_attribute("result.count", len(data))
                return data
            except httpx.HTTPError as e:
                _circuit_breaker["failures"] += 1
                if _circuit_breaker["failures"] >= _circuit_breaker["threshold"]:
                    _circuit_breaker["open"] = True
                    logger.error("Circuit breaker opened", failures=_circuit_breaker["failures"])
                span.record_exception(e)
                logger.error("OpenF1 API error", path=path, error=str(e))
                return []

    def get_sessions(self, year: int) -> list[dict]:
        return self._request("/sessions", params={"year": year})

    def get_drivers(self, session_key: int) -> list[dict]:
        return self._request("/drivers", params={"session_key": session_key})

    def get_laps(self, session_key: int, driver_number: int | None = None) -> list[dict]:
        params: dict[str, Any] = {"session_key": session_key}
        if driver_number:
            params["driver_number"] = driver_number
        return self._request("/laps", params=params)

    def get_positions(self, session_key: int) -> list[dict]:
        return self._request("/position", params={"session_key": session_key})

    def get_pit_stops(self, session_key: int) -> list[dict]:
        return self._request("/pit", params={"session_key": session_key})

    def get_intervals(self, session_key: int) -> list[dict]:
        return self._request("/intervals", params={"session_key": session_key})

    def close(self):
        self.client.close()
