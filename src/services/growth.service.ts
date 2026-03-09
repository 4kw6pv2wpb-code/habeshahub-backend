/**
 * Growth Engine service.
 * Handles referrals, reward points, ambassadors, and growth analytics.
 */

import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';
import { AppError } from '../middlewares/errorHandler';

const prisma = new PrismaClient();
const db = prisma as any; // For models not yet generated

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function calcTier(totalPoints: number): string {
  if (totalPoints >= 10000) return 'platinum';
  if (totalPoints >= 5000) return 'gold';
  if (totalPoints >= 1000) return 'silver';
  return 'bronze';
}

// ─────────────────────────────────────────────
// Referrals
// ─────────────────────────────────────────────

/**
 * Generate a unique referral code for a user.
 */
export async function generateReferralCode(userId: string) {
  // Return existing unconverted code if present
  const existing = await db.referral.findFirst({
    where: { referrerId: userId, isConverted: false },
  });
  if (existing) return existing;

  let code: string;
  let attempts = 0;
  do {
    code = generateCode();
    attempts++;
    if (attempts > 20) throw new AppError('Could not generate unique code', 500);
    const conflict = await db.referral.findUnique({ where: { code } });
    if (!conflict) break;
  } while (true);

  const referral = await db.referral.create({
    data: {
      referrerId: userId,
      code,
      pointsEarned: 0,
      isConverted: false,
    },
  });

  logger.info('Referral code generated', { userId, code });
  return referral;
}

/**
 * Process a referral code for a new user — mark as converted, award points.
 */
export async function processReferral(code: string, newUserId: string) {
  const referral = await db.referral.findUnique({ where: { code } });

  if (!referral) {
    throw AppError.notFound('Referral code not found');
  }

  if (referral.isConverted) {
    throw new AppError('Referral code has already been used', 400);
  }

  if (referral.referrerId === newUserId) {
    throw new AppError('Cannot use your own referral code', 400);
  }

  const REFERRAL_POINTS = 100;

  const updated = await db.referral.update({
    where: { code },
    data: {
      referredId: newUserId,
      isConverted: true,
      convertedAt: new Date(),
      pointsEarned: REFERRAL_POINTS,
    },
  });

  // Award points to referrer
  await awardPoints(referral.referrerId, 'REFERRAL', REFERRAL_POINTS, { referredUserId: newUserId });
  // Award sign-up bonus to new user
  await awardPoints(newUserId, 'SIGN_UP', 50, { referralCode: code });

  logger.info('Referral processed', { code, referrerId: referral.referrerId, newUserId });
  return updated;
}

/**
 * Get referrals made by a user (paginated).
 */
export async function getReferrals(userId: string, page = 1, limit = 20) {
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    db.referral.findMany({
      where: { referrerId: userId },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    db.referral.count({ where: { referrerId: userId } }),
  ]);

  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
}

// ─────────────────────────────────────────────
// Reward Points
// ─────────────────────────────────────────────

/**
 * Award points to a user for a specific action.
 */
export async function awardPoints(
  userId: string,
  action: string,
  points: number,
  metadata?: Record<string, any>,
) {
  const record = await db.rewardPoints.create({
    data: {
      userId,
      action,
      points,
      metadata: metadata ?? {},
    },
  });

  logger.info('Points awarded', { userId, action, points });

  // Update ambassador tier if applicable
  await updateAmbassadorTier(userId).catch(() => {
    // Not an ambassador yet — ignore
  });

  return record;
}

/**
 * Get total points and history for a user.
 */
export async function getPoints(userId: string) {
  const [history, aggregate] = await Promise.all([
    db.rewardPoints.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    }),
    db.rewardPoints.aggregate({
      where: { userId },
      _sum: { points: true },
    }),
  ]);

  return {
    total: aggregate._sum.points ?? 0,
    history,
  };
}

/**
 * Get top users by total points (leaderboard).
 */
export async function getLeaderboard(limit = 20) {
  const rows = await db.rewardPoints.groupBy({
    by: ['userId'],
    _sum: { points: true },
    orderBy: { _sum: { points: 'desc' } },
    take: limit,
  });

  return rows.map((r: any) => ({
    userId: r.userId,
    totalPoints: r._sum.points ?? 0,
  }));
}

// ─────────────────────────────────────────────
// Ambassadors
// ─────────────────────────────────────────────

/**
 * Apply to become a community ambassador.
 */
export async function applyForAmbassador(userId: string, city: string, region: string) {
  const existing = await db.ambassador.findUnique({ where: { userId } });
  if (existing) {
    throw new AppError('Already registered as ambassador', 409);
  }

  const { total } = await getPoints(userId);
  const referralCount = await db.referral.count({ where: { referrerId: userId, isConverted: true } });

  const ambassador = await db.ambassador.create({
    data: {
      userId,
      tier: calcTier(total),
      totalReferrals: referralCount,
      totalPoints: total,
      isActive: true,
      city,
      region,
    },
  });

  logger.info('Ambassador created', { userId, city, region, tier: ambassador.tier });
  return ambassador;
}

/**
 * List all active ambassadors (paginated).
 */
export async function getAmbassadors(page = 1, limit = 20) {
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    db.ambassador.findMany({
      where: { isActive: true },
      orderBy: [{ tier: 'desc' }, { totalPoints: 'desc' }],
      skip,
      take: limit,
    }),
    db.ambassador.count({ where: { isActive: true } }),
  ]);

  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
}

/**
 * Auto-recalculate and update an ambassador's tier based on current points.
 */
export async function updateAmbassadorTier(userId: string) {
  const ambassador = await db.ambassador.findUnique({ where: { userId } });
  if (!ambassador) return null;

  const { total } = await getPoints(userId);
  const referralCount = await db.referral.count({ where: { referrerId: userId, isConverted: true } });
  const newTier = calcTier(total);

  const updated = await db.ambassador.update({
    where: { userId },
    data: {
      tier: newTier,
      totalPoints: total,
      totalReferrals: referralCount,
      updatedAt: new Date(),
    },
  });

  logger.info('Ambassador tier updated', { userId, tier: newTier });
  return updated;
}

// ─────────────────────────────────────────────
// Platform Stats
// ─────────────────────────────────────────────

/**
 * Platform-wide growth statistics.
 */
export async function getGrowthStats() {
  const [
    totalReferrals,
    convertedReferrals,
    totalPointsAwarded,
    totalAmbassadors,
    ambassadorsByTier,
  ] = await Promise.all([
    db.referral.count(),
    db.referral.count({ where: { isConverted: true } }),
    db.rewardPoints.aggregate({ _sum: { points: true } }),
    db.ambassador.count({ where: { isActive: true } }),
    db.ambassador.groupBy({
      by: ['tier'],
      _count: { tier: true },
      where: { isActive: true },
    }),
  ]);

  return {
    totalReferrals,
    convertedReferrals,
    conversionRate: totalReferrals > 0 ? convertedReferrals / totalReferrals : 0,
    totalPointsAwarded: totalPointsAwarded._sum.points ?? 0,
    totalAmbassadors,
    ambassadorsByTier,
  };
}
