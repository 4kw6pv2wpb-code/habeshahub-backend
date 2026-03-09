import { Router } from 'express';
import { authenticate } from '../middlewares/auth';
import { storyEngagementController } from '../controllers/story-engagement.controller';

const router = Router();

router.get('/stats', authenticate, storyEngagementController.getMyStats);
router.post('/:storyId/view', authenticate, storyEngagementController.viewStory);
router.post('/:storyId/react', authenticate, storyEngagementController.reactToStory);
router.delete('/:storyId/react', authenticate, storyEngagementController.removeReaction);
router.get('/:storyId/views', authenticate, storyEngagementController.getViews);
router.get('/:storyId/reactions', storyEngagementController.getReactions);

export default router;
