import Redis from 'ioredis';
import pino from 'pino';
import { trace } from '@opentelemetry/api';
import { handlePositionChange } from './handlers/positionChange.js';
import { handlePitStop } from './handlers/pitStop.js';
import { handleFastestLap } from './handlers/fastestLap.js';
import { handleSafetyCar } from './handlers/safetyCar.js';

const logger = pino({ name: 'pitwall-notifications' });
const tracer = trace.getTracer('pitwall-notifications');

const CHANNELS = [
  'f1:position-change',
  'f1:pit-stop',
  'f1:fastest-lap',
  'f1:safety-car',
  'f1:session-status',
];

const handlers: Record<string, (data: unknown) => void> = {
  'f1:position-change': handlePositionChange,
  'f1:pit-stop': handlePitStop,
  'f1:fastest-lap': handleFastestLap,
  'f1:safety-car': handleSafetyCar,
  'f1:session-status': (data) => logger.info({ event: 'session_status', data }, 'Session status change'),
};

export async function startSubscriber() {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  const sub = new Redis(redisUrl);

  await sub.subscribe(...CHANNELS);
  logger.info({ channels: CHANNELS }, 'Subscribed to Redis channels');

  sub.on('message', (channel, message) => {
    const span = tracer.startSpan(`notification.${channel}`);
    try {
      const payload = JSON.parse(message);
      span.setAttribute('channel', channel);
      span.setAttribute('event_type', payload.event_type || 'unknown');
      span.setAttribute('session_id', payload.session_id || 0);

      const handler = handlers[channel];
      if (handler) {
        handler(payload);
      } else {
        logger.warn({ channel }, 'No handler for channel');
      }
    } catch (err) {
      logger.error({ err, channel }, 'Failed to process message');
      span.recordException(err as Error);
    } finally {
      span.end();
    }
  });

  return sub;
}
