/**
 * JWT authentication middleware.
 * Verifies Bearer token and attaches decoded user to req.user.
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { AppError } from './errorHandler';
import type { JwtPayload, AuthenticatedRequest } from '../types';
import { Role } from '@prisma/client';

// ─────────────────────────────────────────────
// Core auth middleware
// ─────────────────────────────────────────────

/**
 * Verify JWT from Authorization: Bearer <token> header.
 * Attaches { id, email, role } to req.user on success.
 */
export function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw AppError.unauthorized('Authorization header missing or malformed');
  }

  const token = authHeader.slice(7); // Remove "Bearer "

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;

    // Attach user context to request
    (req as AuthenticatedRequest).user = {
      id: decoded.sub,
      email: decoded.email,
      role: decoded.role,
    };

    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw AppError.unauthorized('Token has expired', 'TOKEN_EXPIRED');
    }
    throw AppError.unauthorized('Invalid or malformed token', 'INVALID_TOKEN');
  }
}

// ─────────────────────────────────────────────
// Role-based access control
// ─────────────────────────────────────────────

/**
 * Require that the authenticated user has one of the allowed roles.
 * Must be used after `authenticate`.
 */
export function requireRole(...allowedRoles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const user = (req as AuthenticatedRequest).user;

    if (!user) {
      throw AppError.unauthorized('Authentication required');
    }

    if (!allowedRoles.includes(user.role)) {
      throw AppError.forbidden(
        `Requires one of: ${allowedRoles.join(', ')}`,
        'INSUFFICIENT_ROLE',
      );
    }

    next();
  };
}

/**
 * Shorthand: require admin role.
 */
export const requireAdmin = requireRole(Role.ADMIN);

/**
 * Shorthand: require admin or moderator role.
 */
export const requireModerator = requireRole(Role.ADMIN, Role.MODERATOR);

// ─────────────────────────────────────────────
// Optional auth (doesn't throw if no token)
// ─────────────────────────────────────────────

/**
 * Optionally decode JWT. Attaches user if present, continues either way.
 * Useful for public endpoints that have personalised data when logged in.
 */
export function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.slice(7);

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    (req as AuthenticatedRequest).user = {
      id: decoded.sub,
      email: decoded.email,
      role: decoded.role,
    };
  } catch {
    // Token invalid — continue without user context
  }

  next();
}
