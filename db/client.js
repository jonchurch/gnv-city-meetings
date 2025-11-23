import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

/**
 * PostgreSQL connection pool
 * Uses connection pooling for efficient connection reuse
 */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Connection pool settings
  max: 20,                    // Maximum number of clients in the pool
  idleTimeoutMillis: 30000,   // Close idle clients after 30 seconds
  connectionTimeoutMillis: 2000, // Return error if connection takes > 2 seconds
});

// Log pool errors
pool.on('error', (err, client) => {
  console.error('Unexpected error on idle PostgreSQL client', err);
  process.exit(-1);
});

/**
 * Query helper - executes a SQL query and returns results
 * @param {string} text - SQL query text
 * @param {Array} params - Query parameters (uses $1, $2, etc.)
 * @returns {Promise<pg.QueryResult>}
 */
export async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;

    // Log slow queries (> 100ms)
    if (duration > 100) {
      console.log('Slow query:', { text, duration, rows: res.rowCount });
    }

    return res;
  } catch (error) {
    console.error('Database query error:', { text, params, error: error.message });
    throw error;
  }
}

/**
 * Get a client from the pool for transactions
 * Remember to call client.release() when done!
 * @returns {Promise<pg.PoolClient>}
 */
export async function getClient() {
  const client = await pool.connect();
  return client;
}

/**
 * Close the connection pool
 * Call this when shutting down the application
 */
export async function close() {
  await pool.end();
}

export default {
  query,
  getClient,
  close,
};
