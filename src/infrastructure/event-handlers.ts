/**
 * Event Handler Registrations.
 *
 * Wires all domain event handlers to the shared eventBus singleton.
 * Call `registerAllHandlers()` once at server startup (after DB/Redis are ready).
 *
 * Handler responsibilities:
 *  USER_REGISTERED     → award SIGN_UP points, create diaspora wallet
 *  VIDEO_UPLOADED      → trigger media processing job (placeholder)
 *  POST_CREATED        → track engagement event, push to feed
 *  JOB_POSTED          → notify matching users (placeholder)
 *  WALLET_TRANSACTION  → log audit event
 *  EQUB_CYCLE_COMPLETE → create payout transaction, notify all members
 *  STREAM_STARTED      → notify followers
 *  CONTENT_FLAGGED     → create moderation queue entry
 *  CREATOR_TIPPED      → update creator wallet, notify creator
 */

import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';
import {
  eventBus,
  EventType,
  UserRegisteredPayload,
  VideoUploadedPayload,
  PostCreatedPayload,
  JobPostedPayload,
  WalletTransactionPayload,
  EqubCycleCompletePayload,
  StreamStartedPayload,
  ContentFlaggedPayload,
  CreatorTippedPayload,
} from './event-bus';

const prisma = new PrismaClient();
const db = prisma as any;

// ─────────────────────────────────────────────
// Handler: USER_REGISTERED
// ─────────────────────────────────────────────

async function handleUserRegistered(payload: UserRegisteredPayload): Promise<void> {
  const { userId, email, name } = payload;
  logger.info('EventHandler: USER_REGISTERED', { userId, email });

  try {
    // 1. Award SIGN_UP reward points
    await db.rewardPoints.create({
      data: {
        userId,
        action: 'SIGN_UP',
        points: 50,
        metadata: { source: 'registration', email },
      },
    });
    logger.info('EventHandler: SIGN_UP points awarded', { userId, points: 50 });
  } catch (err: any) {
    logger.error('EventHandler: failed to award SIGN_UP points', { userId, error: err?.message });
  }

  try {
    // 2. Create diaspora wallet for the new user
    const existing = await db.diasporaWallet.findUnique({ where: { userId } });
    if (!existing) {
      await db.diasporaWallet.create({
        data: {
          userId,
          balance: 0,
          currency: 'USD',
          isActive: true,
        },
      });
      logger.info('EventHandler: diaspora wallet created', { userId });
    }
  } catch (err: any) {
    logger.error('EventHandler: failed to create diaspora wallet', { userId, error: err?.message });
  }

  // 3. Send welcome notification (in-process via notification service)
  try {
    await db.notification.create({
      data: {
        userId,
        type: 'WELCOME',
        title: 'Welcome to HabeshaHub!',
        body: `Hey ${name}, your account is ready. Start connecting with the diaspora community.`,
        data: {},
      },
    });
    logger.info('EventHandler: welcome notification created', { userId });
  } catch (err: any) {
    logger.error('EventHandler: failed to create welcome notification', { userId, error: err?.message });
  }
}

// ─────────────────────────────────────────────
// Handler: VIDEO_UPLOADED
// ─────────────────────────────────────────────

async function handleVideoUploaded(payload: VideoUploadedPayload): Promise<void> {
  const { videoId, userId, title, rawUrl } = payload;
  logger.info('EventHandler: VIDEO_UPLOADED — triggering media processing job', {
    videoId,
    userId,
    title,
    rawUrl,
  });

  // Placeholder: enqueue transcoding/thumbnail job via media worker queue.
  // In production this would push to a BullMQ/NATS JetStream job queue:
  //   await mediaQueue.add('transcode', { videoId, rawUrl, userId });
  logger.info('EventHandler: media processing job enqueued (placeholder)', { videoId });

  // Track that media processing was requested
  try {
    await db.videoProcessingJob.create({
      data: {
        videoId,
        status: 'QUEUED',
        rawUrl,
        requestedAt: new Date(),
      },
    }).catch(() => {
      // Table may not exist yet (Phase 2) — log only
      logger.info('EventHandler: videoProcessingJob table not yet available, skipping DB insert');
    });
  } catch (err: any) {
    logger.warn('EventHandler: VIDEO_UPLOADED db write skipped', { error: err?.message });
  }
}

// ─────────────────────────────────────────────
// Handler: POST_CREATED
// ─────────────────────────────────────────────

async function handlePostCreated(payload: PostCreatedPayload): Promise<void> {
  const { postId, userId, hashtags, city } = payload;
  logger.info('EventHandler: POST_CREATED — tracking engagement + pushing to feed', {
    postId,
    userId,
  });

  // 1. Record an engagement event for feed-ranking signals
  try {
    await db.engagementEvent.create({
      data: {
        userId,
        contentId: postId,
        contentType: 'POST',
        eventType: 'CREATE',
        metadata: { hashtags: hashtags ?? [], city: city ?? null },
      },
    });
    logger.info('EventHandler: engagement event recorded for post', { postId });
  } catch (err: any) {
    logger.warn('EventHandler: failed to record engagement event', { postId, error: err?.message });
  }

  // 2. Push post into follower feeds via feed service (placeholder)
  // In production: await feedFanoutQueue.add('fanout', { postId, userId });
  logger.info('EventHandler: feed fanout job enqueued (placeholder)', { postId, userId });
}

// ─────────────────────────────────────────────
// Handler: JOB_POSTED
// ─────────────────────────────────────────────

async function handleJobPosted(payload: JobPostedPayload): Promise<void> {
  const { jobId, userId, title, city, country, requiredLanguages, tags } = payload;
  logger.info('EventHandler: JOB_POSTED — finding matching users (placeholder)', {
    jobId,
    title,
    city,
    country,
  });

  // Placeholder: match users by city/language/interest and send notifications.
  // In production this would run a matching query and batch-create notifications:
  //   const matches = await userMatchingService.findJobMatches({ city, country, requiredLanguages, tags });
  //   await notificationService.batchCreate(matches.map(u => ({ userId: u.id, type: 'JOB_MATCH', ... })));
  logger.info('EventHandler: job matching + notification dispatch placeholder', {
    jobId,
    requiredLanguages,
    tags,
  });
}

// ─────────────────────────────────────────────
// Handler: WALLET_TRANSACTION
// ─────────────────────────────────────────────

async function handleWalletTransaction(payload: WalletTransactionPayload): Promise<void> {
  const { transactionId, userId, type, amount, currency, status } = payload;
  logger.info('EventHandler: WALLET_TRANSACTION — logging audit event', {
    transactionId,
    userId,
    type,
    amount,
    currency,
    status,
  });

  try {
    await db.auditLog.create({
      data: {
        userId,
        action: `WALLET_${type}`,
        resourceType: 'WALLET_TRANSACTION',
        resourceId: transactionId,
        metadata: { amount, currency, status, type },
        createdAt: new Date(),
      },
    });
    logger.info('EventHandler: wallet audit log created', { transactionId });
  } catch (err: any) {
    // AuditLog table may not be available — log inline instead
    logger.warn('EventHandler: WALLET_TRANSACTION audit log db write skipped', {
      transactionId,
      error: err?.message,
    });
  }
}

// ─────────────────────────────────────────────
// Handler: EQUB_CYCLE_COMPLETE
// ─────────────────────────────────────────────

async function handleEqubCycleComplete(payload: EqubCycleCompletePayload): Promise<void> {
  const { equbId, cycleNumber, payoutUserId, payoutAmount, currency, memberIds } = payload;
  logger.info('EventHandler: EQUB_CYCLE_COMPLETE — creating payout + notifying members', {
    equbId,
    cycleNumber,
    payoutUserId,
    payoutAmount,
  });

  // 1. Create payout transaction for the winning member
  try {
    await db.walletTransaction.create({
      data: {
        userId: payoutUserId,
        type: 'EQUB_PAYOUT',
        amount: payoutAmount,
        currency,
        status: 'COMPLETED',
        metadata: { equbId, cycleNumber },
      },
    });
    logger.info('EventHandler: equb payout transaction created', { equbId, payoutUserId, payoutAmount });
  } catch (err: any) {
    logger.error('EventHandler: failed to create equb payout transaction', {
      equbId,
      error: err?.message,
    });
  }

  // 2. Notify payout recipient
  try {
    await db.notification.create({
      data: {
        userId: payoutUserId,
        type: 'EQUB_PAYOUT',
        title: 'You received your Equb payout!',
        body: `Congratulations! ${payoutAmount} ${currency} has been credited to your wallet from the Equb cycle #${cycleNumber}.`,
        data: { equbId, cycleNumber, amount: payoutAmount, currency },
      },
    });
  } catch (err: any) {
    logger.warn('EventHandler: failed to notify payout recipient', { payoutUserId, error: err?.message });
  }

  // 3. Notify all other members that cycle is complete
  const otherMembers = memberIds.filter((id) => id !== payoutUserId);
  for (const memberId of otherMembers) {
    try {
      await db.notification.create({
        data: {
          userId: memberId,
          type: 'EQUB_CYCLE_COMPLETE',
          title: `Equb Cycle #${cycleNumber} Complete`,
          body: `The payout for cycle #${cycleNumber} has been distributed. Next cycle is on its way!`,
          data: { equbId, cycleNumber },
        },
      });
    } catch (err: any) {
      logger.warn('EventHandler: failed to notify equb member', { memberId, error: err?.message });
    }
  }

  logger.info('EventHandler: equb cycle notifications dispatched', {
    equbId,
    cycleNumber,
    notified: memberIds.length,
  });
}

// ─────────────────────────────────────────────
// Handler: STREAM_STARTED
// ─────────────────────────────────────────────

async function handleStreamStarted(payload: StreamStartedPayload): Promise<void> {
  const { streamId, userId, title, followerIds } = payload;
  logger.info('EventHandler: STREAM_STARTED — notifying followers', {
    streamId,
    userId,
    title,
    followerCount: followerIds?.length ?? 'unknown',
  });

  // Resolve follower IDs if not provided in payload (look up from DB)
  let targetFollowers = followerIds ?? [];
  if (targetFollowers.length === 0) {
    try {
      const follows = await db.follow.findMany({
        where: { followingId: userId },
        select: { followerId: true },
      });
      targetFollowers = follows.map((f: any) => f.followerId);
    } catch (err: any) {
      logger.warn('EventHandler: failed to fetch followers for stream notification', {
        userId,
        error: err?.message,
      });
    }
  }

  // Notify each follower
  for (const followerId of targetFollowers) {
    try {
      await db.notification.create({
        data: {
          userId: followerId,
          type: 'STREAM_STARTED',
          title: 'Live now!',
          body: `Someone you follow just went live: "${title}"`,
          data: { streamId, streamerId: userId, title },
        },
      });
    } catch (err: any) {
      logger.warn('EventHandler: failed to notify follower about stream', {
        followerId,
        streamId,
        error: err?.message,
      });
    }
  }

  logger.info('EventHandler: stream notifications dispatched', {
    streamId,
    notified: targetFollowers.length,
  });
}

// ─────────────────────────────────────────────
// Handler: CONTENT_FLAGGED
// ─────────────────────────────────────────────

async function handleContentFlagged(payload: ContentFlaggedPayload): Promise<void> {
  const { contentId, contentType, reportedByUserId, reason, details } = payload;
  logger.info('EventHandler: CONTENT_FLAGGED — creating moderation queue entry', {
    contentId,
    contentType,
    reason,
  });

  try {
    await db.moderationQueue.create({
      data: {
        contentId,
        contentType,
        reportedByUserId,
        reason,
        details: details ?? null,
        status: 'PENDING',
        priority: reason === 'HATE_SPEECH' || reason === 'VIOLENCE' ? 'HIGH' : 'NORMAL',
        createdAt: new Date(),
      },
    });
    logger.info('EventHandler: moderation queue entry created', { contentId, contentType, reason });
  } catch (err: any) {
    logger.error('EventHandler: failed to create moderation queue entry', {
      contentId,
      error: err?.message,
    });
  }
}

// ─────────────────────────────────────────────
// Handler: CREATOR_TIPPED
// ─────────────────────────────────────────────

async function handleCreatorTipped(payload: CreatorTippedPayload): Promise<void> {
  const { tipId, creatorId, tipperId, amount, currency, contentId, contentType, message } = payload;
  logger.info('EventHandler: CREATOR_TIPPED — updating wallet + notifying creator', {
    tipId,
    creatorId,
    tipperId,
    amount,
    currency,
  });

  // 1. Credit tip to creator's wallet
  try {
    // Increment wallet balance
    await db.diasporaWallet.updateMany({
      where: { userId: creatorId },
      data: { balance: { increment: amount } },
    });
    logger.info('EventHandler: creator wallet credited', { creatorId, amount, currency });
  } catch (err: any) {
    logger.error('EventHandler: failed to credit creator wallet for tip', {
      creatorId,
      tipId,
      error: err?.message,
    });
  }

  // 2. Record wallet transaction for the creator
  try {
    await db.walletTransaction.create({
      data: {
        userId: creatorId,
        type: 'TIP',
        amount,
        currency,
        status: 'COMPLETED',
        metadata: { tipId, tipperId, contentId, contentType, message },
      },
    });
  } catch (err: any) {
    logger.warn('EventHandler: failed to record tip wallet transaction', { tipId, error: err?.message });
  }

  // 3. Look up tipper name for the notification
  let tipperName = 'Someone';
  try {
    const tipper = await db.user.findUnique({
      where: { id: tipperId },
      select: { name: true },
    });
    if (tipper?.name) tipperName = tipper.name;
  } catch {
    // Non-critical — use default
  }

  // 4. Notify the creator
  try {
    await db.notification.create({
      data: {
        userId: creatorId,
        type: 'TIP_RECEIVED',
        title: `You received a tip of ${amount} ${currency}!`,
        body: message
          ? `${tipperName} tipped you: "${message}"`
          : `${tipperName} sent you a ${amount} ${currency} tip.`,
        data: { tipId, tipperId, tipperName, amount, currency, contentId, contentType },
      },
    });
    logger.info('EventHandler: creator tip notification sent', { creatorId, tipId });
  } catch (err: any) {
    logger.warn('EventHandler: failed to notify creator of tip', { creatorId, error: err?.message });
  }
}

// ─────────────────────────────────────────────
// Register All Handlers
// ─────────────────────────────────────────────

/**
 * Register every domain event handler on the shared event bus.
 * Call once at application startup, after all connections are established.
 */
export function registerAllHandlers(): void {
  eventBus.subscribe(EventType.USER_REGISTERED,     handleUserRegistered);
  eventBus.subscribe(EventType.VIDEO_UPLOADED,      handleVideoUploaded);
  eventBus.subscribe(EventType.POST_CREATED,        handlePostCreated);
  eventBus.subscribe(EventType.JOB_POSTED,          handleJobPosted);
  eventBus.subscribe(EventType.WALLET_TRANSACTION,  handleWalletTransaction);
  eventBus.subscribe(EventType.EQUB_CYCLE_COMPLETE, handleEqubCycleComplete);
  eventBus.subscribe(EventType.STREAM_STARTED,      handleStreamStarted);
  eventBus.subscribe(EventType.CONTENT_FLAGGED,     handleContentFlagged);
  eventBus.subscribe(EventType.CREATOR_TIPPED,      handleCreatorTipped);

  logger.info('EventBus: all domain handlers registered', {
    handlers: [
      EventType.USER_REGISTERED,
      EventType.VIDEO_UPLOADED,
      EventType.POST_CREATED,
      EventType.JOB_POSTED,
      EventType.WALLET_TRANSACTION,
      EventType.EQUB_CYCLE_COMPLETE,
      EventType.STREAM_STARTED,
      EventType.CONTENT_FLAGGED,
      EventType.CREATOR_TIPPED,
    ],
  });
}

/**
 * Deregister all domain event handlers (used in testing / graceful shutdown).
 */
export function unregisterAllHandlers(): void {
  eventBus.unsubscribe(EventType.USER_REGISTERED,     handleUserRegistered);
  eventBus.unsubscribe(EventType.VIDEO_UPLOADED,      handleVideoUploaded);
  eventBus.unsubscribe(EventType.POST_CREATED,        handlePostCreated);
  eventBus.unsubscribe(EventType.JOB_POSTED,          handleJobPosted);
  eventBus.unsubscribe(EventType.WALLET_TRANSACTION,  handleWalletTransaction);
  eventBus.unsubscribe(EventType.EQUB_CYCLE_COMPLETE, handleEqubCycleComplete);
  eventBus.unsubscribe(EventType.STREAM_STARTED,      handleStreamStarted);
  eventBus.unsubscribe(EventType.CONTENT_FLAGGED,     handleContentFlagged);
  eventBus.unsubscribe(EventType.CREATOR_TIPPED,      handleCreatorTipped);

  logger.info('EventBus: all domain handlers unregistered');
}
