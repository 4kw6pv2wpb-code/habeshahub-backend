/**
 * Messaging service.
 * Handles thread management, message persistence, and Socket.io integration.
 */

import { Server as SocketServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/database';
import { AppError } from '../middlewares/errorHandler';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { parsePagination } from '../utils/helpers';
import { SOCKET_EVENTS } from '../utils/constants';
import { moderateContent } from './moderation.service';
import type {
  JwtPayload,
  SocketUser,
  IncomingMessage,
  OutgoingMessage,
  PaginationQuery,
} from '../types';

// ─────────────────────────────────────────────
// Online presence store (in-memory)
// In a multi-instance deployment, move this to Redis
// ─────────────────────────────────────────────

const onlineUsers = new Map<string, SocketUser>();

// ─────────────────────────────────────────────
// Socket.io setup
// ─────────────────────────────────────────────

/**
 * Attach Socket.io handlers and JWT auth to the io instance.
 * Called once during server startup.
 */
export function setupSocketHandlers(io: SocketServer): void {
  // ── Middleware: JWT authentication ──────────
  io.use((socket: Socket, next) => {
    const token =
      (socket.handshake.auth as { token?: string }).token ??
      socket.handshake.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return next(new Error('Authentication token required'));
    }

    try {
      const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
      (socket as Socket & { userId: string; userEmail: string }).userId =
        decoded.sub;
      (socket as Socket & { userId: string; userEmail: string }).userEmail =
        decoded.email;
      next();
    } catch {
      next(new Error('Invalid or expired token'));
    }
  });

  // ── Connection handler ───────────────────────
  io.on('connection', (socket: Socket) => {
    const userId = (socket as Socket & { userId: string }).userId;

    if (!userId) {
      socket.disconnect(true);
      return;
    }

    logger.info('Socket connected', { userId, socketId: socket.id });

    // Track online presence
    onlineUsers.set(userId, {
      userId,
      socketId: socket.id,
      connectedAt: new Date(),
    });

    // Notify others that this user is online
    socket.broadcast.emit(SOCKET_EVENTS.USER_ONLINE, { userId });

    // ── Join a thread room ───────────────────
    socket.on(SOCKET_EVENTS.JOIN_THREAD, async (threadId: string) => {
      // Verify user is a participant in this thread
      const thread = await prisma.thread.findFirst({
        where: {
          id: threadId,
          participants: { some: { id: userId } },
        },
      });

      if (!thread) {
        socket.emit(SOCKET_EVENTS.ERROR, { message: 'Thread not found or access denied' });
        return;
      }

      await socket.join(threadId);
      logger.debug('User joined thread room', { userId, threadId });
    });

    // ── Leave a thread room ──────────────────
    socket.on(SOCKET_EVENTS.LEAVE_THREAD, (threadId: string) => {
      socket.leave(threadId);
      logger.debug('User left thread room', { userId, threadId });
    });

    // ── Send message ─────────────────────────
    socket.on(SOCKET_EVENTS.SEND_MESSAGE, async (payload: IncomingMessage) => {
      try {
        const message = await sendMessage(userId, payload, io);
        logger.debug('Message sent via socket', {
          messageId: message.id,
          threadId: payload.threadId,
        });
      } catch (err) {
        const message = err instanceof AppError ? err.message : 'Failed to send message';
        socket.emit(SOCKET_EVENTS.ERROR, { message });
        logger.error('Socket message error', { error: (err as Error).message, userId });
      }
    });

    // ── Typing indicators ────────────────────
    socket.on(SOCKET_EVENTS.TYPING_START, (threadId: string) => {
      socket.to(threadId).emit(SOCKET_EVENTS.TYPING_INDICATOR, {
        userId,
        threadId,
        isTyping: true,
      });
    });

    socket.on(SOCKET_EVENTS.TYPING_STOP, (threadId: string) => {
      socket.to(threadId).emit(SOCKET_EVENTS.TYPING_INDICATOR, {
        userId,
        threadId,
        isTyping: false,
      });
    });

    // ── Disconnect ───────────────────────────
    socket.on('disconnect', () => {
      onlineUsers.delete(userId);
      socket.broadcast.emit(SOCKET_EVENTS.USER_OFFLINE, { userId });
      logger.info('Socket disconnected', { userId, socketId: socket.id });
    });
  });
}

// ─────────────────────────────────────────────
// Message operations (also called via HTTP)
// ─────────────────────────────────────────────

/**
 * Create a new message in a thread and broadcast it over Socket.io.
 */
export async function sendMessage(
  senderId: string,
  input: IncomingMessage,
  io?: SocketServer,
): Promise<OutgoingMessage> {
  const { threadId, text, mediaUrl, mediaType } = input;

  // Validate thread membership
  const thread = await prisma.thread.findFirst({
    where: {
      id: threadId,
      participants: { some: { id: senderId } },
    },
    select: { id: true },
  });

  if (!thread) {
    throw AppError.notFound('Thread not found or you are not a participant');
  }

  if (!text && !mediaUrl) {
    throw AppError.badRequest('Message must contain text or media');
  }

  // Moderate text content
  if (text) {
    const modResult = await moderateContent(text);
    if (!modResult.isSafe) {
      throw AppError.badRequest(
        'Message was flagged for inappropriate content',
        'CONTENT_FLAGGED',
      );
    }
  }

  // Fetch sender for the response payload
  const sender = await prisma.user.findUnique({
    where: { id: senderId },
    select: { id: true, name: true },
  });

  if (!sender) {
    throw AppError.unauthorized('Sender not found');
  }

  // Persist message and update thread timestamp
  const [message] = await prisma.$transaction([
    prisma.message.create({
      data: {
        threadId,
        senderId,
        text: text ?? null,
        mediaUrl: mediaUrl ?? null,
        mediaType: mediaType ?? null,
      },
    }),
    prisma.thread.update({
      where: { id: threadId },
      data: { lastMessageAt: new Date() },
    }),
  ]);

  const outgoing: OutgoingMessage = {
    id: message.id,
    threadId: message.threadId,
    senderId: message.senderId,
    senderName: sender.name,
    text: message.text,
    mediaUrl: message.mediaUrl,
    createdAt: message.createdAt,
  };

  // Broadcast to all thread participants via Socket.io (if available)
  if (io) {
    io.to(threadId).emit(SOCKET_EVENTS.NEW_MESSAGE, outgoing);
  }

  return outgoing;
}

/**
 * Get or create a direct-message thread between two users.
 */
export async function getOrCreateThread(
  userAId: string,
  userBId: string,
): Promise<{ id: string; isNew: boolean }> {
  // Look for an existing 1-on-1 thread between these two users
  const existing = await prisma.thread.findFirst({
    where: {
      isGroup: false,
      participants: { every: { id: { in: [userAId, userBId] } } },
    },
    select: { id: true },
  });

  if (existing) {
    return { id: existing.id, isNew: false };
  }

  // Create a new thread
  const thread = await prisma.thread.create({
    data: {
      isGroup: false,
      participants: {
        connect: [{ id: userAId }, { id: userBId }],
      },
    },
  });

  logger.info('New DM thread created', { threadId: thread.id, userAId, userBId });
  return { id: thread.id, isNew: true };
}

/**
 * Get paginated messages for a thread.
 */
export async function getThreadMessages(
  threadId: string,
  userId: string,
  paginationQuery: PaginationQuery,
) {
  // Validate membership
  const thread = await prisma.thread.findFirst({
    where: {
      id: threadId,
      participants: { some: { id: userId } },
    },
    select: { id: true, isGroup: true, groupName: true },
  });

  if (!thread) {
    throw AppError.notFound('Thread not found or access denied');
  }

  const { page, limit, skip } = parsePagination(paginationQuery);

  const [messages, total] = await Promise.all([
    prisma.message.findMany({
      where: { threadId, status: 'ACTIVE' },
      include: {
        sender: {
          select: { id: true, name: true, avatarUrl: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip,
    }),
    prisma.message.count({ where: { threadId, status: 'ACTIVE' } }),
  ]);

  // Mark messages as read
  await prisma.message.updateMany({
    where: {
      threadId,
      senderId: { not: userId },
      isRead: false,
    },
    data: { isRead: true },
  });

  return { messages: messages.reverse(), total, page, limit };
}

/**
 * Get all threads for a user with last message preview.
 */
export async function getUserThreads(userId: string) {
  const threads = await prisma.thread.findMany({
    where: {
      participants: { some: { id: userId } },
    },
    include: {
      participants: {
        select: { id: true, name: true, avatarUrl: true },
      },
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: {
          id: true,
          text: true,
          mediaUrl: true,
          createdAt: true,
          isRead: true,
          sender: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { lastMessageAt: 'desc' },
  });

  return threads;
}

/**
 * Return the set of currently online user IDs.
 */
export function getOnlineUsers(): string[] {
  return Array.from(onlineUsers.keys());
}
