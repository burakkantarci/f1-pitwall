import type { FastifyInstance } from 'fastify';
import { trace } from '@opentelemetry/api';
import { pool } from '../db/client.js';
import { redis } from '../cache/redis.js';

interface ChaosState {
  latency: { active: boolean; min_ms: number; max_ms: number; timer?: ReturnType<typeof setTimeout> };
  errors: { active: boolean; rate: number; timer?: ReturnType<typeof setTimeout> };
  memoryLeak: { active: boolean; data: unknown[] };
  dbSlow: { active: boolean; delay_ms: number; timer?: ReturnType<typeof setTimeout> };
}

const chaos: ChaosState = {
  latency: { active: false, min_ms: 0, max_ms: 0 },
  errors: { active: false, rate: 0 },
  memoryLeak: { active: false, data: [] },
  dbSlow: { active: false, delay_ms: 0 },
};

export async function chaosRoutes(app: FastifyInstance) {
  const tracer = trace.getTracer('pitwall-chaos');

  // Chaos middleware — applied globally via hooks
  app.addHook('onRequest', async (req, reply) => {
    if (req.url.startsWith('/api/chaos') || req.url === '/api/health') return;

    if (chaos.latency.active) {
      const delay = Math.random() * (chaos.latency.max_ms - chaos.latency.min_ms) + chaos.latency.min_ms;
      const span = tracer.startSpan('chaos.latency_injection');
      span.setAttribute('chaos.delay_ms', delay);
      await new Promise((resolve) => setTimeout(resolve, delay));
      span.end();
    }

    if (chaos.errors.active && Math.random() < chaos.errors.rate) {
      const span = tracer.startSpan('chaos.error_injection');
      span.setAttribute('chaos.error_rate', chaos.errors.rate);
      span.end();
      reply.code(500).send({ error: 'Chaos error injection', chaos: true });
    }
  });

  app.addHook('preHandler', async () => {
    if (chaos.dbSlow.active) {
      const span = tracer.startSpan('chaos.db_slow_injection');
      span.setAttribute('chaos.db_delay_ms', chaos.dbSlow.delay_ms);
      await pool.query(`SELECT pg_sleep($1)`, [chaos.dbSlow.delay_ms / 1000]);
      span.end();
    }
  });

  app.post<{ Body: { min_ms: number; max_ms: number; duration_s: number } }>('/chaos/latency', async (req) => {
    const { min_ms, max_ms, duration_s } = req.body;
    if (chaos.latency.timer) clearTimeout(chaos.latency.timer);
    chaos.latency = {
      active: true,
      min_ms,
      max_ms,
      timer: setTimeout(() => { chaos.latency.active = false; }, duration_s * 1000),
    };
    app.log.info({ min_ms, max_ms, duration_s }, 'Chaos: latency injection activated');
    return { status: 'active', min_ms, max_ms, duration_s };
  });

  app.post<{ Body: { rate: number; duration_s: number } }>('/chaos/errors', async (req) => {
    const { rate, duration_s } = req.body;
    if (chaos.errors.timer) clearTimeout(chaos.errors.timer);
    chaos.errors = {
      active: true,
      rate,
      timer: setTimeout(() => { chaos.errors.active = false; }, duration_s * 1000),
    };
    app.log.info({ rate, duration_s }, 'Chaos: error injection activated');
    return { status: 'active', rate, duration_s };
  });

  app.post('/chaos/memory-leak', async () => {
    chaos.memoryLeak.active = true;
    const interval = setInterval(() => {
      if (!chaos.memoryLeak.active) {
        clearInterval(interval);
        return;
      }
      chaos.memoryLeak.data.push(new Array(10000).fill('leak'));
    }, 100);
    app.log.info('Chaos: memory leak activated');
    return { status: 'active' };
  });

  app.post('/chaos/cache-flush', async () => {
    await redis.flushall();
    app.log.info('Chaos: cache flushed');
    return { status: 'flushed' };
  });

  app.post<{ Body: { delay_ms: number; duration_s: number } }>('/chaos/db-slow', async (req) => {
    const { delay_ms, duration_s } = req.body;
    if (chaos.dbSlow.timer) clearTimeout(chaos.dbSlow.timer);
    chaos.dbSlow = {
      active: true,
      delay_ms,
      timer: setTimeout(() => { chaos.dbSlow.active = false; }, duration_s * 1000),
    };
    app.log.info({ delay_ms, duration_s }, 'Chaos: slow DB injection activated');
    return { status: 'active', delay_ms, duration_s };
  });

  app.delete('/chaos', async () => {
    if (chaos.latency.timer) clearTimeout(chaos.latency.timer);
    if (chaos.errors.timer) clearTimeout(chaos.errors.timer);
    if (chaos.dbSlow.timer) clearTimeout(chaos.dbSlow.timer);
    chaos.latency = { active: false, min_ms: 0, max_ms: 0 };
    chaos.errors = { active: false, rate: 0 };
    chaos.memoryLeak = { active: false, data: [] };
    chaos.dbSlow = { active: false, delay_ms: 0 };
    app.log.info('Chaos: all injections cleared');
    return { status: 'cleared' };
  });

  app.get('/chaos/status', async () => ({
    latency: { active: chaos.latency.active, min_ms: chaos.latency.min_ms, max_ms: chaos.latency.max_ms },
    errors: { active: chaos.errors.active, rate: chaos.errors.rate },
    memory_leak: { active: chaos.memoryLeak.active, entries: chaos.memoryLeak.data.length },
    db_slow: { active: chaos.dbSlow.active, delay_ms: chaos.dbSlow.delay_ms },
  }));
}
