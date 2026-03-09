import { Request, Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../types';
import * as engagementService from '../services/engagement.service';

export const engagementController = {
  async trackEngagement(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: userId } = (req as AuthenticatedRequest).user;
      const { contentType, contentId, action, value, metadata } = req.body;
      const result = await engagementService.trackEngagement(
        userId,
        contentType,
        contentId,
        action,
        value,
        metadata,
      );
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  async getContentEngagement(req: Request, res: Response, next: NextFunction) {
    try {
      const { contentType, contentId } = req.params;
      const result = await engagementService.getContentEngagement(contentType, contentId);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  async getUserEngagement(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: userId } = (req as AuthenticatedRequest).user;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const { items, total, totalPages } = await engagementService.getUserEngagementHistory(
        userId,
        page,
        limit,
      );
      res.json({ success: true, data: items, meta: { total, page, limit, totalPages } });
    } catch (err) {
      next(err);
    }
  },

  async getPopularContent(req: Request, res: Response, next: NextFunction) {
    try {
      const { contentType } = req.params;
      const timeWindow = parseInt(req.query.timeWindow as string) || 24;
      const limit = parseInt(req.query.limit as string) || 10;
      const result = await engagementService.getPopularContent(contentType, timeWindow, limit);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  async getEngagementStats(req: Request, res: Response, next: NextFunction) {
    try {
      const startDate = req.query.startDate
        ? new Date(req.query.startDate as string)
        : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : new Date();
      const result = await engagementService.getEngagementStats(startDate, endDate);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  async getRankedFeed(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: userId } = (req as AuthenticatedRequest).user;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const result = await engagementService.getRankedFeed(userId, page, limit);
      res.json({
        success: true,
        data: result.items,
        meta: {
          total: result.total,
          page: result.page,
          limit: result.limit,
          totalPages: result.totalPages,
          ranked: result.ranked,
        },
      });
    } catch (err) {
      next(err);
    }
  },

  async getRecentEvents(req: Request, res: Response, next: NextFunction) {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const result = await engagementService.getRecentPlatformEvents(limit);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },
};
