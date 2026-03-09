/**
 * Analytics Routes
 *
 * All routes require authentication + admin role.
 *
 * GET /analytics/dashboard  → full platform dashboard
 * GET /analytics/dau        → daily active users
 * GET /analytics/retention  → cohort retention rates
 * GET /analytics/creators   → creator revenue & watch time
 * GET /analytics/content    → top content + engagement breakdown
 * GET /analytics/growth     → user growth over time
 */

import { Router } from 'express';
import { authenticate, requireAdmin } from '../middlewares/auth';
import { analyticsController } from '../controllers/analytics.controller';

const router = Router();

// All analytics routes are admin-only
router.use(authenticate, requireAdmin);

router.get('/dashboard', analyticsController.getDashboard);
router.get('/dau', analyticsController.getDAU);
router.get('/retention', analyticsController.getRetention);
router.get('/creators', analyticsController.getCreatorMetrics);
router.get('/content', analyticsController.getContentMetrics);
router.get('/growth', analyticsController.getUserGrowth);

export default router;
