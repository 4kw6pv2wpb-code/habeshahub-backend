import { Router } from 'express';
import { authenticate, requireModerator } from '../middlewares/auth';
import { engagementController } from '../controllers/engagement.controller';

const router = Router();

router.post('/track', authenticate, engagementController.trackEngagement);
router.get('/content/:contentType/:contentId', engagementController.getContentEngagement);
router.get('/history', authenticate, engagementController.getUserEngagement);
router.get('/popular/:contentType', engagementController.getPopularContent);
router.get('/stats', requireModerator, engagementController.getEngagementStats);
router.get('/feed', authenticate, engagementController.getRankedFeed);
router.get('/events', requireModerator, engagementController.getRecentEvents);

export default router;
