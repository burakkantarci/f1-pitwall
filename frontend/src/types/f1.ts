export interface Driver {
  id: number;
  external_id: string;
  name: string;
  abbreviation: string;
  number: number;
  team: string;
  country: string;
  headshot_url: string | null;
}

export interface Season {
  id: number;
  year: number;
}

export interface Circuit {
  id: number;
  external_id: string;
  name: string;
  country: string;
  city: string;
  lat: number;
  lng: number;
}

export interface Race {
  id: number;
  season_id: number;
  circuit_id: number;
  name: string;
  round: number;
  date: string;
  scheduled_time: string | null;
  circuit?: Circuit;
}

export interface Session {
  id: number;
  race_id: number;
  external_id: string;
  type: 'practice_1' | 'practice_2' | 'practice_3' | 'qualifying' | 'sprint' | 'race';
  start_time: string | null;
  end_time: string | null;
  status: 'scheduled' | 'live' | 'completed' | 'cancelled';
}

export interface Lap {
  id: number;
  session_id: number;
  driver_id: number;
  lap_number: number;
  position: number | null;
  time_ms: number | null;
  sector_1_ms: number | null;
  sector_2_ms: number | null;
  sector_3_ms: number | null;
  is_pit_in: boolean;
  is_pit_out: boolean;
  compound: string | null;
}

export interface PitStop {
  id: number;
  session_id: number;
  driver_id: number;
  lap: number;
  duration_ms: number | null;
  tire_compound_old: string | null;
  tire_compound_new: string | null;
}

export interface Position {
  id: number;
  session_id: number;
  driver_id: number;
  position: number;
  gap_to_leader_ms: number | null;
  interval_ms: number | null;
  last_lap_ms: number | null;
  recorded_at: string;
  driver?: Driver;
}

export interface Standing {
  id: number;
  season_id: number;
  driver_id: number;
  points: number;
  position: number;
  wins: number;
  podiums: number;
  driver?: Driver;
}

export interface ChaosStatus {
  latency: { active: boolean; min_ms?: number; max_ms?: number; expires_at?: string };
  errors: { active: boolean; rate?: number; expires_at?: string };
  memory_leak: { active: boolean };
  cache_flush: { last_flushed?: string };
  db_slow: { active: boolean; delay_ms?: number; expires_at?: string };
}

export type WSMessage =
  | { type: 'position_update'; data: Position[] }
  | { type: 'lap_complete'; data: Lap }
  | { type: 'pit_stop'; data: PitStop }
  | { type: 'fastest_lap'; data: Lap }
  | { type: 'session_status'; data: { session_id: number; status: string } };
