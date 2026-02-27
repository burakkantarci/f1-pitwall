import { useState, useEffect } from 'react';
import { api } from '../api/client';
import type { ChaosStatus } from '../types/f1';

export default function AdminPanel() {
  const [chaosStatus, setChaosStatus] = useState<ChaosStatus | null>(null);
  const [replaySessionId, setReplaySessionId] = useState('1');
  const [replaySpeed, setReplaySpeed] = useState('10');
  const [message, setMessage] = useState('');

  const refreshStatus = () => {
    api.getChaosStatus()
      .then(setChaosStatus)
      .catch(() => {});
  };

  useEffect(() => {
    refreshStatus();
    const interval = setInterval(refreshStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const showMsg = (text: string) => {
    setMessage(text);
    setTimeout(() => setMessage(''), 3000);
  };

  const chaosActions = [
    {
      label: 'Inject Latency',
      description: '200-2000ms random delay on all requests',
      active: chaosStatus?.latency.active,
      action: () =>
        api.setChaosLatency({ min_ms: 200, max_ms: 2000, duration_s: 60 }).then(() => {
          showMsg('Latency injection active for 60s');
          refreshStatus();
        }),
    },
    {
      label: 'Inject Errors',
      description: '30% of requests return 500',
      active: chaosStatus?.errors.active,
      action: () =>
        api.setChaosErrors({ rate: 0.3, duration_s: 60 }).then(() => {
          showMsg('Error injection active for 60s');
          refreshStatus();
        }),
    },
    {
      label: 'Memory Leak',
      description: 'Start allocating memory without cleanup',
      active: chaosStatus?.memory_leak.active,
      action: () =>
        api.setChaosMemoryLeak().then(() => {
          showMsg('Memory leak started');
          refreshStatus();
        }),
    },
    {
      label: 'Flush Cache',
      description: 'Clear all Redis caches (FLUSHALL)',
      active: false,
      action: () =>
        api.setChaosCacheFlush().then(() => {
          showMsg('Cache flushed');
          refreshStatus();
        }),
    },
    {
      label: 'Slow Queries',
      description: '500ms pg_sleep before each query',
      active: chaosStatus?.db_slow.active,
      action: () =>
        api.setChaosDbSlow({ delay_ms: 500, duration_s: 60 }).then(() => {
          showMsg('Slow query injection active for 60s');
          refreshStatus();
        }),
    },
  ];

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Admin Panel</h2>

      {message && (
        <div className="mb-4 px-4 py-2 bg-green-900/50 border border-green-700 rounded text-green-300 text-sm">
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Replay Controls */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <h3 className="font-semibold mb-4">Race Replay</h3>
          <p className="text-gray-400 text-sm mb-4">
            Replay a historical session at accelerated speed. Events will be published to Redis
            and streamed to the Live Dashboard.
          </p>
          <div className="flex gap-3 mb-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Session ID</label>
              <input
                type="number"
                value={replaySessionId}
                onChange={(e) => setReplaySessionId(e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm w-24"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Speed</label>
              <select
                value={replaySpeed}
                onChange={(e) => setReplaySpeed(e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm"
              >
                <option value="1">1x (real-time)</option>
                <option value="5">5x</option>
                <option value="10">10x</option>
                <option value="20">20x</option>
                <option value="50">50x</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() =>
                api
                  .startReplay({
                    session_id: parseInt(replaySessionId),
                    speed: parseInt(replaySpeed),
                  })
                  .then(() => showMsg(`Replay started: session ${replaySessionId} at ${replaySpeed}x`))
                  .catch((e) => showMsg(`Error: ${e.message}`))
              }
              className="bg-green-700 hover:bg-green-600 px-4 py-2 rounded text-sm font-medium"
            >
              Start Replay
            </button>
            <button
              onClick={() =>
                fetch(`${import.meta.env.VITE_API_URL}/api/admin/replay/stop`, { method: 'POST' })
                  .then(() => showMsg('Replay stopped'))
                  .catch((e) => showMsg(`Error: ${e.message}`))
              }
              className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded text-sm font-medium"
            >
              Stop
            </button>
          </div>
        </div>

        {/* Chaos Engineering */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Chaos Engineering</h3>
            <button
              onClick={() =>
                api.clearChaos().then(() => {
                  showMsg('All chaos cleared');
                  refreshStatus();
                })
              }
              className="bg-red-700 hover:bg-red-600 px-3 py-1 rounded text-xs font-medium"
            >
              Clear All
            </button>
          </div>
          <div className="space-y-3">
            {chaosActions.map((action) => (
              <div
                key={action.label}
                className="flex items-center justify-between bg-gray-800/50 rounded px-3 py-2"
              >
                <div>
                  <div className="text-sm font-medium flex items-center gap-2">
                    {action.label}
                    {action.active && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-red-900/50 text-red-400">
                        ACTIVE
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500">{action.description}</div>
                </div>
                <button
                  onClick={() => action.action().catch((e: Error) => showMsg(`Error: ${e.message}`))}
                  className="bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded text-xs font-medium shrink-0"
                >
                  Activate
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Status */}
        {chaosStatus && (
          <div className="lg:col-span-2 bg-gray-900 border border-gray-800 rounded-lg p-4">
            <h3 className="font-semibold mb-3">Current Status</h3>
            <pre className="text-xs text-gray-400 bg-gray-800 rounded p-3 overflow-x-auto">
              {JSON.stringify(chaosStatus, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
