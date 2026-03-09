/**
 * Global error handler middleware.
 * Catches all errors and returns standardised JSON error responses.
 */

import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../utils/logger';
import type { ErrorResponse } from '../types';

// ─────────────────────────────────────────────
// Custom Application Error
// ─────────────────────────────────────────────

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;

  constructor(
    message: string,
    statusCode = 500,
    code = 'INTERNAL_ERROR',
    isOperational = true,
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }

  // Factory helpers for common cases
  static badRequest(message: string, code = 'BAD_REQUEST'): AppError {
    return new AppError(message, 400, code);
  }

  static unauthorized(message = 'Unauthorized', code = 'UNAUTHORIZED'): AppError {
    return new AppError(message, 401, code);
  }

  static forbidden(message = 'Forbidden', code = 'FORBIDDEN'): AppError {
    return new AppError(message, 403, code);
  }

  static notFound(message = 'Resource not found', code = 'NOT_FOUND'): AppError {
    return new AppError(message, 404, code);
  }

  static conflict(message: string, code = 'CONFLICT'): AppError {
    return new AppError(message, 409, code);
  }

  static internal(message = 'Internal server error', code = 'INTERNAL_ERROR'): AppError {
    return new AppError(message, 500, code, false);
  }
}

// ─────────────────────────────────────────────
// Error Handler Middleware
// ─────────────────────────────────────────────

export function errorHandler(
  err: Error | AppError | ZodError,
  req: Request,
  res: Response,
  // next is required for Express to recognise this as an error handler
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  // ── Zod validation errors ──────────────────
  if (err instanceof ZodError) {
    const messages = err.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
    logger.warn('Validation error', { path: req.path, errors: messages });
    const body: ErrorResponse = {
      success: false,
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      statusCode: 422,
    };
    res.status(422).json({ ...body, details: messages });
    return;
  }

  // ── Known operational errors ───────────────
  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error('Application error', {
        message: err.message,
        code: err.code,
        stack: err.stack,
        path: req.path,
      });
    } else {
      logger.warn('Client error', {
        message: err.message,
        code: err.code,
        path: req.path,
      });
    }
    res.status(err.statusCode).json({
      success: false,
      error: err.message,
      code: err.code,
      statusCode: err.statusCode,
    } satisfies ErrorResponse);
    return;
  }

  // ── Prisma errors ──────────────────────────
  if (err.constructor?.name === 'PrismaClientKnownRequestError') {
    const prismaErr = err as unknown as { code: string; meta?: { target?: string[] } };
    if (prismaErr.code === 'P2002') {
      const fields = prismaErr.meta?.target?.join(', ') ?? 'field';
      res.status(409).json({
        success: false,
        error: `A record with this ${fields} already exists`,
        code: 'DUPLICATE_ENTRY',
        statusCode: 409,
      } satisfies ErrorResponse);
      return;
    }
    if (prismaErr.code === 'P2025') {
      res.status(404).json({
        success: false,
        error: 'Record not found',
        code: 'NOT_FOUND',
        statusCode: 404,
      } satisfies ErrorResponse);
      return;
    }
  }

  // ── JWT errors ─────────────────────────────
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    res.status(401).json({
      success: false,
      error: err.name === 'TokenExpiredError' ? 'Token has expired' : 'Invalid token',
      code: 'INVALID_TOKEN',
      statusCode: 401,
    } satisfies ErrorResponse);
    return;
  }

  // ── Unhandled errors ───────────────────────
  logger.error('Unhandled error', {
    message: err.message,
    stack: err.stack,
    path: req.path,
  });

  res.status(500).json({
    success: false,
    error: 'An unexpected error occurred',
    code: 'INTERNAL_ERROR',
    statusCode: 500,
  } satisfies ErrorResponse);
}

// ─────────────────────────────────────────────
// Not Found Handler (must be registered last, before errorHandler)
// ─────────────────────────────────────────────

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(AppError.notFound(`Route ${req.method} ${req.path} not found`, 'ROUTE_NOT_FOUND'));
}
