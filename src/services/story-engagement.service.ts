/**
 * Story Engagement service.
 * Handles views, reactions, and stats for stories.
 */

import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';
import { AppError } from '../middlewares/errorHandler';

const prisma = new PrismaClient();
const db = prisma as any; // For models not yet generated

// ─────────────────────────────────────────────
// Views
// ─────────────────────────────────────────────

/**
 * Record a story view. Creates a new record or updates the timestamp if already viewed.
 * Also increments the story's aggregate viewCount.
 */
export async function viewStory(storyId: string, viewerId: string) {
  const story = await prisma.story.findUnique({
    where: { id: storyId },
    select: { id: true, authorId: true },
  });

  if (!story) {
    throw AppError.notFound('Story not found');
  }

  const existing = await db.storyView.findFirst({
    where: { storyId, viewerId },
  });

  let view;
  if (existing) {
    view = await db.storyView.update({
      where: { id: existing.id },
      data: { viewedAt: new Date() },
    });
  } else {
    view = await db.storyView.create({
      data: { storyId, viewerId },
    });

    // Only increment on first view
    await prisma.story.update({
      where: { id: storyId },
      data: { viewCount: { increment: 1 } },
    });
  }

  logger.debug('Story viewed', { storyId, viewerId });
  return view;
}

// ─────────────────────────────────────────────
// Reactions
// ─────────────────────────────────────────────

/**
 * Add or update a reaction to a story (upsert by storyId + userId).
 */
export async function reactToStory(storyId: string, userId: string, emoji: string) {
  const story = await prisma.story.findUnique({
    where: { id: storyId },
    select: { id: true },
  });

  if (!story) {
    throw AppError.notFound('Story not found');
  }

  const reaction = await db.storyReaction.upsert({
    where: {
      storyId_userId: { storyId, userId },
    },
    update: { emoji },
    create: { storyId, userId, emoji },
  });

  logger.debug('Story reaction added', { storyId, userId, emoji });
  return reaction;
}

/**
 * Remove a user's reaction from a story.
 */
export async function removeReaction(storyId: string, userId: string) {
  const reaction = await db.storyReaction.findUnique({
    where: {
      storyId_userId: { storyId, userId },
    },
  });

  if (!reaction) {
    throw AppError.notFound('Reaction not found');
  }

  await db.storyReaction.delete({
    where: { storyId_userId: { storyId, userId } },
  });

  logger.debug('Story reaction removed', { storyId, userId });
  return { deleted: true };
}

// ─────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────

/**
 * Get paginated list of viewers for a story.
 */
export async function getStoryViews(storyId: string, page = 1, limit = 20) {
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    db.storyView.findMany({
      where: { storyId },
      orderBy: { viewedAt: 'desc' },
      skip,
      take: limit,
      include: {
        viewer: { select: { id: true, name: true, avatarUrl: true } },
      },
    }),
    db.storyView.count({ where: { storyId } }),
  ]);

  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
}

/**
 * Get all reactions for a story — grouped by emoji count plus full list.
 */
export async function getStoryReactions(storyId: string) {
  const [reactions, grouped] = await Promise.all([
    db.storyReaction.findMany({
      where: { storyId },
      orderBy: { createdAt: 'desc' },
    }),
    db.storyReaction.groupBy({
      by: ['emoji'],
      where: { storyId },
      _count: { emoji: true },
      orderBy: { _count: { emoji: 'desc' } },
    }),
  ]);

  return {
    total: reactions.length,
    grouped: grouped.map((g: any) => ({ emoji: g.emoji, count: g._count.emoji })),
    reactions,
  };
}

// ─────────────────────────────────────────────
// User Stats
// ─────────────────────────────────────────────

/**
 * Get aggregate view and reaction stats across all of a user's stories.
 */
export async function getMyStoryStats(userId: string) {
  const stories = await prisma.story.findMany({
    where: { authorId: userId },
    select: { id: true, viewCount: true, createdAt: true, expiresAt: true },
  });

  if (stories.length === 0) {
    return {
      totalStories: 0,
      totalViews: 0,
      totalReactions: 0,
      storyBreakdown: [],
    };
  }

  const storyIds = stories.map((s) => s.id);

  const [totalViews, totalReactions] = await Promise.all([
    db.storyView.count({ where: { storyId: { in: storyIds } } }),
    db.storyReaction.count({ where: { storyId: { in: storyIds } } }),
  ]);

  const storyBreakdown = await Promise.all(
    stories.map(async (s) => {
      const [views, reactions] = await Promise.all([
        db.storyView.count({ where: { storyId: s.id } }),
        db.storyReaction.count({ where: { storyId: s.id } }),
      ]);
      return { storyId: s.id, views, reactions, createdAt: s.createdAt };
    }),
  );

  return {
    totalStories: stories.length,
    totalViews,
    totalReactions,
    storyBreakdown,
  };
}
