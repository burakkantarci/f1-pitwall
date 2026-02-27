import './telemetry/tracing.js';

import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { racesRoutes } from './routes/races.js';
import { driversRoutes } from './routes/drivers.js';
import { sessionsRoutes } from './routes/sessions.js';
import { liveRoutes } from './routes/live.js';
import { chaosRoutes } from './routes/chaos.js';
import { wsHandler } from './websocket/handler.js';

const app = Fastify({
  logger: {
    transport: {
      target: 'pino/file',
    },
    level: 'info',
  },
});

await app.register(cors, { origin: true });
await app.register(websocket);

// Health check
app.get('/api/health', async () => ({ status: 'ok', service: 'pitwall-api' }));

// Routes
await app.register(racesRoutes, { prefix: '/api' });
await app.register(driversRoutes, { prefix: '/api' });
await app.register(sessionsRoutes, { prefix: '/api' });
await app.register(liveRoutes, { prefix: '/api' });
await app.register(chaosRoutes, { prefix: '/api' });

// WebSocket
await app.register(wsHandler);

const port = parseInt(process.env.PORT || '3001', 10);

try {
  await app.listen({ port, host: '0.0.0.0' });
  app.log.info(`pitwall-api listening on port ${port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
