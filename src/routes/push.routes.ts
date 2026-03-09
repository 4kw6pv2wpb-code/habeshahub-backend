/**
 * Push notification routes.
 *
 * POST /push/register   — register device token (authenticated)
 * POST /push/unregister — remove device token (authenticated)
 * POST /push/test       — send test push to self (authenticated)
 * POST /push/broadcast  — broadcast to all devices (admin only)
 */

import { Router } from 'express';
import { authenticate, requireAdmin } from '../middlewares/auth';
import { pushController } from '../controllers/push.controller';

const router = Router();

router.post('/register', authenticate, pushController.registerDevice);
router.post('/unregister', authenticate, pushController.unregisterDevice);
router.post('/test', authenticate, pushController.sendTestPush);
router.post('/broadcast', authenticate, requireAdmin, pushController.broadcastPush);

export default router;
