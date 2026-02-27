import { useState, useEffect } from 'react';
import { api } from '../api/client';
import type { Standing } from '../types/f1';

export default function DriverStandings() {
  const [standings, setStandings] = useState<Standing[]>([]);
  const [year, setYear] = useState(2024);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.getStandings(year)
      .then((res) => setStandings(res.standings))
      .catch(() => setStandings([]))
      .finally(() => setLoading(false));
  }, [year]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Driver Standings</h2>
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
        <p className="text-gray-400">Loading standings...</p>
      ) : standings.length === 0 ? (
        <p className="text-gray-400">No standings found. Run the seed script to load data.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-400 text-left">
                <th className="py-3 px-4 w-16">Pos</th>
                <th className="py-3 px-4">Driver</th>
                <th className="py-3 px-4">Team</th>
                <th className="py-3 px-4 text-right">Points</th>
                <th className="py-3 px-4 text-right">Wins</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((s) => {
                const row = s as unknown as Record<string, unknown>;
                return (
                  <tr key={s.id} className="border-b border-gray-800/50 hover:bg-gray-900">
                    <td className="py-3 px-4 font-mono">
                      <span className={`${s.position <= 3 ? 'text-yellow-400' : 'text-gray-300'}`}>
                        {s.position}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-gray-500 font-mono w-6">
                          {String(row.number ?? '')}
                        </span>
                        <div>
                          <div className="font-medium">{String(row.driver_name ?? '')}</div>
                          <div className="text-xs text-gray-500">{String(row.abbreviation ?? '')}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-gray-400">{String(row.team ?? '')}</td>
                    <td className="py-3 px-4 text-right font-mono font-semibold">{s.points}</td>
                    <td className="py-3 px-4 text-right font-mono">{s.wins}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
