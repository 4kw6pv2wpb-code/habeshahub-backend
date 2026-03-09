/**
 * Admin dashboard controller.
 * All methods require authenticate + requireAdmin middleware.
 */

import { Request, Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../types';
import * as adminService from '../services/admin.service';

export const adminController = {
  // ─────────────────────────────────────────────
  // User Management
  // ─────────────────────────────────────────────

  /**
   * GET /admin/users
   * Query: page, limit, search, role, isActive
   */
  async getUsers(req: Request, res: Response, next: NextFunction) {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
      const search = req.query.search as string | undefined;
      const role = req.query.role as string | undefined;

      let isActive: boolean | undefined;
      if (req.query.isActive !== undefined) {
        isActive = req.query.isActive === 'true';
      }

      const result = await adminService.getUsers(page, limit, search, role, isActive);
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /admin/users/:id
   */
  async getUserById(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const user = await adminService.getUserById(id);

      if (!user) {
        res.status(404).json({ success: false, error: 'User not found' });
        return;
      }

      res.json({ success: true, data: user });
    } catch (err) {
      next(err);
    }
  },

  /**
   * PATCH /admin/users/:id/role
   * Body: { role: string }
   */
  async updateRole(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { role } = req.body as { role: string };

      if (!role) {
        res.status(400).json({ success: false, error: 'role is required' });
        return;
      }

      const user = await adminService.updateUserRole(id, role);
      res.json({ success: true, data: user });
    } catch (err) {
      next(err);
    }
  },

  /**
   * PATCH /admin/users/:id/toggle-active
   */
  async toggleActive(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const user = await adminService.toggleUserActive(id);
      res.json({ success: true, data: user });
    } catch (err) {
      next(err);
    }
  },

  /**
   * DELETE /admin/users/:id
   */
  async deleteUser(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const user = await adminService.deleteUser(id);
      res.json({ success: true, data: user });
    } catch (err) {
      next(err);
    }
  },

  // ─────────────────────────────────────────────
  // Moderation Queue
  // ─────────────────────────────────────────────

  /**
   * GET /admin/moderation/queue
   * Query: page, limit, status
   */
  async getModerationQueue(req: Request, res: Response, next: NextFunction) {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
      const status = req.query.status as string | undefined;

      const result = await adminService.getModerationQueue(page, limit, status);
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /admin/moderation/content/:contentType/:contentId
   */
  async getContentForReview(req: Request, res: Response, next: NextFunction) {
    try {
      const { contentType, contentId } = req.params;
      const content = await adminService.getContentForReview(contentType, contentId);

      if (!content) {
        res.status(404).json({ success: false, error: 'Content not found' });
        return;
      }

      res.json({ success: true, data: content });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /admin/moderation/remove
   * Body: { contentType, contentId, reason }
   */
  async removeContent(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: moderatorId } = (req as AuthenticatedRequest).user;
      const { contentType, contentId, reason } = req.body as {
        contentType: string;
        contentId: string;
        reason: string;
      };

      if (!contentType || !contentId || !reason) {
        res.status(400).json({ success: false, error: 'contentType, contentId, and reason are required' });
        return;
      }

      const result = await adminService.removeContent(contentType, contentId, moderatorId, reason);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /admin/moderation/bulk-resolve
   * Body: { reportIds: string[], resolution: string }
   */
  async bulkResolve(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: moderatorId } = (req as AuthenticatedRequest).user;
      const { reportIds, resolution } = req.body as {
        reportIds: string[];
        resolution: string;
      };

      if (!Array.isArray(reportIds) || reportIds.length === 0) {
        res.status(400).json({ success: false, error: 'reportIds must be a non-empty array' });
        return;
      }

      if (!resolution) {
        res.status(400).json({ success: false, error: 'resolution is required' });
        return;
      }

      const result = await adminService.bulkResolveReports(reportIds, resolution, moderatorId);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  // ─────────────────────────────────────────────
  // Wallet Controls
  // ─────────────────────────────────────────────

  /**
   * GET /admin/wallets/overview
   */
  async getWalletOverview(req: Request, res: Response, next: NextFunction) {
    try {
      const overview = await adminService.getWalletOverview();
      res.json({ success: true, data: overview });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /admin/wallets/user/:userId
   */
  async getUserWallet(req: Request, res: Response, next: NextFunction) {
    try {
      const { userId } = req.params;
      const wallet = await adminService.getUserWallet(userId);

      if (!wallet) {
        res.status(404).json({ success: false, error: 'Wallet not found for this user' });
        return;
      }

      res.json({ success: true, data: wallet });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /admin/wallets/user/:userId/freeze
   * Body: { reason: string }
   */
  async freezeWallet(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: moderatorId } = (req as AuthenticatedRequest).user;
      const { userId } = req.params;
      const { reason } = req.body as { reason: string };

      if (!reason) {
        res.status(400).json({ success: false, error: 'reason is required' });
        return;
      }

      const result = await adminService.freezeWallet(userId, reason, moderatorId);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /admin/wallets/user/:userId/adjust
   * Body: { amount: number, reason: string }
   */
  async adjustBalance(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: moderatorId } = (req as AuthenticatedRequest).user;
      const { userId } = req.params;
      const { amount, reason } = req.body as { amount: number; reason: string };

      if (amount === undefined || amount === null) {
        res.status(400).json({ success: false, error: 'amount is required' });
        return;
      }

      if (!reason) {
        res.status(400).json({ success: false, error: 'reason is required' });
        return;
      }

      const result = await adminService.adjustBalance(userId, Number(amount), reason, moderatorId);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  // ─────────────────────────────────────────────
  // Platform Statistics
  // ─────────────────────────────────────────────

  /**
   * GET /admin/stats
   */
  async getPlatformStats(req: Request, res: Response, next: NextFunction) {
    try {
      const stats = await adminService.getPlatformStats();
      res.json({ success: true, data: stats });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /admin/stats/daily
   * Query: startDate (ISO), endDate (ISO)
   */
  async getDailyStats(req: Request, res: Response, next: NextFunction) {
    try {
      const startDate = req.query.startDate
        ? new Date(req.query.startDate as string)
        : (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d; })();

      const endDate = req.query.endDate
        ? new Date(req.query.endDate as string)
        : new Date();

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        res.status(400).json({ success: false, error: 'Invalid date format. Use ISO 8601.' });
        return;
      }

      const stats = await adminService.getDailyStats(startDate, endDate);
      res.json({ success: true, data: stats });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /admin/stats/growth
   */
  async getGrowthMetrics(req: Request, res: Response, next: NextFunction) {
    try {
      const metrics = await adminService.getGrowthMetrics();
      res.json({ success: true, data: metrics });
    } catch (err) {
      next(err);
    }
  },
};
