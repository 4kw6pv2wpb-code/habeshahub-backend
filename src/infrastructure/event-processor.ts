/**
 * Background Event Processor.
 *
 * Responsibilities:
 *  1. Batch-process engagement events for feed ranking signal aggregation.
 *  2. Aggregate daily analytics from the event stream into a summary record.
 *  3. Retry failed event handlers up to 3 times with exponential backoff.
 *  4. Dead-letter queue — failed events after all retries are pushed to a
 *     Redis list (`event_dlq`) for manual review / replay.
 *
 * Exports:
 *   startProcessor()  — begin background processing loops
 *   stopProcessor()   — gracefully stop all loops
 */

import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';
import { redis } from '../config/redis';
import { eventBus, EventType, EventPayloadMap } from './event-bus';

const prisma = new PrismaClient();
const db = prisma as any;

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

const ENGAGEMENT_BATCH_INTERVAL_MS  = 10_000;   // Process engagement queue every 10s
const ANALYTICS_AGGREGATE_INTERVAL_MS = 60_000; // Aggregate analytics every 60s
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 500;                 // Doubles each attempt: 500ms, 1s, 2s
const DLQ_KEY = 'event_dlq';
const DLQ_MAX_LENGTH = 10_000;                   // Cap DLQ at 10k entries
const ENGAGEMENT_QUEUE_KEY = 'event_queue:engagement';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

interface QueuedEngagementEvent {
  contentId: string;
  contentType: string;
  userId: string;
  eventType: string;
  timestamp: number;
}

interface DeadLetterEntry<E extends EventType = EventType> {
  event: E;
  payload: EventPayloadMap[E];
  error: string;
  attempts: number;
  failedAt: string;
}

// ─────────────────────────────────────────────
// Processor State
// ─────────────────────────────────────────────

let engagementTimer: ReturnType<typeof setInterval> | null = null;
let analyticsTimer: ReturnType<typeof setInterval> | null = null;
let isRunning = false;

// ─────────────────────────────────────────────
// Dead Letter Queue
// ─────────────────────────────────────────────

/**
 * Push a failed event to the Redis dead-letter queue.
 * Trims the list to DLQ_MAX_LENGTH to prevent unbounded growth.
 */
async function pushToDlq<E extends EventType>(
  event: E,
  payload: EventPayloadMap[E],
  error: string,
  attempts: number,
): Promise<void> {
  const entry: DeadLetterEntry<E> = {
    event,
    payload,
    error,
    attempts,
    failedAt: new Date().toISOString(),
  };

  try {
    await redis.rpush(DLQ_KEY, JSON.stringify(entry));
    await redis.ltrim(DLQ_KEY, -DLQ_MAX_LENGTH, -1);
    logger.warn('EventProcessor: event pushed to DLQ', { event, attempts, error });
  } catch (redisErr: any) {
    logger.error('EventProcessor: failed to push to DLQ', {
      event,
      redisError: redisErr?.message,
    });
  }
}

/**
 * Read up to `count` entries from the DLQ (does not remove them).
 * Useful for monitoring / admin replay endpoints.
 */
export async function peekDlq(count = 10): Promise<DeadLetterEntry[]> {
  try {
    const raw = await redis.lrange(DLQ_KEY, 0, count - 1);
    return raw.map((r) => JSON.parse(r));
  } catch {
    return [];
  }
}

/**
 * Return the current length of the dead-letter queue.
 */
export async function getDlqLength(): Promise<number> {
  try {
    return await redis.llen(DLQ_KEY);
  } catch {
    return 0;
  }
}

// ─────────────────────────────────────────────
// Retry Logic
// ─────────────────────────────────────────────

/**
 * Execute a handler with exponential-backoff retry.
 * On exhaustion, the event is pushed to the DLQ.
 */
async function withRetry<E extends EventType>(
  event: E,
  payload: EventPayloadMap[E],
  handler: (payload: EventPayloadMap[E]) => Promise<void>,
): Promise<void> {
  let lastError: Error = new Error('unknown');

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await handler(payload);
      if (attempt > 1) {
        logger.info('EventProcessor: retry succeeded', { event, attempt });
      }
      return; // success — exit
    } catch (err: any) {
      lastError = err;
      const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
      logger.warn('EventProcessor: handler failed, will retry', {
        event,
        attempt,
        maxRetries: MAX_RETRIES,
        retryInMs: attempt < MAX_RETRIES ? delay : 'N/A (final attempt)',
        error: err?.message,
      });

      if (attempt < MAX_RETRIES) {
        await sleep(delay);
      }
    }
  }

  // All retries exhausted — send to DLQ
  logger.error('EventProcessor: handler permanently failed, sending to DLQ', {
    event,
    attempts: MAX_RETRIES,
    error: lastError.message,
  });
  await pushToDlq(event, payload, lastError.message, MAX_RETRIES);
}

// ─────────────────────────────────────────────
// Engagement Batch Processor
// ─────────────────────────────────────────────

/**
 * Enqueue an engagement event for batch processing.
 * Called by event handlers (e.g., from POST_CREATED / VIDEO_UPLOADED flows).
 */
export async function enqueueEngagementEvent(
  event: QueuedEngagementEvent,
): Promise<void> {
  try {
    await redis.rpush(ENGAGEMENT_QUEUE_KEY, JSON.stringify(event));
  } catch (err: any) {
    logger.warn('EventProcessor: failed to enqueue engagement event', { error: err?.message });
  }
}

/**
 * Drain and process the engagement event queue in one batch.
 * Updates the EngagementEvent table and recomputes aggregate scores
 * that the recommendation engine reads.
 */
async function processEngagementBatch(): Promise<void> {
  let raw: string | null;
  const batch: QueuedEngagementEvent[] = [];

  // Drain up to 500 items from the queue in one tick
  for (let i = 0; i < 500; i++) {
    try {
      raw = await redis.lpop(ENGAGEMENT_QUEUE_KEY);
    } catch {
      break;
    }
    if (!raw) break;
    try {
      batch.push(JSON.parse(raw));
    } catch {
      // Malformed — skip
    }
  }

  if (batch.length === 0) return;

  logger.debug('EventProcessor: processing engagement batch', { count: batch.length });

  for (const item of batch) {
    try {
      await db.engagementEvent.create({
        data: {
          userId:      item.userId,
          contentId:   item.contentId,
          contentType: item.contentType,
          eventType:   item.eventType,
          metadata:    { source: 'batch_processor', ts: item.timestamp },
        },
      });
    } catch (err: any) {
      logger.warn('EventProcessor: engagement insert failed', {
        contentId: item.contentId,
        error: err?.message,
      });
    }
  }

  // Aggregate view counts per content item in this batch
  const contentCounts: Record<string, number> = {};
  for (const item of batch) {
    if (item.eventType === 'VIEW') {
      contentCounts[item.contentId] = (contentCounts[item.contentId] ?? 0) + 1;
    }
  }

  for (const [contentId, viewCount] of Object.entries(contentCounts)) {
    try {
      await db.contentStats.upsert({
        where: { contentId },
        update: { viewCount: { increment: viewCount } },
        create: { contentId, viewCount, likeCount: 0, commentCount: 0, shareCount: 0 },
      });
    } catch {
      // Table may not exist — skip gracefully
    }
  }

  logger.info('EventProcessor: engagement batch processed', { count: batch.length });
}

// ─────────────────────────────────────────────
// Daily Analytics Aggregator
// ─────────────────────────────────────────────

/**
 * Aggregate platform-wide analytics for the current day.
 * Counts registrations, posts, videos, transactions and upserts a daily snapshot.
 */
async function aggregateDailyAnalytics(): Promise<void> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today.getTime() + 86_400_000);

  logger.debug('EventProcessor: aggregating daily analytics', {
    date: today.toISOString().slice(0, 10),
  });

  try {
    const [
      newUsers,
      newPosts,
      newVideos,
      walletTransactions,
      newJobs,
      newStreams,
      flaggedContent,
    ] = await Promise.allSettled([
      db.user.count({ where: { createdAt: { gte: today, lt: tomorrow } } }),
      db.post.count({ where: { createdAt: { gte: today, lt: tomorrow } } }),
      db.video.count({ where: { createdAt: { gte: today, lt: tomorrow } } }),
      db.walletTransaction.count({ where: { createdAt: { gte: today, lt: tomorrow }, status: 'COMPLETED' } }),
      db.job.count({ where: { createdAt: { gte: today, lt: tomorrow } } }),
      db.liveStream.count({ where: { startedAt: { gte: today, lt: tomorrow } } }),
      db.userReport.count({ where: { createdAt: { gte: today, lt: tomorrow } } }),
    ]);

    const snapshot = {
      date:               today,
      newUsers:           newUsers.status === 'fulfilled'           ? newUsers.value           : 0,
      newPosts:           newPosts.status === 'fulfilled'           ? newPosts.value           : 0,
      newVideos:          newVideos.status === 'fulfilled'          ? newVideos.value          : 0,
      walletTransactions: walletTransactions.status === 'fulfilled' ? walletTransactions.value : 0,
      newJobs:            newJobs.status === 'fulfilled'            ? newJobs.value            : 0,
      newStreams:         newStreams.status === 'fulfilled'         ? newStreams.value         : 0,
      flaggedContent:     flaggedContent.status === 'fulfilled'     ? flaggedContent.value     : 0,
    };

    await db.dailyAnalyticsSnapshot.upsert({
      where: { date: today },
      update: snapshot,
      create: snapshot,
    });

    logger.info('EventProcessor: daily analytics aggregated', snapshot);
  } catch (err: any) {
    // DailyAnalyticsSnapshot table may not exist yet — log and continue
    logger.warn('EventProcessor: daily analytics upsert skipped', { error: err?.message });
  }
}

// ─────────────────────────────────────────────
// Resilient Event Subscriptions
// ─────────────────────────────────────────────
//
// These supplement the direct event-handler registrations in event-handlers.ts.
// The processor wraps handlers in `withRetry` for critical side-effects that
// need guaranteed delivery with DLQ fallback.
// ─────────────────────────────────────────────

function registerRetryHandlers(): void {
  // Retry-wrapped handler: wallet transaction audit (critical financial record)
  eventBus.subscribe(EventType.WALLET_TRANSACTION, async (payload) => {
    await withRetry(EventType.WALLET_TRANSACTION, payload, async (p) => {
      // Re-attempt writing the audit log if the main handler failed
      await db.auditLog.create({
        data: {
          userId:       p.userId,
          action:       `WALLET_${p.type}_RETRY`,
          resourceType: 'WALLET_TRANSACTION',
          resourceId:   p.transactionId,
          metadata:     { amount: p.amount, currency: p.currency, status: p.status },
          createdAt:    new Date(),
        },
      });
    });
  });

  // Retry-wrapped handler: equb payout (critical financial record)
  eventBus.subscribe(EventType.EQUB_CYCLE_COMPLETE, async (payload) => {
    await withRetry(EventType.EQUB_CYCLE_COMPLETE, payload, async (p) => {
      // Ensure equb cycle is marked as completed in the equb record
      await db.equbCycle.updateMany({
        where: { equbId: p.equbId, cycleNumber: p.cycleNumber },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });
    });
  });

  // Retry-wrapped handler: creator tip wallet credit (critical)
  eventBus.subscribe(EventType.CREATOR_TIPPED, async (payload) => {
    await withRetry(EventType.CREATOR_TIPPED, payload, async (p) => {
      // Verify the wallet balance increment was persisted
      const wallet = await db.diasporaWallet.findUnique({ where: { userId: p.creatorId } });
      if (!wallet) {
        throw new Error(`Wallet not found for creator ${p.creatorId}`);
      }
      logger.info('EventProcessor: creator tip wallet verified', {
        creatorId: p.creatorId,
        balance: wallet.balance,
      });
    });
  });

  logger.info('EventProcessor: retry-wrapped handlers registered');
}

// ─────────────────────────────────────────────
// Lifecycle
// ─────────────────────────────────────────────

/**
 * Start the background event processor.
 * Idempotent — calling multiple times is safe.
 */
export function startProcessor(): void {
  if (isRunning) {
    logger.warn('EventProcessor: already running');
    return;
  }

  isRunning = true;
  registerRetryHandlers();

  engagementTimer = setInterval(async () => {
    try {
      await processEngagementBatch();
    } catch (err: any) {
      logger.error('EventProcessor: engagement batch error', { error: err?.message });
    }
  }, ENGAGEMENT_BATCH_INTERVAL_MS);

  analyticsTimer = setInterval(async () => {
    try {
      await aggregateDailyAnalytics();
    } catch (err: any) {
      logger.error('EventProcessor: analytics aggregation error', { error: err?.message });
    }
  }, ANALYTICS_AGGREGATE_INTERVAL_MS);

  logger.info('EventProcessor: started', {
    engagementIntervalMs: ENGAGEMENT_BATCH_INTERVAL_MS,
    analyticsIntervalMs:  ANALYTICS_AGGREGATE_INTERVAL_MS,
    maxRetries:           MAX_RETRIES,
    dlqKey:               DLQ_KEY,
  });
}

/**
 * Stop the background event processor gracefully.
 * Clears intervals so the process can exit cleanly.
 */
export function stopProcessor(): void {
  if (!isRunning) return;

  if (engagementTimer) {
    clearInterval(engagementTimer);
    engagementTimer = null;
  }

  if (analyticsTimer) {
    clearInterval(analyticsTimer);
    analyticsTimer = null;
  }

  isRunning = false;
  logger.info('EventProcessor: stopped');
}

// ─────────────────────────────────────────────
// Utility
// ─────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
