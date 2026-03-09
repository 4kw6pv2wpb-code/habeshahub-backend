import { Router } from 'express';
import { authenticate, requireModerator } from '../middlewares/auth';
import { growthController } from '../controllers/growth.controller';

const router = Router();

router.post('/referral/generate', authenticate, growthController.generateCode);
router.post('/referral/redeem', authenticate, growthController.processReferral);
router.get('/referrals', authenticate, growthController.getReferrals);
router.get('/points', authenticate, growthController.getPoints);
router.get('/leaderboard', growthController.getLeaderboard);
router.post('/ambassador', authenticate, growthController.applyForAmbassador);
router.get('/ambassadors', growthController.getAmbassadors);
router.get('/stats', requireModerator, growthController.getGrowthStats);

export default router;
