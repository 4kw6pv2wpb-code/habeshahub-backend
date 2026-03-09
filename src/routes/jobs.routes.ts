/**
 * Jobs routes.
 * GET  /jobs
 * GET  /jobs/:id
 * POST /jobs
 * POST /jobs/:id/apply
 */

import { Router } from 'express';
import * as JobsController from '../controllers/jobs.controller';
import { authenticate } from '../middlewares/auth';
import { rateLimiter } from '../middlewares/rateLimiter';
import { validate, uuidParamSchema } from '../middlewares/validate';

const router = Router();

router.use(authenticate);
router.use(rateLimiter);

router.get('/', JobsController.listJobs);
router.get('/:id', validate({ params: uuidParamSchema }), JobsController.getJob);
router.post('/', JobsController.createJob);
router.post('/:id/apply', validate({ params: uuidParamSchema }), JobsController.applyToJob);

export default router;
