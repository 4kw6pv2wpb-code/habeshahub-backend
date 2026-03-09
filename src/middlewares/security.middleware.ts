/**
 * Security Middleware
 *
 * Express middleware for audit logging, fraud detection, and abuse prevention.
 * Mount these on specific route groups to enforce automatic security checks.
 */

import { Request, Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../types';
import * as security from '../infrastructure/security';
import { logger } from '../utils/logger';
import crypto from 'crypto';

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  return req.socket?.remoteAddress ?? 'unknown';
}

function hashBody(body: unknown): string {
  try {
    const serialised = JSON.stringify(body ?? {});
    return crypto.createHash('sha256').update(serialised).digest('hex').slice(0, 16);
  } catch {
    return 'unhashable';
  }
}

// ─────────────────────────────────────────────
// Audit Middleware
// ─────────────────────────────────────────────

/**
 * Automatically log all mutating requests (POST/PUT/PATCH/DELETE).
 * Stores actor, path, method, and a SHA-256 hash of the request body.
 */
export async function auditMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const MUTATING_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

  if (!MUTATING_METHODS.includes(req.method)) {
    return next();
  }

  try {
    const authedReq = req as AuthenticatedRequest;
    const actorId = authedReq.user?.id;

    if (!actorId) {
      // Skip audit for unauthenticated requests (e.g. login endpoint)
      return next();
    }

    // Derive a rough targetType/targetId from the URL path
    const pathParts = req.path.split('/').filter(Boolean);
    const targetType = pathParts[0] ?? 'unknown';
    const targetId =
      pathParts.find((p) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(p),
      ) ?? 'none';

    // Fire-and-forget — don't block the request
    security
      .auditLog({
        action: `${req.method} ${req.path}`,
        actorId,
        targetType,
        targetId,
        changes: { bodyHash: hashBody(req.body), query: req.query },
        ip: getClientIp(req),
        userAgent: req.headers['user-agent'] ?? 'unknown',
        timestamp: new Date(),
      })
      .catch((err) => logger.error('auditMiddleware: auditLog failed', { err }));
  } catch (err) {
    logger.error('auditMiddleware error', { err });
  }

  next();
}

// ─────────────────────────────────────────────
// Fraud Check Middleware
// ─────────────────────────────────────────────

/**
 * Run fraud detection on wallet/finance routes before the handler.
 * Blocks the request with 403 if a critical fraud signal is detected.
 */
export async function fraudCheckMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authedReq = req as AuthenticatedRequest;
    const userId = authedReq.user?.id;

    if (!userId) {
      return next();
    }

    const metadata: Record<string, unknown> = {
      amount: req.body?.amount,
      ip: getClientIp(req),
      lastKnownCountry: req.headers['x-user-country'],
      path: req.path,
    };

    const signals = await security.detectFraudSignals(
      userId,
      'wallet_transaction',
      metadata,
    );

    const criticalSignals = signals.filter((s) => s.severity === 'critical');
    const highSignals = signals.filter((s) => s.severity === 'high');

    if (criticalSignals.length > 0) {
      logger.warn('fraudCheckMiddleware: blocking critical fraud signal', {
        userId,
        signals: criticalSignals,
      });
      res.status(403).json({
        success: false,
        error: 'Transaction blocked due to suspicious activity. Please contact support.',
        code: 'FRAUD_BLOCKED',
      });
      return;
    }

    // Flag for manual review on high signals without blocking
    if (highSignals.length > 0) {
      security
        .flagForReview(userId, highSignals)
        .catch((err) => logger.error('fraudCheckMiddleware: flagForReview failed', { err }));
    }
  } catch (err) {
    logger.error('fraudCheckMiddleware error', { err });
  }

  next();
}

// ─────────────────────────────────────────────
// Abuse Check Middleware
// ─────────────────────────────────────────────

/**
 * Run abuse detection on content-creation routes.
 * If abuse is detected, auto-moderates the user and blocks the request.
 */
export async function abuseCheckMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authedReq = req as AuthenticatedRequest;
    const userId = authedReq.user?.id;

    if (!userId) {
      return next();
    }

    // Derive content type from URL path
    const pathParts = req.path.split('/').filter(Boolean);
    const contentType = pathParts[0] ?? 'content';

    // Stringify the body as the "content" to analyse
    const content =
      typeof req.body?.content === 'string'
        ? req.body.content
        : JSON.stringify(req.body ?? {});

    const abuseReport = await security.detectAbuse(userId, contentType, content);

    if (abuseReport) {
      logger.warn('abuseCheckMiddleware: abuse detected', {
        userId,
        abuseType: abuseReport.abuseType,
        score: abuseReport.score,
      });

      // Auto-moderate (apply warning or mute)
      await security.autoModerate(userId, abuseReport);

      // Block the request if score is high enough for a mute
      if (abuseReport.score >= 70) {
        res.status(429).json({
          success: false,
          error: 'Content blocked due to policy violation.',
          code: 'ABUSE_BLOCKED',
        });
        return;
      }
    }
  } catch (err) {
    logger.error('abuseCheckMiddleware error', { err });
  }

  next();
}
