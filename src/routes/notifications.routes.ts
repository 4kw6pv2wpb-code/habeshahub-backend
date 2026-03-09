import { Router } from 'express';
import { notificationsController } from '../controllers/notifications.controller';
import { authenticate } from '../middlewares/auth';

const router = Router();

router.use(authenticate);

router.get('/', notificationsController.list);
router.get('/unread-count', notificationsController.unreadCount);
router.patch('/:id/read', notificationsController.markRead);
router.post('/mark-all-read', notificationsController.markAllRead);

export default router;
