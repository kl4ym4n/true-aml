import express, { Express } from 'express';
import helmet from 'helmet';
import healthRoutes from './modules/health/health.routes';
import checkRoutes from './modules/check/check.routes';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { apiRateLimiter } from './middleware/rateLimiter';
import { env } from './config/env';

const createApp = (): Express => {
  const app = express();

  // Security headers
  app.use(helmet());

  // CORS middleware
  app.use((req, res, next) => {
    const origin = req.headers.origin as string | undefined;

    if (env.allowedOrigins.length === 0) {
      // Dev mode: allow all origins
      res.header('Access-Control-Allow-Origin', origin ?? '*');
    } else if (origin != null && env.allowedOrigins.includes(origin)) {
      res.header('Access-Control-Allow-Origin', origin);
    }
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header(
      'Access-Control-Allow-Headers',
      'Origin, X-Requested-With, Content-Type, Accept, x-api-key'
    );
    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
    } else {
      next();
    }
  });

  // Middleware
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // Global rate limiting
  app.use('/api', apiRateLimiter);

  // Routes
  app.use('/', healthRoutes);
  app.use('/api/v1/check', checkRoutes);

  // Error handling
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};

export default createApp;
