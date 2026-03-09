import { Request, Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../types';
import * as growthService from '../services/growth.service';

export const growthController = {
  async generateCode(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: userId } = (req as AuthenticatedRequest).user;
      const result = await growthService.generateReferralCode(userId);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  async processReferral(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: userId } = (req as AuthenticatedRequest).user;
      const { code } = req.body;
      const result = await growthService.processReferral(code, userId);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  async getReferrals(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: userId } = (req as AuthenticatedRequest).user;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const { items, total, totalPages } = await growthService.getReferrals(userId, page, limit);
      res.json({ success: true, data: items, meta: { total, page, limit, totalPages } });
    } catch (err) {
      next(err);
    }
  },

  async getPoints(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: userId } = (req as AuthenticatedRequest).user;
      const result = await growthService.getPoints(userId);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  async getLeaderboard(req: Request, res: Response, next: NextFunction) {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const result = await growthService.getLeaderboard(limit);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  async applyForAmbassador(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: userId } = (req as AuthenticatedRequest).user;
      const { city, region } = req.body;
      const result = await growthService.applyForAmbassador(userId, city, region);
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  async getAmbassadors(req: Request, res: Response, next: NextFunction) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const { items, total, totalPages } = await growthService.getAmbassadors(page, limit);
      res.json({ success: true, data: items, meta: { total, page, limit, totalPages } });
    } catch (err) {
      next(err);
    }
  },

  async getGrowthStats(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await growthService.getGrowthStats();
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },
};
