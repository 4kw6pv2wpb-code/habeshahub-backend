import { Router } from 'express';
import { authenticate, requireModerator } from '../middlewares/auth';
import { videoController } from '../controllers/video.controller';

const router = Router();

// Public routes
router.get('/', videoController.getVideoFeed);
router.get('/trending', videoController.getTrending);
router.get('/search', videoController.searchByHashtag);
router.get('/user/:userId', videoController.getUserVideos);
router.get('/:id', videoController.getById);
router.get('/:id/comments', videoController.getComments);
router.post('/:id/view', videoController.incrementView);

// Authenticated routes
router.post('/', authenticate, videoController.upload);
router.post('/:id/like', authenticate, videoController.likeVideo);
router.post('/:id/comments', authenticate, videoController.comment);
router.delete('/:id', authenticate, videoController.deleteVideo);

// Moderator routes
router.patch('/:id/status', authenticate, requireModerator, videoController.updateStatus);

export default router;
