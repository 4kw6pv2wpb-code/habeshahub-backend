/**
 * Messages controller.
 * Handles HTTP fallback for /messages routes (Socket.io is the primary channel).
 */

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as MessagingService from '../services/messaging.service';
import { buildPaginationMeta, parsePagination } from '../utils/helpers';
import type { AuthenticatedRequest } from '../types';

// ─────────────────────────────────────────────
// Zod schemas
// ─────────────────────────────────────────────

export const sendMessageSchema = z.object({
  recipientId: z.string().uuid('Invalid recipient ID').optional(),
  threadId: z.string().uuid('Invalid thread ID').optional(),
  text: z.string().max(10000).optional(),
  mediaUrl: z.string().url().optional(),
  mediaType: z.enum(['image', 'video', 'audio', 'file']).optional(),
}).refine(
  (data) => data.recipientId || data.threadId,
  { message: 'Either recipientId or threadId must be provided' },
).refine(
  (data) => data.text || data.mediaUrl,
  { message: 'Message must contain text or media' },
);

// ─────────────────────────────────────────────
// Handlers
// ─────────────────────────────────────────────

/**
 * GET /messages
 * List all threads for the authenticated user.
 */
export async function getThreads(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id: userId } = (req as AuthenticatedRequest).user;
    const threads = await MessagingService.getUserThreads(userId);

    res.status(200).json({
      success: true,
      data: threads,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /messages/thread/:threadId
 * Get paginated messages for a specific thread.
 */
export async function getMessages(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id: userId } = (req as AuthenticatedRequest).user;
    const { threadId } = req.params;
    const { page, limit } = parsePagination(req.query as { page?: number; limit?: number });

    const result = await MessagingService.getThreadMessages(threadId, userId, {
      page,
      limit,
    });

    res.status(200).json({
      success: true,
      data: result.messages,
      meta: buildPaginationMeta(result.total, result.page, result.limit),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /messages
 * Send a message via HTTP (alternative to Socket.io).
 */
export async function sendMessage(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id: senderId } = (req as AuthenticatedRequest).user;
    const input = sendMessageSchema.parse(req.body);

    let threadId: string;

    if (input.threadId) {
      threadId = input.threadId;
    } else {
      // Create or get DM thread with recipient
      const { id } = await MessagingService.getOrCreateThread(
        senderId,
        input.recipientId!,
      );
      threadId = id;
    }

    const message = await MessagingService.sendMessage(senderId, {
      threadId,
      text: input.text,
      mediaUrl: input.mediaUrl,
      mediaType: input.mediaType,
    });

    res.status(201).json({
      success: true,
      data: message,
      message: 'Message sent',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /messages/online
 * Returns currently online user IDs.
 */
export async function getOnlineUsers(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const online = MessagingService.getOnlineUsers();
    res.status(200).json({ success: true, data: { onlineUsers: online } });
  } catch (err) {
    next(err);
  }
}
