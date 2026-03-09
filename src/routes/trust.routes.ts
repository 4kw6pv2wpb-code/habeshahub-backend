import { Router } from 'express';
import { authenticate, requireModerator } from '../middlewares/auth';
import { trustController } from '../controllers/trust.controller';

const router = Router();

router.post('/reports', authenticate, trustController.createReport);
router.get('/reports', requireModerator, trustController.getReports);
router.get('/reports/:id', requireModerator, trustController.getReportById);
router.post('/reports/:id/resolve', requireModerator, trustController.resolveReport);
router.post('/actions', requireModerator, trustController.takeAction);
router.get('/logs', requireModerator, trustController.getModLogs);
router.get('/users/:userId/reports', requireModerator, trustController.getUserReportHistory);
router.get('/stats', requireModerator, trustController.getModStats);

export default router;
