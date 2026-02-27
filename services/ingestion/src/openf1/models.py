from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class OpenF1Driver(BaseModel):
    driver_number: int
    full_name: Optional[str] = None
    name_acronym: Optional[str] = None
    team_name: Optional[str] = None
    country_code: Optional[str] = None
    headshot_url: Optional[str] = None
    session_key: Optional[int] = None


class OpenF1Session(BaseModel):
    session_key: int
    session_name: Optional[str] = None
    session_type: Optional[str] = None
    date_start: Optional[datetime] = None
    date_end: Optional[datetime] = None
    year: Optional[int] = None
    circuit_short_name: Optional[str] = None
    country_name: Optional[str] = None
    meeting_key: Optional[int] = None


class OpenF1Lap(BaseModel):
    driver_number: int
    lap_number: int
    lap_duration: Optional[float] = None
    duration_sector_1: Optional[float] = None
    duration_sector_2: Optional[float] = None
    duration_sector_3: Optional[float] = None
    is_pit_out_lap: Optional[bool] = None
    session_key: Optional[int] = None
    date_start: Optional[datetime] = None


class OpenF1Position(BaseModel):
    driver_number: int
    position: int
    date: Optional[datetime] = None
    session_key: Optional[int] = None
    meeting_key: Optional[int] = None


class OpenF1Pit(BaseModel):
    driver_number: int
    lap_number: int
    pit_duration: Optional[float] = None
    session_key: Optional[int] = None
    date: Optional[datetime] = None


class OpenF1Interval(BaseModel):
    driver_number: int
    gap_to_leader: Optional[float] = None
    interval: Optional[float] = None
    date: Optional[datetime] = None
    session_key: Optional[int] = None
