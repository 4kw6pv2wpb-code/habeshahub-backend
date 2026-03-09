/**
 * Recommendation Engine Service.
 * Computes engagement-ranked content scores using the formula:
 *   score = (likes*2) + (comments*3) + (shares*4) + freshness + language_match + location_match
 *
 * Also handles job recommendations, event suggestions, and user discovery.
 */

import { prisma } from '../config/database';
import { redis } from '../config/redis';
import { logger } from '../utils/logger';
import type { Language } from '@prisma/client';

// ─────────────────────────────────────────────
// Score Weights
// ─────────────────────────────────────────────

const WEIGHTS = {
  LIKES: 2,
  COMMENTS: 3,
  SHARES: 4,         // Future: shares tracking
  FRESHNESS_HALF_LIFE: 24,  // hours — score halves every 24h
  LANGUAGE_MATCH: 15,
  LOCATION_MATCH: 10,
  SAME_CITY: 8,
  SAME_COUNTRY: 4,
} as const;

const FEED_CACHE_TTL = 300; // 5 minutes

interface UserContext {
  userId: string;
  languages: Language[];
  city: string | null;
  country: string | null;
}

interface ScoredPost {
  postId: string;
  score: number;
  breakdown: {
    engagement: number;
    freshness: number;
    languageBoost: number;
    locationBoost: number;
  };
}

interface ScoredJob {
  jobId: string;
  score: number;
  reasons: string[];
}

export const recommendationService = {
  /**
   * Compute engagement score for a post relative to a viewer.
   */
  computePostScore(
    post: {
      likesCount: number;
      commentsCount: number;
      createdAt: Date;
      authorLanguages: Language[];
      authorCity: string | null;
      authorCountry: string | null;
    },
    viewer: UserContext,
  ): ScoredPost & { postId: string } {
    // Engagement score
    const engagement =
      post.likesCount * WEIGHTS.LIKES +
      post.commentsCount * WEIGHTS.COMMENTS;

    // Freshness decay (exponential)
    const hoursOld = (Date.now() - post.createdAt.getTime()) / (1000 * 60 * 60);
    const freshness = Math.max(0, 100 * Math.exp(-hoursOld / WEIGHTS.FRESHNESS_HALF_LIFE));

    // Language match boost
    const sharedLanguages = post.authorLanguages.filter((lang) =>
      viewer.languages.includes(lang),
    );
    const languageBoost = sharedLanguages.length > 0 ? WEIGHTS.LANGUAGE_MATCH * sharedLanguages.length : 0;

    // Location match boost
    let locationBoost = 0;
    if (post.authorCity && viewer.city && post.authorCity === viewer.city) {
      locationBoost = WEIGHTS.SAME_CITY;
    } else if (post.authorCountry && viewer.country && post.authorCountry === viewer.country) {
      locationBoost = WEIGHTS.SAME_COUNTRY;
    }

    const score = engagement + freshness + languageBoost + locationBoost;

    return {
      postId: '',
      score: Math.round(score * 100) / 100,
      breakdown: {
        engagement,
        freshness: Math.round(freshness * 100) / 100,
        languageBoost,
        locationBoost,
      },
    };
  },

  /**
   * Get a personalized feed for a user, ranked by the recommendation algorithm.
   */
  async getPersonalizedFeed(
    userId: string,
    options: { page?: number; limit?: number } = {},
  ) {
    const { page = 1, limit = 20 } = options;

    // Check cache
    const cacheKey = `feed:${userId}:${page}:${limit}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // Get viewer context
    const viewer = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, languages: true, city: true, country: true },
    });

    if (!viewer) throw new Error('User not found');

    const viewerContext: UserContext = {
      userId: viewer.id,
      languages: viewer.languages,
      city: viewer.city,
      country: viewer.country,
    };

    // Fetch recent posts (last 7 days, max 500 for scoring)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const posts = await prisma.post.findMany({
      where: {
        status: 'ACTIVE',
        createdAt: { gte: sevenDaysAgo },
      },
      include: {
        author: {
          select: { id: true, name: true, avatarUrl: true, city: true, country: true, languages: true },
        },
      },
      take: 500,
      orderBy: { createdAt: 'desc' },
    });

    // Score and rank
    const scored: (ScoredPost & { post: typeof posts[0] })[] = posts.map((post) => {
      const result = this.computePostScore(
        {
          likesCount: post.likesCount,
          commentsCount: post.commentsCount,
          createdAt: post.createdAt,
          authorLanguages: post.author.languages,
          authorCity: post.author.city,
          authorCountry: post.author.country,
        },
        viewerContext,
      );
      return { ...result, postId: post.id, post };
    });

    scored.sort((a, b) => b.score - a.score);

    // Paginate
    const start = (page - 1) * limit;
    const paged = scored.slice(start, start + limit);

    const result = {
      posts: paged.map(({ post, score, breakdown }) => ({
        ...post,
        _score: score,
        _breakdown: breakdown,
      })),
      meta: {
        page,
        limit,
        total: scored.length,
        totalPages: Math.ceil(scored.length / limit),
      },
    };

    // Cache for 5 minutes
    await redis.set(cacheKey, JSON.stringify(result), 'EX', FEED_CACHE_TTL);

    logger.info('Personalized feed generated', { userId, postsScored: scored.length });

    return result;
  },

  /**
   * Recommend jobs to a user based on skills, location, and language match.
   */
  async recommendJobs(
    userId: string,
    options: { limit?: number } = {},
  ): Promise<ScoredJob[]> {
    const { limit = 10 } = options;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { city: true, country: true, languages: true, bio: true },
    });

    if (!user) return [];

    const jobs = await prisma.job.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    // Score each job
    const scored: ScoredJob[] = jobs.map((job) => {
      let score = 0;
      const reasons: string[] = [];

      // Location match
      if (job.remote) {
        score += 5;
        reasons.push('Remote-friendly');
      }
      if (job.city && user.city && job.city.toLowerCase() === user.city.toLowerCase()) {
        score += 10;
        reasons.push(`In ${job.city}`);
      }
      if (job.country && user.country && job.country.toLowerCase() === user.country.toLowerCase()) {
        score += 3;
      }

      // Freshness — newer jobs score higher
      const daysOld = (Date.now() - job.createdAt.getTime()) / (1000 * 60 * 60 * 24);
      score += Math.max(0, 10 - daysOld);

      // Pay indicator
      if (job.payMin && job.payMin > 50000) {
        score += 2;
        reasons.push('Competitive pay');
      }

      return { jobId: job.id, score: Math.round(score * 100) / 100, reasons };
    });

    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, limit);
  },

  /**
   * Suggest events based on location and interest overlap.
   */
  async recommendEvents(userId: string, limit: number = 10) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { city: true, country: true },
    });

    if (!user) return [];

    const upcomingEvents = await prisma.event.findMany({
      where: {
        date: { gte: new Date() },
        isPublic: true,
      },
      include: {
        organizer: { select: { name: true, avatarUrl: true } },
        _count: { select: { attendees: true } },
      },
      orderBy: { date: 'asc' },
      take: 50,
    });

    // Score events
    const scored = upcomingEvents.map((event) => {
      let score = 0;

      // Location match
      if (event.city && user.city && event.city.toLowerCase() === user.city.toLowerCase()) {
        score += 15;
      }
      if (event.isOnline) {
        score += 5; // Online events accessible to everyone
      }

      // Popularity
      score += Math.min(event._count.attendees, 20);

      // Sooner events score higher
      const daysUntil = (event.date.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
      score += Math.max(0, 15 - daysUntil);

      return { event, score };
    });

    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, limit).map(({ event, score }) => ({ ...event, _score: score }));
  },

  /**
   * Invalidate feed cache for a user (call after new post, like, etc.)
   */
  async invalidateFeed(userId: string) {
    const keys = await redis.keys(`feed:${userId}:*`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  },
};
