/**
 * Events routes.
 * GET  /events
 * GET  /events/:id
 * POST /events
 * POST /events/:id/rsvp
 */

import { Router } from 'express';
import * as EventsController from '../controllers/events.controller';
import { authenticate } from '../middlewares/auth';
import { rateLimiter } from '../middlewares/rateLimiter';
import { validate, uuidParamSchema } from '../middlewares/validate';

const router = Router();

router.use(authenticate);
router.use(rateLimiter);

router.get('/', EventsController.listEvents);
router.get('/:id', validate({ params: uuidParamSchema }), EventsController.getEvent);
router.post('/', EventsController.createEvent);
router.post('/:id/rsvp', validate({ params: uuidParamSchema }), EventsController.rsvpEvent);

export default router;
