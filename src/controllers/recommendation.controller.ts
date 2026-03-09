/**
 * Recommendation Controller.
 *
 * Handles HTTP layer for the recommendation engine v3.
 *
 *  GET /feed           → getRankedFeed      (contentType, page, limit)
 *  GET /for-you        → getRecommendations (limit)
 *  GET /similar/:contentType/:contentId → getSimilar
 */

import { Request, Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../types';
import {
  getRankedFeed,
  getPersonalizedRecommendations,
  getSimilarContent,
  ContentType,
} from '../services/recommendation-v3.service';

const VALID_CONTENT_TYPES: ContentType[] = ['POST', 'VIDEO', 'JOB', 'EVENT', 'STORY'];

function parseContentType(raw: unknown): ContentType {
  const upper = String(raw ?? '').toUpperCase() as ContentType;
  return VALID_CONTENT_TYPES.includes(upper) ? upper : 'POST';
}

function parsePositiveInt(raw: unknown, defaultVal: number, max?: number): number {
  const n = parseInt(String(raw ?? defaultVal), 10);
  if (isNaN(n) || n < 1) return defaultVal;
  if (max !== undefined && n > max) return max;
  return n;
}

export const recommendationController = {
  /**
   * GET /recommendations/feed
   * Query params: contentType (POST|VIDEO|JOB|EVENT|STORY), page, limit
   */
  async getRankedFeed(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: userId } = (req as AuthenticatedRequest).user;
      const contentType = parseContentType(req.query.contentType);
      const page  = parsePositiveInt(req.query.page,  1);
      const limit = parsePositiveInt(req.query.limit, 20, 100);

      const result = await getRankedFeed(userId, contentType, page, limit);

      res.json({
        success: true,
        data: result.items,
        meta: {
          total:      result.total,
          page:       result.page,
          limit:      result.limit,
          totalPages: Math.ceil(result.total / result.limit),
        },
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /recommendations/for-you
   * Query params: limit
   */
  async getRecommendations(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: userId } = (req as AuthenticatedRequest).user;
      const limit = parsePositiveInt(req.query.limit, 20, 100);

      const items = await getPersonalizedRecommendations(userId, limit);

      res.json({
        success: true,
        data: items,
        meta: {
          total:      items.length,
          page:       1,
          limit,
          totalPages: 1,
        },
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /recommendations/similar/:contentType/:contentId
   */
  async getSimilar(req: Request, res: Response, next: NextFunction) {
    try {
      const contentType = parseContentType(req.params.contentType);
      const contentId   = String(req.params.contentId ?? '');
      const limit = parsePositiveInt(req.query.limit, 10, 50);

      if (!contentId) {
        res.status(400).json({ success: false, error: 'contentId is required' });
        return;
      }

      const items = await getSimilarContent(contentId, contentType, limit);

      res.json({
        success: true,
        data: items,
        meta: {
          contentId,
          contentType,
          total: items.length,
        },
      });
    } catch (err) {
      next(err);
    }
  },
};
