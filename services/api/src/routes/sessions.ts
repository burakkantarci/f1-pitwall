import type { FastifyInstance } from 'fastify';
import { pool } from '../db/client.js';

export async function sessionsRoutes(app: FastifyInstance) {
  app.get<{ Params: { year: string } }>('/standings/:year/drivers', async (req) => {
    const { year } = req.params;
    const result = await pool.query(
      `SELECT st.*, d.name AS driver_name, d.abbreviation, d.team, d.number
       FROM standings st
       JOIN seasons s ON st.season_id = s.id
       JOIN drivers d ON st.driver_id = d.id
       WHERE s.year = $1
       ORDER BY st.position`,
      [year],
    );
    return { standings: result.rows };
  });

  app.get<{ Params: { year: string } }>('/standings/:year/constructors', async (req) => {
    const { year } = req.params;
    const result = await pool.query(
      `SELECT d.team, SUM(st.points) AS points, SUM(st.wins) AS wins
       FROM standings st
       JOIN seasons s ON st.season_id = s.id
       JOIN drivers d ON st.driver_id = d.id
       WHERE s.year = $1
       GROUP BY d.team
       ORDER BY points DESC`,
      [year],
    );
    return { standings: result.rows };
  });
}
