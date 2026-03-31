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
       WHERE s.status = 'live'
         OR s.id = (SELECT DISTINCT session_id FROM positions ORDER BY session_id DESC LIMIT 1)
       ORDER BY CASE WHEN s.status = 'live' THEN 0 ELSE 1 END, s.start_time DESC
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
      `SELECT DISTINCT ON (p.driver_id)
         p.*, d.name AS driver_name, d.abbreviation, d.team, d.number
       FROM positions p
       JOIN drivers d ON p.driver_id = d.id
       WHERE p.session_id = (
         SELECT DISTINCT session_id FROM positions ORDER BY session_id DESC LIMIT 1
       )
       ORDER BY p.driver_id, p.recorded_at DESC`,
    );
    const positions = result.rows.sort(
      (a: { position: number }, b: { position: number }) => a.position - b.position,
    );
    if (positions.length > 0) {
      await redis.set('live:positions', JSON.stringify(positions), 'EX', 5);
    }
    return { positions };
  });
}
