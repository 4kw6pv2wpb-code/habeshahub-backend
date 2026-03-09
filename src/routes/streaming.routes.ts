import { Router } from 'express';
import { authenticate } from '../middlewares/auth';
import { streamingController } from '../controllers/streaming.controller';

const router = Router();

router.post('/', authenticate, streamingController.create);
router.get('/live', streamingController.getActive);
router.get('/upcoming', streamingController.getUpcoming);
router.get('/user/:userId', streamingController.getUserStreams);
router.get('/:id', streamingController.getById);
router.post('/:id/start', authenticate, streamingController.start);
router.post('/:id/end', authenticate, streamingController.end);
router.post('/:id/gift', authenticate, streamingController.sendGift);
router.get('/:id/gifts', streamingController.getGifts);
router.delete('/:id', authenticate, streamingController.delete);

export default router;
