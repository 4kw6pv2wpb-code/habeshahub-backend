/**
 * Authentication service.
 * Handles user registration, login, JWT generation, and profile retrieval.
 */

import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/database';
import { env } from '../config/env';
import { AppError } from '../middlewares/errorHandler';
import { logger } from '../utils/logger';
import { BCRYPT_ROUNDS } from '../utils/constants';
import { omitKeys } from '../utils/helpers';
import type { JwtPayload } from '../types';
import { Language, Role } from '@prisma/client';

// ─────────────────────────────────────────────
// Input types
// ─────────────────────────────────────────────

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
  phone?: string;
  city?: string;
  country?: string;
  languages?: Language[];
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthResult {
  token: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: Role;
    city: string | null;
    country: string | null;
    languages: Language[];
    avatarUrl: string | null;
    createdAt: Date;
  };
}

// ─────────────────────────────────────────────
// Service methods
// ─────────────────────────────────────────────

/**
 * Register a new user account.
 * Hashes the password with bcrypt before persisting.
 */
export async function registerUser(input: RegisterInput): Promise<AuthResult> {
  const { name, email, password, phone, city, country, languages } = input;

  // Check for existing account
  const existing = await prisma.user.findFirst({
    where: {
      OR: [
        { email: email.toLowerCase() },
        ...(phone ? [{ phone }] : []),
      ],
    },
    select: { id: true, email: true, phone: true },
  });

  if (existing) {
    if (existing.email === email.toLowerCase()) {
      throw AppError.conflict('An account with this email already exists', 'EMAIL_TAKEN');
    }
    throw AppError.conflict('An account with this phone number already exists', 'PHONE_TAKEN');
  }

  // Hash password
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  // Create user
  const user = await prisma.user.create({
    data: {
      name,
      email: email.toLowerCase(),
      passwordHash,
      phone: phone ?? null,
      city: city ?? null,
      country: country ?? null,
      languages: languages ?? [Language.EN],
    },
  });

  logger.info('New user registered', { userId: user.id, email: user.email });

  const token = generateToken(user.id, user.email, user.role);

  return {
    token,
    user: omitKeys(user as Record<string, unknown>, ['passwordHash']) as AuthResult['user'],
  };
}

/**
 * Authenticate an existing user and return a JWT.
 */
export async function loginUser(input: LoginInput): Promise<AuthResult> {
  const { email, password } = input;

  // Fetch user with password hash
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (!user) {
    // Use the same error message to avoid user enumeration
    throw AppError.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');
  }

  if (!user.isActive) {
    throw AppError.unauthorized('This account has been deactivated', 'ACCOUNT_DEACTIVATED');
  }

  // Verify password
  const passwordValid = await bcrypt.compare(password, user.passwordHash);
  if (!passwordValid) {
    throw AppError.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');
  }

  logger.info('User logged in', { userId: user.id, email: user.email });

  const token = generateToken(user.id, user.email, user.role);

  return {
    token,
    user: omitKeys(user as Record<string, unknown>, ['passwordHash']) as AuthResult['user'],
  };
}

/**
 * Retrieve a user's profile by ID (without sensitive fields).
 */
export async function getUserProfile(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      bio: true,
      avatarUrl: true,
      city: true,
      country: true,
      role: true,
      languages: true,
      isVerified: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: {
          posts: true,
          jobs: true,
          events: true,
        },
      },
    },
  });

  if (!user) {
    throw AppError.notFound('User not found');
  }

  return user;
}

/**
 * Update a user's profile fields.
 */
export async function updateUserProfile(
  userId: string,
  data: {
    name?: string;
    bio?: string;
    city?: string;
    country?: string;
    languages?: Language[];
    avatarUrl?: string;
  },
) {
  const user = await prisma.user.update({
    where: { id: userId },
    data,
    select: {
      id: true,
      name: true,
      email: true,
      bio: true,
      avatarUrl: true,
      city: true,
      country: true,
      role: true,
      languages: true,
      updatedAt: true,
    },
  });

  logger.info('User profile updated', { userId });
  return user;
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

/**
 * Generate a signed JWT for the given user.
 */
function generateToken(userId: string, email: string, role: Role): string {
  const payload: JwtPayload = {
    sub: userId,
    email,
    role,
  };

  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
    issuer: 'habeshahub',
    audience: 'habeshahub-client',
  });
}
