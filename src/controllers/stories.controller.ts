/**
 * Stories controller.
 * Handles /stories routes.
 */

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as StoriesService from '../services/stories.service';
import { AppError } from '../middlewares/errorHandler';
import type { AuthenticatedRequest } from '../types';

// ─────────────────────────────────────────────
// Zod schemas
// ─────────────────────────────────────────────

export const createStorySchema = z.object({
  mediaUrl: z.string().url('mediaUrl must be a valid URL'),
  mediaType: z.enum(['image', 'video']).optional(),
  caption: z.string().max(500).optional(),
});

// ─────────────────────────────────────────────
// Handlers
// ─────────────────────────────────────────────

/**
 * POST /stories
 * Create a new 24-hour story.
 */
export async function createStory(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id: authorId } = (req as AuthenticatedRequest).user;
    const input = createStorySchema.parse(req.body);

    const story = await StoriesService.createStory(authorId, input);

    res.status(201).json({
      success: true,
      data: story,
      message: 'Story published (expires in 24 hours)',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /stories/feed
 * Get active stories feed.
 */
export async function getStoriesFeed(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id: viewerId } = (req as AuthenticatedRequest).user;
    const stories = await StoriesService.getStoriesFeed(viewerId);

    res.status(200).json({
      success: true,
      data: stories,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /stories/:id
 * Get a single story.
 */
export async function getStory(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const story = await StoriesService.getStoryById(req.params.id);
    res.status(200).json({ success: true, data: story });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /stories/:id
 * Delete own story.
 */
export async function deleteStory(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id: userId } = (req as AuthenticatedRequest).user;
    await StoriesService.deleteStory(req.params.id, userId);

    res.status(200).json({
      success: true,
      message: 'Story deleted',
    });
  } catch (err) {
    next(err);
  }
}
