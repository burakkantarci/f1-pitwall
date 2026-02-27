import pino from 'pino';

const logger = pino({ name: 'pitwall-notifications.pitstop' });

export function handlePitStop(payload: unknown): void {
  const data = (payload as { data?: Record<string, unknown> })?.data;
  if (!data) return;

  logger.info({
    event: 'pit_stop',
    driver: data.driver_name,
    lap: data.lap,
    duration_ms: data.duration_ms,
  }, `Pit stop: ${data.driver_name} on lap ${data.lap} (${data.duration_ms}ms)`);
}
