/**
 * Search Controller
 * Handles full-text search across all MeiliSearch indexes and
 * triggers a full database reindex (admin-only).
 */

import { Request, Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../types';
import * as searchEngine from '../infrastructure/search-engine';
import * as searchSync from '../infrastructure/search-sync';
import { INDEXES, IndexName } from '../infrastructure/search-engine';
import { logger } from '../utils/logger';

const VALID_INDEXES = new Set<string>(Object.values(INDEXES));

export const searchController = {
  /**
   * GET /search
   * Query params:
   *  - q       {string}  Search term (required)
   *  - index   {string}  Which index to search (required, one of the INDEXES constants)
   *  - filters {string}  JSON-encoded MeiliSearch filter expression, e.g. '{"city":"DC"}'
   *                      or a raw MeiliSearch filter string, e.g. 'city = "DC"'
   *  - page    {number}  1-based page number (default: 1)
   *  - limit   {number}  Results per page (default: 20, max: 100)
   */
  async search(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const q = (req.query.q as string | undefined)?.trim() ?? '';
      const indexParam = req.query.index as string | undefined;
      const filtersParam = req.query.filters as string | undefined;
      const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 20));

      // Validate index
      if (!indexParam || !VALID_INDEXES.has(indexParam)) {
        res.status(400).json({
          success: false,
          error: `"index" must be one of: ${[...VALID_INDEXES].join(', ')}`,
        });
        return;
      }

      // Parse optional filters
      let filter: string | string[] | undefined;
      if (filtersParam) {
        try {
          const parsed = JSON.parse(filtersParam);
          // Accept either an object (convert to MeiliSearch filter array) or raw string/array
          if (typeof parsed === 'string' || Array.isArray(parsed)) {
            filter = parsed;
          } else if (typeof parsed === 'object' && parsed !== null) {
            // Convert { key: value } → ['key = "value"', ...]
            filter = Object.entries(parsed).map(([k, v]) => `${k} = "${v}"`);
          }
        } catch {
          // Treat as a raw filter string if not valid JSON
          filter = filtersParam;
        }
      }

      const result = await searchEngine.search(
        indexParam as IndexName,
        q,
        { filter, page, limit },
      );

      res.json({
        success: true,
        data: result.hits,
        meta: {
          totalHits: result.totalHits,
          page: result.page,
          limit: result.limit,
          processingTimeMs: result.processingTimeMs,
        },
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /search/reindex
   * Trigger a full reindex of all MeiliSearch indexes from the database.
   * Requires admin role. Runs asynchronously — returns immediately with 202.
   */
  async reindex(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id: userId } = (req as AuthenticatedRequest).user;

      logger.info('searchController: reindex triggered by admin', { userId });

      // Kick off reindex without blocking the response
      searchSync.syncAllIndexes().catch((err) => {
        logger.error('searchController: background reindex failed', { err });
      });

      res.status(202).json({
        success: true,
        data: { message: 'Reindex started. All 7 indexes will be refreshed in the background.' },
      });
    } catch (err) {
      next(err);
    }
  },
};
