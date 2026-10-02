require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const { pool } = require('../src/db');

// ─── Pre-flight check ─────────────────────────────────────────────────────────
if (!process.env.DATABASE_URL) {
  console.error('[migrate] ERROR: DATABASE_URL is not set.');
  console.error('[migrate] Copy .env.example → .env and fill in your PostgreSQL connection string.');
  process.exit(1);
}

(async () => {
  try {
    const sqlFile = path.join(__dirname, '../migrations/001_sprint2_catalog.sql');
    const sql = fs.readFileSync(sqlFile, 'utf8');
    console.log('[migrate] Running: 001_sprint2_catalog.sql...');
    await pool.query(sql);
    console.log('[migrate] ✓ Migration completed successfully.');
    console.log('[migrate] Run "npm run seed" to load sample data.');
  } catch (err) {
    console.error('[migrate] Migration failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();

