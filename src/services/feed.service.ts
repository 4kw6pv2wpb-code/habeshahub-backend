/**
 * Feed recommendation service.
 * Implements the scoring formula:
 *   score = (likes * 2) + (comments * 3) + freshness_decay + language_match + location_match
 *
 * freshness_decay = Math.max(0, 1 - (hoursAge / 168))   // decays over 1 week
 * language_match  = author shares a language with viewer  ? 0.3 : 0
 * location_match  = same city                            ? 0.2 : 0
 */

import { prisma } from '../config/database';
import { AppError } from '../middlewares/errorHandler';
import { logger } from '../utils/logger';
import { hoursAgo, parsePagination } from '../utils/helpers';
import {
  FEED_FRESHNESS_DECAY_HOURS,
  FEED_LIKE_WEIGHT,
  FEED_COMMENT_WEIGHT,
  FEED_LANGUAGE_MATCH_BOOST,
  FEED_LOCATION_MATCH_BOOST,
} from '../utils/constants';
import type { FeedPost, FeedScoreInput, PaginationQuery } from '../types';
import { Language } from '@prisma/client';

// ─────────────────────────────────────────────
// Score calculation
// ─────────────────────────────────────────────

/**
 * Calculate the recommendation score for a single post relative to the viewer.
 */
export function calculateFeedScore(input: FeedScoreInput): number {
  const {
    likesCount,
    commentsCount,
    createdAt,
    authorLanguages,
    authorCity,
    viewerLanguages,
    viewerCity,
  } = input;

  // Engagement signals
  const engagementScore =
    likesCount * FEED_LIKE_WEIGHT + commentsCount * FEED_COMMENT_WEIGHT;

  // Freshness decay: 1.0 when brand new → 0.0 after 1 week
  const hours = hoursAgo(createdAt);
  const freshnessDecay = Math.max(0, 1 - hours / FEED_FRESHNESS_DECAY_HOURS);

  // Language overlap: 0.3 bonus if any shared language
  const hasSharedLanguage = authorLanguages.some((lang: Language) =>
    viewerLanguages.includes(lang),
  );
  const languageMatch = hasSharedLanguage ? FEED_LANGUAGE_MATCH_BOOST : 0;

  // Location match: 0.2 bonus if same city
  const locationMatch =
    authorCity && viewerCity && authorCity.toLowerCase() === viewerCity.toLowerCase()
      ? FEED_LOCATION_MATCH_BOOST
      : 0;

  return engagementScore + freshnessDecay + languageMatch + locationMatch;
}

// ─────────────────────────────────────────────
// Feed retrieval
// ─────────────────────────────────────────────

/**
 * Fetch and rank the feed for a given user.
 * Returns paginated, scored posts.
 */
export async function getPersonalisedFeed(
  userId: string,
  paginationQuery: PaginationQuery,
): Promise<{ posts: FeedPost[]; total: number; page: number; limit: number }> {
  // Fetch viewer preferences for personalisation
  const viewer = await prisma.user.findUnique({
    where: { id: userId },
    select: { languages: true, city: true },
  });

  if (!viewer) {
    throw AppError.notFound('User not found');
  }

  const { page, limit, skip } = parsePagination(paginationQuery);

  // Fetch a larger candidate pool for scoring (3× the limit)
  // then sort by score in application code
  const candidateLimit = limit * 3;
  const candidateOffset = skip; // rough offset for pagination

  const [posts, total] = await Promise.all([
    prisma.post.findMany({
      where: { status: 'ACTIVE' },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
            city: true,
            languages: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: candidateLimit,
      skip: candidateOffset,
    }),
    prisma.post.count({ where: { status: 'ACTIVE' } }),
  ]);

  // Score each post relative to the current viewer
  const scored: FeedPost[] = posts.map((post) => {
    const score = calculateFeedScore({
      likesCount: post.likesCount,
      commentsCount: post.commentsCount,
      createdAt: post.createdAt,
      authorLanguages: post.author.languages,
      authorCity: post.author.city,
      viewerLanguages: viewer.languages,
      viewerCity: viewer.city,
    });

    return {
      id: post.id,
      content: post.content,
      mediaUrl: post.mediaUrl,
      mediaType: post.mediaType,
      likesCount: post.likesCount,
      commentsCount: post.commentsCount,
      createdAt: post.createdAt,
      score,
      author: post.author,
    };
  });

  // Sort descending by score, then take the requested page slice
  scored.sort((a, b) => b.score - a.score);
  const paginated = scored.slice(0, limit);

  logger.debug('Feed generated', {
    userId,
    total,
    scored: scored.length,
    returned: paginated.length,
  });

  return { posts: paginated, total, page, limit };
}

// ─────────────────────────────────────────────
// Post creation (used by controller)
// ─────────────────────────────────────────────

export async function createPost(
  authorId: string,
  data: { content: string; mediaUrl?: string; mediaType?: string },
) {
  const post = await prisma.post.create({
    data: {
      authorId,
      content: data.content,
      mediaUrl: data.mediaUrl ?? null,
      mediaType: data.mediaType ?? null,
    },
    include: {
      author: {
        select: { id: true, name: true, avatarUrl: true },
      },
    },
  });

  logger.info('Post created', { postId: post.id, authorId });
  return post;
}

/**
 * Toggle like on a post. Returns updated like count.
 */
export async function togglePostLike(
  postId: string,
  userId: string,
): Promise<{ liked: boolean; likesCount: number }> {
  // Check for existing like
  const existing = await prisma.like.findUnique({
    where: { postId_userId: { postId, userId } },
  });

  if (existing) {
    // Unlike: remove like record and decrement counter
    await prisma.$transaction([
      prisma.like.delete({ where: { postId_userId: { postId, userId } } }),
      prisma.post.update({
        where: { id: postId },
        data: { likesCount: { decrement: 1 } },
      }),
    ]);
    return { liked: false, likesCount: await getPostLikeCount(postId) };
  } else {
    // Like: create record and increment counter
    await prisma.$transaction([
      prisma.like.create({ data: { postId, userId } }),
      prisma.post.update({
        where: { id: postId },
        data: { likesCount: { increment: 1 } },
      }),
    ]);
    return { liked: true, likesCount: await getPostLikeCount(postId) };
  }
}

async function getPostLikeCount(postId: string): Promise<number> {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { likesCount: true },
  });
  return post?.likesCount ?? 0;
}
