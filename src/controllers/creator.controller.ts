import { Request, Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../types';
import * as creatorService from '../services/creator.service';

export const creatorController = {
  async createProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: userId } = (req as AuthenticatedRequest).user;
      const result = await creatorService.createProfile(userId, req.body);
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  async getMyProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: userId } = (req as AuthenticatedRequest).user;
      const result = await creatorService.getProfile(userId);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  async getProfileById(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const result = await creatorService.getProfileById(id);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  async updateProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: userId } = (req as AuthenticatedRequest).user;
      const result = await creatorService.updateProfile(userId, req.body);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  async enableMonetization(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: userId } = (req as AuthenticatedRequest).user;
      const result = await creatorService.enableMonetization(userId);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  async getWallet(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: userId } = (req as AuthenticatedRequest).user;
      const result = await creatorService.getWallet(userId);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  async tipCreator(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: fromUserId } = (req as AuthenticatedRequest).user;
      const { creatorId, amount } = req.body;
      const result = await creatorService.tipCreator(fromUserId, creatorId, Number(amount));
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  async subscribe(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: userId } = (req as AuthenticatedRequest).user;
      const { creatorId } = req.body;
      const result = await creatorService.subscribeToCreator(userId, creatorId);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  async getRevenues(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: userId } = (req as AuthenticatedRequest).user;

      // Resolve creatorId from userId
      const { prisma } = await import('../config/database');
      const db = prisma as any;
      const profile = await db.creatorProfile.findUnique({ where: { userId } });
      if (!profile) {
        res.status(404).json({ success: false, message: 'Creator profile not found' });
        return;
      }

      const page = parseInt(String(req.query.page ?? '1'), 10);
      const limit = parseInt(String(req.query.limit ?? '20'), 10);
      const type = req.query.type as string | undefined;

      const { items, meta } = await creatorService.getRevenues(profile.id, page, limit, type);
      res.json({ success: true, data: items, meta });
    } catch (err) {
      next(err);
    }
  },

  async getAnalytics(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: userId } = (req as AuthenticatedRequest).user;

      const { prisma } = await import('../config/database');
      const db = prisma as any;
      const profile = await db.creatorProfile.findUnique({ where: { userId } });
      if (!profile) {
        res.status(404).json({ success: false, message: 'Creator profile not found' });
        return;
      }

      const startDate = req.query.startDate
        ? new Date(String(req.query.startDate))
        : (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d; })();
      const endDate = req.query.endDate
        ? new Date(String(req.query.endDate))
        : new Date();

      const result = await creatorService.getAnalytics(profile.id, startDate, endDate);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  async getTopCreators(req: Request, res: Response, next: NextFunction) {
    try {
      const category = req.query.category as string | undefined;
      const limit = parseInt(String(req.query.limit ?? '20'), 10);
      const result = await creatorService.getTopCreators(category, limit);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  async withdrawFunds(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: userId } = (req as AuthenticatedRequest).user;
      const { amount } = req.body;
      const result = await creatorService.withdrawFunds(userId, Number(amount));
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  async getDashboard(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: userId } = (req as AuthenticatedRequest).user;
      const result = await creatorService.getCreatorDashboard(userId);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },
};
