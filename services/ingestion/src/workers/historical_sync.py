import structlog
from sqlalchemy.orm import Session as DBSession
from opentelemetry import trace

from src.db.models import Season, Circuit, Race, Driver, Standing, Session
from src.ergast.client import ErgastClient

logger = structlog.get_logger()
tracer = trace.get_tracer("pitwall-ingestion.workers.historical_sync")


def sync_season(db: DBSession, year: int) -> dict:
    """Sync a full season's data from Ergast API."""
    with tracer.start_as_current_span("sync_season") as span:
        span.set_attribute("year", year)
        client = ErgastClient()
        stats = {"races": 0, "drivers": 0, "standings": 0, "circuits": 0}

        try:
            # Ensure season exists
            season = db.query(Season).filter_by(year=year).first()
            if not season:
                season = Season(year=year)
                db.add(season)
                db.flush()

            # Sync races and circuits
            races = client.get_season_races(year)
            for race_data in races:
                circuit_data = race_data.get("Circuit", {})
                location = circuit_data.get("Location", {})

                # Upsert circuit
                circuit = db.query(Circuit).filter_by(external_id=circuit_data.get("circuitId")).first()
                if not circuit:
                    circuit = Circuit(
                        external_id=circuit_data.get("circuitId"),
                        name=circuit_data.get("circuitName", ""),
                        country=location.get("country", ""),
                        city=location.get("locality", ""),
                        lat=location.get("lat"),
                        lng=location.get("long"),
                    )
                    db.add(circuit)
                    db.flush()
                    stats["circuits"] += 1

                # Upsert race
                round_num = int(race_data.get("round", 0))
                race = db.query(Race).filter_by(season_id=season.id, round=round_num).first()
                if not race:
                    race = Race(
                        season_id=season.id,
                        circuit_id=circuit.id,
                        name=race_data.get("raceName", ""),
                        round=round_num,
                        date=race_data.get("date"),
                    )
                    db.add(race)
                    db.flush()
                    stats["races"] += 1

                    # Create a race session entry
                    session = Session(
                        race_id=race.id,
                        external_id=f"ergast-{year}-{round_num}-race",
                        type="race",
                        status="completed",
                    )
                    db.add(session)

            # Sync driver standings
            standings = client.get_driver_standings(year)
            for standing_data in standings:
                driver_data = standing_data.get("Driver", {})
                constructors = standing_data.get("Constructors", [])
                team = constructors[0].get("name", "") if constructors else ""

                # Upsert driver
                driver = db.query(Driver).filter_by(external_id=driver_data.get("driverId")).first()
                if not driver:
                    driver = Driver(
                        external_id=driver_data.get("driverId"),
                        name=f"{driver_data.get('givenName', '')} {driver_data.get('familyName', '')}",
                        abbreviation=driver_data.get("code"),
                        number=int(driver_data["permanentNumber"]) if driver_data.get("permanentNumber") else None,
                        team=team,
                        country=driver_data.get("nationality", ""),
                    )
                    db.add(driver)
                    db.flush()
                    stats["drivers"] += 1
                else:
                    driver.team = team
                    driver.country = driver_data.get("nationality", driver.country)

                # Upsert standing
                existing = db.query(Standing).filter_by(season_id=season.id, driver_id=driver.id).first()
                if not existing:
                    standing = Standing(
                        season_id=season.id,
                        driver_id=driver.id,
                        points=float(standing_data.get("points", 0)),
                        position=int(standing_data.get("position", 0)),
                        wins=int(standing_data.get("wins", 0)),
                    )
                    db.add(standing)
                    stats["standings"] += 1
                else:
                    existing.points = float(standing_data.get("points", 0))
                    existing.position = int(standing_data.get("position", 0))
                    existing.wins = int(standing_data.get("wins", 0))

            db.commit()
            logger.info("Season sync complete", year=year, stats=stats)
            return stats

        except Exception as e:
            db.rollback()
            span.record_exception(e)
            logger.error("Season sync failed", year=year, error=str(e))
            raise
        finally:
            client.close()
