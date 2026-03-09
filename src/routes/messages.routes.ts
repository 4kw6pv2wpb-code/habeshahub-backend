/**
 * Messages routes.
 * GET  /messages             — list all threads
 * GET  /messages/online      — online users
 * GET  /messages/thread/:threadId — thread messages
 * POST /messages             — send a message (HTTP fallback)
 */

import { Router } from 'express';
import * as MessagesController from '../controllers/messages.controller';
import { authenticate } from '../middlewares/auth';
import { rateLimiter } from '../middlewares/rateLimiter';

const router = Router();

router.use(authenticate);
router.use(rateLimiter);

router.get('/', MessagesController.getThreads);
router.get('/online', MessagesController.getOnlineUsers);
router.get('/thread/:threadId', MessagesController.getMessages);
router.post('/', MessagesController.sendMessage);

export default router;
