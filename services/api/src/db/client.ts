import pg from 'pg';
import pino from 'pino';

const logger = pino({ name: 'postgres' });

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://pitwall:pitwall_dev@localhost:5432/pitwall',
});

pool.on('error', (err) => logger.error({ err: err.message }, 'PostgreSQL pool error'));

export { pool };
