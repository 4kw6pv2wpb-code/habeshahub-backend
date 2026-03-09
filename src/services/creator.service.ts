/**
 * Creator Economy service.
 * Handles creator profiles, wallets, tips, subscriptions, analytics, and revenue.
 */

import { prisma } from '../config/database';
import { AppError } from '../middlewares/errorHandler';
import { logger } from '../utils/logger';
// TransactionType and TransactionStatus are Phase 2 enums — use string literals
const TransactionType = {
  TIP: 'TIP',
  SUBSCRIPTION: 'SUBSCRIPTION',
  WITHDRAWAL: 'WITHDRAWAL',
} as const;

const TransactionStatus = {
  PENDING: 'PENDING',
  COMPLETED: 'COMPLETED',
} as const;

const db = prisma as any; // For Phase 2 models

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface CreateProfileInput {
  displayName?: string;
  bio?: string;
  bannerUrl?: string;
  category?: string;
  tipEnabled?: boolean;
  subscriptionPrice?: number;
}

export interface UpdateProfileInput {
  displayName?: string;
  bio?: string;
  bannerUrl?: string;
  category?: string;
  tipEnabled?: boolean;
  subscriptionPrice?: number;
}

export interface RecordAnalyticsInput {
  date?: Date;
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  newFollowers?: number;
  revenue?: number;
  watchTime?: number;
}

// ─────────────────────────────────────────────
// Profile
// ─────────────────────────────────────────────

/**
 * Create a creator profile for a user.
 * One profile per user (userId is unique).
 */
export async function createProfile(userId: string, data: CreateProfileInput) {
  const existing = await db.creatorProfile.findUnique({ where: { userId } });
  if (existing) {
    throw AppError.badRequest('Creator profile already exists for this user');
  }

  const profile = await db.creatorProfile.create({
    data: {
      userId,
      displayName: data.displayName,
      bio: data.bio,
      bannerUrl: data.bannerUrl,
      category: data.category,
      tipEnabled: data.tipEnabled ?? true,
      subscriptionPrice: data.subscriptionPrice,
    },
    include: {
      user: { select: { id: true, name: true, email: true, avatarUrl: true } },
    },
  });

  logger.info(`Creator profile created for user ${userId}`);
  return profile;
}

/**
 * Get own profile with wallet info (authenticated).
 */
export async function getProfile(userId: string) {
  const profile = await db.creatorProfile.findUnique({
    where: { userId },
    include: {
      user: { select: { id: true, name: true, email: true, avatarUrl: true } },
      wallet: true,
    },
  });

  if (!profile) {
    throw AppError.notFound('Creator profile not found');
  }

  return profile;
}

/**
 * Public profile view by profile ID.
 */
export async function getProfileById(profileId: string) {
  const profile = await db.creatorProfile.findUnique({
    where: { id: profileId },
    include: {
      user: { select: { id: true, name: true, avatarUrl: true } },
    },
  });

  if (!profile) {
    throw AppError.notFound('Creator profile not found');
  }

  return profile;
}

/**
 * Update creator profile settings.
 */
export async function updateProfile(userId: string, data: UpdateProfileInput) {
  const profile = await db.creatorProfile.findUnique({ where: { userId } });
  if (!profile) {
    throw AppError.notFound('Creator profile not found');
  }

  const updated = await db.creatorProfile.update({
    where: { userId },
    data: {
      ...(data.displayName !== undefined && { displayName: data.displayName }),
      ...(data.bio !== undefined && { bio: data.bio }),
      ...(data.bannerUrl !== undefined && { bannerUrl: data.bannerUrl }),
      ...(data.category !== undefined && { category: data.category }),
      ...(data.tipEnabled !== undefined && { tipEnabled: data.tipEnabled }),
      ...(data.subscriptionPrice !== undefined && { subscriptionPrice: data.subscriptionPrice }),
    },
    include: {
      user: { select: { id: true, name: true, avatarUrl: true } },
    },
  });

  logger.info(`Creator profile updated for user ${userId}`);
  return updated;
}

// ─────────────────────────────────────────────
// Monetization
// ─────────────────────────────────────────────

/**
 * Enable monetization for a creator.
 * Sets isMonetized=true and creates a wallet if one doesn't exist.
 */
export async function enableMonetization(userId: string) {
  const profile = await db.creatorProfile.findUnique({ where: { userId } });
  if (!profile) {
    throw AppError.notFound('Creator profile not found');
  }

  const [updatedProfile] = await prisma.$transaction([
    db.creatorProfile.update({
      where: { userId },
      data: { isMonetized: true },
    }),
    db.creatorWallet.upsert({
      where: { creatorId: profile.id },
      create: { creatorId: profile.id },
      update: {},
    }),
  ]);

  logger.info(`Monetization enabled for creator ${profile.id}`);
  return updatedProfile;
}

// ─────────────────────────────────────────────
// Wallet
// ─────────────────────────────────────────────

/**
 * Get wallet with recent transactions.
 */
export async function getWallet(userId: string) {
  const profile = await db.creatorProfile.findUnique({ where: { userId } });
  if (!profile) {
    throw AppError.notFound('Creator profile not found');
  }

  const wallet = await db.creatorWallet.findUnique({
    where: { creatorId: profile.id },
    include: {
      transactions: {
        orderBy: { createdAt: 'desc' },
        take: 20,
      },
    },
  });

  if (!wallet) {
    throw AppError.notFound('Wallet not found. Enable monetization first.');
  }

  return wallet;
}

// ─────────────────────────────────────────────
// Tip
// ─────────────────────────────────────────────

/**
 * Tip a creator. Creates a revenue record and updates wallet balance.
 */
export async function tipCreator(fromUserId: string, creatorId: string, amount: number) {
  if (amount <= 0) {
    throw AppError.badRequest('Tip amount must be greater than 0');
  }

  const profile = await db.creatorProfile.findUnique({ where: { id: creatorId } });
  if (!profile) {
    throw AppError.notFound('Creator not found');
  }

  if (!profile.tipEnabled) {
    throw AppError.badRequest('This creator has tips disabled');
  }

  if (!profile.isMonetized) {
    throw AppError.badRequest('This creator is not monetized');
  }

  const wallet = await db.creatorWallet.findUnique({ where: { creatorId } });
  if (!wallet) {
    throw AppError.notFound('Creator wallet not found');
  }

  const [revenue] = await prisma.$transaction([
    db.creatorRevenue.create({
      data: {
        creatorId,
        type: TransactionType.TIP,
        amount,
        fromUserId,
        status: TransactionStatus.COMPLETED,
      },
    }),
    db.creatorWallet.update({
      where: { creatorId },
      data: {
        balance: { increment: amount },
        totalEarned: { increment: amount },
      },
    }),
    db.creatorProfile.update({
      where: { id: creatorId },
      data: {
        totalRevenue: { increment: amount },
        monthlyRevenue: { increment: amount },
      },
    }),
  ]);

  logger.info(`Tip of ${amount} sent from user ${fromUserId} to creator ${creatorId}`);
  return revenue;
}

// ─────────────────────────────────────────────
// Subscription
// ─────────────────────────────────────────────

/**
 * Subscribe to a creator. Increments subscriberCount and creates a revenue record.
 */
export async function subscribeToCreator(userId: string, creatorId: string) {
  const profile = await db.creatorProfile.findUnique({ where: { id: creatorId } });
  if (!profile) {
    throw AppError.notFound('Creator not found');
  }

  if (!profile.isMonetized) {
    throw AppError.badRequest('This creator is not monetized');
  }

  const subscriptionAmount = profile.subscriptionPrice ?? 0;

  const ops: any[] = [
    db.creatorProfile.update({
      where: { id: creatorId },
      data: { subscriberCount: { increment: 1 } },
    }),
    db.creatorRevenue.create({
      data: {
        creatorId,
        type: TransactionType.SUBSCRIPTION,
        amount: subscriptionAmount,
        fromUserId: userId,
        status: TransactionStatus.COMPLETED,
        metadata: { subscriptionPrice: subscriptionAmount },
      },
    }),
  ];

  if (subscriptionAmount > 0) {
    const wallet = await db.creatorWallet.findUnique({ where: { creatorId } });
    if (wallet) {
      ops.push(
        db.creatorWallet.update({
          where: { creatorId },
          data: {
            balance: { increment: subscriptionAmount },
            totalEarned: { increment: subscriptionAmount },
          },
        }),
        db.creatorProfile.update({
          where: { id: creatorId },
          data: {
            totalRevenue: { increment: subscriptionAmount },
            monthlyRevenue: { increment: subscriptionAmount },
          },
        }),
      );
    }
  }

  const [updatedProfile] = await prisma.$transaction(ops);

  logger.info(`User ${userId} subscribed to creator ${creatorId}`);
  return updatedProfile;
}

// ─────────────────────────────────────────────
// Revenue
// ─────────────────────────────────────────────

/**
 * Paginated revenue history for a creator.
 */
export async function getRevenues(
  creatorId: string,
  page: number = 1,
  limit: number = 20,
  type?: string,
) {
  const skip = (page - 1) * limit;

  const where: any = { creatorId };
  if (type) {
    where.type = type;
  }

  const [items, total] = await Promise.all([
    db.creatorRevenue.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    db.creatorRevenue.count({ where }),
  ]);

  return {
    items,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}

// ─────────────────────────────────────────────
// Analytics
// ─────────────────────────────────────────────

/**
 * Get analytics rows in a date range.
 */
export async function getAnalytics(creatorId: string, startDate: Date, endDate: Date) {
  const rows = await db.creatorAnalytics.findMany({
    where: {
      creatorId,
      date: {
        gte: startDate,
        lte: endDate,
      },
    },
    orderBy: { date: 'asc' },
  });

  return rows;
}

/**
 * Upsert a daily analytics row for a creator.
 */
export async function recordDailyAnalytics(creatorId: string, data: RecordAnalyticsInput) {
  const profile = await db.creatorProfile.findUnique({ where: { id: creatorId } });
  if (!profile) {
    throw AppError.notFound('Creator profile not found');
  }

  const targetDate = data.date ? new Date(data.date) : new Date();
  // Normalize to midnight UTC for date-only comparison
  targetDate.setUTCHours(0, 0, 0, 0);

  const row = await db.creatorAnalytics.upsert({
    where: {
      creatorId_date: { creatorId, date: targetDate },
    },
    create: {
      creatorId,
      date: targetDate,
      views: data.views ?? 0,
      likes: data.likes ?? 0,
      comments: data.comments ?? 0,
      shares: data.shares ?? 0,
      newFollowers: data.newFollowers ?? 0,
      revenue: data.revenue ?? 0,
      watchTime: data.watchTime ?? 0,
    },
    update: {
      ...(data.views !== undefined && { views: { increment: data.views } }),
      ...(data.likes !== undefined && { likes: { increment: data.likes } }),
      ...(data.comments !== undefined && { comments: { increment: data.comments } }),
      ...(data.shares !== undefined && { shares: { increment: data.shares } }),
      ...(data.newFollowers !== undefined && { newFollowers: { increment: data.newFollowers } }),
      ...(data.revenue !== undefined && { revenue: { increment: data.revenue } }),
      ...(data.watchTime !== undefined && { watchTime: { increment: data.watchTime } }),
    },
  });

  return row;
}

// ─────────────────────────────────────────────
// Leaderboard
// ─────────────────────────────────────────────

/**
 * Top creators leaderboard by subscriberCount.
 */
export async function getTopCreators(category?: string, limit: number = 20) {
  const where: any = { isMonetized: true };
  if (category) {
    where.category = category;
  }

  const creators = await db.creatorProfile.findMany({
    where,
    orderBy: { subscriberCount: 'desc' },
    take: limit,
    include: {
      user: { select: { id: true, name: true, avatarUrl: true } },
    },
  });

  return creators;
}

// ─────────────────────────────────────────────
// Withdraw
// ─────────────────────────────────────────────

/**
 * Withdraw funds from creator wallet.
 * Deducts from balance and creates a withdrawal record.
 */
export async function withdrawFunds(userId: string, amount: number) {
  if (amount <= 0) {
    throw AppError.badRequest('Withdrawal amount must be greater than 0');
  }

  const profile = await db.creatorProfile.findUnique({ where: { userId } });
  if (!profile) {
    throw AppError.notFound('Creator profile not found');
  }

  const wallet = await db.creatorWallet.findUnique({ where: { creatorId: profile.id } });
  if (!wallet) {
    throw AppError.notFound('Wallet not found');
  }

  if (wallet.balance < amount) {
    throw AppError.badRequest('Insufficient wallet balance');
  }

  const [revenue, updatedWallet] = await prisma.$transaction([
    db.creatorRevenue.create({
      data: {
        creatorId: profile.id,
        type: TransactionType.WITHDRAWAL,
        amount,
        status: TransactionStatus.COMPLETED,
        metadata: { walletId: wallet.id },
      },
    }),
    db.creatorWallet.update({
      where: { creatorId: profile.id },
      data: {
        balance: { decrement: amount },
        totalWithdrawn: { increment: amount },
      },
    }),
  ]);

  logger.info(`Withdrawal of ${amount} processed for creator ${profile.id}`);
  return { revenue, wallet: updatedWallet };
}

// ─────────────────────────────────────────────
// Dashboard
// ─────────────────────────────────────────────

/**
 * Aggregate dashboard data: total revenue, subscribers, recent analytics.
 */
export async function getCreatorDashboard(userId: string) {
  const profile = await db.creatorProfile.findUnique({
    where: { userId },
    include: {
      wallet: true,
    },
  });

  if (!profile) {
    throw AppError.notFound('Creator profile not found');
  }

  // Last 30 days analytics
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [recentAnalytics, recentRevenues, revenueByType] = await Promise.all([
    db.creatorAnalytics.findMany({
      where: {
        creatorId: profile.id,
        date: { gte: thirtyDaysAgo },
      },
      orderBy: { date: 'desc' },
    }),
    db.creatorRevenue.findMany({
      where: { creatorId: profile.id },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    db.creatorRevenue.groupBy({
      by: ['type'],
      where: {
        creatorId: profile.id,
        status: TransactionStatus.COMPLETED,
      },
      _sum: { amount: true },
      _count: { id: true },
    }),
  ]);

  // Aggregate analytics totals
  const analyticsTotals = recentAnalytics.reduce(
    (acc: any, row: any) => ({
      views: acc.views + row.views,
      likes: acc.likes + row.likes,
      comments: acc.comments + row.comments,
      shares: acc.shares + row.shares,
      newFollowers: acc.newFollowers + row.newFollowers,
      revenue: acc.revenue + row.revenue,
      watchTime: acc.watchTime + row.watchTime,
    }),
    { views: 0, likes: 0, comments: 0, shares: 0, newFollowers: 0, revenue: 0, watchTime: 0 },
  );

  return {
    profile: {
      id: profile.id,
      displayName: profile.displayName,
      category: profile.category,
      isMonetized: profile.isMonetized,
      subscriberCount: profile.subscriberCount,
      totalRevenue: profile.totalRevenue,
      monthlyRevenue: profile.monthlyRevenue,
      badgeLevel: profile.badgeLevel,
      verifiedAt: profile.verifiedAt,
    },
    wallet: profile.wallet,
    last30Days: {
      totals: analyticsTotals,
      dailyRows: recentAnalytics,
    },
    recentRevenues,
    revenueByType,
  };
}
