require('dotenv').config();
const app        = require('./app');
const { pool }   = require('./db');
const port       = process.env.PORT || 3000;

const server = app.listen(port, () =>
  console.log(`S&P Clovers API running on http://localhost:${port}`)
);

// ─── Graceful Shutdown ────────────────────────────────────────────────────────
// Allows in-flight requests to finish before the process exits.
// Required for Docker, PM2, and cloud environments.

async function shutdown(signal) {
  console.log(`\n[Server] ${signal} received — shutting down gracefully...`);
  server.close(async () => {
    console.log('[Server] HTTP server closed');
    await pool.end();
    console.log('[Server] DB pool closed');
    process.exit(0);
  });

  // Force exit after 10 s if connections don't close
  setTimeout(() => {
    console.error('[Server] Forced exit after timeout');
    process.exit(1);
  }, 10_000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

// ─── Unhandled Error Safety Nets ──────────────────────────────────────────────
process.on('unhandledRejection', (reason) => {
  console.error('[Server] Unhandled promise rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[Server] Uncaught exception:', err.message);
  process.exit(1);
});

