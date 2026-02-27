import type { FastifyInstance } from 'fastify';
import { pool } from '../db/client.js';

export async function driversRoutes(app: FastifyInstance) {
  app.get('/drivers', async () => {
    const result = await pool.query(
      `SELECT d.*, st.points, st.position AS standing_position, st.wins, st.podiums
       FROM drivers d
       LEFT JOIN standings st ON d.id = st.driver_id
       LEFT JOIN seasons s ON st.season_id = s.id
       ORDER BY st.position NULLS LAST`,
    );
    return { drivers: result.rows };
  });

  app.get<{ Params: { id: string } }>('/drivers/:id', async (req) => {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT d.*, st.points, st.position AS standing_position, st.wins, st.podiums
       FROM drivers d
       LEFT JOIN standings st ON d.id = st.driver_id
       WHERE d.id = $1`,
      [id],
    );
    if (result.rows.length === 0) {
      throw { statusCode: 404, message: 'Driver not found' };
    }
    return { driver: result.rows[0] };
  });

  app.get<{ Params: { id: string } }>('/drivers/:id/laps', async (req) => {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT l.*, s.type AS session_type, r.name AS race_name
       FROM laps l
       JOIN sessions s ON l.session_id = s.id
       JOIN races r ON s.race_id = r.id
       WHERE l.driver_id = $1
       ORDER BY r.date DESC, l.lap_number`,
      [id],
    );
    return { laps: result.rows };
  });
}
