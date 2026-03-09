/**
 * Posts routes.
 * GET  /posts/feed
 * GET  /posts/:id
 * POST /posts
 * POST /posts/:id/like
 * POST /posts/:id/comments
 */

import { Router } from 'express';
import * as PostsController from '../controllers/posts.controller';
import { authenticate } from '../middlewares/auth';
import { rateLimiter } from '../middlewares/rateLimiter';
import { validate, uuidParamSchema } from '../middlewares/validate';

const router = Router();

// All posts routes require authentication
router.use(authenticate);
router.use(rateLimiter);

router.get('/feed', PostsController.getFeed);
router.get('/:id', validate({ params: uuidParamSchema }), PostsController.getPost);
router.post('/', PostsController.createPost);
router.post('/:id/like', validate({ params: uuidParamSchema }), PostsController.likePost);
router.post('/:id/comments', validate({ params: uuidParamSchema }), PostsController.addComment);

export default router;
