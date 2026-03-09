/**
 * Rate limiting middleware using rate-limiter-flexible with Redis backend.
 * Falls back to in-memory if Redis is unavailable.
 */

import { Request, Response, NextFunction } from 'express';
import {
  RateLimiterRedis,
  RateLimiterMemory,
  RateLimiterAbstract,
} from 'rate-limiter-flexible';
import { redis } from '../config/redis';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { AppError } from './errorHandler';

// ─────────────────────────────────────────────
// Limiter factory
// ─────────────────────────────────────────────

function createRateLimiter(): RateLimiterAbstract {
  const opts = {
    keyPrefix: 'habeshahub_rl',
    points: env.RATE_LIMIT_POINTS,     // requests allowed
    duration: env.RATE_LIMIT_DURATION, // per duration (seconds)
    blockDuration: 60,                 // block for 1 min after exhaustion
  };

  try {
    return new RateLimiterRedis({
      ...opts,
      storeClient: redis,
      insuranceLimiter: new RateLimiterMemory(opts), // fallback if Redis blips
    });
  } catch (err) {
    logger.warn('Rate limiter: Redis unavailable, using in-memory fallback', {
      error: (err as Error).message,
    });
    return new RateLimiterMemory(opts);
  }
}

const globalLimiter = createRateLimiter();

// Stricter limiter for auth endpoints
const authLimiter = new RateLimiterMemory({
  keyPrefix: 'habeshahub_auth_rl',
  points: 10,   // 10 attempts
  duration: 900, // per 15 minutes
  blockDuration: 900,
});

// ─────────────────────────────────────────────
// Middleware factories
// ─────────────────────────────────────────────

/**
 * Standard rate limiter: 200 requests/day per user (or IP if unauthenticated).
 */
export function rateLimiter(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  // Use authenticated user ID when available, otherwise fall back to IP
  const key =
    (req as { user?: { id: string } }).user?.id ?? req.ip ?? 'anonymous';

  globalLimiter
    .consume(key)
    .then((rateLimiterRes) => {
      // Set standard rate limit headers
      res.setHeader('X-RateLimit-Limit', env.RATE_LIMIT_POINTS);
      res.setHeader(
        'X-RateLimit-Remaining',
        rateLimiterRes.remainingPoints,
      );
      res.setHeader(
        'X-RateLimit-Reset',
        Math.ceil(Date.now() / 1000 + rateLimiterRes.msBeforeNext / 1000),
      );
      next();
    })
    .catch(() => {
      logger.warn('Rate limit exceeded', { key });
      res.setHeader('Retry-After', Math.ceil(60)); // 60s retry
      next(
        new AppError(
          'Too many requests. Please try again later.',
          429,
          'RATE_LIMIT_EXCEEDED',
        ),
      );
    });
}

/**
 * Strict limiter for authentication endpoints (prevents brute force).
 */
export function authRateLimiter(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const key = req.ip ?? 'anonymous';

  authLimiter
    .consume(key)
    .then(() => next())
    .catch(() => {
      logger.warn('Auth rate limit exceeded', { ip: req.ip });
      res.setHeader('Retry-After', '900');
      next(
        new AppError(
          'Too many authentication attempts. Please try again in 15 minutes.',
          429,
          'AUTH_RATE_LIMIT_EXCEEDED',
        ),
      );
    });
}
