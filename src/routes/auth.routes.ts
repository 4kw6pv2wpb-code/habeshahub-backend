/**
 * Authentication routes.
 * POST /auth/register
 * POST /auth/login
 * GET  /auth/profile
 * PATCH /auth/profile
 */

import { Router } from 'express';
import * as AuthController from '../controllers/auth.controller';
import { authenticate } from '../middlewares/auth';
import { authRateLimiter } from '../middlewares/rateLimiter';

const router = Router();

// Public routes (with stricter rate limiting)
router.post('/register', authRateLimiter, AuthController.register);
router.post('/login', authRateLimiter, AuthController.login);

// Protected routes
router.get('/profile', authenticate, AuthController.getProfile);
router.patch('/profile', authenticate, AuthController.updateProfile);

export default router;
