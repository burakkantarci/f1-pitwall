CREATE TABLE drivers (
    id SERIAL PRIMARY KEY,
    external_id VARCHAR(50) UNIQUE,
    name VARCHAR(100) NOT NULL,
    abbreviation VARCHAR(3),
    number INTEGER,
    team VARCHAR(100),
    country VARCHAR(50),
    headshot_url TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE seasons (
    id SERIAL PRIMARY KEY,
    year INTEGER UNIQUE NOT NULL
);

CREATE TABLE circuits (
    id SERIAL PRIMARY KEY,
    external_id VARCHAR(50) UNIQUE,
    name VARCHAR(200) NOT NULL,
    country VARCHAR(100),
    city VARCHAR(100),
    lat DECIMAL(10, 6),
    lng DECIMAL(10, 6)
);

CREATE TABLE races (
    id SERIAL PRIMARY KEY,
    season_id INTEGER REFERENCES seasons(id),
    circuit_id INTEGER REFERENCES circuits(id),
    name VARCHAR(200) NOT NULL,
    round INTEGER NOT NULL,
    date DATE NOT NULL,
    scheduled_time TIMESTAMP,
    UNIQUE(season_id, round)
);

CREATE TABLE sessions (
    id SERIAL PRIMARY KEY,
    race_id INTEGER REFERENCES races(id),
    external_id VARCHAR(50) UNIQUE,
    type VARCHAR(20) NOT NULL CHECK (type IN ('practice_1', 'practice_2', 'practice_3', 'qualifying', 'sprint', 'race')),
    start_time TIMESTAMP,
    end_time TIMESTAMP,
    status VARCHAR(20) DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'live', 'completed', 'cancelled'))
);

CREATE TABLE laps (
    id SERIAL PRIMARY KEY,
    session_id INTEGER REFERENCES sessions(id),
    driver_id INTEGER REFERENCES drivers(id),
    lap_number INTEGER NOT NULL,
    position INTEGER,
    time_ms INTEGER,
    sector_1_ms INTEGER,
    sector_2_ms INTEGER,
    sector_3_ms INTEGER,
    is_pit_in BOOLEAN DEFAULT FALSE,
    is_pit_out BOOLEAN DEFAULT FALSE,
    compound VARCHAR(20),
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(session_id, driver_id, lap_number)
);

CREATE TABLE pit_stops (
    id SERIAL PRIMARY KEY,
    session_id INTEGER REFERENCES sessions(id),
    driver_id INTEGER REFERENCES drivers(id),
    lap INTEGER NOT NULL,
    duration_ms INTEGER,
    tire_compound_old VARCHAR(20),
    tire_compound_new VARCHAR(20),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE positions (
    id SERIAL PRIMARY KEY,
    session_id INTEGER REFERENCES sessions(id),
    driver_id INTEGER REFERENCES drivers(id),
    position INTEGER NOT NULL,
    gap_to_leader_ms INTEGER,
    interval_ms INTEGER,
    last_lap_ms INTEGER,
    recorded_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE standings (
    id SERIAL PRIMARY KEY,
    season_id INTEGER REFERENCES seasons(id),
    driver_id INTEGER REFERENCES drivers(id),
    points DECIMAL(6, 2) DEFAULT 0,
    position INTEGER,
    wins INTEGER DEFAULT 0,
    podiums INTEGER DEFAULT 0,
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(season_id, driver_id)
);

CREATE INDEX idx_laps_session_driver ON laps(session_id, driver_id);
CREATE INDEX idx_positions_session ON positions(session_id, recorded_at);
CREATE INDEX idx_positions_driver ON positions(driver_id);
CREATE INDEX idx_standings_season ON standings(season_id);
