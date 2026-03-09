import { Request, Response, NextFunction } from 'express';
import { notificationService } from '../services/notification.service';
import type { AuthenticatedRequest } from '../types';

export const notificationsController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: userId } = (req as AuthenticatedRequest).user;
      const unreadOnly = req.query.unread === 'true';
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      const offset = parseInt(req.query.offset as string) || 0;

      const result = await notificationService.getByUser(userId, { unreadOnly, limit, offset });
      res.json(result);
    } catch (error) {
      next(error);
    }
  },

  async unreadCount(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: userId } = (req as AuthenticatedRequest).user;
      const count = await notificationService.getUnreadCount(userId);
      res.json({ count });
    } catch (error) {
      next(error);
    }
  },

  async markRead(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: userId } = (req as AuthenticatedRequest).user;
      const { id } = req.params;
      const success = await notificationService.markAsRead(id, userId);
      res.json({ success });
    } catch (error) {
      next(error);
    }
  },

  async markAllRead(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: userId } = (req as AuthenticatedRequest).user;
      const count = await notificationService.markAllAsRead(userId);
      res.json({ markedRead: count });
    } catch (error) {
      next(error);
    }
  },
};
