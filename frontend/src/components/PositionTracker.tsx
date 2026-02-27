import { useState, useEffect } from 'react';
import { api } from '../api/client';
import type { Position } from '../types/f1';

export default function PositionTracker() {
  const [positions, setPositions] = useState<Position[]>([]);

  useEffect(() => {
    api.getLivePositions()
      .then((res) => setPositions(res.positions))
      .catch(() => {});
  }, []);

  // Visual mini-position chart
  const maxPos = 20;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
      <h3 className="text-sm font-semibold mb-3">Position Overview</h3>
      {positions.length === 0 ? (
        <p className="text-gray-500 text-xs">No position data available.</p>
      ) : (
        <div className="space-y-1">
          {positions.slice(0, 10).map((pos) => {
            const row = pos as unknown as Record<string, unknown>;
            const barWidth = ((maxPos - pos.position + 1) / maxPos) * 100;
            return (
              <div key={pos.id} className="flex items-center gap-2 text-xs">
                <span className="w-4 text-right font-mono text-gray-500">{pos.position}</span>
                <span className="w-10 text-gray-400 truncate">{String(row.abbreviation ?? '')}</span>
                <div className="flex-1 h-4 bg-gray-800 rounded overflow-hidden">
                  <div
                    className={`h-full rounded ${
                      pos.position === 1
                        ? 'bg-red-600'
                        : pos.position <= 3
                        ? 'bg-yellow-600'
                        : pos.position <= 10
                        ? 'bg-blue-600'
                        : 'bg-gray-600'
                    }`}
                    style={{ width: `${barWidth}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
