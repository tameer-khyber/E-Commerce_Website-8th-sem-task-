/**
 * scripts/reset.js
 *
 * Development helper — drops all Sprint 2 tables then re-runs the migration.
 * Use when you want a clean slate (e.g. after schema changes during development).
 *
 * Usage:   npm run reset
 *
 * WARNING: This destroys ALL data in the local database.
 *          It will refuse to run when NODE_ENV=production.
 */

require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const { pool } = require('../src/db');

// Safety Guard
if (process.env.NODE_ENV === 'production') {
  console.error('[reset] Refused: NODE_ENV is "production". This script is dev-only.');
  process.exit(1);
}

// Drop tables in reverse dependency order
const DROP_SQL = `
  DROP TABLE IF EXISTS order_items    CASCADE;
  DROP TABLE IF EXISTS orders         CASCADE;
  DROP TABLE IF EXISTS cart_items     CASCADE;
  DROP TABLE IF EXISTS carts          CASCADE;
  DROP TABLE IF EXISTS wishlist_items CASCADE;
  DROP TABLE IF EXISTS reviews        CASCADE;
  DROP TABLE IF EXISTS assets         CASCADE;
  DROP TABLE IF EXISTS skus           CASCADE;
  DROP TABLE IF EXISTS variants       CASCADE;
  DROP TABLE IF EXISTS products       CASCADE;
  DROP TABLE IF EXISTS categories     CASCADE;
  DROP TABLE IF EXISTS users          CASCADE;
`;

(async () => {
  try {
    console.log('[reset] Dropping all Sprint 2 tables...');
    await pool.query(DROP_SQL);
    console.log('[reset] All tables dropped.');

    console.log('[reset] Re-running migration: 001_sprint2_catalog.sql');
    const sqlFile = path.join(__dirname, '../migrations/001_sprint2_catalog.sql');
    const sql = fs.readFileSync(sqlFile, 'utf8');
    await pool.query(sql);
    console.log('[reset] Migration complete. Database is clean and ready.');
    console.log('[reset] Run "npm run seed" to reload sample data.');
  } catch (err) {
    console.error('[reset] Failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
