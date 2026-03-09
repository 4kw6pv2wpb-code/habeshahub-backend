/**
 * Security Controller
 *
 * Exposes fraud, KYC, and audit endpoints:
 *   - Fraud score lookup (admin)
 *   - KYC status and initiation (authenticated user + admin)
 *   - Audit trail queries (admin)
 */

import { Request, Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../types';
import * as security from '../infrastructure/security';

export const securityController = {
  /**
   * GET /security/fraud/:userId
   * Returns the composite fraud risk score (0–100) for a user.
   * Requires: authenticate + requireAdmin
   */
  async getFraudScore(req: Request, res: Response, next: NextFunction) {
    try {
      const { userId } = req.params as { userId: string };
      const score = await security.getFraudScore(userId);
      res.json({ success: true, data: { userId, fraudScore: score } });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /security/kyc
   * Returns KYC status for the authenticated user (own user or admin).
   * Requires: authenticate
   */
  async getKYCStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const authedReq = req as AuthenticatedRequest;
      const requesterId = authedReq.user.id;
      const requesterRole = authedReq.user.role;

      // Admins may query any userId via query param; users get their own status
      const targetUserId =
        requesterRole === 'ADMIN' && (req.query.userId as string)
          ? (req.query.userId as string)
          : requesterId;

      const status = await security.getKYCStatus(targetUserId);
      res.json({ success: true, data: status });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /security/kyc
   * Initiates KYC verification for the authenticated user.
   * Body: { level: 'basic'|'verified'|'enhanced' }
   * Requires: authenticate
   */
  async initiateKYC(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: userId } = (req as AuthenticatedRequest).user;
      const { level = 'basic' } = req.body as {
        level?: 'basic' | 'verified' | 'enhanced';
      };

      const result = await security.initiateKYC(userId, level);
      res.status(202).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /security/audit
   * Returns paginated audit trail for an entity.
   * Query: targetType, targetId, page, limit
   * Requires: authenticate + requireAdmin
   */
  async getAuditTrail(req: Request, res: Response, next: NextFunction) {
    try {
      const {
        targetType,
        targetId,
        page = '1',
        limit = '20',
      } = req.query as {
        targetType?: string;
        targetId?: string;
        page?: string;
        limit?: string;
      };

      if (!targetType || !targetId) {
        res.status(400).json({
          success: false,
          error: 'Query params targetType and targetId are required.',
        });
        return;
      }

      const parsedPage = Math.max(parseInt(page, 10) || 1, 1);
      const parsedLimit = Math.min(parseInt(limit, 10) || 20, 100);

      const { entries, total } = await security.getAuditTrail(
        targetType,
        targetId,
        parsedPage,
        parsedLimit,
      );

      res.json({
        success: true,
        data: entries,
        meta: {
          total,
          page: parsedPage,
          limit: parsedLimit,
          totalPages: Math.ceil(total / parsedLimit),
        },
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /security/audit/user/:userId
   * Returns all audit events by or against a specific user.
   * Requires: authenticate + requireAdmin
   */
  async getUserAudits(req: Request, res: Response, next: NextFunction) {
    try {
      const { userId } = req.params as { userId: string };
      const {
        page = '1',
        limit = '20',
      } = req.query as { page?: string; limit?: string };

      const parsedPage = Math.max(parseInt(page, 10) || 1, 1);
      const parsedLimit = Math.min(parseInt(limit, 10) || 20, 100);

      const { entries, total } = await security.getUserAuditTrail(
        userId,
        parsedPage,
        parsedLimit,
      );

      res.json({
        success: true,
        data: entries,
        meta: {
          total,
          page: parsedPage,
          limit: parsedLimit,
          totalPages: Math.ceil(total / parsedLimit),
        },
      });
    } catch (err) {
      next(err);
    }
  },
};
