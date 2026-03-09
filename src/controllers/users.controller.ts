import { Request, Response, NextFunction } from 'express';
import { userService } from '../services/user.service';
import type { AuthenticatedRequest } from '../types';

export const usersController = {
  async getProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: userId } = (req as AuthenticatedRequest).user;
      const user = await userService.getById(userId);

      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      res.json({ user });
    } catch (error) {
      next(error);
    }
  },

  async updateProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: userId } = (req as AuthenticatedRequest).user;
      const user = await userService.updateProfile(userId, req.body);
      res.json({ user });
    } catch (error) {
      next(error);
    }
  },

  async search(req: Request, res: Response, next: NextFunction) {
    try {
      const query = (req.query.q as string) || '';
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
      const offset = parseInt(req.query.offset as string) || 0;

      const users = await userService.search(query, { limit, offset });
      res.json({ users });
    } catch (error) {
      next(error);
    }
  },

  async stats(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: userId } = (req as AuthenticatedRequest).user;
      const stats = await userService.getStats(userId);
      res.json({ stats });
    } catch (error) {
      next(error);
    }
  },

  async deactivate(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: userId } = (req as AuthenticatedRequest).user;
      await userService.deactivate(userId);
      res.json({ message: 'Account deactivated' });
    } catch (error) {
      next(error);
    }
  },
};
