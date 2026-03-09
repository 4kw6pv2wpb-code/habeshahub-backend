/**
 * Live Streaming service.
 * Manages stream lifecycle, viewer counts, and gifts.
 */

import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';
import { AppError } from '../middlewares/errorHandler';

const prisma = new PrismaClient();
const db = prisma as any; // For models not yet generated

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function randomStreamKey(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let key = 'sk_';
  for (let i = 0; i < 24; i++) {
    key += chars[Math.floor(Math.random() * chars.length)];
  }
  return key;
}

// ─────────────────────────────────────────────
// Stream management
// ─────────────────────────────────────────────

/**
 * Create a new scheduled live stream.
 */
export async function createStream(
  hostId: string,
  data: {
    title: string;
    description?: string;
    thumbnailUrl?: string;
    scheduledAt?: Date;
  },
) {
  const streamKey = randomStreamKey();
  const rtmpUrl = `rtmp://stream.habeshahub.com/live/${streamKey}`;
  const hlsUrl = `https://stream.habeshahub.com/hls/${streamKey}/index.m3u8`;

  const stream = await db.liveStream.create({
    data: {
      hostId,
      title: data.title,
      description: data.description ?? null,
      thumbnailUrl: data.thumbnailUrl ?? null,
      streamKey,
      rtmpUrl,
      hlsUrl,
      status: 'SCHEDULED',
      viewerCount: 0,
      peakViewers: 0,
      giftsTotal: 0,
      scheduledAt: data.scheduledAt ?? null,
    },
    include: {
      host: { select: { id: true, name: true, avatarUrl: true } },
    },
  });

  logger.info('Live stream created', { streamId: stream.id, hostId });
  return stream;
}

/**
 * Get currently live streams, sorted by viewer count (paginated).
 */
export async function getActiveStreams(page = 1, limit = 20) {
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    db.liveStream.findMany({
      where: { status: 'LIVE' },
      orderBy: { viewerCount: 'desc' },
      include: { host: { select: { id: true, name: true, avatarUrl: true } } },
      skip,
      take: limit,
    }),
    db.liveStream.count({ where: { status: 'LIVE' } }),
  ]);

  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
}

/**
 * Get upcoming (scheduled) streams (paginated).
 */
export async function getUpcomingStreams(page = 1, limit = 20) {
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    db.liveStream.findMany({
      where: { status: 'SCHEDULED' },
      orderBy: { scheduledAt: 'asc' },
      include: { host: { select: { id: true, name: true, avatarUrl: true } } },
      skip,
      take: limit,
    }),
    db.liveStream.count({ where: { status: 'SCHEDULED' } }),
  ]);

  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
}

/**
 * Get a single stream by ID with host info and gift summary.
 */
export async function getStreamById(id: string) {
  const stream = await db.liveStream.findUnique({
    where: { id },
    include: {
      host: { select: { id: true, name: true, avatarUrl: true, city: true } },
      gifts: {
        orderBy: { createdAt: 'desc' },
        take: 10,
      },
    },
  });

  if (!stream) {
    throw AppError.notFound('Stream not found');
  }

  return stream;
}

/**
 * Start a stream — set status to LIVE and record startedAt.
 */
export async function startStream(streamId: string, hostId: string) {
  const stream = await db.liveStream.findUnique({ where: { id: streamId } });

  if (!stream) throw AppError.notFound('Stream not found');
  if (stream.hostId !== hostId) throw AppError.forbidden('Only the host can start this stream');
  if (stream.status === 'LIVE') throw new AppError('Stream is already live', 400);
  if (stream.status === 'ENDED') throw new AppError('Stream has already ended', 400);
  if (stream.status === 'CANCELLED') throw new AppError('Stream has been cancelled', 400);

  const updated = await db.liveStream.update({
    where: { id: streamId },
    data: { status: 'LIVE', startedAt: new Date() },
    include: { host: { select: { id: true, name: true, avatarUrl: true } } },
  });

  logger.info('Stream started', { streamId, hostId });
  return updated;
}

/**
 * End a stream — set status to ENDED and record endedAt.
 */
export async function endStream(streamId: string, hostId: string) {
  const stream = await db.liveStream.findUnique({ where: { id: streamId } });

  if (!stream) throw AppError.notFound('Stream not found');
  if (stream.hostId !== hostId) throw AppError.forbidden('Only the host can end this stream');
  if (stream.status === 'ENDED') throw new AppError('Stream has already ended', 400);

  const updated = await db.liveStream.update({
    where: { id: streamId },
    data: { status: 'ENDED', endedAt: new Date() },
    include: { host: { select: { id: true, name: true, avatarUrl: true } } },
  });

  logger.info('Stream ended', { streamId, hostId });
  return updated;
}

/**
 * Update viewer count; also update peak if new count exceeds previous peak.
 */
export async function updateViewerCount(streamId: string, count: number) {
  const stream = await db.liveStream.findUnique({
    where: { id: streamId },
    select: { peakViewers: true },
  });

  if (!stream) throw AppError.notFound('Stream not found');

  const updated = await db.liveStream.update({
    where: { id: streamId },
    data: {
      viewerCount: count,
      peakViewers: count > stream.peakViewers ? count : stream.peakViewers,
    },
  });

  return updated;
}

/**
 * Send a gift during a live stream.
 */
export async function sendGift(
  streamId: string,
  senderId: string,
  giftType: string,
  amount: number,
  message?: string,
) {
  const stream = await db.liveStream.findUnique({ where: { id: streamId } });
  if (!stream) throw AppError.notFound('Stream not found');
  if (stream.status !== 'LIVE') throw new AppError('Can only send gifts to live streams', 400);

  const [gift] = await Promise.all([
    db.streamGift.create({
      data: { streamId, senderId, giftType, amount, message: message ?? null },
    }),
    db.liveStream.update({
      where: { id: streamId },
      data: { giftsTotal: { increment: amount } },
    }),
  ]);

  logger.info('Gift sent', { streamId, senderId, giftType, amount });
  return gift;
}

/**
 * Get paginated gifts for a stream.
 */
export async function getStreamGifts(streamId: string, page = 1, limit = 20) {
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    db.streamGift.findMany({
      where: { streamId },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    db.streamGift.count({ where: { streamId } }),
  ]);

  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
}

/**
 * Get all streams created by a user (paginated).
 */
export async function getUserStreams(userId: string, page = 1, limit = 20) {
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    db.liveStream.findMany({
      where: { hostId: userId },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    db.liveStream.count({ where: { hostId: userId } }),
  ]);

  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
}

/**
 * Cancel a stream (only if not yet ended).
 */
export async function deleteStream(streamId: string, hostId: string) {
  const stream = await db.liveStream.findUnique({ where: { id: streamId } });

  if (!stream) throw AppError.notFound('Stream not found');
  if (stream.hostId !== hostId) throw AppError.forbidden('Only the host can cancel this stream');
  if (stream.status === 'ENDED') throw new AppError('Cannot cancel an ended stream', 400);

  const updated = await db.liveStream.update({
    where: { id: streamId },
    data: { status: 'CANCELLED' },
  });

  logger.info('Stream cancelled', { streamId, hostId });
  return updated;
}
