import { Request, Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../types';
import * as storyEngagementService from '../services/story-engagement.service';

export const storyEngagementController = {
  async viewStory(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: viewerId } = (req as AuthenticatedRequest).user;
      const { storyId } = req.params;
      const result = await storyEngagementService.viewStory(storyId, viewerId);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  async reactToStory(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: userId } = (req as AuthenticatedRequest).user;
      const { storyId } = req.params;
      const { emoji } = req.body;
      const result = await storyEngagementService.reactToStory(storyId, userId, emoji);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  async removeReaction(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: userId } = (req as AuthenticatedRequest).user;
      const { storyId } = req.params;
      const result = await storyEngagementService.removeReaction(storyId, userId);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  async getViews(req: Request, res: Response, next: NextFunction) {
    try {
      const { storyId } = req.params;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const { items, total, totalPages } = await storyEngagementService.getStoryViews(
        storyId,
        page,
        limit,
      );
      res.json({ success: true, data: items, meta: { total, page, limit, totalPages } });
    } catch (err) {
      next(err);
    }
  },

  async getReactions(req: Request, res: Response, next: NextFunction) {
    try {
      const { storyId } = req.params;
      const result = await storyEngagementService.getStoryReactions(storyId);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  async getMyStats(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: userId } = (req as AuthenticatedRequest).user;
      const result = await storyEngagementService.getMyStoryStats(userId);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },
};
