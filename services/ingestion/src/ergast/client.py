import httpx
import structlog
from opentelemetry import trace
from typing import Any

from src.config import settings

logger = structlog.get_logger()
tracer = trace.get_tracer("pitwall-ingestion.ergast")


class ErgastClient:
    def __init__(self):
        self.base_url = settings.ergast_base_url
        self.client = httpx.Client(base_url=self.base_url, timeout=30.0)

    def _request(self, path: str) -> dict[str, Any]:
        with tracer.start_as_current_span(f"ergast.get {path}") as span:
            span.set_attribute("http.url", f"{self.base_url}{path}")
            try:
                response = self.client.get(f"{path}.json")
                response.raise_for_status()
                return response.json()
            except httpx.HTTPError as e:
                span.record_exception(e)
                logger.error("Ergast API error", path=path, error=str(e))
                return {}

    def get_season_races(self, year: int) -> list[dict]:
        data = self._request(f"/{year}/races")
        return data.get("MRData", {}).get("RaceTable", {}).get("Races", [])

    def get_driver_standings(self, year: int) -> list[dict]:
        data = self._request(f"/{year}/driverStandings")
        standings_lists = data.get("MRData", {}).get("StandingsTable", {}).get("StandingsLists", [])
        if standings_lists:
            return standings_lists[0].get("DriverStandings", [])
        return []

    def get_constructor_standings(self, year: int) -> list[dict]:
        data = self._request(f"/{year}/constructorStandings")
        standings_lists = data.get("MRData", {}).get("StandingsTable", {}).get("StandingsLists", [])
        if standings_lists:
            return standings_lists[0].get("ConstructorStandings", [])
        return []

    def get_race_results(self, year: int, round_num: int) -> list[dict]:
        data = self._request(f"/{year}/{round_num}/results")
        races = data.get("MRData", {}).get("RaceTable", {}).get("Races", [])
        if races:
            return races[0].get("Results", [])
        return []

    def close(self):
        self.client.close()
