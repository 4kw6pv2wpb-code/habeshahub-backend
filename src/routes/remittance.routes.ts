/**
 * Remittance routes.
 * GET  /remittance              — user's remittance history
 * GET  /remittance/corridors    — list supported corridors
 * GET  /remittance/:id          — single remittance
 * POST /remittance/quote        — get a quote (no auth needed)
 * POST /remittance/send         — send money
 */

import { Router } from 'express';
import * as RemittanceController from '../controllers/remittance.controller';
import { authenticate } from '../middlewares/auth';
import { rateLimiter, authRateLimiter } from '../middlewares/rateLimiter';
import { validate, uuidParamSchema } from '../middlewares/validate';

const router = Router();

// Public endpoint — get a quote without logging in
router.post('/quote', authRateLimiter, RemittanceController.getQuote);

// Public — list corridors
router.get('/corridors', RemittanceController.listCorridors);

// Protected routes
router.use(authenticate);
router.use(rateLimiter);

router.get('/', RemittanceController.getUserRemittances);
router.get('/:id', validate({ params: uuidParamSchema }), RemittanceController.getRemittanceById);
router.post('/send', RemittanceController.sendRemittance);

export default router;
