/**
 * Zod validation middleware factory.
 * Validates req.body, req.params, and/or req.query against provided schemas.
 */

import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError, z } from 'zod';

interface ValidationSchemas {
  body?: ZodSchema;
  params?: ZodSchema;
  query?: ZodSchema;
}

/**
 * Returns an Express middleware that validates request against the given schemas.
 * Throws a ZodError (caught by errorHandler) if validation fails.
 */
export function validate(schemas: ValidationSchemas) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (schemas.body) {
        req.body = schemas.body.parse(req.body);
      }
      if (schemas.params) {
        req.params = schemas.params.parse(req.params);
      }
      if (schemas.query) {
        req.query = schemas.query.parse(req.query);
      }
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        next(err);
      } else {
        next(err);
      }
    }
  };
}

// ─────────────────────────────────────────────
// Common reusable schemas
// ─────────────────────────────────────────────

export const uuidParamSchema = z.object({
  id: z.string().uuid('Invalid UUID format'),
});

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
});
