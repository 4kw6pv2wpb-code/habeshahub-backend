import { Router } from 'express';
import { authenticate } from '../middlewares/auth';
import { creatorController } from '../controllers/creator.controller';

const router = Router();

// Profile
router.post('/profile', authenticate, creatorController.createProfile);
router.get('/profile', authenticate, creatorController.getMyProfile);
router.get('/profile/:id', creatorController.getProfileById);
router.put('/profile', authenticate, creatorController.updateProfile);

// Monetization
router.post('/monetize', authenticate, creatorController.enableMonetization);

// Wallet
router.get('/wallet', authenticate, creatorController.getWallet);

// Tipping & subscriptions
router.post('/tip', authenticate, creatorController.tipCreator);
router.post('/subscribe', authenticate, creatorController.subscribe);

// Revenue & analytics
router.get('/revenues', authenticate, creatorController.getRevenues);
router.get('/analytics', authenticate, creatorController.getAnalytics);

// Leaderboard (public)
router.get('/top', creatorController.getTopCreators);

// Withdrawals
router.post('/withdraw', authenticate, creatorController.withdrawFunds);

// Dashboard
router.get('/dashboard', authenticate, creatorController.getDashboard);

export default router;
