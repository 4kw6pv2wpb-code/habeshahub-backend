/**
 * Multi-platform push notification dispatcher.
 * Supports FCM (Android), APNs (iOS), and Web Push.
 * Device tokens are stored in Redis hashes.
 */

import { PrismaClient } from '@prisma/client';
import { redis } from '../config/redis';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();
const db = prisma as any;

// ─────────────────────────────────────────────
// Interfaces
// ─────────────────────────────────────────────

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
  badge?: number;
  sound?: string;
  imageUrl?: string;
}

export interface DeviceToken {
  userId: string;
  token: string;
  platform: 'ios' | 'android' | 'web';
  createdAt: Date;
}

export interface PushResult {
  sent: number;
  failed: number;
  tokens: string[];
}

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

const FCM_PROJECT_ID = process.env.FCM_PROJECT_ID ?? 'habeshahub';
const FCM_API_URL = `https://fcm.googleapis.com/v1/projects/${FCM_PROJECT_ID}/messages:send`;
const APNS_HOST = 'api.push.apple.com';
const APNS_BUNDLE_ID = process.env.APNS_BUNDLE_ID ?? 'com.habeshahub.app';

// Redis key helpers
const tokenKey = (userId: string) => `push_tokens:${userId}`;
const allUsersKey = 'push_token_users'; // Set of userIds that have tokens

// ─────────────────────────────────────────────
// Device Registration
// ─────────────────────────────────────────────

/**
 * Register a device token for a user.
 * Stored in Redis hash: push_tokens:{userId} → { [token]: platform|createdAt }
 */
export async function registerDevice(
  userId: string,
  token: string,
  platform: 'ios' | 'android' | 'web',
): Promise<void> {
  const key = tokenKey(userId);
  const value = JSON.stringify({ platform, createdAt: new Date().toISOString() });

  await redis.hset(key, token, value);
  await redis.sadd(allUsersKey, userId);

  logger.info('Device registered', { userId, platform, tokenPrefix: token.slice(0, 12) });
}

/**
 * Remove a device token for a user.
 */
export async function unregisterDevice(userId: string, token: string): Promise<void> {
  const key = tokenKey(userId);
  const removed = await redis.hdel(key, token);

  // If no tokens remain, remove from allUsersKey
  const remaining = await redis.hlen(key);
  if (remaining === 0) {
    await redis.srem(allUsersKey, userId);
  }

  logger.info('Device unregistered', { userId, removed });
}

/**
 * Get all device tokens for a user, grouped by platform.
 */
export async function getUserTokens(userId: string): Promise<DeviceToken[]> {
  const key = tokenKey(userId);
  const hash = await redis.hgetall(key);

  if (!hash) return [];

  return Object.entries(hash).map(([token, raw]) => {
    const meta = JSON.parse(raw as string) as { platform: 'ios' | 'android' | 'web'; createdAt: string };
    return {
      userId,
      token,
      platform: meta.platform,
      createdAt: new Date(meta.createdAt),
    };
  });
}

// ─────────────────────────────────────────────
// Send Helpers
// ─────────────────────────────────────────────

/**
 * Send a push notification to a single user (all their devices).
 */
export async function sendToUser(userId: string, payload: PushPayload): Promise<PushResult> {
  const tokens = await getUserTokens(userId);
  if (tokens.length === 0) {
    return { sent: 0, failed: 0, tokens: [] };
  }

  return _dispatchByPlatform(tokens, payload);
}

/**
 * Send a push notification to multiple users (all their devices).
 */
export async function sendToUsers(userIds: string[], payload: PushPayload): Promise<PushResult> {
  const allTokens: DeviceToken[] = [];

  await Promise.all(
    userIds.map(async (userId) => {
      const tokens = await getUserTokens(userId);
      allTokens.push(...tokens);
    }),
  );

  if (allTokens.length === 0) {
    return { sent: 0, failed: 0, tokens: [] };
  }

  return _dispatchByPlatform(allTokens, payload);
}

/**
 * Broadcast to ALL registered devices (Redis SSCAN over allUsersKey).
 */
export async function sendToAll(payload: PushPayload): Promise<PushResult> {
  const allTokens: DeviceToken[] = [];
  let cursor = '0';

  do {
    const [nextCursor, members] = await redis.sscan(allUsersKey, cursor, 'COUNT', 100);
    cursor = nextCursor;

    await Promise.all(
      members.map(async (userId) => {
        const tokens = await getUserTokens(userId);
        allTokens.push(...tokens);
      }),
    );
  } while (cursor !== '0');

  if (allTokens.length === 0) {
    logger.warn('sendToAll: no registered devices found');
    return { sent: 0, failed: 0, tokens: [] };
  }

  logger.info('Broadcasting push notification', {
    totalTokens: allTokens.length,
    title: payload.title,
  });

  return _dispatchByPlatform(allTokens, payload);
}

/**
 * Internal: group tokens by platform and dispatch.
 */
async function _dispatchByPlatform(
  tokens: DeviceToken[],
  payload: PushPayload,
): Promise<PushResult> {
  const fcmTokens = tokens.filter((t) => t.platform === 'android').map((t) => t.token);
  const apnsTokens = tokens.filter((t) => t.platform === 'ios').map((t) => t.token);
  const webTokens = tokens.filter((t) => t.platform === 'web').map((t) => t.token);

  const results = await Promise.allSettled([
    fcmTokens.length > 0 ? dispatchFCM(fcmTokens, payload) : Promise.resolve({ sent: 0, failed: 0, tokens: [] }),
    apnsTokens.length > 0 ? dispatchAPNS(apnsTokens, payload) : Promise.resolve({ sent: 0, failed: 0, tokens: [] }),
    webTokens.length > 0 ? dispatchWebPush(webTokens, payload) : Promise.resolve({ sent: 0, failed: 0, tokens: [] }),
  ]);

  let sent = 0;
  let failed = 0;
  const sentTokens: string[] = [];

  for (const result of results) {
    if (result.status === 'fulfilled') {
      sent += result.value.sent;
      failed += result.value.failed;
      sentTokens.push(...result.value.tokens);
    } else {
      failed += 1;
      logger.error('Platform dispatch error', { reason: result.reason });
    }
  }

  return { sent, failed, tokens: sentTokens };
}

// ─────────────────────────────────────────────
// Platform Dispatchers
// ─────────────────────────────────────────────

/**
 * Firebase Cloud Messaging (FCM v1 HTTP API).
 * Logs the request that would be sent to the FCM API.
 */
export async function dispatchFCM(tokens: string[], payload: PushPayload): Promise<PushResult> {
  // FCM v1 sends one message per token (no batch in v1 HTTP API)
  const messages = tokens.map((token) => ({
    message: {
      token,
      notification: {
        title: payload.title,
        body: payload.body,
        ...(payload.imageUrl ? { image: payload.imageUrl } : {}),
      },
      android: {
        notification: {
          sound: payload.sound ?? 'default',
          ...(payload.badge !== undefined ? { notification_count: payload.badge } : {}),
          ...(payload.imageUrl ? { image_url: payload.imageUrl } : {}),
        },
      },
      ...(payload.data ? { data: payload.data } : {}),
    },
  }));

  logger.info('FCM dispatch', {
    method: 'POST',
    url: FCM_API_URL,
    headers: {
      Authorization: 'Bearer <FCM_ACCESS_TOKEN>',
      'Content-Type': 'application/json',
    },
    tokenCount: tokens.length,
    payloadSample: messages[0],
  });

  // Mock success: all tokens accepted
  return { sent: tokens.length, failed: 0, tokens };
}

/**
 * Apple Push Notification service (APNs HTTP/2).
 * Logs the HTTP/2 request that would be sent to api.push.apple.com.
 */
export async function dispatchAPNS(tokens: string[], payload: PushPayload): Promise<PushResult> {
  const apnsPayload = {
    aps: {
      alert: {
        title: payload.title,
        body: payload.body,
      },
      sound: payload.sound ?? 'default',
      ...(payload.badge !== undefined ? { badge: payload.badge } : {}),
      'mutable-content': payload.imageUrl ? 1 : 0,
    },
    ...(payload.data ? payload.data : {}),
    ...(payload.imageUrl ? { 'media-url': payload.imageUrl } : {}),
  };

  for (const token of tokens) {
    logger.info('APNs dispatch', {
      method: 'POST',
      url: `https://${APNS_HOST}/3/device/${token}`,
      headers: {
        ':method': 'POST',
        ':path': `/3/device/${token}`,
        ':scheme': 'https',
        ':authority': APNS_HOST,
        'apns-topic': APNS_BUNDLE_ID,
        'apns-push-type': 'alert',
        'apns-priority': '10',
        authorization: 'bearer <APNS_JWT_TOKEN>',
        'content-type': 'application/json',
      },
      body: apnsPayload,
    });
  }

  // Mock success
  return { sent: tokens.length, failed: 0, tokens };
}

/**
 * Web Push Protocol (RFC 8030).
 * Logs the request that would be sent to the push service endpoint.
 */
export async function dispatchWebPush(tokens: string[], payload: PushPayload): Promise<PushResult> {
  const webPayload = JSON.stringify({
    title: payload.title,
    body: payload.body,
    ...(payload.data ? { data: payload.data } : {}),
    ...(payload.badge !== undefined ? { badge: payload.badge } : {}),
    ...(payload.imageUrl ? { icon: payload.imageUrl } : {}),
  });

  for (const subscriptionEndpoint of tokens) {
    logger.info('Web Push dispatch', {
      method: 'POST',
      url: subscriptionEndpoint,
      headers: {
        'Content-Type': 'application/json',
        'Content-Encoding': 'aes128gcm',
        TTL: '86400',
        Authorization: 'vapid t=<VAPID_JWT>,k=<VAPID_PUBLIC_KEY>',
        Urgency: 'normal',
      },
      body: webPayload,
    });
  }

  // Mock success
  return { sent: tokens.length, failed: 0, tokens };
}

// ─────────────────────────────────────────────
// Event-driven Notification Mapping
// ─────────────────────────────────────────────

type EventType =
  | 'new_message'
  | 'post_like'
  | 'stream_started'
  | 'job_match'
  | 'equb_payout'
  | 'creator_tip';

interface EventData {
  // new_message
  senderName?: string;
  senderId?: string;
  recipientId?: string;
  // post_like
  likerName?: string;
  postOwnerId?: string;
  // stream_started
  hostName?: string;
  followerIds?: string[];
  // job_match
  jobTitle?: string;
  jobSeekerId?: string;
  // equb_payout
  amount?: number | string;
  payoutUserId?: string;
  // creator_tip
  tipRecipientId?: string;
  // extra data forwarded to payload
  [key: string]: unknown;
}

/**
 * Map a platform event to a push notification and dispatch it.
 */
export async function sendEventNotification(
  eventType: EventType,
  data: EventData,
): Promise<PushResult> {
  let payload: PushPayload;
  let targetUserIds: string[] = [];

  const extraData: Record<string, string> = {};
  // Forward safe string fields as push data
  for (const [k, v] of Object.entries(data)) {
    if (typeof v === 'string') extraData[k] = v;
  }

  switch (eventType) {
    case 'new_message':
      payload = {
        title: 'New Message',
        body: `New message from ${data.senderName ?? 'someone'}`,
        sound: 'default',
        data: { ...extraData, eventType },
      };
      if (data.recipientId) targetUserIds = [data.recipientId];
      break;

    case 'post_like':
      payload = {
        title: 'Post Liked',
        body: `${data.likerName ?? 'Someone'} liked your post`,
        sound: 'default',
        data: { ...extraData, eventType },
      };
      if (data.postOwnerId) targetUserIds = [data.postOwnerId];
      break;

    case 'stream_started':
      payload = {
        title: 'Live Now!',
        body: `${data.hostName ?? 'Someone'} is live now!`,
        sound: 'default',
        data: { ...extraData, eventType },
      };
      targetUserIds = data.followerIds ?? [];
      break;

    case 'job_match':
      payload = {
        title: 'New Job Match',
        body: `New job match: ${data.jobTitle ?? 'a new opportunity'}`,
        sound: 'default',
        data: { ...extraData, eventType },
      };
      if (data.jobSeekerId) targetUserIds = [data.jobSeekerId];
      break;

    case 'equb_payout':
      payload = {
        title: 'Equb Payout Ready',
        body: `Your equb payout of $${data.amount ?? '0'} is ready!`,
        sound: 'default',
        data: { ...extraData, eventType },
      };
      if (data.payoutUserId) targetUserIds = [data.payoutUserId];
      break;

    case 'creator_tip':
      payload = {
        title: 'You Got a Tip!',
        body: `You received a $${data.amount ?? '0'} tip!`,
        sound: 'default',
        data: { ...extraData, eventType },
      };
      if (data.tipRecipientId) targetUserIds = [data.tipRecipientId];
      break;

    default:
      logger.warn('sendEventNotification: unknown event type', { eventType });
      return { sent: 0, failed: 0, tokens: [] };
  }

  if (targetUserIds.length === 0) {
    logger.warn('sendEventNotification: no target users', { eventType });
    return { sent: 0, failed: 0, tokens: [] };
  }

  logger.info('Sending event notification', {
    eventType,
    targetCount: targetUserIds.length,
    title: payload.title,
  });

  return sendToUsers(targetUserIds, payload);
}
