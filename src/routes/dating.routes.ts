/**
 * Dating Routes.
 *
 * GET    /dating/profile         — Get own dating profile
 * PATCH  /dating/profile         — Update dating profile
 * GET    /dating/discover        — Get discover feed
 * POST   /dating/swipe           — Swipe left/right
 * GET    /dating/matches         — Get all matches
 * DELETE /dating/matches/:matchId — Unmatch
 */

import { Router } from 'express';
import { datingController } from '../controllers/dating.controller';
import { authenticate } from '../middlewares/auth';

const router = Router();

router.use(authenticate);

router.get('/profile', datingController.getProfile);
router.patch('/profile', datingController.updateProfile);
router.get('/discover', datingController.discover);
router.post('/swipe', datingController.swipe);
router.get('/matches', datingController.matches);
router.delete('/matches/:matchId', datingController.unmatch);

export default router;
