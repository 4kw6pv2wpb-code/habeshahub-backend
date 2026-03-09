/**
 * Feed Ranking v2 + Engagement service.
 * Tracks engagement events and provides algorithmic feed ranking.
 */

import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';
import { AppError } from '../middlewares/errorHandler';

const prisma = new PrismaClient();
const db = prisma as any; // For models not yet generated

// ─────────────────────────────────────────────
// Engagement Events
// ─────────────────────────────────────────────

/**
 * Record a user engagement event (view, like, comment, share, etc.).
 */
export async function trackEngagement(
  userId: string,
  contentType: string,
  contentId: string,
  action: string,
  value?: number,
  metadata?: Record<string, any>,
) {
  const event = await db.engagementEvent.create({
    data: {
      userId,
      contentType,
      contentId,
      action,
      value: value ?? 1,
      metadata: metadata ?? {},
    },
  });

  logger.debug('Engagement tracked', { userId, contentType, contentId, action });
  return event;
}

/**
 * Record a platform-level event (new post, user join, etc.).
 */
export async function trackPlatformEvent(
  type: string,
  actorId?: string,
  entityType?: string,
  entityId?: string,
  data?: Record<string, any>,
) {
  const event = await db.platformEvent.create({
    data: {
      type,
      actorId: actorId ?? null,
      entityType: entityType ?? null,
      entityId: entityId ?? null,
      data: data ?? {},
    },
  });

  logger.debug('Platform event tracked', { type, actorId, entityType, entityId });
  return event;
}

// ─────────────────────────────────────────────
// Aggregations
// ─────────────────────────────────────────────

/**
 * Aggregate engagement stats for a specific piece of content.
 */
export async function getContentEngagement(contentType: string, contentId: string) {
  const events = await db.engagementEvent.groupBy({
    by: ['action'],
    where: { contentType, contentId },
    _count: { action: true },
    _sum: { value: true },
  });

  const stats: Record<string, { count: number; total: number }> = {};
  for (const e of events) {
    stats[e.action] = {
      count: e._count.action,
      total: e._sum.value ?? 0,
    };
  }

  return { contentType, contentId, stats };
}

/**
 * Get a user's engagement history (paginated).
 */
export async function getUserEngagementHistory(userId: string, page = 1, limit = 20) {
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    db.engagementEvent.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    db.engagementEvent.count({ where: { userId } }),
  ]);

  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
}

/**
 * Get most engaged content for a given content type within a time window.
 */
export async function getPopularContent(
  contentType: string,
  timeWindow: number, // hours
  limit = 10,
) {
  const since = new Date(Date.now() - timeWindow * 60 * 60 * 1000);

  const rows = await db.engagementEvent.groupBy({
    by: ['contentId'],
    where: { contentType, createdAt: { gte: since } },
    _sum: { value: true },
    _count: { contentId: true },
    orderBy: { _sum: { value: 'desc' } },
    take: limit,
  });

  return rows.map((r: any) => ({
    contentId: r.contentId,
    contentType,
    totalValue: r._sum.value ?? 0,
    eventCount: r._count.contentId,
  }));
}

/**
 * Get aggregate engagement stats for a date range (admin analytics).
 */
export async function getEngagementStats(startDate: Date, endDate: Date) {
  const [totalEvents, byAction, byContentType] = await Promise.all([
    db.engagementEvent.count({
      where: { createdAt: { gte: startDate, lte: endDate } },
    }),
    db.engagementEvent.groupBy({
      by: ['action'],
      where: { createdAt: { gte: startDate, lte: endDate } },
      _count: { action: true },
      _sum: { value: true },
    }),
    db.engagementEvent.groupBy({
      by: ['contentType'],
      where: { createdAt: { gte: startDate, lte: endDate } },
      _count: { contentType: true },
    }),
  ]);

  return {
    totalEvents,
    byAction,
    byContentType,
    period: { startDate, endDate },
  };
}

// ─────────────────────────────────────────────
// Algorithmic Feed
// ─────────────────────────────────────────────

/**
 * Return a ranked feed of posts scored by engagement:
 * score = views*1 + likes*3 + comments*5 + shares*8
 * Only considers posts from the last 30 days.
 */
export async function getRankedFeed(userId: string, page = 1, limit = 20) {
  const skip = (page - 1) * limit;
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Aggregate engagement per post
  const engagementRows = await db.engagementEvent.groupBy({
    by: ['contentId', 'action'],
    where: {
      contentType: 'post',
      createdAt: { gte: since },
    },
    _sum: { value: true },
  });

  // Build score map: postId → score
  const scoreMap: Record<string, number> = {};
  const weights: Record<string, number> = {
    view: 1,
    like: 3,
    comment: 5,
    share: 8,
  };

  for (const row of engagementRows) {
    const w = weights[row.action] ?? 1;
    const contribution = (row._sum.value ?? 0) * w;
    scoreMap[row.contentId] = (scoreMap[row.contentId] ?? 0) + contribution;
  }

  // Sort post IDs by score descending
  const sortedIds = Object.entries(scoreMap)
    .sort(([, a], [, b]) => b - a)
    .slice(skip, skip + limit)
    .map(([id]) => id);

  if (sortedIds.length === 0) {
    // Fall back to chronological feed if no engagement data
    const fallback = await (prisma as any).post
      ? db.post.findMany({
          where: { createdAt: { gte: since } },
          include: { author: { select: { id: true, name: true, avatarUrl: true } } },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        })
      : [];

    return {
      items: fallback,
      total: fallback.length,
      page,
      limit,
      totalPages: 1,
      ranked: false,
    };
  }

  // Fetch actual post records
  const posts = await db.post.findMany({
    where: { id: { in: sortedIds } },
    include: { author: { select: { id: true, name: true, avatarUrl: true } } },
  });

  // Re-sort to match score order
  const postMap: Record<string, any> = {};
  for (const p of posts) postMap[p.id] = p;
  const ranked = sortedIds
    .map((id) => ({ ...postMap[id], engagementScore: scoreMap[id] ?? 0 }))
    .filter(Boolean);

  const totalScored = Object.keys(scoreMap).length;

  logger.debug('Ranked feed generated', { userId, count: ranked.length });

  return {
    items: ranked,
    total: totalScored,
    page,
    limit,
    totalPages: Math.ceil(totalScored / limit),
    ranked: true,
  };
}

// ─────────────────────────────────────────────
// Platform Events
// ─────────────────────────────────────────────

/**
 * Get the most recent platform events (activity stream).
 */
export async function getRecentPlatformEvents(limit = 50) {
  const events = await db.platformEvent.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return events;
}
