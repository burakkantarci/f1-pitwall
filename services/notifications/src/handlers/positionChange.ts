import pino from 'pino';

const logger = pino({ name: 'pitwall-notifications.position' });

export function handlePositionChange(payload: unknown): void {
  const data = (payload as { data?: Record<string, unknown> })?.data;
  if (!data) return;

  logger.info({
    event: 'position_change',
    driver: data.driver_name,
    old_position: data.old_position,
    new_position: data.new_position,
    lap: data.lap,
  }, `Position change: ${data.driver_name} P${data.old_position} -> P${data.new_position}`);
}
