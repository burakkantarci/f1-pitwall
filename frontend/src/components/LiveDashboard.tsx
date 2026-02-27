import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';
import { useWebSocket } from '../hooks/useWebSocket';
import type { Position, Session, WSMessage } from '../types/f1';
import LapTimeChart from './LapTimeChart';
import PositionTracker from './PositionTracker';

function formatGap(ms: number | null): string {
  if (ms === null || ms === 0) return 'LEADER';
  const seconds = ms / 1000;
  return `+${seconds.toFixed(3)}`;
}

function formatLapTime(ms: number | null): string {
  if (ms === null) return '-';
  const minutes = Math.floor(ms / 60000);
  const seconds = ((ms % 60000) / 1000).toFixed(3);
  return minutes > 0 ? `${minutes}:${seconds.padStart(6, '0')}` : seconds;
}

export default function LiveDashboard() {
  const [session, setSession] = useState<Session | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<{ type: string; text: string; time: string }[]>([]);

  useEffect(() => {
    Promise.all([api.getLiveSession(), api.getLivePositions()])
      .then(([sessionRes, posRes]) => {
        setSession(sessionRes.session);
        setPositions(posRes.positions);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const onMessage = useCallback((msg: WSMessage) => {
    const now = new Date().toLocaleTimeString();

    switch (msg.type) {
      case 'position_update':
        setPositions(msg.data);
        break;
      case 'lap_complete':
        setEvents((prev) => [
          { type: 'lap', text: `Lap complete: ${formatLapTime(msg.data.time_ms)}`, time: now },
          ...prev.slice(0, 49),
        ]);
        break;
      case 'pit_stop':
        setEvents((prev) => [
          { type: 'pit', text: `Pit stop`, time: now },
          ...prev.slice(0, 49),
        ]);
        break;
      case 'fastest_lap':
        setEvents((prev) => [
          { type: 'fastest', text: `Fastest lap: ${formatLapTime(msg.data.time_ms)}`, time: now },
          ...prev.slice(0, 49),
        ]);
        break;
      case 'session_status':
        setEvents((prev) => [
          { type: 'status', text: `Session: ${msg.data.status}`, time: now },
          ...prev.slice(0, 49),
        ]);
        break;
    }
  }, []);

  const { connected } = useWebSocket(onMessage);

  const sessionRow = session as unknown as Record<string, unknown> | null;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">Live Dashboard</h2>
          {sessionRow && (
            <p className="text-gray-400 text-sm mt-1">
              {String(sessionRow.race_name ?? 'Session')} - {session?.type?.replace('_', ' ')}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${
              connected ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400' : 'bg-red-400'}`} />
            {connected ? 'Connected' : 'Disconnected'}
          </span>
          {session && (
            <span
              className={`px-3 py-1 rounded-full text-xs font-medium ${
                session.status === 'live'
                  ? 'bg-green-900/50 text-green-400'
                  : session.status === 'completed'
                  ? 'bg-gray-800 text-gray-400'
                  : 'bg-yellow-900/50 text-yellow-400'
              }`}
            >
              {session.status.toUpperCase()}
            </span>
          )}
        </div>
      </div>

      {loading ? (
        <p className="text-gray-400">Loading live data...</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Position Tower */}
          <div className="lg:col-span-2">
            <div className="bg-gray-900 border border-gray-800 rounded-lg">
              <div className="px-4 py-3 border-b border-gray-800">
                <h3 className="font-semibold">Position Tower</h3>
              </div>
              {positions.length === 0 ? (
                <div className="p-4 text-gray-400 text-sm">
                  No position data. Start a replay from the Admin panel to see live data.
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-500 text-xs border-b border-gray-800">
                      <th className="py-2 px-4 text-left">POS</th>
                      <th className="py-2 px-4 text-left">DRIVER</th>
                      <th className="py-2 px-4 text-left">TEAM</th>
                      <th className="py-2 px-4 text-right">GAP</th>
                      <th className="py-2 px-4 text-right">INTERVAL</th>
                      <th className="py-2 px-4 text-right">LAST LAP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {positions.map((pos) => {
                      const row = pos as unknown as Record<string, unknown>;
                      return (
                        <tr key={pos.id} className="border-b border-gray-800/30 hover:bg-gray-800/30">
                          <td className="py-2 px-4 font-mono font-bold">
                            <span className={pos.position <= 3 ? 'text-yellow-400' : ''}>{pos.position}</span>
                          </td>
                          <td className="py-2 px-4">
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-500 font-mono">{String(row.number ?? '')}</span>
                              <span className="font-medium">{String(row.driver_name ?? String(row.abbreviation ?? ''))}</span>
                            </div>
                          </td>
                          <td className="py-2 px-4 text-gray-400">{String(row.team ?? '')}</td>
                          <td className="py-2 px-4 text-right font-mono text-gray-300">
                            {formatGap(pos.gap_to_leader_ms)}
                          </td>
                          <td className="py-2 px-4 text-right font-mono text-gray-300">
                            {pos.interval_ms ? `+${(pos.interval_ms / 1000).toFixed(3)}` : '-'}
                          </td>
                          <td className="py-2 px-4 text-right font-mono text-gray-300">
                            {formatLapTime(pos.last_lap_ms)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              <LapTimeChart />
              <PositionTracker />
            </div>
          </div>

          {/* Event Feed */}
          <div>
            <div className="bg-gray-900 border border-gray-800 rounded-lg">
              <div className="px-4 py-3 border-b border-gray-800">
                <h3 className="font-semibold">Live Events</h3>
              </div>
              <div className="max-h-[600px] overflow-y-auto">
                {events.length === 0 ? (
                  <div className="p-4 text-gray-500 text-sm">Waiting for events...</div>
                ) : (
                  events.map((event, i) => (
                    <div key={i} className="px-4 py-2 border-b border-gray-800/30 text-sm">
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            event.type === 'fastest'
                              ? 'bg-purple-500'
                              : event.type === 'pit'
                              ? 'bg-yellow-500'
                              : event.type === 'status'
                              ? 'bg-blue-500'
                              : 'bg-green-500'
                          }`}
                        />
                        <span className="text-gray-300">{event.text}</span>
                        <span className="ml-auto text-xs text-gray-600">{event.time}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
