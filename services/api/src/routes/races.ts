import type { FastifyInstance } from 'fastify';
import { pool } from '../db/client.js';

export async function racesRoutes(app: FastifyInstance) {
  app.get('/seasons', async () => {
    const result = await pool.query('SELECT * FROM seasons ORDER BY year DESC');
    return { seasons: result.rows };
  });

  app.get<{ Params: { year: string } }>('/seasons/:year/races', async (req) => {
    const { year } = req.params;
    const result = await pool.query(
      `SELECT r.*, c.name AS circuit_name, c.country AS circuit_country, c.city AS circuit_city
       FROM races r
       JOIN seasons s ON r.season_id = s.id
       LEFT JOIN circuits c ON r.circuit_id = c.id
       WHERE s.year = $1
       ORDER BY r.round`,
      [year],
    );
    return { races: result.rows };
  });

  app.get<{ Params: { id: string } }>('/races/:id', async (req) => {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT r.*, c.name AS circuit_name, c.country AS circuit_country
       FROM races r
       LEFT JOIN circuits c ON r.circuit_id = c.id
       WHERE r.id = $1`,
      [id],
    );
    if (result.rows.length === 0) {
      throw { statusCode: 404, message: 'Race not found' };
    }
    return { race: result.rows[0] };
  });

  app.get<{ Params: { id: string } }>('/races/:id/laps', async (req) => {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT l.*, d.name AS driver_name, d.abbreviation
       FROM laps l
       JOIN sessions s ON l.session_id = s.id
       JOIN drivers d ON l.driver_id = d.id
       WHERE s.race_id = $1 AND s.type = 'race'
       ORDER BY l.lap_number, l.position`,
      [id],
    );
    return { laps: result.rows };
  });

  app.get<{ Params: { id: string } }>('/races/:id/pitstops', async (req) => {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT ps.*, d.name AS driver_name, d.abbreviation
       FROM pit_stops ps
       JOIN sessions s ON ps.session_id = s.id
       JOIN drivers d ON ps.driver_id = d.id
       WHERE s.race_id = $1 AND s.type = 'race'
       ORDER BY ps.lap, ps.driver_id`,
      [id],
    );
    return { pitstops: result.rows };
  });
}
