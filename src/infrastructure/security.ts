/**
 * Security Infrastructure
 *
 * Fraud detection, KYC verification, abuse prevention, and audit logging.
 * Redis is used for real-time signal scoring and event streaming.
 */

import { PrismaClient } from '@prisma/client';
import { redis } from '../config/redis';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();
const db = prisma as any;

// ─────────────────────────────────────────────
// Interfaces
// ─────────────────────────────────────────────

export interface FraudSignal {
  userId: string;
  signalType: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  details: Record<string, unknown>;
  timestamp: Date;
}

export interface KYCStatus {
  userId: string;
  level: 'none' | 'basic' | 'verified' | 'enhanced';
  documents: string[];
  verifiedAt?: Date;
}

export interface AbuseReport {
  userId: string;
  abuseType: string;
  score: number;
  details: Record<string, unknown>;
}

export interface AuditEntry {
  action: string;
  actorId: string;
  targetType: string;
  targetId: string;
  changes: Record<string, unknown>;
  ip: string;
  userAgent: string;
  timestamp: Date;
}

// ─────────────────────────────────────────────
// Redis Key Helpers
// ─────────────────────────────────────────────

const FRAUD_SCORE_PREFIX = 'security:fraud_score:';
const ABUSE_SCORE_PREFIX = 'security:abuse_score:';
const AUDIT_STREAM_KEY = 'security:audit_stream';
const WALLET_TX_WINDOW_PREFIX = 'security:wallet_tx:';
const LOGIN_FAIL_PREFIX = 'security:login_fail:';
const POST_RATE_PREFIX = 'security:post_rate:';

// ─────────────────────────────────────────────
// Fraud Detection
// ─────────────────────────────────────────────

/**
 * Analyse a user action for fraud signals.
 * Returns an array of FraudSignal (empty = no signals).
 */
export async function detectFraudSignals(
  userId: string,
  action: string,
  metadata: Record<string, unknown>,
): Promise<FraudSignal[]> {
  const signals: FraudSignal[] = [];
  const now = new Date();

  try {
    // ── 1. Rapid wallet transactions (>5 in 1 minute) ────────────────
    if (action === 'wallet_transaction') {
      const txWindowKey = `${WALLET_TX_WINDOW_PREFIX}${userId}`;
      const txCount = await redis.incr(txWindowKey);
      if (txCount === 1) {
        // Set 60-second window on first increment
        await redis.expire(txWindowKey, 60);
      }
      if (txCount > 5) {
        signals.push({
          userId,
          signalType: 'rapid_transactions',
          severity: 'high',
          details: { transactionCount: txCount, windowSeconds: 60 },
          timestamp: now,
        });
      }

      // ── 2. Unusual single transaction amount (>$5000) ─────────────
      const amount = Number(metadata.amount ?? 0);
      if (amount > 5000) {
        signals.push({
          userId,
          signalType: 'unusual_amount',
          severity: 'medium',
          details: { amount, threshold: 5000 },
          timestamp: now,
        });
      }

      // ── 3. New account high-value transaction (<24h old + >$500) ──
      if (amount > 500) {
        const user = await db.user.findUnique({
          where: { id: userId },
          select: { createdAt: true },
        });
        if (user) {
          const ageHours =
            (now.getTime() - new Date(user.createdAt).getTime()) /
            (1000 * 60 * 60);
          if (ageHours < 24) {
            signals.push({
              userId,
              signalType: 'new_account_high_value',
              severity: 'medium',
              details: { amount, accountAgeHours: Math.round(ageHours) },
              timestamp: now,
            });
          }
        }
      }
    }

    // ── 4. Multiple failed login attempts (>10 in 15 min) ────────────
    if (action === 'login_failed') {
      const failKey = `${LOGIN_FAIL_PREFIX}${userId}`;
      const failCount = await redis.incr(failKey);
      if (failCount === 1) {
        await redis.expire(failKey, 15 * 60); // 15-minute window
      }
      if (failCount > 10) {
        signals.push({
          userId,
          signalType: 'multiple_failed_logins',
          severity: 'high',
          details: { failedAttempts: failCount, windowMinutes: 15 },
          timestamp: now,
        });
      }
    }

    // ── 5. IP geolocation mismatch (placeholder) ─────────────────────
    if (metadata.ip && metadata.lastKnownCountry) {
      logger.warn('security.detectFraudSignals: IP geolocation check placeholder', {
        userId,
        ip: metadata.ip,
        lastKnownCountry: metadata.lastKnownCountry,
      });
      // TODO: integrate GeoIP provider (e.g. MaxMind) to compare countries
    }

    // Update composite fraud score in Redis hash
    if (signals.length > 0) {
      const severityScore: Record<string, number> = {
        low: 5,
        medium: 15,
        high: 30,
        critical: 50,
      };
      const increment = signals.reduce(
        (sum, s) => sum + (severityScore[s.severity] ?? 0),
        0,
      );
      await redis.hincrby(
        `${FRAUD_SCORE_PREFIX}${userId}`,
        'score',
        increment,
      );
      await redis.hset(
        `${FRAUD_SCORE_PREFIX}${userId}`,
        'lastSignal',
        now.toISOString(),
      );
      await redis.expire(
        `${FRAUD_SCORE_PREFIX}${userId}`,
        60 * 60 * 24 * 7,
      ); // 7-day TTL
    }
  } catch (err) {
    logger.error('security.detectFraudSignals error', { err, userId, action });
  }

  return signals;
}

/**
 * Composite fraud risk score 0–100 from Redis hash.
 */
export async function getFraudScore(userId: string): Promise<number> {
  const raw = await redis.hget(`${FRAUD_SCORE_PREFIX}${userId}`, 'score');
  return Math.min(parseInt(raw ?? '0', 10), 100);
}

/**
 * Create a UserReport with FRAUD reason for review.
 */
export async function flagForReview(
  userId: string,
  signals: FraudSignal[],
): Promise<void> {
  try {
    const description = signals
      .map((s) => `[${s.severity.toUpperCase()}] ${s.signalType}: ${JSON.stringify(s.details)}`)
      .join('\n');

    // Use the platform system user (actorId null → fallback to first admin)
    const admin = await db.user.findFirst({
      where: { role: 'ADMIN' },
      select: { id: true },
    });

    if (!admin) {
      logger.warn('security.flagForReview: no admin user found to create report');
      return;
    }

    await db.userReport.create({
      data: {
        reporterId: admin.id,
        reportedId: userId,
        reason: 'FRAUD',
        description,
        status: 'PENDING',
      },
    });

    logger.info('security.flagForReview: fraud report created', {
      userId,
      signalCount: signals.length,
    });
  } catch (err) {
    logger.error('security.flagForReview error', { err, userId });
  }
}

/**
 * Resolve all open fraud flags for a user (called by a moderator).
 */
export async function clearFraudFlags(
  userId: string,
  moderatorId: string,
): Promise<number> {
  try {
    const result = await db.userReport.updateMany({
      where: {
        reportedId: userId,
        reason: 'FRAUD',
        status: { in: ['PENDING', 'REVIEWING'] },
      },
      data: {
        status: 'RESOLVED',
        resolvedBy: moderatorId,
        resolvedAt: new Date(),
        resolution: 'Cleared by moderator',
      },
    });

    // Reset fraud score in Redis
    await redis.del(`${FRAUD_SCORE_PREFIX}${userId}`);

    logger.info('security.clearFraudFlags: cleared', {
      userId,
      moderatorId,
      count: result.count,
    });

    return result.count;
  } catch (err) {
    logger.error('security.clearFraudFlags error', { err, userId });
    return 0;
  }
}

// ─────────────────────────────────────────────
// KYC Verification
// ─────────────────────────────────────────────

/**
 * Get the current KYC status for a user.
 */
export async function getKYCStatus(userId: string): Promise<KYCStatus> {
  const wallet = await db.diasporaWallet.findUnique({
    where: { userId },
    select: { kycVerified: true, updatedAt: true },
  });

  // Retrieve stored KYC document list from Redis
  const docsRaw = await redis.get(`kyc:docs:${userId}`);
  const documents: string[] = docsRaw ? JSON.parse(docsRaw) : [];

  if (!wallet) {
    return { userId, level: 'none', documents };
  }

  const level: KYCStatus['level'] = wallet.kycVerified ? 'verified' : 'basic';

  return {
    userId,
    level,
    documents,
    verifiedAt: wallet.kycVerified ? new Date(wallet.updatedAt) : undefined,
  };
}

/**
 * Initiate a KYC verification process.
 * Placeholder for third-party API integration (e.g. Onfido, Persona).
 */
export async function initiateKYC(
  userId: string,
  level: KYCStatus['level'],
): Promise<{ status: string; message: string }> {
  logger.info('security.initiateKYC: starting KYC process', {
    userId,
    level,
    // TODO: call third-party KYC provider API here
  });

  // Store pending KYC state
  await redis.set(
    `kyc:pending:${userId}`,
    JSON.stringify({ level, initiatedAt: new Date().toISOString() }),
    'EX',
    60 * 60 * 24 * 7, // 7 days to complete
  );

  return {
    status: 'initiated',
    message: `KYC verification at level '${level}' has been initiated. A third-party provider will contact the user.`,
  };
}

/**
 * Mark KYC as completed, update DiasporaWallet.kycVerified.
 */
export async function completeKYC(
  userId: string,
  level: KYCStatus['level'],
  documents: string[],
): Promise<KYCStatus> {
  // Store document list in Redis
  await redis.set(`kyc:docs:${userId}`, JSON.stringify(documents));
  // Remove pending state
  await redis.del(`kyc:pending:${userId}`);

  // Update wallet KYC flag
  await db.diasporaWallet.upsert({
    where: { userId },
    update: { kycVerified: true },
    create: {
      userId,
      kycVerified: true,
      balance: 0,
      currency: 'USD',
    },
  });

  logger.info('security.completeKYC: KYC completed', { userId, level, documents });

  return {
    userId,
    level,
    documents,
    verifiedAt: new Date(),
  };
}

/**
 * Verify a user meets the required KYC level; throws if not.
 */
export async function requireKYC(
  userId: string,
  requiredLevel: KYCStatus['level'],
): Promise<void> {
  const levelOrder: Record<KYCStatus['level'], number> = {
    none: 0,
    basic: 1,
    verified: 2,
    enhanced: 3,
  };

  const status = await getKYCStatus(userId);
  if (levelOrder[status.level] < levelOrder[requiredLevel]) {
    throw Object.assign(
      new Error(`KYC level '${requiredLevel}' required, user has '${status.level}'`),
      { statusCode: 403, code: 'KYC_REQUIRED' },
    );
  }
}

// ─────────────────────────────────────────────
// Abuse Detection
// ─────────────────────────────────────────────

// Placeholder patterns for known bad content
const BAD_CONTENT_PATTERNS: RegExp[] = [
  /\b(buy now|click here|earn money fast)\b/i,
  /\b(free gift|you have won|claim your prize)\b/i,
];

/**
 * Detect abuse in user-generated content.
 * Returns an AbuseReport or null if no abuse detected.
 */
export async function detectAbuse(
  userId: string,
  contentType: string,
  content: string,
): Promise<AbuseReport | null> {
  const now = Date.now();

  try {
    // ── 1. Rate anomaly: >20 posts per hour ───────────────────────────
    const rateKey = `${POST_RATE_PREFIX}${userId}`;
    const postCount = await redis.incr(rateKey);
    if (postCount === 1) {
      await redis.expire(rateKey, 3600); // 1-hour window
    }
    if (postCount > 20) {
      const report: AbuseReport = {
        userId,
        abuseType: 'rate_anomaly',
        score: Math.min(postCount * 3, 100),
        details: { postsThisHour: postCount, limit: 20, contentType },
      };
      await _incrementAbuseScore(userId, report.score);
      return report;
    }

    // ── 2. Spam: repeated content in short time ──────────────────────
    const recentKey = `abuse:recent_content:${userId}`;
    const recentRaw = await redis.get(recentKey);
    if (recentRaw) {
      const recentContent: string[] = JSON.parse(recentRaw);
      const isDuplicate = recentContent.some(
        (prev) => prev === content || (content.length > 20 && prev.startsWith(content.slice(0, 20))),
      );
      if (isDuplicate) {
        const report: AbuseReport = {
          userId,
          abuseType: 'spam_duplicate',
          score: 50,
          details: { contentType, contentSnippet: content.slice(0, 50) },
        };
        await _incrementAbuseScore(userId, report.score);
        return report;
      }
    }

    // Store recent content (last 5 items, 5 min window)
    const recent: string[] = recentRaw ? JSON.parse(recentRaw) : [];
    recent.push(content);
    if (recent.length > 5) recent.shift();
    await redis.set(recentKey, JSON.stringify(recent), 'EX', 300);

    // ── 3. Known bad patterns (regex list) ──────────────────────────
    for (const pattern of BAD_CONTENT_PATTERNS) {
      if (pattern.test(content)) {
        const report: AbuseReport = {
          userId,
          abuseType: 'bad_pattern',
          score: 60,
          details: { pattern: pattern.toString(), contentType },
        };
        await _incrementAbuseScore(userId, report.score);
        return report;
      }
    }
  } catch (err) {
    logger.error('security.detectAbuse error', { err, userId });
  }

  return null;
}

async function _incrementAbuseScore(userId: string, increment: number): Promise<void> {
  await redis.incrby(`${ABUSE_SCORE_PREFIX}${userId}`, increment);
  await redis.expire(`${ABUSE_SCORE_PREFIX}${userId}`, 60 * 60 * 24 * 7);
}

/**
 * Abuse risk score 0–100 from Redis.
 */
export async function getAbuseScore(userId: string): Promise<number> {
  const raw = await redis.get(`${ABUSE_SCORE_PREFIX}${userId}`);
  return Math.min(parseInt(raw ?? '0', 10), 100);
}

/**
 * Auto-moderate based on abuse severity score.
 * Applies warning or mute via ModerationLog.
 */
export async function autoModerate(
  userId: string,
  abuseReport: AbuseReport,
): Promise<void> {
  try {
    const admin = await db.user.findFirst({
      where: { role: 'ADMIN' },
      select: { id: true },
    });

    if (!admin) {
      logger.warn('security.autoModerate: no admin found for moderation log');
      return;
    }

    const action = abuseReport.score >= 70 ? 'MUTE' : 'WARNING';
    const expiresAt =
      action === 'MUTE'
        ? new Date(Date.now() + 60 * 60 * 24 * 1000) // 24h mute
        : null;

    await db.moderationLog.create({
      data: {
        actorId: admin.id,
        targetId: userId,
        action,
        reason: `Auto-moderated: ${abuseReport.abuseType} (score: ${abuseReport.score})`,
        expiresAt,
        metadata: { abuseReport },
      },
    });

    logger.info('security.autoModerate: action applied', {
      userId,
      action,
      abuseType: abuseReport.abuseType,
      score: abuseReport.score,
    });
  } catch (err) {
    logger.error('security.autoModerate error', { err, userId });
  }
}

// ─────────────────────────────────────────────
// Audit Logging
// ─────────────────────────────────────────────

/**
 * Write an audit entry to PlatformEvent (type='AUDIT') and Redis stream.
 */
export async function auditLog(entry: AuditEntry): Promise<void> {
  try {
    await db.platformEvent.create({
      data: {
        type: 'AUDIT',
        actorId: entry.actorId,
        entityType: entry.targetType,
        entityId: entry.targetId,
        data: {
          action: entry.action,
          changes: entry.changes,
          ip: entry.ip,
          userAgent: entry.userAgent,
          timestamp: entry.timestamp.toISOString(),
        },
      },
    });

    // Push to Redis stream for real-time monitoring
    await redis.xadd(
      AUDIT_STREAM_KEY,
      '*', // auto-generate stream ID
      'action', entry.action,
      'actorId', entry.actorId,
      'targetType', entry.targetType,
      'targetId', entry.targetId,
      'ip', entry.ip,
      'timestamp', entry.timestamp.toISOString(),
    );

    // Trim stream to last 10,000 entries
    await redis.xtrim(AUDIT_STREAM_KEY, 'MAXLEN', '~', 10000);
  } catch (err) {
    logger.error('security.auditLog error', { err, entry });
  }
}

/**
 * Get paginated audit history for an entity.
 */
export async function getAuditTrail(
  targetType: string,
  targetId: string,
  page = 1,
  limit = 20,
): Promise<{ entries: any[]; total: number }> {
  const skip = (page - 1) * limit;

  const [entries, total] = await Promise.all([
    db.platformEvent.findMany({
      where: {
        type: 'AUDIT',
        entityType: targetType,
        entityId: targetId,
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    db.platformEvent.count({
      where: {
        type: 'AUDIT',
        entityType: targetType,
        entityId: targetId,
      },
    }),
  ]);

  return { entries, total };
}

/**
 * Get paginated audit trail for all actions by or against a user.
 */
export async function getUserAuditTrail(
  userId: string,
  page = 1,
  limit = 20,
): Promise<{ entries: any[]; total: number }> {
  const skip = (page - 1) * limit;

  const [entries, total] = await Promise.all([
    db.platformEvent.findMany({
      where: {
        type: 'AUDIT',
        OR: [
          { actorId: userId },
          { entityId: userId, entityType: 'user' },
        ],
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    db.platformEvent.count({
      where: {
        type: 'AUDIT',
        OR: [
          { actorId: userId },
          { entityId: userId, entityType: 'user' },
        ],
      },
    }),
  ]);

  return { entries, total };
}

/**
 * Most recent audit events across the platform.
 */
export async function getRecentAudits(limit = 50): Promise<any[]> {
  return db.platformEvent.findMany({
    where: { type: 'AUDIT' },
    orderBy: { createdAt: 'desc' },
    take: Math.min(limit, 200),
  });
}
