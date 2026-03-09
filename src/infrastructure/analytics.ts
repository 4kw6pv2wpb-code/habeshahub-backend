/**
 * Analytics Pipeline
 *
 * ClickHouse-compatible design with PostgreSQL fallback.
 * Events are written to PlatformEvent + buffered in Redis sorted sets
 * for real-time aggregation. A cron job calls flushBufferedEvents()
 * to drain Redis into the database.
 */

import { PrismaClient } from '@prisma/client';
import { redis } from '../config/redis';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();
const db = prisma as any;

// ─────────────────────────────────────────────
// Interfaces
// ─────────────────────────────────────────────

export interface AnalyticsEvent {
  eventType: string;
  userId?: string;
  entityType?: string;
  entityId?: string;
  properties: Record<string, unknown>;
  timestamp: Date;
  sessionId?: string;
}

export interface DailyMetric {
  date: string;
  metric: string;
  value: number;
  dimensions?: Record<string, string>;
}

export interface AnalyticsDashboard {
  dau: number;
  wau: number;
  mau: number;
  retention: {
    day1: number;
    day7: number;
    day30: number;
  };
  topContent: Array<Record<string, unknown>>;
  revenueMetrics: {
    total: number;
    byType: Array<{ type: string; total: number }>;
  };
  growthRate: {
    daily: number;
    weekly: number;
    monthly: number;
  };
}

// ─────────────────────────────────────────────
// Redis key helpers
// ─────────────────────────────────────────────

const REDIS_EVENT_BUFFER_KEY = 'analytics:event_buffer';
const REDIS_DAU_PREFIX = 'analytics:dau:';

function dateStr(d: Date): string {
  return d.toISOString().split('T')[0]; // YYYY-MM-DD
}

function periodStart(period: 'day' | 'week' | 'month', from?: Date): Date {
  const base = from ? new Date(from) : new Date();
  if (period === 'day') {
    base.setHours(0, 0, 0, 0);
  } else if (period === 'week') {
    base.setDate(base.getDate() - 7);
    base.setHours(0, 0, 0, 0);
  } else {
    base.setDate(base.getDate() - 30);
    base.setHours(0, 0, 0, 0);
  }
  return base;
}

// ─────────────────────────────────────────────
// Event Tracking
// ─────────────────────────────────────────────

/**
 * Track a single analytics event.
 * Writes to PlatformEvent + buffers in Redis sorted set for real-time use.
 */
export async function trackEvent(event: AnalyticsEvent): Promise<void> {
  try {
    // Persist to database
    await db.platformEvent.create({
      data: {
        type: event.eventType,
        actorId: event.userId ?? null,
        entityType: event.entityType ?? null,
        entityId: event.entityId ?? null,
        data: {
          properties: event.properties,
          sessionId: event.sessionId,
          timestamp: event.timestamp.toISOString(),
        },
      },
    });

    // Buffer in Redis sorted set (score = unix timestamp ms)
    const score = event.timestamp.getTime();
    const payload = JSON.stringify({
      eventType: event.eventType,
      userId: event.userId,
      entityType: event.entityType,
      entityId: event.entityId,
      properties: event.properties,
      sessionId: event.sessionId,
      timestamp: event.timestamp.toISOString(),
    });
    await redis.zadd(REDIS_EVENT_BUFFER_KEY, score, payload);

    // Track DAU: add userId to a Redis HyperLogLog-style set for today
    if (event.userId) {
      const today = dateStr(event.timestamp);
      await redis.sadd(`${REDIS_DAU_PREFIX}${today}`, event.userId);
      await redis.expire(`${REDIS_DAU_PREFIX}${today}`, 60 * 60 * 48); // 48h TTL
    }
  } catch (err) {
    logger.error('analytics.trackEvent error', { err, event });
  }
}

/**
 * Bulk insert analytics events.
 */
export async function trackBatch(events: AnalyticsEvent[]): Promise<void> {
  try {
    const records = events.map((event) => ({
      type: event.eventType,
      actorId: event.userId ?? null,
      entityType: event.entityType ?? null,
      entityId: event.entityId ?? null,
      data: {
        properties: event.properties,
        sessionId: event.sessionId,
        timestamp: event.timestamp.toISOString(),
      },
    }));

    await db.platformEvent.createMany({ data: records, skipDuplicates: true });

    // Buffer all in Redis
    const pipeline = redis.pipeline();
    for (const event of events) {
      const score = event.timestamp.getTime();
      const payload = JSON.stringify({
        eventType: event.eventType,
        userId: event.userId,
        entityType: event.entityType,
        entityId: event.entityId,
        properties: event.properties,
        sessionId: event.sessionId,
        timestamp: event.timestamp.toISOString(),
      });
      pipeline.zadd(REDIS_EVENT_BUFFER_KEY, score, payload);

      if (event.userId) {
        const today = dateStr(event.timestamp);
        pipeline.sadd(`${REDIS_DAU_PREFIX}${today}`, event.userId);
        pipeline.expire(`${REDIS_DAU_PREFIX}${today}`, 60 * 60 * 48);
      }
    }
    await pipeline.exec();
  } catch (err) {
    logger.error('analytics.trackBatch error', { err });
  }
}

// ─────────────────────────────────────────────
// Active Users
// ─────────────────────────────────────────────

/**
 * Daily Active Users — count distinct users from EngagementEvent for date.
 */
export async function getDAU(date?: Date): Promise<number> {
  const target = date ?? new Date();
  const dayStr = dateStr(target);

  // Check Redis fast path
  const redisKey = `${REDIS_DAU_PREFIX}${dayStr}`;
  const redisCount = await redis.scard(redisKey);
  if (redisCount > 0) return redisCount;

  const start = new Date(target);
  start.setHours(0, 0, 0, 0);
  const end = new Date(target);
  end.setHours(23, 59, 59, 999);

  const result = await db.engagementEvent.groupBy({
    by: ['userId'],
    where: { createdAt: { gte: start, lte: end } },
  });

  return result.length;
}

/**
 * Weekly Active Users — distinct users over the last 7 days.
 */
export async function getWAU(endDate?: Date): Promise<number> {
  const end = endDate ?? new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 7);

  const result = await db.engagementEvent.groupBy({
    by: ['userId'],
    where: { createdAt: { gte: start, lte: end } },
  });

  return result.length;
}

/**
 * Monthly Active Users — distinct users over the last 30 days.
 */
export async function getMAU(endDate?: Date): Promise<number> {
  const end = endDate ?? new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 30);

  const result = await db.engagementEvent.groupBy({
    by: ['userId'],
    where: { createdAt: { gte: start, lte: end } },
  });

  return result.length;
}

// ─────────────────────────────────────────────
// Retention Cohort
// ─────────────────────────────────────────────

/**
 * Compute day-1, day-7, day-30 retention rates for users who joined
 * between startDate and endDate (cohort window).
 */
export async function getRetentionCohort(
  startDate: Date,
  endDate: Date,
): Promise<{ day1: number; day7: number; day30: number }> {
  // Get cohort: users created within the window
  const cohortUsers = await db.user.findMany({
    where: { createdAt: { gte: startDate, lte: endDate } },
    select: { id: true, createdAt: true },
  });

  if (cohortUsers.length === 0) {
    return { day1: 0, day7: 0, day30: 0 };
  }

  const cohortSize = cohortUsers.length;

  // For each cohort user, check if they had any engagement N days after join
  const checkRetention = async (offsetDays: number): Promise<number> => {
    let retained = 0;
    for (const user of cohortUsers) {
      const windowStart = new Date(user.createdAt);
      windowStart.setDate(windowStart.getDate() + offsetDays);
      const windowEnd = new Date(windowStart);
      windowEnd.setDate(windowEnd.getDate() + 1);

      const activity = await db.engagementEvent.findFirst({
        where: {
          userId: user.id,
          createdAt: { gte: windowStart, lte: windowEnd },
        },
        select: { id: true },
      });

      if (activity) retained++;
    }
    return Math.round((retained / cohortSize) * 100 * 10) / 10;
  };

  const [day1, day7, day30] = await Promise.all([
    checkRetention(1),
    checkRetention(7),
    checkRetention(30),
  ]);

  return { day1, day7, day30 };
}

// ─────────────────────────────────────────────
// Revenue & Transaction Metrics
// ─────────────────────────────────────────────

/**
 * Aggregate creator revenue for a given period.
 */
export async function getCreatorRevenue(
  period: 'day' | 'week' | 'month',
): Promise<{ total: number; byType: Array<{ type: string; total: number }> }> {
  const start = periodStart(period);

  const rows = await db.creatorRevenue.groupBy({
    by: ['type'],
    _sum: { amount: true },
    where: {
      createdAt: { gte: start },
      status: 'COMPLETED',
    },
  });

  const byType = rows.map((r: any) => ({
    type: r.type as string,
    total: r._sum.amount ?? 0,
  }));

  const total = byType.reduce((sum: number, r: any) => sum + r.total, 0);

  return { total, byType };
}

/**
 * Aggregate total video watch time (seconds) for a period.
 */
export async function getVideoWatchTime(
  period: 'day' | 'week' | 'month',
): Promise<number> {
  const start = periodStart(period);

  const result = await db.engagementEvent.aggregate({
    _sum: { value: true },
    where: {
      contentType: 'video',
      action: 'watch',
      createdAt: { gte: start },
    },
  });

  return result._sum.value ?? 0;
}

/**
 * Aggregate wallet transaction volume for a period.
 */
export async function getWalletTransactionVolume(
  period: 'day' | 'week' | 'month',
): Promise<{ total: number; count: number }> {
  const start = periodStart(period);

  const result = await db.walletTransaction.aggregate({
    _sum: { amount: true },
    _count: { id: true },
    where: {
      createdAt: { gte: start },
      status: 'COMPLETED',
    },
  });

  return {
    total: result._sum.amount ?? 0,
    count: result._count.id ?? 0,
  };
}

// ─────────────────────────────────────────────
// Engagement & Content
// ─────────────────────────────────────────────

/**
 * Engagement metrics grouped by action for a content type and period.
 */
export async function getEngagementMetrics(
  contentType: string,
  period: 'day' | 'week' | 'month',
): Promise<Array<{ action: string; count: number }>> {
  const start = periodStart(period);

  const rows = await db.engagementEvent.groupBy({
    by: ['action'],
    _count: { id: true },
    where: {
      contentType,
      createdAt: { gte: start },
    },
    orderBy: { _count: { id: 'desc' } },
  });

  return rows.map((r: any) => ({
    action: r.action as string,
    count: r._count.id as number,
  }));
}

/**
 * Top content ranked by a metric (views/likes/comments/watch) for a period.
 */
export async function getTopContent(
  contentType: string,
  metric: string,
  limit: number,
  period: 'day' | 'week' | 'month',
): Promise<Array<Record<string, unknown>>> {
  const start = periodStart(period);

  const rows = await db.engagementEvent.groupBy({
    by: ['contentId'],
    _count: { id: true },
    _sum: { value: true },
    where: {
      contentType,
      action: metric,
      createdAt: { gte: start },
    },
    orderBy: { _count: { id: 'desc' } },
    take: limit,
  });

  return rows.map((r: any) => ({
    contentId: r.contentId as string,
    count: r._count.id as number,
    totalValue: r._sum.value ?? 0,
  }));
}

/**
 * New user growth by day, week, or month.
 */
export async function getUserGrowth(
  period: 'day' | 'week' | 'month',
): Promise<Array<{ date: string; count: number }>> {
  const start = periodStart(period);

  const users = await db.user.findMany({
    where: { createdAt: { gte: start } },
    select: { createdAt: true },
    orderBy: { createdAt: 'asc' },
  });

  // Group by day
  const grouped: Record<string, number> = {};
  for (const u of users) {
    const day = dateStr(u.createdAt);
    grouped[day] = (grouped[day] ?? 0) + 1;
  }

  return Object.entries(grouped).map(([date, count]) => ({ date, count }));
}

// ─────────────────────────────────────────────
// Full Dashboard
// ─────────────────────────────────────────────

/**
 * Aggregate all metrics into a single AnalyticsDashboard object.
 */
export async function getFullDashboard(): Promise<AnalyticsDashboard> {
  const now = new Date();

  // Retention cohort: users who joined in the past 30 days
  const cohortStart = new Date(now);
  cohortStart.setDate(cohortStart.getDate() - 30);

  const [dau, wau, mau, retention, topContent, revenueDay, revenueWeek, revenueMonth, growthDay, growthWeek] =
    await Promise.all([
      getDAU(now),
      getWAU(now),
      getMAU(now),
      getRetentionCohort(cohortStart, now),
      getTopContent('video', 'view', 10, 'week'),
      getCreatorRevenue('day'),
      getCreatorRevenue('week'),
      getCreatorRevenue('month'),
      getUserGrowth('day'),
      getUserGrowth('week'),
    ]);

  // Simple growth rate: % change vs prior period
  const calcGrowthRate = (
    current: Array<{ date: string; count: number }>,
  ): number => {
    if (current.length < 2) return 0;
    const half = Math.floor(current.length / 2);
    const firstHalf = current.slice(0, half).reduce((s, d) => s + d.count, 0);
    const secondHalf = current.slice(half).reduce((s, d) => s + d.count, 0);
    if (firstHalf === 0) return 0;
    return Math.round(((secondHalf - firstHalf) / firstHalf) * 100 * 10) / 10;
  };

  return {
    dau,
    wau,
    mau,
    retention,
    topContent,
    revenueMetrics: {
      total: revenueMonth.total,
      byType: revenueMonth.byType,
    },
    growthRate: {
      daily: calcGrowthRate(growthDay),
      weekly: calcGrowthRate(growthWeek),
      monthly: calcGrowthRate(growthWeek), // fallback: reuse weekly shape
    },
  };
}

// ─────────────────────────────────────────────
// Buffer Flush (called by cron)
// ─────────────────────────────────────────────

/**
 * Move Redis-buffered events to the database.
 * Removes all members from the sorted set after processing.
 */
export async function flushBufferedEvents(): Promise<number> {
  try {
    const now = Date.now();
    // Fetch all events up to now (exclude future-timestamped events)
    const members = await redis.zrangebyscore(REDIS_EVENT_BUFFER_KEY, '-inf', now);

    if (members.length === 0) return 0;

    const records = members
      .map((raw) => {
        try {
          const e = JSON.parse(raw) as AnalyticsEvent & { timestamp: string };
          return {
            type: e.eventType,
            actorId: e.userId ?? null,
            entityType: e.entityType ?? null,
            entityId: e.entityId ?? null,
            data: {
              properties: e.properties ?? {},
              sessionId: e.sessionId ?? null,
              timestamp: e.timestamp,
              source: 'buffer_flush',
            },
          };
        } catch {
          return null;
        }
      })
      .filter(Boolean) as any[];

    if (records.length > 0) {
      await db.platformEvent.createMany({ data: records, skipDuplicates: true });
    }

    // Remove flushed members
    await redis.zremrangebyscore(REDIS_EVENT_BUFFER_KEY, '-inf', now);

    logger.info(`analytics.flushBufferedEvents: flushed ${records.length} events`);
    return records.length;
  } catch (err) {
    logger.error('analytics.flushBufferedEvents error', { err });
    return 0;
  }
}
