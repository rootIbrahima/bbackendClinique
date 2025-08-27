import pg from 'pg';
const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // en local, pas de SSL
});

export const q = (text, params = []) => pool.query(text, params);
