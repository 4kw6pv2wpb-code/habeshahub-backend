/**
 * Socket.io Gateway — Centralized real-time event hub.
 *
 * Channels:
 *   1. chat_messages  — Private/group messaging via threads
 *   2. notifications  — Push notifications for likes, comments, matches, etc.
 *   3. story_updates  — New story broadcasts, view counts
 *   4. feed_updates   — Real-time feed activity (new posts, trending)
 */

import { Server as SocketServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { redis } from '../config/redis';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import type { JwtPayload } from '../types';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

interface AuthenticatedSocket extends Socket {
  userId?: string;
  userName?: string;
}

interface ChatPayload {
  threadId: string;
  text?: string;
  mediaUrl?: string;
  mediaType?: string;
}

interface TypingPayload {
  threadId: string;
  isTyping: boolean;
}

interface StoryViewPayload {
  storyId: string;
}

// ─────────────────────────────────────────────
// Online presence tracking (Redis)
// ─────────────────────────────────────────────

const ONLINE_KEY = 'online_users';
const PRESENCE_TTL = 300; // 5 minutes

async function setOnline(userId: string, socketId: string): Promise<void> {
  await redis.hset(ONLINE_KEY, userId, JSON.stringify({ socketId, connectedAt: Date.now() }));
  await redis.expire(ONLINE_KEY, PRESENCE_TTL);
}

async function setOffline(userId: string): Promise<void> {
  await redis.hdel(ONLINE_KEY, userId);
}

async function getOnlineUsers(): Promise<string[]> {
  const all = await redis.hkeys(ONLINE_KEY);
  return all;
}

// ─────────────────────────────────────────────
// Gateway setup
// ─────────────────────────────────────────────

export function setupSocketGateway(io: SocketServer): void {
  // ── JWT Authentication Middleware ──
  io.use((socket: AuthenticatedSocket, next) => {
    const token = socket.handshake.auth?.token ?? socket.handshake.headers?.authorization?.replace('Bearer ', '');

    if (!token) {
      return next(new Error('Authentication required'));
    }

    try {
      const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
      socket.userId = decoded.sub;
      socket.userName = decoded.email;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', async (rawSocket: Socket) => {
    const socket = rawSocket as AuthenticatedSocket;
    const userId = socket.userId!;

    logger.info('Socket connected', { userId, socketId: socket.id });

    // Track online presence
    await setOnline(userId, socket.id);

    // Join user's personal room for notifications
    socket.join(`user:${userId}`);

    // Join rooms for all threads user participates in
    const threads = await prisma.thread.findMany({
      where: { participants: { some: { id: userId } } },
      select: { id: true },
    });
    for (const thread of threads) {
      socket.join(`thread:${thread.id}`);
    }

    // Broadcast updated online count
    const onlineUsers = await getOnlineUsers();
    io.emit('presence:count', { online: onlineUsers.length });

    // ──────────────────────────────────
    // Channel 1: chat_messages
    // ──────────────────────────────────

    socket.on('chat:send', async (payload: ChatPayload, ack?: (response: { success: boolean; messageId?: string; error?: string }) => void) => {
      try {
        const { threadId, text, mediaUrl, mediaType } = payload;

        // Verify user is a participant
        const thread = await prisma.thread.findFirst({
          where: { id: threadId, participants: { some: { id: userId } } },
        });

        if (!thread) {
          ack?.({ success: false, error: 'Thread not found or access denied' });
          return;
        }

        // Persist message
        const message = await prisma.message.create({
          data: {
            threadId,
            senderId: userId,
            text: text ?? null,
            mediaUrl: mediaUrl ?? null,
            mediaType: mediaType ?? null,
          },
        });

        // Update thread timestamp
        await prisma.thread.update({
          where: { id: threadId },
          data: { lastMessageAt: new Date() },
        });

        // Get sender info for broadcast
        const sender = await prisma.user.findUnique({
          where: { id: userId },
          select: { name: true, avatarUrl: true },
        });

        const outgoing = {
          id: message.id,
          threadId,
          senderId: userId,
          senderName: sender?.name ?? 'Unknown',
          senderAvatar: sender?.avatarUrl,
          text: message.text,
          mediaUrl: message.mediaUrl,
          mediaType: message.mediaType,
          createdAt: message.createdAt,
        };

        // Broadcast to all participants in the thread
        io.to(`thread:${threadId}`).emit('chat:message', outgoing);

        ack?.({ success: true, messageId: message.id });

        logger.debug('Chat message sent', { threadId, senderId: userId });
      } catch (error) {
        logger.error('chat:send error', { error, userId });
        ack?.({ success: false, error: 'Failed to send message' });
      }
    });

    socket.on('chat:typing', (payload: TypingPayload) => {
      socket.to(`thread:${payload.threadId}`).emit('chat:typing', {
        threadId: payload.threadId,
        userId,
        isTyping: payload.isTyping,
      });
    });

    socket.on('chat:read', async (payload: { threadId: string }) => {
      await prisma.message.updateMany({
        where: { threadId: payload.threadId, senderId: { not: userId }, isRead: false },
        data: { isRead: true },
      });

      socket.to(`thread:${payload.threadId}`).emit('chat:read_receipt', {
        threadId: payload.threadId,
        readBy: userId,
        readAt: new Date(),
      });
    });

    // ──────────────────────────────────
    // Channel 2: notifications
    // ──────────────────────────────────

    socket.on('notifications:subscribe', () => {
      // Already in user room, just acknowledge
      socket.emit('notifications:subscribed', { userId });
    });

    socket.on('notifications:mark_read', async (payload: { notificationId: string }) => {
      await prisma.notification.updateMany({
        where: { id: payload.notificationId, userId },
        data: { isRead: true },
      });
      socket.emit('notifications:updated', { id: payload.notificationId, isRead: true });
    });

    // ──────────────────────────────────
    // Channel 3: story_updates
    // ──────────────────────────────────

    socket.on('stories:view', async (payload: StoryViewPayload) => {
      try {
        await prisma.story.update({
          where: { id: payload.storyId },
          data: { viewCount: { increment: 1 } },
        });

        // Notify story author
        const story = await prisma.story.findUnique({
          where: { id: payload.storyId },
          select: { authorId: true },
        });

        if (story && story.authorId !== userId) {
          io.to(`user:${story.authorId}`).emit('stories:viewed', {
            storyId: payload.storyId,
            viewerId: userId,
          });
        }
      } catch (error) {
        logger.error('stories:view error', { error, userId });
      }
    });

    socket.on('stories:subscribe', () => {
      socket.join('stories:live');
      socket.emit('stories:subscribed', { channel: 'stories:live' });
    });

    // ──────────────────────────────────
    // Channel 4: feed_updates
    // ──────────────────────────────────

    socket.on('feed:subscribe', () => {
      socket.join('feed:live');
      socket.emit('feed:subscribed', { channel: 'feed:live' });
    });

    // ──────────────────────────────────
    // Disconnect
    // ──────────────────────────────────

    socket.on('disconnect', async (reason) => {
      await setOffline(userId);
      const remaining = await getOnlineUsers();
      io.emit('presence:count', { online: remaining.length });
      logger.info('Socket disconnected', { userId, reason });
    });
  });

  logger.info('Socket.io Gateway initialized with 4 channels: chat_messages, notifications, story_updates, feed_updates');
}

// ─────────────────────────────────────────────
// Server-side broadcast helpers
// (Call from controllers/services to push events)
// ─────────────────────────────────────────────

let _io: SocketServer | null = null;

export function setSocketServer(io: SocketServer): void {
  _io = io;
}

export function getSocketServer(): SocketServer | null {
  return _io;
}

/**
 * Push a notification to a specific user via socket.
 */
export function pushNotification(userId: string, notification: {
  id: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}): void {
  _io?.to(`user:${userId}`).emit('notifications:new', notification);
}

/**
 * Broadcast a new story to all subscribed users.
 */
export function broadcastNewStory(story: {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatar: string | null;
  mediaUrl: string;
  mediaType: string;
}): void {
  _io?.to('stories:live').emit('stories:new', story);
}

/**
 * Broadcast a new post to the live feed.
 */
export function broadcastNewPost(post: {
  id: string;
  authorId: string;
  authorName: string;
  content: string;
  mediaUrl: string | null;
}): void {
  _io?.to('feed:live').emit('feed:new_post', post);
}

/**
 * Broadcast a trending update (e.g., post crossing a like threshold).
 */
export function broadcastTrending(post: {
  id: string;
  likesCount: number;
  commentsCount: number;
}): void {
  _io?.to('feed:live').emit('feed:trending', post);
}

/**
 * Broadcast a new housing listing to the housing channel.
 */
export function broadcastNewListing(listing: {
  id: string;
  title: string;
  rent: number;
  city: string;
  listingType: string;
  posterName: string;
}): void {
  _io?.to('housing:live').emit('housing:new_listing', listing);
}

/**
 * Notify listing poster of a new inquiry.
 */
export function notifyHousingInquiry(posterId: string, inquiry: {
  id: string;
  listingId: string;
  listingTitle: string;
  senderName: string;
  message: string;
}): void {
  _io?.to(`user:${posterId}`).emit('housing:new_inquiry', inquiry);
}
