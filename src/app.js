import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import pinoHttp from 'pino-http';
import { logger } from './utils/logger.js';
import { globalLimiter } from './middlewares/rateLimiters.js';
import { notFound } from './middlewares/notFound.js';
import { errorHandler } from './middlewares/errorHandler.js';
import { env } from './config/env.js';
import { pool } from './db/pool.js';
import { asyncHandler } from './utils/asyncHandler.js';
import { AppError } from './utils/AppError.js';
import catalogRouter from './modules/catalog/catalog.routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const staticRoot = path.join(__dirname, '..', 'public', 'static');

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN }));
  app.use(pinoHttp({
    logger,
    genReqId(req, res) {
      const incoming = req.headers['x-request-id'];
      const candidate = Array.isArray(incoming) ? incoming[0] : incoming;
      const id = (candidate && /^[a-zA-Z0-9-]{1,64}$/.test(candidate)) ? candidate : randomUUID();
      res.setHeader('X-Request-Id', id);
      return id;
    },
  }));

  // No body to parse, nothing worth rate-limiting — ahead of both.
  app.get('/health', asyncHandler(async (req, res) => {
    let connection;
    try {
      connection = await pool.getConnection();
      await connection.ping();
    } catch (err) {
      req.log.error({ err }, 'Health check DB ping failed');
      throw new AppError('Service unavailable.', { statusCode: 503, code: 'DB_UNAVAILABLE' });
    } finally {
      connection?.release();
    }

    res.json({ status: 'ok', db: 'up', uptime: process.uptime() });
  }));

  // Global body cap (CLAUDE.md rule 10). Routes that need more (e.g. /orders,
  // for logoDataUrl) raise this locally on their own router, never here.
  app.use(express.json({ limit: '100kb' }));

  // Baseline abuse protection for all traffic (docs/backend-plan.md §5).
  // Endpoint-specific limiters (auth/contact/orders) are applied by their
  // own routers, on top of this.
  app.use(globalLimiter);

  // Serves the seeded kit images. image_url in the DB is root-relative
  // (/static/kits/<filename>), never an absolute URL with a host — a
  // baked-in localhost:4000 would break every row on deploy.
  app.use('/static', express.static(staticRoot, {
    maxAge: '7d',
    setHeaders(res) {
      res.setHeader('X-Content-Type-Options', 'nosniff');
    },
  }));

  // catalogRouter defines its own full paths (/kits, /kits/featured,
  // /products), so it mounts at /api, not /api/kits.
  app.use('/api', catalogRouter);

  // Remaining feature routers mount here, e.g.:
  // app.use('/api/auth', authRouter);
  // app.use('/api/contact', contactRouter);
  // app.use('/api/orders', ordersRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
