import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { closePool } from './db/pool.js';

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, 'Server listening');
});

async function shutdown(signal) {
  logger.info({ signal }, 'Shutting down');

  server.close(async (err) => {
    if (err) {
      logger.error({ err }, 'Error closing HTTP server');
      process.exitCode = 1;
    }

    try {
      await closePool();
    } catch (poolErr) {
      logger.error({ err: poolErr }, 'Error closing DB pool');
      process.exitCode = 1;
    }

    process.exit();
  });

  // Force-exit if connections don't drain in time.
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
