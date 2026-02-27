import type { FastifyInstance } from 'fastify';
import { pool } from '../db/client.js';
import { redis } from '../cache/redis.js';

export async function liveRoutes(app: FastifyInstance) {
  app.get('/live/session', async () => {
    // Check cache first
    const cached = await redis.get('live:session');
    if (cached) return { session: JSON.parse(cached) };

    const result = await pool.query(
      `SELECT s.*, r.name AS race_name
       FROM sessions s
       JOIN races r ON s.race_id = r.id
       WHERE s.status IN ('live', 'completed')
       ORDER BY s.start_time DESC
       LIMIT 1`,
    );
    const session = result.rows[0] || null;
    if (session) {
      await redis.set('live:session', JSON.stringify(session), 'EX', 30);
    }
    return { session };
  });

  app.get('/live/positions', async () => {
    const cached = await redis.get('live:positions');
    if (cached) return { positions: JSON.parse(cached) };

    const result = await pool.query(
      `SELECT p.*, d.name AS driver_name, d.abbreviation, d.team, d.number
       FROM positions p
       JOIN drivers d ON p.driver_id = d.id
       WHERE p.session_id = (
         SELECT id FROM sessions WHERE status = 'live' ORDER BY start_time DESC LIMIT 1
       )
       AND p.recorded_at = (
         SELECT MAX(recorded_at) FROM positions WHERE session_id = p.session_id
       )
       ORDER BY p.position`,
    );
    const positions = result.rows;
    if (positions.length > 0) {
      await redis.set('live:positions', JSON.stringify(positions), 'EX', 5);
    }
    return { positions };
  });
}
