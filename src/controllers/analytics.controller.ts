/**
 * Analytics Controller
 *
 * Admin-only endpoints for platform analytics:
 *   - Full dashboard aggregation
 *   - DAU/WAU/MAU
 *   - Retention cohort analysis
 *   - Creator revenue metrics
 *   - Content performance metrics
 *   - User growth
 */

import { Request, Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../types';
import * as analytics from '../infrastructure/analytics';

export const analyticsController = {
  /**
   * GET /analytics/dashboard
   * Returns the full AnalyticsDashboard aggregate.
   */
  async getDashboard(req: Request, res: Response, next: NextFunction) {
    try {
      const dashboard = await analytics.getFullDashboard();
      res.json({ success: true, data: dashboard });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /analytics/dau
   * Query: date (optional, ISO string)
   */
  async getDAU(req: Request, res: Response, next: NextFunction) {
    try {
      const { date } = req.query as { date?: string };
      const target = date ? new Date(date) : undefined;
      const dau = await analytics.getDAU(target);
      res.json({ success: true, data: { dau, date: (target ?? new Date()).toISOString().split('T')[0] } });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /analytics/retention
   * Query: startDate (ISO), endDate (ISO)
   */
  async getRetention(req: Request, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate } = req.query as {
        startDate?: string;
        endDate?: string;
      };

      const start = startDate ? new Date(startDate) : (() => {
        const d = new Date();
        d.setDate(d.getDate() - 30);
        return d;
      })();
      const end = endDate ? new Date(endDate) : new Date();

      const retention = await analytics.getRetentionCohort(start, end);
      res.json({ success: true, data: retention });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /analytics/creators
   * Query: period ('day'|'week'|'month', default 'month')
   */
  async getCreatorMetrics(req: Request, res: Response, next: NextFunction) {
    try {
      const { period = 'month' } = req.query as {
        period?: 'day' | 'week' | 'month';
      };

      const [revenue, watchTime] = await Promise.all([
        analytics.getCreatorRevenue(period),
        analytics.getVideoWatchTime(period),
      ]);

      res.json({ success: true, data: { revenue, watchTime } });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /analytics/content
   * Query: contentType, metric, period ('day'|'week'|'month'), limit (default 10)
   */
  async getContentMetrics(req: Request, res: Response, next: NextFunction) {
    try {
      const {
        contentType = 'video',
        metric = 'view',
        period = 'week',
        limit = '10',
      } = req.query as {
        contentType?: string;
        metric?: string;
        period?: 'day' | 'week' | 'month';
        limit?: string;
      };

      const parsedLimit = Math.min(parseInt(limit, 10) || 10, 100);

      const [topContent, engagement] = await Promise.all([
        analytics.getTopContent(contentType, metric, parsedLimit, period),
        analytics.getEngagementMetrics(contentType, period),
      ]);

      res.json({ success: true, data: { topContent, engagement } });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /analytics/growth
   * Query: period ('day'|'week'|'month', default 'week')
   */
  async getUserGrowth(req: Request, res: Response, next: NextFunction) {
    try {
      const { period = 'week' } = req.query as {
        period?: 'day' | 'week' | 'month';
      };

      const [growth, wau, mau] = await Promise.all([
        analytics.getUserGrowth(period),
        analytics.getWAU(),
        analytics.getMAU(),
      ]);

      res.json({ success: true, data: { growth, wau, mau } });
    } catch (err) {
      next(err);
    }
  },
};
