const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {};
  if (options?.body) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(`${API_URL}${path}`, {
    headers,
    ...options,
  });
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export const api = {
  getSeasons: () => request<{ seasons: import('../types/f1').Season[] }>('/api/seasons'),
  getRaces: (year: number) => request<{ races: import('../types/f1').Race[] }>(`/api/seasons/${year}/races`),
  getRace: (id: number) => request<{ race: import('../types/f1').Race }>(`/api/races/${id}`),
  getRaceLaps: (id: number) => request<{ laps: import('../types/f1').Lap[] }>(`/api/races/${id}/laps`),
  getRacePitstops: (id: number) => request<{ pitstops: import('../types/f1').PitStop[] }>(`/api/races/${id}/pitstops`),
  getDrivers: () => request<{ drivers: import('../types/f1').Driver[] }>('/api/drivers'),
  getDriver: (id: number) => request<{ driver: import('../types/f1').Driver }>(`/api/drivers/${id}`),
  getDriverLaps: (id: number) => request<{ laps: import('../types/f1').Lap[] }>(`/api/drivers/${id}/laps`),
  getLiveSession: () => request<{ session: import('../types/f1').Session }>('/api/live/session'),
  getLivePositions: () => request<{ positions: import('../types/f1').Position[] }>('/api/live/positions'),
  getStandings: (year: number) => request<{ standings: import('../types/f1').Standing[] }>(`/api/standings/${year}/drivers`),
  getChaosStatus: () => request<import('../types/f1').ChaosStatus>('/api/chaos/status'),
  setChaosLatency: (body: { min_ms: number; max_ms: number; duration_s: number }) =>
    request('/api/chaos/latency', { method: 'POST', body: JSON.stringify(body) }),
  setChaosErrors: (body: { rate: number; duration_s: number }) =>
    request('/api/chaos/errors', { method: 'POST', body: JSON.stringify(body) }),
  setChaosMemoryLeak: () => request('/api/chaos/memory-leak', { method: 'POST' }),
  setChaosCacheFlush: () => request('/api/chaos/cache-flush', { method: 'POST' }),
  setChaosDbSlow: (body: { delay_ms: number; duration_s: number }) =>
    request('/api/chaos/db-slow', { method: 'POST', body: JSON.stringify(body) }),
  clearChaos: () => request('/api/chaos', { method: 'DELETE' }),
  startReplay: (body: { session_id: number; speed: number }) =>
    request('/api/admin/replay', { method: 'POST', body: JSON.stringify(body) }),
  // Infrastructure chaos
  infraRedisKill: () => request('/api/chaos/infra/redis-kill', { method: 'POST' }),
  infraRedisRestore: () => request('/api/chaos/infra/redis-restore', { method: 'POST' }),
  infraDbKill: () => request('/api/chaos/infra/db-kill', { method: 'POST' }),
  infraDbRestore: () => request('/api/chaos/infra/db-restore', { method: 'POST' }),
  infraIngestionKill: () => request('/api/chaos/infra/ingestion-kill', { method: 'POST' }),
  infraIngestionRestore: () => request('/api/chaos/infra/ingestion-restore', { method: 'POST' }),
  infraNotificationsKill: () => request('/api/chaos/infra/notifications-kill', { method: 'POST' }),
  infraNotificationsRestore: () => request('/api/chaos/infra/notifications-restore', { method: 'POST' }),
  infraMeltdown: () => request('/api/chaos/infra/meltdown', { method: 'POST' }),
  infraMeltdownRestore: () => request('/api/chaos/infra/meltdown-restore', { method: 'POST' }),
  infraStatus: () => request<Record<string, { desired: number; ready: number }>>('/api/chaos/infra/status'),
};
