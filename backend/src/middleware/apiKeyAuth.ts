import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';
import { UnauthorizedError } from '../lib/errors';

/**
 * API Key authentication middleware
 * Expects API key in X-API-Key header
 */
export const apiKeyAuth = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  const apiKey = req.headers['x-api-key'] as string;

  if (!apiKey) {
    next(new UnauthorizedError('API key is required'));
    return;
  }

  if (!env.apiKey) {
    next(new UnauthorizedError('Server misconfiguration: API_KEY not set'));
    return;
  }

  if (apiKey !== env.apiKey) {
    next(new UnauthorizedError('Invalid API key'));
    return;
  }

  next();
};
