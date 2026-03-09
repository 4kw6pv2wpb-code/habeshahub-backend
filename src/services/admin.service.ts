/**
 * Admin service — full platform management.
 * Covers user management, moderation queue, wallet controls, and platform statistics.
 */

import { PrismaClient } from '@prisma/client';
import { redis } from '../config/redis';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();
const db = prisma as any;

// ─────────────────────────────────────────────
// User Management
// ─────────────────────────────────────────────

/**
 * Paginated user list with optional filters.
 */
export async function getUsers(
  page: number,
  limit: number,
  search?: string,
  role?: string,
  isActive?: boolean,
) {
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {};

  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
    ];
  }

  if (role) {
    where.role = role;
  }

  if (isActive !== undefined) {
    where.isActive = isActive;
  }

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        isVerified: true,
        avatarUrl: true,
        city: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.user.count({ where }),
  ]);

  return {
    users,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Full user detail with relation counts.
 */
export async function getUserById(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      _count: {
        select: {
          posts: true,
          notifications: true,
          sentMessages: true,
        },
      },
    },
  });

  if (!user) return null;

  // Fetch additional counts via db for Phase 2+ models
  const [
    followersCount,
    followingCount,
    videosCount,
    jobsCount,
    housingCount,
  ] = await Promise.all([
    db.follow?.count({ where: { followingId: userId } }).catch(() => 0),
    db.follow?.count({ where: { followerId: userId } }).catch(() => 0),
    db.video?.count({ where: { userId } }).catch(() => 0),
    db.jobListing?.count({ where: { userId } }).catch(() => 0),
    db.housingListing?.count({ where: { userId } }).catch(() => 0),
  ]);

  return {
    ...user,
    counts: {
      ...user._count,
      followers: followersCount,
      following: followingCount,
      videos: videosCount,
      jobs: jobsCount,
      housing: housingCount,
    },
  };
}

/**
 * Update a user's role.
 */
export async function updateUserRole(userId: string, role: string) {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { role: role as any },
    select: { id: true, name: true, email: true, role: true },
  });

  logger.info('Admin: user role updated', { userId, newRole: role });
  return user;
}

/**
 * Toggle a user's active status (activate / deactivate).
 */
export async function toggleUserActive(userId: string) {
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { isActive: true },
  });

  if (!existing) throw new Error(`User ${userId} not found`);

  const user = await prisma.user.update({
    where: { id: userId },
    data: { isActive: !existing.isActive },
    select: { id: true, name: true, email: true, isActive: true },
  });

  logger.info('Admin: user active status toggled', { userId, isActive: user.isActive });
  return user;
}

/**
 * Soft-delete a user (sets isActive = false).
 */
export async function deleteUser(userId: string) {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { isActive: false },
    select: { id: true, name: true, email: true, isActive: true },
  });

  logger.info('Admin: user soft-deleted', { userId });
  return user;
}

// ─────────────────────────────────────────────
// Moderation Queue
// ─────────────────────────────────────────────

/**
 * Paginated list of content reports (moderation queue).
 */
export async function getModerationQueue(
  page: number,
  limit: number,
  status?: string,
) {
  const skip = (page - 1) * limit;
  const where: Record<string, unknown> = {};

  if (status) {
    where.status = status;
  } else {
    where.status = 'PENDING';
  }

  const [reports, total] = await Promise.all([
    db.report.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'asc' },
      include: {
        reporter: {
          select: { id: true, name: true, email: true, avatarUrl: true },
        },
      },
    }),
    db.report.count({ where }),
  ]);

  return {
    reports,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Fetch the actual content being reported.
 */
export async function getContentForReview(contentType: string, contentId: string) {
  switch (contentType.toLowerCase()) {
    case 'post':
      return db.post.findUnique({
        where: { id: contentId },
        include: {
          author: { select: { id: true, name: true, avatarUrl: true } },
          _count: { select: { likes: true, comments: true } },
        },
      });

    case 'comment':
      return db.comment.findUnique({
        where: { id: contentId },
        include: {
          author: { select: { id: true, name: true, avatarUrl: true } },
        },
      });

    case 'video':
      return db.video.findUnique({
        where: { id: contentId },
        include: {
          user: { select: { id: true, name: true, avatarUrl: true } },
          _count: { select: { likes: true, comments: true } },
        },
      });

    case 'message':
      return db.message.findUnique({
        where: { id: contentId },
        include: {
          sender: { select: { id: true, name: true, avatarUrl: true } },
        },
      });

    case 'job':
      return db.jobListing.findUnique({
        where: { id: contentId },
        include: {
          poster: { select: { id: true, name: true, avatarUrl: true } },
        },
      });

    case 'housing':
      return db.housingListing.findUnique({
        where: { id: contentId },
        include: {
          poster: { select: { id: true, name: true, avatarUrl: true } },
        },
      });

    default:
      throw new Error(`Unknown content type: ${contentType}`);
  }
}

/**
 * Remove content and create a ModerationLog entry.
 */
export async function removeContent(
  contentType: string,
  contentId: string,
  moderatorId: string,
  reason: string,
) {
  // Soft-delete or deactivate the content depending on type
  let removed: unknown = null;

  switch (contentType.toLowerCase()) {
    case 'post':
      removed = await db.post.update({
        where: { id: contentId },
        data: { isActive: false },
      });
      break;

    case 'comment':
      removed = await db.comment.update({
        where: { id: contentId },
        data: { isActive: false },
      });
      break;

    case 'video':
      removed = await db.video.update({
        where: { id: contentId },
        data: { isActive: false },
      });
      break;

    case 'job':
      removed = await db.jobListing.update({
        where: { id: contentId },
        data: { isActive: false },
      });
      break;

    case 'housing':
      removed = await db.housingListing.update({
        where: { id: contentId },
        data: { isActive: false },
      });
      break;

    case 'message':
      removed = await db.message.update({
        where: { id: contentId },
        data: { isDeleted: true },
      });
      break;

    default:
      throw new Error(`Unknown content type: ${contentType}`);
  }

  // Create audit log
  const log = await db.moderationLog.create({
    data: {
      moderatorId,
      action: 'REMOVE_CONTENT',
      contentType,
      contentId,
      reason,
    },
  });

  // Resolve related pending reports for this content
  await db.report.updateMany({
    where: { contentType, contentId, status: 'PENDING' },
    data: { status: 'RESOLVED', resolvedAt: new Date(), resolvedById: moderatorId },
  });

  logger.info('Admin: content removed', { contentType, contentId, moderatorId, reason });

  return { removed, log };
}

/**
 * Bulk resolve multiple reports.
 */
export async function bulkResolveReports(
  reportIds: string[],
  resolution: string,
  moderatorId: string,
) {
  const result = await db.report.updateMany({
    where: { id: { in: reportIds } },
    data: {
      status: 'RESOLVED',
      resolution,
      resolvedAt: new Date(),
      resolvedById: moderatorId,
    },
  });

  logger.info('Admin: bulk reports resolved', {
    count: result.count,
    moderatorId,
    resolution,
  });

  return { resolved: result.count };
}

// ─────────────────────────────────────────────
// Wallet Controls
// ─────────────────────────────────────────────

/**
 * Platform-wide wallet overview.
 */
export async function getWalletOverview() {
  const [wallets, transactionVolume, activeWallets] = await Promise.all([
    db.wallet.aggregate({
      _sum: { balance: true },
      _count: { id: true },
    }),
    db.transaction.aggregate({
      _sum: { amount: true },
      _count: { id: true },
    }),
    db.wallet.count({ where: { isActive: true } }),
  ]);

  return {
    totalBalance: wallets._sum?.balance ?? 0,
    totalWallets: wallets._count?.id ?? 0,
    activeWallets,
    transactionVolume: transactionVolume._sum?.amount ?? 0,
    transactionCount: transactionVolume._count?.id ?? 0,
  };
}

/**
 * Detailed wallet for a specific user with recent transactions.
 */
export async function getUserWallet(userId: string) {
  const wallet = await db.wallet.findUnique({
    where: { userId },
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
  });

  if (!wallet) return null;

  const transactions = await db.transaction.findMany({
    where: { walletId: wallet.id },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  return { wallet, transactions };
}

/**
 * Freeze a user's wallet and log the action.
 */
export async function freezeWallet(userId: string, reason: string, moderatorId: string) {
  const wallet = await db.wallet.update({
    where: { userId },
    data: { isActive: false },
  });

  const log = await db.moderationLog.create({
    data: {
      moderatorId,
      action: 'FREEZE_WALLET',
      contentType: 'wallet',
      contentId: wallet.id,
      reason,
    },
  });

  logger.info('Admin: wallet frozen', { userId, walletId: wallet.id, moderatorId, reason });

  return { wallet, log };
}

/**
 * Adjust a user's wallet balance with an audit log entry.
 */
export async function adjustBalance(
  userId: string,
  amount: number,
  reason: string,
  moderatorId: string,
) {
  const wallet = await db.wallet.findUnique({ where: { userId } });
  if (!wallet) throw new Error(`Wallet not found for user ${userId}`);

  const [updatedWallet, transaction, log] = await Promise.all([
    db.wallet.update({
      where: { userId },
      data: { balance: { increment: amount } },
    }),
    db.transaction.create({
      data: {
        walletId: wallet.id,
        amount,
        type: amount >= 0 ? 'ADMIN_CREDIT' : 'ADMIN_DEBIT',
        description: `Admin adjustment: ${reason}`,
        status: 'COMPLETED',
        metadata: { moderatorId, reason },
      },
    }),
    db.moderationLog.create({
      data: {
        moderatorId,
        action: 'ADJUST_BALANCE',
        contentType: 'wallet',
        contentId: wallet.id,
        reason: `Amount: ${amount} — ${reason}`,
      },
    }),
  ]);

  logger.info('Admin: wallet balance adjusted', { userId, amount, moderatorId, reason });

  return { wallet: updatedWallet, transaction, log };
}

// ─────────────────────────────────────────────
// Platform Statistics
// ─────────────────────────────────────────────

/**
 * Comprehensive platform stats snapshot.
 */
export async function getPlatformStats() {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - 7);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    // Users
    totalUsers,
    activeUsers,
    newToday,
    newThisWeek,
    newThisMonth,

    // Content
    postsCount,
    videosCount,
    jobsCount,
    housingCount,
    eventsCount,

    // Engagement
    dailyActiveUsers,
    totalLikes,
    totalComments,

    // Finance
    walletData,
    transactionVolume,
    activeEqubs,
    loanVolume,

    // Creators
    totalCreators,
    monetizedCreators,
    creatorRevenue,

    // Moderation
    pendingReports,
    resolvedToday,
  ] = await Promise.all([
    // Users
    prisma.user.count(),
    prisma.user.count({ where: { isActive: true } }),
    prisma.user.count({ where: { createdAt: { gte: startOfToday } } }),
    prisma.user.count({ where: { createdAt: { gte: startOfWeek } } }),
    prisma.user.count({ where: { createdAt: { gte: startOfMonth } } }),

    // Content
    db.post?.count({ where: { isActive: true } }).catch(() => 0),
    db.video?.count({ where: { isActive: true } }).catch(() => 0),
    db.jobListing?.count({ where: { isActive: true } }).catch(() => 0),
    db.housingListing?.count({ where: { isActive: true } }).catch(() => 0),
    db.event?.count({ where: { isActive: true } }).catch(() => 0),

    // Engagement: daily active users from EngagementEvent
    db.engagementEvent?.count({
      where: { createdAt: { gte: startOfToday } },
    }).catch(() => 0),
    db.like?.count().catch(() => 0),
    db.comment?.count({ where: { isActive: true } }).catch(() => 0),

    // Finance: total wallet balance
    db.wallet?.aggregate({ _sum: { balance: true } }).catch(() => ({ _sum: { balance: 0 } })),
    db.transaction?.aggregate({ _sum: { amount: true } }).catch(() => ({ _sum: { amount: 0 } })),
    db.equb?.count({ where: { status: 'ACTIVE' } }).catch(() => 0),
    db.loan?.aggregate({ _sum: { amount: true }, where: { status: 'ACTIVE' } }).catch(() => ({ _sum: { amount: 0 } })),

    // Creators
    db.creatorProfile?.count().catch(() => 0),
    db.creatorProfile?.count({ where: { isMonetized: true } }).catch(() => 0),
    db.creatorRevenue?.aggregate({ _sum: { amount: true } }).catch(() => ({ _sum: { amount: 0 } })),

    // Moderation
    db.report?.count({ where: { status: 'PENDING' } }).catch(() => 0),
    db.moderationLog?.count({ where: { createdAt: { gte: startOfToday } } }).catch(() => 0),
  ]);

  // Active moderation actions (bans, freezes, etc.)
  const activeActions = await db.moderationLog?.count({
    where: {
      action: { in: ['FREEZE_WALLET', 'BAN_USER', 'REMOVE_CONTENT'] },
      createdAt: { gte: startOfMonth },
    },
  }).catch(() => 0);

  return {
    users: {
      total: totalUsers,
      active: activeUsers,
      newToday,
      newThisWeek,
      newThisMonth,
    },
    content: {
      posts: postsCount,
      videos: videosCount,
      jobs: jobsCount,
      housingListings: housingCount,
      events: eventsCount,
    },
    engagement: {
      dailyActiveUsers,
      totalLikes,
      totalComments,
    },
    finance: {
      totalWalletBalance: walletData?._sum?.balance ?? 0,
      transactionVolume: transactionVolume?._sum?.amount ?? 0,
      activeEqubs,
      loanVolume: loanVolume?._sum?.amount ?? 0,
    },
    creators: {
      total: totalCreators,
      monetized: monetizedCreators,
      totalRevenue: creatorRevenue?._sum?.amount ?? 0,
    },
    moderation: {
      pendingReports,
      resolvedToday,
      activeActions,
    },
  };
}

/**
 * Daily breakdown of key metrics between two dates.
 */
export async function getDailyStats(startDate: Date, endDate: Date) {
  const days: Array<{
    date: string;
    newUsers: number;
    newPosts: number;
    newVideos: number;
    transactions: number;
    transactionVolume: number;
  }> = [];

  const cursor = new Date(startDate);

  while (cursor <= endDate) {
    const dayStart = new Date(cursor);
    const dayEnd = new Date(cursor);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const dateStr = cursor.toISOString().split('T')[0];

    const [newUsers, newPosts, newVideos, txData] = await Promise.all([
      prisma.user.count({ where: { createdAt: { gte: dayStart, lt: dayEnd } } }),
      db.post?.count({ where: { createdAt: { gte: dayStart, lt: dayEnd } } }).catch(() => 0),
      db.video?.count({ where: { createdAt: { gte: dayStart, lt: dayEnd } } }).catch(() => 0),
      db.transaction?.aggregate({
        where: { createdAt: { gte: dayStart, lt: dayEnd }, status: 'COMPLETED' },
        _count: { id: true },
        _sum: { amount: true },
      }).catch(() => ({ _count: { id: 0 }, _sum: { amount: 0 } })),
    ]);

    days.push({
      date: dateStr,
      newUsers,
      newPosts,
      newVideos,
      transactions: txData?._count?.id ?? 0,
      transactionVolume: txData?._sum?.amount ?? 0,
    });

    cursor.setDate(cursor.getDate() + 1);
  }

  return days;
}

/**
 * Week-over-week and month-over-month growth metrics.
 */
export async function getGrowthMetrics() {
  const now = new Date();

  const thisWeekStart = new Date(now);
  thisWeekStart.setDate(now.getDate() - 7);

  const lastWeekStart = new Date(now);
  lastWeekStart.setDate(now.getDate() - 14);

  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

  const [
    usersThisWeek,
    usersLastWeek,
    usersThisMonth,
    usersLastMonth,

    postsThisWeek,
    postsLastWeek,
    postsThisMonth,
    postsLastMonth,

    revenueThisMonth,
    revenueLastMonth,
  ] = await Promise.all([
    prisma.user.count({ where: { createdAt: { gte: thisWeekStart } } }),
    prisma.user.count({ where: { createdAt: { gte: lastWeekStart, lt: thisWeekStart } } }),
    prisma.user.count({ where: { createdAt: { gte: thisMonthStart } } }),
    prisma.user.count({ where: { createdAt: { gte: lastMonthStart, lt: thisMonthStart } } }),

    db.post?.count({ where: { createdAt: { gte: thisWeekStart } } }).catch(() => 0),
    db.post?.count({ where: { createdAt: { gte: lastWeekStart, lt: thisWeekStart } } }).catch(() => 0),
    db.post?.count({ where: { createdAt: { gte: thisMonthStart } } }).catch(() => 0),
    db.post?.count({ where: { createdAt: { gte: lastMonthStart, lt: thisMonthStart } } }).catch(() => 0),

    db.transaction?.aggregate({
      where: { createdAt: { gte: thisMonthStart }, status: 'COMPLETED' },
      _sum: { amount: true },
    }).catch(() => ({ _sum: { amount: 0 } })),
    db.transaction?.aggregate({
      where: { createdAt: { gte: lastMonthStart, lte: lastMonthEnd }, status: 'COMPLETED' },
      _sum: { amount: true },
    }).catch(() => ({ _sum: { amount: 0 } })),
  ]);

  function growthPct(current: number, previous: number): number {
    if (previous === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / previous) * 100 * 10) / 10;
  }

  const revenueThis = revenueThisMonth?._sum?.amount ?? 0;
  const revenueLast = revenueLastMonth?._sum?.amount ?? 0;

  return {
    weekOverWeek: {
      users: {
        thisWeek: usersThisWeek,
        lastWeek: usersLastWeek,
        growthPct: growthPct(usersThisWeek, usersLastWeek),
      },
      posts: {
        thisWeek: postsThisWeek,
        lastWeek: postsLastWeek,
        growthPct: growthPct(postsThisWeek, postsLastWeek),
      },
    },
    monthOverMonth: {
      users: {
        thisMonth: usersThisMonth,
        lastMonth: usersLastMonth,
        growthPct: growthPct(usersThisMonth, usersLastMonth),
      },
      posts: {
        thisMonth: postsThisMonth,
        lastMonth: postsLastMonth,
        growthPct: growthPct(postsThisMonth, postsLastMonth),
      },
      revenue: {
        thisMonth: revenueThis,
        lastMonth: revenueLast,
        growthPct: growthPct(revenueThis, revenueLast),
      },
    },
  };
}
