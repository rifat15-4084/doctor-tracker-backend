/**
 * Express application factory.
 *
 * The app is created separately from the server bootstrap so it can be
 * imported by tests without opening a port.
 */
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';

import { env } from './config/env.js';
import routes from './routes/index.js';
import { notFound } from './middleware/notFound.js';
import { errorHandler } from './middleware/errorHandler.js';
import { ApiError } from './utils/ApiError.js';

export const createApp = () => {
  const app = express();

  // Render (and every other PaaS) terminates TLS at a reverse proxy. Trusting
  // exactly one proxy hop makes `req.secure`, `req.protocol` and `req.ip`
  // reflect the real client - which is what lets the `secure` auth cookie be
  // accepted behind the proxy.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  // ---------------------------------------------------------------------
  // Security headers
  // ---------------------------------------------------------------------
  app.use(
    helmet({
      // The API only serves JSON; a strict CSP would break the SPA if the
      // same origin ever serves the frontend.
      contentSecurityPolicy: env.isProd ? undefined : false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  // ---------------------------------------------------------------------
  // CORS - credentials mode requires an explicit origin allow-list
  // ---------------------------------------------------------------------
  app.use(
    cors({
      origin(origin, callback) {
        // Same-origin requests, curl and server-to-server calls have no
        // Origin header -> always allowed.
        if (!origin) return callback(null, true);

        const normalized = origin.replace(/\/+$/, '');
        if (env.CLIENT_URLS.includes(normalized)) {
          return callback(null, true);
        }

        return callback(
          new ApiError(`Origin ${origin} is not allowed by the CORS policy.`, 403),
        );
      },
      credentials: true, // required so browsers send the httpOnly cookie
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      exposedHeaders: ['RateLimit', 'RateLimit-Policy'],
      maxAge: 600,
    }),
  );

  // ---------------------------------------------------------------------
  // Parsers / middlewares
  // ---------------------------------------------------------------------
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());
  app.use(compression());

  app.use(
    morgan(env.LOG_FORMAT, {
      skip: (req) => req.path === '/health', // keep health probes out of the logs
    }),
  );

  // ---------------------------------------------------------------------
  // Global rate limiter (generous - the strict limit lives on /auth/login)
  // ---------------------------------------------------------------------
  if (env.RATE_LIMIT_ENABLED) {
    app.use(
      rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: 600,
        standardHeaders: 'draft-7',
        legacyHeaders: false,
        message: {
          success: false,
          message: 'Too many requests. Please try again later.',
          errors: [],
        },
      }),
    );
  }

  // ---------------------------------------------------------------------
  // Health check
  // ---------------------------------------------------------------------
  // Deliberately does ZERO I/O: it reads the driver's in-memory connection
  // state (a plain number) and returns immediately. Render uses this path as
  // its health probe, so it must never wait on MongoDB.
  const healthHandler = (_req, res) =>
    res.status(200).json({
      success: true,
      status: 'ok',
      service: 'doctor-tracker-api',
      environment: env.NODE_ENV,
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      database: ['disconnected', 'connected', 'connecting', 'disconnecting'][
        mongoose.connection.readyState
      ] || 'unknown',
    });

  app.get('/health', healthHandler);
  app.get('/api/health', healthHandler);

  // ---------------------------------------------------------------------
  // API
  // ---------------------------------------------------------------------
  app.use('/api', routes);

  // Unknown route -> 404
  app.use(notFound);

  // Centralised error handler (must be registered last)
  app.use(errorHandler);

  return app;
};

export default createApp;
