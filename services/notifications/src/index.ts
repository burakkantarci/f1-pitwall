import './telemetry/tracing.js';

import pino from 'pino';
import { startSubscriber } from './subscriber.js';

const logger = pino({ name: 'pitwall-notifications' });

async function main() {
  logger.info('Starting pitwall-notifications service');

  try {
    await startSubscriber();
    logger.info('Notification service running, listening for events');
  } catch (err) {
    logger.error({ err }, 'Failed to start notification service');
    process.exit(1);
  }
}

main();
