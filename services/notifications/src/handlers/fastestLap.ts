import pino from 'pino';

const logger = pino({ name: 'pitwall-notifications.fastest-lap' });

export function handleFastestLap(payload: unknown): void {
  const data = (payload as { data?: Record<string, unknown> })?.data;
  if (!data) return;

  const timeMs = data.time_ms as number;
  const minutes = Math.floor(timeMs / 60000);
  const seconds = ((timeMs % 60000) / 1000).toFixed(3);

  logger.info({
    event: 'fastest_lap',
    driver: data.driver_name,
    lap_number: data.lap_number,
    time_ms: timeMs,
  }, `Fastest lap: ${data.driver_name} - ${minutes}:${seconds} on lap ${data.lap_number}`);
}
