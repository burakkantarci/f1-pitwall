from pydantic import BaseModel
from typing import Optional


class ErgastCircuit(BaseModel):
    circuitId: str
    circuitName: str
    url: Optional[str] = None
    Location: Optional[dict] = None


class ErgastRace(BaseModel):
    season: str
    round: str
    raceName: str
    date: str
    time: Optional[str] = None
    Circuit: Optional[ErgastCircuit] = None


class ErgastDriver(BaseModel):
    driverId: str
    permanentNumber: Optional[str] = None
    code: Optional[str] = None
    givenName: str
    familyName: str
    nationality: Optional[str] = None
    url: Optional[str] = None


class ErgastConstructor(BaseModel):
    constructorId: str
    name: str
    nationality: Optional[str] = None


class ErgastStanding(BaseModel):
    position: str
    points: str
    wins: str
    Driver: ErgastDriver
    Constructors: list[ErgastConstructor] = []
