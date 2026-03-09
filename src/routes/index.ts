/**
 * Route aggregator.
 * Mounts all feature routers under /api prefix.
 */

import { Router, Request, Response } from 'express';
import authRoutes from './auth.routes';
import postsRoutes from './posts.routes';
import jobsRoutes from './jobs.routes';
import messagesRoutes from './messages.routes';
import storiesRoutes from './stories.routes';
import eventsRoutes from './events.routes';
import remittanceRoutes from './remittance.routes';
import notificationsRoutes from './notifications.routes';
import datingRoutes from './dating.routes';
import usersRoutes from './users.routes';
import aiRoutes from './ai.routes';
import housingRoutes from './housing.routes';
// Phase 2 routes
import videoRoutes from './video.routes';
import creatorRoutes from './creator.routes';
import financeRoutes from './finance.routes';
import growthRoutes from './growth.routes';
import streamingRoutes from './streaming.routes';
import trustRoutes from './trust.routes';
import engagementRoutes from './engagement.routes';
import storyEngagementRoutes from './story-engagement.routes';
// Phase 3 routes
import recommendationRoutes from './recommendation.routes';
import searchRoutes from './search.routes';
import pushRoutes from './push.routes';
import adminRoutes from './admin.routes';
import analyticsRoutes from './analytics.routes';
import securityRoutes from './security.routes';

const router = Router();

// ─────────────────────────────────────────────
// API health check
// ─────────────────────────────────────────────

router.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    data: {
      status: 'ok',
      version: process.env.npm_package_version ?? '1.0.0',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
    },
  });
});

// ─────────────────────────────────────────────
// Feature routes
// ─────────────────────────────────────────────

router.use('/auth', authRoutes);
router.use('/posts', postsRoutes);
router.use('/jobs', jobsRoutes);
router.use('/messages', messagesRoutes);
router.use('/stories', storiesRoutes);
router.use('/events', eventsRoutes);
router.use('/remittance', remittanceRoutes);
router.use('/notifications', notificationsRoutes);
router.use('/dating', datingRoutes);
router.use('/users', usersRoutes);
router.use('/ai', aiRoutes);
router.use('/housing', housingRoutes);

// Phase 2 routes
router.use('/videos', videoRoutes);
router.use('/creators', creatorRoutes);
router.use('/finance', financeRoutes);
router.use('/growth', growthRoutes);
router.use('/streaming', streamingRoutes);
router.use('/trust', trustRoutes);
router.use('/engagement', engagementRoutes);
router.use('/stories/engagement', storyEngagementRoutes);

// Phase 3 routes
router.use('/recommendations', recommendationRoutes);
router.use('/search', searchRoutes);
router.use('/push', pushRoutes);
router.use('/admin', adminRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/security', securityRoutes);

export default router;
