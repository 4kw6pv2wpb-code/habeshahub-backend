import { Request, Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../types';
import * as trustService from '../services/trust.service';

export const trustController = {
  async createReport(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: reporterId } = (req as AuthenticatedRequest).user;
      const result = await trustService.createReport(reporterId, req.body);
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  async getReports(req: Request, res: Response, next: NextFunction) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const status = req.query.status as string | undefined;
      const { items, total, totalPages } = await trustService.getReports(page, limit, status);
      res.json({ success: true, data: items, meta: { total, page, limit, totalPages } });
    } catch (err) {
      next(err);
    }
  },

  async getReportById(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const result = await trustService.getReportById(id);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  async resolveReport(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: moderatorId } = (req as AuthenticatedRequest).user;
      const { id: reportId } = req.params;
      const { resolution, status } = req.body;
      const result = await trustService.resolveReport(reportId, moderatorId, resolution, status);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  async takeAction(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: moderatorId } = (req as AuthenticatedRequest).user;
      const { targetId, action, reason, contentType, contentId, duration } = req.body;
      const result = await trustService.takeModAction(
        moderatorId,
        targetId,
        action,
        reason,
        contentType,
        contentId,
        duration,
      );
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  async getModLogs(req: Request, res: Response, next: NextFunction) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const targetId = req.query.targetId as string | undefined;
      const { items, total, totalPages } = await trustService.getModLogs(page, limit, targetId);
      res.json({ success: true, data: items, meta: { total, page, limit, totalPages } });
    } catch (err) {
      next(err);
    }
  },

  async getUserReportHistory(req: Request, res: Response, next: NextFunction) {
    try {
      const { userId } = req.params;
      const result = await trustService.getUserReportHistory(userId);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  async getModStats(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await trustService.getModStats();
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },
};
