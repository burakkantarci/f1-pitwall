import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://pitwall:pitwall_dev@localhost:5432/pitwall',
});

export { pool };
