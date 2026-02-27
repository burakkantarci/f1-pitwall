import { useState, useEffect } from 'react';
import { api } from '../api/client';
import type { Race } from '../types/f1';

export default function RaceCalendar() {
  const [races, setRaces] = useState<Race[]>([]);
  const [year, setYear] = useState(2024);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.getRaces(year)
      .then((res) => setRaces(res.races))
      .catch(() => setRaces([]))
      .finally(() => setLoading(false));
  }, [year]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Race Calendar</h2>
        <div className="flex gap-2">
          {[2023, 2024].map((y) => (
            <button
              key={y}
              onClick={() => setYear(y)}
              className={`px-4 py-1 rounded text-sm ${
                year === y ? 'bg-red-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              {y}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-gray-400">Loading races...</p>
      ) : races.length === 0 ? (
        <p className="text-gray-400">No races found. Run the seed script to load data.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {races.map((race) => (
            <div
              key={race.id}
              className="bg-gray-900 border border-gray-800 rounded-lg p-4 hover:border-red-600 transition-colors"
            >
              <div className="text-xs text-gray-500 mb-1">Round {race.round}</div>
              <h3 className="font-semibold text-lg mb-2">{race.name}</h3>
              <div className="text-sm text-gray-400 space-y-1">
                <div>{(race as unknown as Record<string, unknown>).circuit_name as string}</div>
                <div>{(race as unknown as Record<string, unknown>).circuit_country as string}</div>
                <div className="text-red-400">
                  {new Date(race.date).toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
