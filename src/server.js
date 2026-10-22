/**
 * Server bootstrap.
 *
 *  1. connect to MongoDB
 *  2. listen on process.env.PORT, bound to 0.0.0.0 (required by Render)
 *  3. shut down gracefully on SIGTERM / SIGINT so in-flight requests finish
 *
 * Any startup failure logs a clear, actionable message and exits with a
 * non-zero code so the platform can surface the real problem.
 */
import { createApp } from './app.js';
import { connectDB, disconnectDB } from './config/db.js';
import { env } from './config/env.js';

const start = async () => {
  try {
    await connectDB();
  } catch (error) {
    // `connectDB` already printed a detailed, actionable message.
    // eslint-disable-next-line no-console
    console.error('[server] Startup aborted: database connection failed.');
    process.exit(1);
  }

  const app = createApp();

  // Bind explicitly to 0.0.0.0 so containers / Render can route traffic in.
  const server = app.listen(env.PORT, env.HOST, () => {
    // eslint-disable-next-line no-console
    console.log(`[server] Doctor Tracker API listening on ${env.HOST}:${env.PORT} (${env.NODE_ENV})`);
    // eslint-disable-next-line no-console
    console.log(`[server] Health check available at /health`);
  });

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      // eslint-disable-next-line no-console
      console.error(`[server] Port ${env.PORT} is already in use.`);
    } else {
      // eslint-disable-next-line no-console
      console.error(`[server] HTTP server error: ${error.message}`);
    }
    process.exit(1);
  });

  // ---------------------------------------------------------------------
  // Graceful shutdown
  // ---------------------------------------------------------------------
  let shuttingDown = false;

  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;

    // eslint-disable-next-line no-console
    console.log(`\n[server] ${signal} received - shutting down gracefully...`);

    server.close(async () => {
      try {
        await disconnectDB();
      } finally {
        // eslint-disable-next-line no-console
        console.log('[server] Shutdown complete.');
        process.exit(0);
      }
    });

    // Never hang forever: force the process down after 10 seconds.
    setTimeout(() => {
      // eslint-disable-next-line no-console
      console.error('[server] Forced shutdown after timeout.');
      process.exit(1);
    }, 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM')); // Render sends this on deploy/restart
  process.on('SIGINT', () => shutdown('SIGINT')); // Ctrl+C locally

  process.on('unhandledRejection', (reason) => {
    // eslint-disable-next-line no-console
    console.error('[server] Unhandled promise rejection:', reason);
    shutdown('unhandledRejection');
  });

  process.on('uncaughtException', (error) => {
    // eslint-disable-next-line no-console
    console.error('[server] Uncaught exception:', error);
    process.exit(1);
  });
};

start();

export default start;
