import './telemetry/tracing.js';

import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { racesRoutes } from './routes/races.js';
import { driversRoutes } from './routes/drivers.js';
import { sessionsRoutes } from './routes/sessions.js';
import { liveRoutes } from './routes/live.js';
import { chaosRoutes } from './routes/chaos.js';
import { k8sChaosRoutes } from './routes/k8s-chaos.js';
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
await app.register(k8sChaosRoutes, { prefix: '/api' });

// Admin - replay proxy to ingestion service
app.post<{ Body: { session_id: number; speed: number } }>('/api/admin/replay', async (req) => {
  const { session_id, speed } = req.body;
  const ingestionUrl = process.env.INGESTION_URL || 'http://ingestion:8000';
  const res = await fetch(`${ingestionUrl}/replay?session_id=${session_id}&speed=${speed}`, {
    method: 'POST',
  });
  return res.json();
});

app.post('/api/admin/replay/stop', async () => {
  const ingestionUrl = process.env.INGESTION_URL || 'http://ingestion:8000';
  const res = await fetch(`${ingestionUrl}/replay/stop`, { method: 'POST' });
  return res.json();
});

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
