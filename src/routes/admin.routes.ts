/**
 * Admin dashboard routes.
 * All routes require authenticate + requireAdmin.
 *
 * Users:
 *   GET    /admin/users                             → getUsers
 *   GET    /admin/users/:id                         → getUserById
 *   PATCH  /admin/users/:id/role                    → updateRole
 *   PATCH  /admin/users/:id/toggle-active           → toggleActive
 *   DELETE /admin/users/:id                         → deleteUser
 *
 * Moderation:
 *   GET    /admin/moderation/queue                  → getModerationQueue
 *   GET    /admin/moderation/content/:type/:id      → getContentForReview
 *   POST   /admin/moderation/remove                 → removeContent
 *   POST   /admin/moderation/bulk-resolve           → bulkResolve
 *
 * Wallets:
 *   GET    /admin/wallets/overview                  → getWalletOverview
 *   GET    /admin/wallets/user/:userId              → getUserWallet
 *   POST   /admin/wallets/user/:userId/freeze       → freezeWallet
 *   POST   /admin/wallets/user/:userId/adjust       → adjustBalance
 *
 * Statistics:
 *   GET    /admin/stats                             → getPlatformStats
 *   GET    /admin/stats/daily                       → getDailyStats
 *   GET    /admin/stats/growth                      → getGrowthMetrics
 */

import { Router } from 'express';
import { authenticate, requireAdmin } from '../middlewares/auth';
import { adminController } from '../controllers/admin.controller';

const router = Router();

// Apply auth + admin guard to all admin routes
router.use(authenticate, requireAdmin);

// ─── Users ────────────────────────────────────
router.get('/users', adminController.getUsers);
router.get('/users/:id', adminController.getUserById);
router.patch('/users/:id/role', adminController.updateRole);
router.patch('/users/:id/toggle-active', adminController.toggleActive);
router.delete('/users/:id', adminController.deleteUser);

// ─── Moderation ───────────────────────────────
router.get('/moderation/queue', adminController.getModerationQueue);
router.get('/moderation/content/:contentType/:contentId', adminController.getContentForReview);
router.post('/moderation/remove', adminController.removeContent);
router.post('/moderation/bulk-resolve', adminController.bulkResolve);

// ─── Wallets ──────────────────────────────────
router.get('/wallets/overview', adminController.getWalletOverview);
router.get('/wallets/user/:userId', adminController.getUserWallet);
router.post('/wallets/user/:userId/freeze', adminController.freezeWallet);
router.post('/wallets/user/:userId/adjust', adminController.adjustBalance);

// ─── Statistics ───────────────────────────────
router.get('/stats', adminController.getPlatformStats);
router.get('/stats/daily', adminController.getDailyStats);
router.get('/stats/growth', adminController.getGrowthMetrics);

export default router;
