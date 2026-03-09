/**
 * Authentication controller.
 * Handles /auth routes.
 */

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as AuthService from '../services/auth.service';
import { AppError } from '../middlewares/errorHandler';
import { Language } from '@prisma/client';
import type { AuthenticatedRequest } from '../types';

// ─────────────────────────────────────────────
// Zod schemas (exported for route-level validation)
// ─────────────────────────────────────────────

export const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  email: z.string().email('Invalid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      'Password must contain uppercase, lowercase, and a number',
    ),
  phone: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  languages: z.array(z.nativeEnum(Language)).optional(),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const updateProfileSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  bio: z.string().max(500).optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  languages: z.array(z.nativeEnum(Language)).optional(),
  avatarUrl: z.string().url().optional(),
});

// ─────────────────────────────────────────────
// Handlers
// ─────────────────────────────────────────────

/**
 * POST /auth/register
 */
export async function register(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const input = registerSchema.parse(req.body);
    const result = await AuthService.registerUser(input);

    res.status(201).json({
      success: true,
      data: result,
      message: 'Account created successfully',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /auth/login
 */
export async function login(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const input = loginSchema.parse(req.body);
    const result = await AuthService.loginUser(input);

    res.status(200).json({
      success: true,
      data: result,
      message: 'Login successful',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /auth/profile
 * Requires authentication.
 */
export async function getProfile(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id: userId } = (req as AuthenticatedRequest).user;
    const user = await AuthService.getUserProfile(userId);

    res.status(200).json({
      success: true,
      data: user,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /auth/profile
 * Requires authentication.
 */
export async function updateProfile(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id: userId } = (req as AuthenticatedRequest).user;
    const data = updateProfileSchema.parse(req.body);

    if (Object.keys(data).length === 0) {
      throw AppError.badRequest('No fields provided to update');
    }

    const updated = await AuthService.updateUserProfile(userId, data);

    res.status(200).json({
      success: true,
      data: updated,
      message: 'Profile updated successfully',
    });
  } catch (err) {
    next(err);
  }
}
