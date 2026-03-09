/**
 * Dating Controller.
 * Handles dating profile, discover, swipe, matches, and unmatch.
 */

import { Request, Response, NextFunction } from 'express';
import { datingService } from '../services/dating.service';
import type { AuthenticatedRequest } from '../types';

export const datingController = {
  async getProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: userId } = (req as AuthenticatedRequest).user;
      const profile = await datingService.getProfile(userId);
      res.json({ success: true, data: profile });
    } catch (error) {
      next(error);
    }
  },

  async updateProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: userId } = (req as AuthenticatedRequest).user;
      const profile = await datingService.updateProfile(userId, req.body);
      res.json({ success: true, data: profile });
    } catch (error) {
      next(error);
    }
  },

  async discover(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: userId } = (req as AuthenticatedRequest).user;
      const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);
      const offset = parseInt(req.query.offset as string) || 0;

      const profiles = await datingService.getDiscoverProfiles(userId, { limit, offset });
      res.json({ success: true, data: profiles });
    } catch (error) {
      next(error);
    }
  },

  async swipe(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: userId } = (req as AuthenticatedRequest).user;
      const { targetId, direction } = req.body;

      if (!targetId || !['left', 'right'].includes(direction)) {
        res.status(400).json({ error: 'targetId and direction (left/right) required' });
        return;
      }

      const result = await datingService.swipe({
        swiperId: userId,
        targetId,
        direction,
      });

      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },

  async matches(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: userId } = (req as AuthenticatedRequest).user;
      const matches = await datingService.getMatches(userId);
      res.json({ success: true, data: matches });
    } catch (error) {
      next(error);
    }
  },

  async unmatch(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: userId } = (req as AuthenticatedRequest).user;
      const { matchId } = req.params;

      const result = await datingService.unmatch(userId, matchId);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },
};
