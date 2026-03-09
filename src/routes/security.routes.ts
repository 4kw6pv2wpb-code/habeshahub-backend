/**
 * Security Routes
 *
 * GET  /security/fraud/:userId       → getFraudScore   (authenticate, requireAdmin)
 * GET  /security/kyc                 → getKYCStatus    (authenticate — own user or admin)
 * POST /security/kyc                 → initiateKYC     (authenticate)
 * GET  /security/audit               → getAuditTrail   (authenticate, requireAdmin)
 * GET  /security/audit/user/:userId  → getUserAudits   (authenticate, requireAdmin)
 */

import { Router } from 'express';
import { authenticate, requireAdmin } from '../middlewares/auth';
import { securityController } from '../controllers/security.controller';

const router = Router();

// Fraud score — admin only
router.get('/fraud/:userId', authenticate, requireAdmin, securityController.getFraudScore);

// KYC — authenticated user (own data); admin may pass ?userId= query param
router.get('/kyc', authenticate, securityController.getKYCStatus);
router.post('/kyc', authenticate, securityController.initiateKYC);

// Audit trail — admin only
// Note: /audit/user/:userId must be declared before /audit to avoid route conflict
router.get('/audit/user/:userId', authenticate, requireAdmin, securityController.getUserAudits);
router.get('/audit', authenticate, requireAdmin, securityController.getAuditTrail);

export default router;
