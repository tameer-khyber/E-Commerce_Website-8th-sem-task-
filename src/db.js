require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Log pool-level errors (e.g. connection drops) instead of crashing
pool.on('error', (err) => {
  console.error('[DB Pool Error]', err.message);
});

module.exports = { pool };

