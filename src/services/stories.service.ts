/**
 * Stories service.
 * Handles creation, expiration, and feed retrieval for 24-hour stories.
 */

import { prisma } from '../config/database';
import { AppError } from '../middlewares/errorHandler';
import { logger } from '../utils/logger';
import { hoursFromNow } from '../utils/helpers';
import { STORY_TTL_HOURS } from '../utils/constants';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface CreateStoryInput {
  mediaUrl: string;
  mediaType?: string;
  caption?: string;
}

// ─────────────────────────────────────────────
// Service operations
// ─────────────────────────────────────────────

/**
 * Create a new story that expires in 24 hours.
 */
export async function createStory(authorId: string, input: CreateStoryInput) {
  const expiresAt = hoursFromNow(STORY_TTL_HOURS);

  const story = await prisma.story.create({
    data: {
      authorId,
      mediaUrl: input.mediaUrl,
      mediaType: input.mediaType ?? 'image',
      caption: input.caption ?? null,
      expiresAt,
    },
    include: {
      author: {
        select: { id: true, name: true, avatarUrl: true, city: true },
      },
    },
  });

  logger.info('Story created', {
    storyId: story.id,
    authorId,
    expiresAt: story.expiresAt,
  });

  return story;
}

/**
 * Get the story feed — active (non-expired) stories from all users,
 * ordered by most recent.
 */
export async function getStoriesFeed(viewerId: string) {
  const now = new Date();

  const stories = await prisma.story.findMany({
    where: {
      status: 'ACTIVE',
      expiresAt: { gt: now }, // Only non-expired stories
    },
    include: {
      author: {
        select: { id: true, name: true, avatarUrl: true, city: true },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 50, // Limit to 50 stories in feed
  });

  // Increment view count for all fetched stories (fire-and-forget)
  const storyIds = stories.map((s) => s.id);
  prisma.story
    .updateMany({
      where: { id: { in: storyIds } },
      data: { viewCount: { increment: 1 } },
    })
    .catch((err: Error) => {
      logger.error('Failed to update story view counts', { error: err.message });
    });

  logger.debug('Stories feed fetched', { viewerId, count: stories.length });

  return stories;
}

/**
 * Get a single story by ID. Returns null if expired.
 */
export async function getStoryById(storyId: string) {
  const story = await prisma.story.findFirst({
    where: {
      id: storyId,
      status: 'ACTIVE',
      expiresAt: { gt: new Date() },
    },
    include: {
      author: {
        select: { id: true, name: true, avatarUrl: true },
      },
    },
  });

  if (!story) {
    throw AppError.notFound('Story not found or has expired');
  }

  return story;
}

/**
 * Delete expired stories.
 * This can be scheduled as a cron job or called periodically.
 * Marks stories as REMOVED rather than hard-deleting for audit purposes.
 */
export async function expireStories(): Promise<number> {
  const result = await prisma.story.updateMany({
    where: {
      expiresAt: { lte: new Date() },
      status: 'ACTIVE',
    },
    data: { status: 'REMOVED' },
  });

  if (result.count > 0) {
    logger.info('Expired stories archived', { count: result.count });
  }

  return result.count;
}

/**
 * Delete a story (by the author only).
 */
export async function deleteStory(storyId: string, requesterId: string) {
  const story = await prisma.story.findUnique({
    where: { id: storyId },
    select: { id: true, authorId: true },
  });

  if (!story) {
    throw AppError.notFound('Story not found');
  }

  if (story.authorId !== requesterId) {
    throw AppError.forbidden('You can only delete your own stories');
  }

  await prisma.story.update({
    where: { id: storyId },
    data: { status: 'REMOVED' },
  });

  logger.info('Story deleted', { storyId, requesterId });
}
