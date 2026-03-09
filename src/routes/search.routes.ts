/**
 * Search Routes
 *
 * GET  /  — Full-text search (public)
 *           Query params: q, index, filters, page, limit
 *
 * POST /reindex — Trigger full database → MeiliSearch reindex (admin only)
 */

import { Router } from 'express';
import { authenticate, requireAdmin } from '../middlewares/auth';
import { searchController } from '../controllers/search.controller';

const router = Router();

// Public search endpoint
router.get('/', searchController.search);

// Admin-only full reindex
router.post('/reindex', authenticate, requireAdmin, searchController.reindex);

export default router;
