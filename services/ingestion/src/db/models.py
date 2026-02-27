from sqlalchemy import Column, Integer, String, Boolean, Date, DateTime, Numeric, ForeignKey, UniqueConstraint
from sqlalchemy.sql import func

from src.db.database import Base


class Driver(Base):
    __tablename__ = "drivers"

    id = Column(Integer, primary_key=True)
    external_id = Column(String(50), unique=True)
    name = Column(String(100), nullable=False)
    abbreviation = Column(String(3))
    number = Column(Integer)
    team = Column(String(100))
    country = Column(String(50))
    headshot_url = Column(String)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now())


class Season(Base):
    __tablename__ = "seasons"

    id = Column(Integer, primary_key=True)
    year = Column(Integer, unique=True, nullable=False)


class Circuit(Base):
    __tablename__ = "circuits"

    id = Column(Integer, primary_key=True)
    external_id = Column(String(50), unique=True)
    name = Column(String(200), nullable=False)
    country = Column(String(100))
    city = Column(String(100))
    lat = Column(Numeric(10, 6))
    lng = Column(Numeric(10, 6))


class Race(Base):
    __tablename__ = "races"

    id = Column(Integer, primary_key=True)
    season_id = Column(Integer, ForeignKey("seasons.id"))
    circuit_id = Column(Integer, ForeignKey("circuits.id"))
    name = Column(String(200), nullable=False)
    round = Column(Integer, nullable=False)
    date = Column(Date, nullable=False)
    scheduled_time = Column(DateTime)

    __table_args__ = (UniqueConstraint("season_id", "round"),)


class Session(Base):
    __tablename__ = "sessions"

    id = Column(Integer, primary_key=True)
    race_id = Column(Integer, ForeignKey("races.id"))
    external_id = Column(String(50), unique=True)
    type = Column(String(20), nullable=False)
    start_time = Column(DateTime)
    end_time = Column(DateTime)
    status = Column(String(20), default="scheduled")


class Lap(Base):
    __tablename__ = "laps"

    id = Column(Integer, primary_key=True)
    session_id = Column(Integer, ForeignKey("sessions.id"))
    driver_id = Column(Integer, ForeignKey("drivers.id"))
    lap_number = Column(Integer, nullable=False)
    position = Column(Integer)
    time_ms = Column(Integer)
    sector_1_ms = Column(Integer)
    sector_2_ms = Column(Integer)
    sector_3_ms = Column(Integer)
    is_pit_in = Column(Boolean, default=False)
    is_pit_out = Column(Boolean, default=False)
    compound = Column(String(20))
    created_at = Column(DateTime, server_default=func.now())

    __table_args__ = (UniqueConstraint("session_id", "driver_id", "lap_number"),)


class PitStop(Base):
    __tablename__ = "pit_stops"

    id = Column(Integer, primary_key=True)
    session_id = Column(Integer, ForeignKey("sessions.id"))
    driver_id = Column(Integer, ForeignKey("drivers.id"))
    lap = Column(Integer, nullable=False)
    duration_ms = Column(Integer)
    tire_compound_old = Column(String(20))
    tire_compound_new = Column(String(20))
    created_at = Column(DateTime, server_default=func.now())


class Position(Base):
    __tablename__ = "positions"

    id = Column(Integer, primary_key=True)
    session_id = Column(Integer, ForeignKey("sessions.id"))
    driver_id = Column(Integer, ForeignKey("drivers.id"))
    position = Column(Integer, nullable=False)
    gap_to_leader_ms = Column(Integer)
    interval_ms = Column(Integer)
    last_lap_ms = Column(Integer)
    recorded_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, server_default=func.now())


class Standing(Base):
    __tablename__ = "standings"

    id = Column(Integer, primary_key=True)
    season_id = Column(Integer, ForeignKey("seasons.id"))
    driver_id = Column(Integer, ForeignKey("drivers.id"))
    points = Column(Numeric(6, 2), default=0)
    position = Column(Integer)
    wins = Column(Integer, default=0)
    podiums = Column(Integer, default=0)
    updated_at = Column(DateTime, server_default=func.now())

    __table_args__ = (UniqueConstraint("season_id", "driver_id"),)
