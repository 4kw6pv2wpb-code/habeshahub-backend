/**
 * Stories routes.
 * GET    /stories/feed
 * GET    /stories/:id
 * POST   /stories
 * DELETE /stories/:id
 */

import { Router } from 'express';
import * as StoriesController from '../controllers/stories.controller';
import { authenticate } from '../middlewares/auth';
import { rateLimiter } from '../middlewares/rateLimiter';
import { validate, uuidParamSchema } from '../middlewares/validate';

const router = Router();

router.use(authenticate);
router.use(rateLimiter);

router.get('/feed', StoriesController.getStoriesFeed);
router.get('/:id', validate({ params: uuidParamSchema }), StoriesController.getStory);
router.post('/', StoriesController.createStory);
router.delete('/:id', validate({ params: uuidParamSchema }), StoriesController.deleteStory);

export default router;
