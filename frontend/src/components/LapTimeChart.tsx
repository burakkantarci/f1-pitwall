import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { api } from '../api/client';
import type { Lap } from '../types/f1';

export default function LapTimeChart() {
  const [laps, setLaps] = useState<Lap[]>([]);

  useEffect(() => {
    // Load laps for the first race (demo data)
    api.getRaceLaps(1)
      .then((res) => setLaps(res.laps))
      .catch(() => {});
  }, []);

  // Group laps by driver
  const driverLaps = laps.reduce<Record<string, { lap: number; time: number }[]>>((acc, lap) => {
    const row = lap as unknown as Record<string, unknown>;
    const name = String(row.abbreviation ?? row.driver_name ?? `D${lap.driver_id}`);
    if (!acc[name]) acc[name] = [];
    if (lap.time_ms) {
      acc[name].push({ lap: lap.lap_number, time: lap.time_ms / 1000 });
    }
    return acc;
  }, {});

  // Build chart data: one entry per lap number with each driver's time
  const drivers = Object.keys(driverLaps).slice(0, 5); // top 5 for readability
  const maxLap = Math.max(0, ...laps.map((l) => l.lap_number));
  const chartData = Array.from({ length: maxLap }, (_, i) => {
    const lapNum = i + 1;
    const entry: Record<string, number> = { lap: lapNum };
    for (const driver of drivers) {
      const found = driverLaps[driver]?.find((l) => l.lap === lapNum);
      if (found) entry[driver] = found.time;
    }
    return entry;
  });

  const colors = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7'];

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
      <h3 className="text-sm font-semibold mb-3">Lap Times</h3>
      {chartData.length === 0 ? (
        <p className="text-gray-500 text-xs">No lap data available.</p>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={chartData}>
            <XAxis dataKey="lap" stroke="#4b5563" tick={{ fontSize: 10 }} />
            <YAxis
              stroke="#4b5563"
              tick={{ fontSize: 10 }}
              domain={['dataMin - 2', 'dataMax + 2']}
              tickFormatter={(v: number) => `${v.toFixed(0)}s`}
            />
            <Tooltip
              contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151' }}
              labelStyle={{ color: '#9ca3af' }}
              formatter={(value: number) => [`${value.toFixed(3)}s`, '']}
            />
            {drivers.map((driver, i) => (
              <Line
                key={driver}
                type="monotone"
                dataKey={driver}
                stroke={colors[i % colors.length]}
                dot={false}
                strokeWidth={1.5}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
