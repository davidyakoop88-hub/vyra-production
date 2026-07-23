'use strict';

const { Pool } = require('pg');

const databaseUrl = process.env.DATABASE_URL || '';
let railwayInternal = false;

try {
  const url = new URL(databaseUrl);
  railwayInternal = /\.railway\.internal$/i.test(url.hostname);
} catch {}

const pool = new Pool({
  connectionString: databaseUrl,
  max: Number(process.env.DB_POOL_SIZE || 20),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  ssl: railwayInternal
    ? false
    : process.env.DATABASE_SSL === 'require'
      ? { rejectUnauthorized: true }
      : false
});

async function tx(fn) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { pool, tx };
