import pino from 'pino';

const logger = pino({ name: 'pitwall-notifications.safety-car' });

export function handleSafetyCar(payload: unknown): void {
  const data = (payload as { data?: Record<string, unknown> })?.data;
  if (!data) return;

  logger.info({
    event: 'safety_car',
    status: data.status,
    lap: data.lap,
  }, `Safety car: ${data.status}`);
}
