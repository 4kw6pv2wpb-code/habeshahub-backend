/**
 * Push notification controller.
 * Handles device registration and notification dispatch endpoints.
 */

import { Request, Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../types';
import * as pushService from '../infrastructure/push-notifications';

export const pushController = {
  /**
   * POST /push/register
   * Register a device token for the authenticated user.
   * Body: { token: string, platform: 'ios' | 'android' | 'web' }
   */
  async registerDevice(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: userId } = (req as AuthenticatedRequest).user;
      const { token, platform } = req.body as {
        token: string;
        platform: 'ios' | 'android' | 'web';
      };

      if (!token || !platform) {
        res.status(400).json({ success: false, error: 'token and platform are required' });
        return;
      }

      if (!['ios', 'android', 'web'].includes(platform)) {
        res.status(400).json({ success: false, error: 'platform must be ios, android, or web' });
        return;
      }

      await pushService.registerDevice(userId, token, platform);

      res.json({ success: true, data: { registered: true } });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /push/unregister
   * Remove a device token for the authenticated user.
   * Body: { token: string }
   */
  async unregisterDevice(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: userId } = (req as AuthenticatedRequest).user;
      const { token } = req.body as { token: string };

      if (!token) {
        res.status(400).json({ success: false, error: 'token is required' });
        return;
      }

      await pushService.unregisterDevice(userId, token);

      res.json({ success: true, data: { unregistered: true } });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /push/test
   * Send a test push notification to the authenticated user's own devices.
   */
  async sendTestPush(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: userId } = (req as AuthenticatedRequest).user;

      const result = await pushService.sendToUser(userId, {
        title: 'Test Notification',
        body: 'Push notifications are working correctly!',
        data: { type: 'test' },
        sound: 'default',
      });

      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /push/broadcast
   * Broadcast a push notification to all registered devices. Admin only.
   * Body: { title: string, body: string, data?: Record<string, string>, imageUrl?: string }
   */
  async broadcastPush(req: Request, res: Response, next: NextFunction) {
    try {
      const { title, body, data, imageUrl, badge, sound } = req.body as {
        title: string;
        body: string;
        data?: Record<string, string>;
        imageUrl?: string;
        badge?: number;
        sound?: string;
      };

      if (!title || !body) {
        res.status(400).json({ success: false, error: 'title and body are required' });
        return;
      }

      const result = await pushService.sendToAll({
        title,
        body,
        data,
        imageUrl,
        badge,
        sound,
      });

      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },
};
