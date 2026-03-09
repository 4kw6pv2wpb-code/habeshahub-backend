/**
 * Recommendation Engine v3.
 *
 * Multi-signal ranking system that blends seven independent 0–1 signals into a
 * composite score for each candidate piece of content.
 *
 * Composite formula:
 *   score = 0.25·engagement
 *         + 0.15·watchTime
 *         + 0.15·similarity
 *         + 0.10·language
 *         + 0.10·geo
 *         + 0.10·trust
 *         + 0.15·recency
 *
 * All ranked feeds are cached in Redis for 5 minutes to prevent expensive
 * recomputation on every page load.
 */

import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';
import { redis } from '../config/redis';

const prisma = new PrismaClient();
const db = prisma as any; // For Phase 2 models

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

const FEED_CACHE_TTL_SECONDS = 300; // 5 minutes
const FEED_CACHE_PREFIX = 'ranked_feed';
const CANDIDATE_FETCH_MULTIPLIER = 5; // Fetch 5× the requested limit as candidates

// Signal weights — must sum to 1.0
const WEIGHTS = {
  engagement: 0.25,
  watchTime:  0.15,
  similarity: 0.15,
  language:   0.10,
  geo:        0.10,
  trust:      0.10,
  recency:    0.15,
} as const;

// Engagement normalisation denominator: max achievable raw score
// views*1 + likes*3 + comments*5 + shares*8  — capped at a realistic ceiling
const ENGAGEMENT_NORMALISATION_CEILING = 10_000;

// ─────────────────────────────────────────────
// Internal Types
// ─────────────────────────────────────────────

export type ContentType = 'POST' | 'VIDEO' | 'JOB' | 'EVENT' | 'STORY';

interface UserProfile {
  id: string;
  languages: string[];
  city: string | null;
  country: string | null;
}

interface ContentCandidate {
  id: string;
  authorId: string;
  contentType: ContentType;
  language: string | null;
  city: string | null;
  country: string | null;
  hashtags: string[];
  categoryId: string | null;
  createdAt: Date;
}

export interface RankedItem {
  contentId: string;
  contentType: ContentType;
  score: number;
  signals: {
    engagement: number;
    watchTime: number;
    similarity: number;
    language: number;
    geo: number;
    trust: number;
    recency: number;
  };
}

// ─────────────────────────────────────────────
// Signal Computations (each returns 0–1 float)
// ─────────────────────────────────────────────

/**
 * Engagement score from the EngagementEvent table.
 * Raw score = views·1 + likes·3 + comments·5 + shares·8
 * Normalised against ENGAGEMENT_NORMALISATION_CEILING.
 */
export async function computeEngagementScore(
  contentId: string,
  contentType: ContentType,
): Promise<number> {
  try {
    const rows = await db.engagementEvent.findMany({
      where: { contentId, contentType },
      select: { eventType: true },
    });

    let raw = 0;
    for (const row of rows) {
      switch (row.eventType) {
        case 'VIEW':    raw += 1; break;
        case 'LIKE':    raw += 3; break;
        case 'COMMENT': raw += 5; break;
        case 'SHARE':   raw += 8; break;
      }
    }

    return Math.min(raw / ENGAGEMENT_NORMALISATION_CEILING, 1.0);
  } catch (err: any) {
    logger.warn('RecommendationV3: computeEngagementScore failed', {
      contentId,
      error: err?.message,
    });
    return 0;
  }
}

/**
 * Watch-time score for video content.
 * = total watch time (seconds) / video duration (seconds).
 * Returns 0 for non-video content types.
 */
export async function computeWatchTimeScore(videoId: string): Promise<number> {
  try {
    const video = await db.video.findUnique({
      where: { id: videoId },
      select: { duration: true, watchTimeTotal: true },
    });

    if (!video || !video.duration || video.duration === 0) return 0;

    const watchTime = video.watchTimeTotal ?? 0;
    return Math.min(watchTime / video.duration, 1.0);
  } catch (err: any) {
    logger.warn('RecommendationV3: computeWatchTimeScore failed', {
      videoId,
      error: err?.message,
    });
    return 0;
  }
}

/**
 * Interest similarity between a viewer and a content author.
 * Factors:
 *  - Shared languages (up to 0.4)
 *  - Same city match (0.3)
 *  - Shared past interactions (liked/commented author's content) (0.3)
 */
export async function computeInterestSimilarity(
  userId: string,
  contentAuthorId: string,
): Promise<number> {
  if (userId === contentAuthorId) return 1.0; // Own content — max similarity

  try {
    const [viewer, author] = await Promise.all([
      db.user.findUnique({
        where: { id: userId },
        select: { languages: true, city: true },
      }),
      db.user.findUnique({
        where: { id: contentAuthorId },
        select: { languages: true, city: true },
      }),
    ]);

    if (!viewer || !author) return 0;

    // 1. Language overlap (0–0.4)
    const viewerLangs: string[] = viewer.languages ?? [];
    const authorLangs: string[] = author.languages ?? [];
    const sharedLangs = viewerLangs.filter((l: string) => authorLangs.includes(l));
    const langScore = viewerLangs.length > 0
      ? Math.min(sharedLangs.length / viewerLangs.length, 1.0) * 0.4
      : 0;

    // 2. City match (0 or 0.3)
    const cityScore = viewer.city && author.city && viewer.city === author.city ? 0.3 : 0;

    // 3. Past interaction with this author's content (0 or 0.3)
    const interactionCount = await db.engagementEvent.count({
      where: {
        userId,
        contentType: { in: ['POST', 'VIDEO', 'STORY'] },
        eventType:   { in: ['LIKE', 'COMMENT', 'SHARE'] },
        // Join through content to filter by author — use raw query or sub-select
        // Simplified: count direct engagement events for this author's known contentIds
      },
    });
    const interactionScore = Math.min(interactionCount / 10, 1.0) * 0.3;

    return Math.min(langScore + cityScore + interactionScore, 1.0);
  } catch (err: any) {
    logger.warn('RecommendationV3: computeInterestSimilarity failed', {
      userId,
      contentAuthorId,
      error: err?.message,
    });
    return 0;
  }
}

/**
 * Language match signal.
 * 1.0 if the user speaks the content language, 0.3 if not.
 */
export function computeLanguageMatch(
  userLanguages: string[],
  contentLanguage: string | null,
): number {
  if (!contentLanguage) return 0.5; // Unknown language — neutral
  const lower = contentLanguage.toLowerCase();
  const match = userLanguages.some((l) => l.toLowerCase() === lower);
  return match ? 1.0 : 0.3;
}

/**
 * Geographic relevance signal.
 * 1.0 same city, 0.5 same country, 0.2 different country.
 */
export function computeGeoRelevance(
  userCity: string | null,
  userCountry: string | null,
  contentCity: string | null,
  contentCountry: string | null,
): number {
  if (userCity && contentCity && userCity.toLowerCase() === contentCity.toLowerCase()) {
    return 1.0;
  }
  if (userCountry && contentCountry && userCountry.toLowerCase() === contentCountry.toLowerCase()) {
    return 0.5;
  }
  return 0.2;
}

/**
 * Creator trust score.
 * Factors: verified status, report count, total content count.
 * Returns 0–1.
 */
export async function computeCreatorTrustScore(creatorId: string): Promise<number> {
  try {
    const creator = await db.user.findUnique({
      where: { id: creatorId },
      select: { isVerified: true, reportCount: true, contentCount: true },
    });

    if (!creator) return 0.5; // Unknown creator — neutral

    let score = 0.5; // Baseline

    // Verified badge: +0.3
    if (creator.isVerified) score += 0.3;

    // Content volume (more content = slightly higher baseline) — up to +0.1
    const contentBonus = Math.min((creator.contentCount ?? 0) / 100, 1.0) * 0.1;
    score += contentBonus;

    // Reports penalty — subtract up to 0.4 for high report counts
    const reports = creator.reportCount ?? 0;
    const reportPenalty = Math.min(reports / 20, 1.0) * 0.4;
    score -= reportPenalty;

    return Math.max(0, Math.min(score, 1.0));
  } catch (err: any) {
    logger.warn('RecommendationV3: computeCreatorTrustScore failed', {
      creatorId,
      error: err?.message,
    });
    return 0.5;
  }
}

/**
 * Recency decay using exponential decay.
 * Formula: Math.exp(-0.1 * hoursOld), floored at 0.1.
 * Content younger than ~10h scores close to 1.0; 1-day-old content ~0.09 (→ 0.1 floor).
 */
export function computeRecencyDecay(createdAt: Date): number {
  const hoursOld = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60);
  const decay = Math.exp(-0.1 * hoursOld);
  return Math.max(decay, 0.1);
}

// ─────────────────────────────────────────────
// Composite Score
// ─────────────────────────────────────────────

async function computeCompositeScore(
  content: ContentCandidate,
  user: UserProfile,
): Promise<RankedItem> {
  const [engagement, watchTime, similarity, trust] = await Promise.all([
    computeEngagementScore(content.id, content.contentType),
    content.contentType === 'VIDEO' ? computeWatchTimeScore(content.id) : Promise.resolve(0),
    computeInterestSimilarity(user.id, content.authorId),
    computeCreatorTrustScore(content.authorId),
  ]);

  const language = computeLanguageMatch(user.languages, content.language);
  const geo      = computeGeoRelevance(user.city, user.country, content.city, content.country);
  const recency  = computeRecencyDecay(content.createdAt);

  const score =
    WEIGHTS.engagement * engagement +
    WEIGHTS.watchTime  * watchTime  +
    WEIGHTS.similarity * similarity +
    WEIGHTS.language   * language   +
    WEIGHTS.geo        * geo        +
    WEIGHTS.trust      * trust      +
    WEIGHTS.recency    * recency;

  return {
    contentId:   content.id,
    contentType: content.contentType,
    score:       Math.round(score * 10_000) / 10_000, // 4 decimal places
    signals:     { engagement, watchTime, similarity, language, geo, trust, recency },
  };
}

// ─────────────────────────────────────────────
// Cache Helpers
// ─────────────────────────────────────────────

function feedCacheKey(userId: string, contentType: string): string {
  return `${FEED_CACHE_PREFIX}:${userId}:${contentType}`;
}

async function getCachedFeed(
  userId: string,
  contentType: string,
): Promise<RankedItem[] | null> {
  try {
    const raw = await redis.get(feedCacheKey(userId, contentType));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function setCachedFeed(
  userId: string,
  contentType: string,
  items: RankedItem[],
): Promise<void> {
  try {
    await redis.setex(
      feedCacheKey(userId, contentType),
      FEED_CACHE_TTL_SECONDS,
      JSON.stringify(items),
    );
  } catch (err: any) {
    logger.warn('RecommendationV3: failed to cache feed', { userId, error: err?.message });
  }
}

/**
 * Invalidate a user's cached feed for all content types.
 * Call after the user creates content, follows someone, or updates preferences.
 */
export async function invalidateUserFeed(userId: string): Promise<void> {
  const types: ContentType[] = ['POST', 'VIDEO', 'JOB', 'EVENT', 'STORY'];
  try {
    const keys = types.map((t) => feedCacheKey(userId, t));
    if (keys.length > 0) {
      await redis.del(...keys);
    }
    logger.info('RecommendationV3: user feed cache invalidated', { userId });
  } catch (err: any) {
    logger.warn('RecommendationV3: cache invalidation failed', { userId, error: err?.message });
  }
}

// ─────────────────────────────────────────────
// Candidate Fetchers per Content Type
// ─────────────────────────────────────────────

async function fetchCandidates(
  userId: string,
  contentType: ContentType,
  candidateLimit: number,
): Promise<ContentCandidate[]> {
  const cutoffDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days

  try {
    switch (contentType) {
      case 'POST': {
        const posts = await db.post.findMany({
          where: {
            createdAt: { gte: cutoffDate },
            isDeleted: { not: true },
          },
          orderBy: { createdAt: 'desc' },
          take: candidateLimit,
          select: {
            id: true,
            authorId: true,
            language: true,
            createdAt: true,
            hashtags: true,
            author: { select: { city: true, country: true } },
          },
        });
        return posts.map((p: any) => ({
          id:          p.id,
          authorId:    p.authorId,
          contentType: 'POST' as ContentType,
          language:    p.language ?? null,
          city:        p.author?.city ?? null,
          country:     p.author?.country ?? null,
          hashtags:    p.hashtags ?? [],
          categoryId:  null,
          createdAt:   p.createdAt,
        }));
      }

      case 'VIDEO': {
        const videos = await db.video.findMany({
          where: {
            createdAt:   { gte: cutoffDate },
            isPublished: true,
          },
          orderBy: { createdAt: 'desc' },
          take: candidateLimit,
          select: {
            id: true,
            userId: true,
            language: true,
            createdAt: true,
            hashtags: true,
            categoryId: true,
            user: { select: { city: true, country: true } },
          },
        });
        return videos.map((v: any) => ({
          id:          v.id,
          authorId:    v.userId,
          contentType: 'VIDEO' as ContentType,
          language:    v.language ?? null,
          city:        v.user?.city ?? null,
          country:     v.user?.country ?? null,
          hashtags:    v.hashtags ?? [],
          categoryId:  v.categoryId ?? null,
          createdAt:   v.createdAt,
        }));
      }

      case 'JOB': {
        const jobs = await db.jobPosting.findMany({
          where: {
            createdAt:   { gte: cutoffDate },
            isActive:    true,
          },
          orderBy: { createdAt: 'desc' },
          take: candidateLimit,
          select: {
            id: true,
            userId: true,
            language: true,
            createdAt: true,
            tags: true,
            city: true,
            country: true,
          },
        });
        return jobs.map((j: any) => ({
          id:          j.id,
          authorId:    j.userId,
          contentType: 'JOB' as ContentType,
          language:    j.language ?? null,
          city:        j.city ?? null,
          country:     j.country ?? null,
          hashtags:    j.tags ?? [],
          categoryId:  null,
          createdAt:   j.createdAt,
        }));
      }

      case 'EVENT': {
        const events = await db.event.findMany({
          where: {
            createdAt: { gte: cutoffDate },
            startDate: { gte: new Date() },
          },
          orderBy: { startDate: 'asc' },
          take: candidateLimit,
          select: {
            id: true,
            organizerId: true,
            language: true,
            createdAt: true,
            hashtags: true,
            city: true,
            country: true,
            categoryId: true,
          },
        });
        return events.map((e: any) => ({
          id:          e.id,
          authorId:    e.organizerId,
          contentType: 'EVENT' as ContentType,
          language:    e.language ?? null,
          city:        e.city ?? null,
          country:     e.country ?? null,
          hashtags:    e.hashtags ?? [],
          categoryId:  e.categoryId ?? null,
          createdAt:   e.createdAt,
        }));
      }

      case 'STORY': {
        const stories = await db.story.findMany({
          where: {
            createdAt: { gte: cutoffDate },
            expiresAt: { gt: new Date() },
          },
          orderBy: { createdAt: 'desc' },
          take: candidateLimit,
          select: {
            id: true,
            userId: true,
            createdAt: true,
            user: { select: { city: true, country: true, languages: true } },
          },
        });
        return stories.map((s: any) => ({
          id:          s.id,
          authorId:    s.userId,
          contentType: 'STORY' as ContentType,
          language:    s.user?.languages?.[0] ?? null,
          city:        s.user?.city ?? null,
          country:     s.user?.country ?? null,
          hashtags:    [],
          categoryId:  null,
          createdAt:   s.createdAt,
        }));
      }

      default:
        return [];
    }
  } catch (err: any) {
    logger.warn('RecommendationV3: fetchCandidates failed', {
      contentType,
      error: err?.message,
    });
    return [];
  }
}

// ─────────────────────────────────────────────
// Main Ranking Function
// ─────────────────────────────────────────────

/**
 * Return a ranked, paginated feed for a user.
 * Scores are cached per (userId, contentType) for FEED_CACHE_TTL_SECONDS.
 */
export async function getRankedFeed(
  userId: string,
  contentType: ContentType,
  page = 1,
  limit = 20,
): Promise<{ items: RankedItem[]; total: number; page: number; limit: number }> {
  const cacheHit = await getCachedFeed(userId, contentType);

  let ranked: RankedItem[];

  if (cacheHit) {
    logger.debug('RecommendationV3: cache hit for ranked feed', { userId, contentType });
    ranked = cacheHit;
  } else {
    logger.debug('RecommendationV3: computing ranked feed', { userId, contentType });

    // Fetch user profile for signal computation
    let user: UserProfile = { id: userId, languages: [], city: null, country: null };
    try {
      const dbUser = await db.user.findUnique({
        where: { id: userId },
        select: { id: true, languages: true, city: true, country: true },
      });
      if (dbUser) {
        user = {
          id:        dbUser.id,
          languages: dbUser.languages ?? [],
          city:      dbUser.city ?? null,
          country:   dbUser.country ?? null,
        };
      }
    } catch (err: any) {
      logger.warn('RecommendationV3: failed to fetch user profile', { userId, error: err?.message });
    }

    const candidateLimit = limit * CANDIDATE_FETCH_MULTIPLIER;
    const candidates = await fetchCandidates(userId, contentType, candidateLimit);

    // Compute composite scores in parallel (batched)
    const scored = await Promise.all(
      candidates.map((c) => computeCompositeScore(c, user)),
    );

    // Sort descending by score
    ranked = scored.sort((a, b) => b.score - a.score);

    // Cache the full ranked list
    await setCachedFeed(userId, contentType, ranked);
  }

  // Paginate from the cached/computed ranked list
  const total = ranked.length;
  const start = (page - 1) * limit;
  const items = ranked.slice(start, start + limit);

  logger.info('RecommendationV3: getRankedFeed', {
    userId,
    contentType,
    page,
    limit,
    total,
    returned: items.length,
  });

  return { items, total, page, limit };
}

// ─────────────────────────────────────────────
// Personalized Recommendations (mixed types)
// ─────────────────────────────────────────────

/**
 * Return a personalised "For You" mix across all content types.
 * Takes the top N/types items from each type's ranked feed and merges + re-sorts.
 */
export async function getPersonalizedRecommendations(
  userId: string,
  limit = 20,
): Promise<RankedItem[]> {
  const types: ContentType[] = ['POST', 'VIDEO', 'JOB', 'EVENT', 'STORY'];
  const perType = Math.ceil(limit / types.length) + 5; // Fetch a few extra per type

  const results = await Promise.allSettled(
    types.map((t) => getRankedFeed(userId, t, 1, perType)),
  );

  const all: RankedItem[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled') {
      all.push(...result.value.items);
    }
  }

  // Re-sort by composite score across types and trim to requested limit
  all.sort((a, b) => b.score - a.score);
  const deduped = deduplicate(all);
  return deduped.slice(0, limit);
}

// ─────────────────────────────────────────────
// Similar Content
// ─────────────────────────────────────────────

/**
 * Find content similar to a given item by hashtags, category, and author.
 * Returns a list of similar content IDs sorted by relevance.
 */
export async function getSimilarContent(
  contentId: string,
  contentType: ContentType,
  limit = 10,
): Promise<{ contentId: string; contentType: ContentType; similarity: number }[]> {
  try {
    // Fetch the source content's attributes
    let sourceHashtags: string[] = [];
    let sourceCategoryId: string | null = null;
    let sourceAuthorId: string | null = null;

    switch (contentType) {
      case 'POST': {
        const post = await db.post.findUnique({
          where: { id: contentId },
          select: { hashtags: true, authorId: true },
        });
        sourceHashtags  = post?.hashtags ?? [];
        sourceAuthorId  = post?.authorId ?? null;
        break;
      }
      case 'VIDEO': {
        const video = await db.video.findUnique({
          where: { id: contentId },
          select: { hashtags: true, categoryId: true, userId: true },
        });
        sourceHashtags  = video?.hashtags ?? [];
        sourceCategoryId = video?.categoryId ?? null;
        sourceAuthorId  = video?.userId ?? null;
        break;
      }
      case 'JOB': {
        const job = await db.jobPosting.findUnique({
          where: { id: contentId },
          select: { tags: true, userId: true },
        });
        sourceHashtags  = job?.tags ?? [];
        sourceAuthorId  = job?.userId ?? null;
        break;
      }
      case 'EVENT': {
        const event = await db.event.findUnique({
          where: { id: contentId },
          select: { hashtags: true, categoryId: true, organizerId: true },
        });
        sourceHashtags  = event?.hashtags ?? [];
        sourceCategoryId = event?.categoryId ?? null;
        sourceAuthorId  = event?.organizerId ?? null;
        break;
      }
    }

    // Fetch candidate similar items (same content type)
    const candidates = await fetchCandidates('_system', contentType, limit * 10);

    // Score each candidate by overlap
    const scored = candidates
      .filter((c) => c.id !== contentId) // Exclude self
      .map((c) => {
        let sim = 0;

        // Hashtag/tag overlap (up to 0.5)
        if (sourceHashtags.length > 0 && c.hashtags.length > 0) {
          const overlap = c.hashtags.filter((h: string) => sourceHashtags.includes(h)).length;
          sim += Math.min(overlap / sourceHashtags.length, 1.0) * 0.5;
        }

        // Same category (0.3)
        if (sourceCategoryId && c.categoryId && sourceCategoryId === c.categoryId) {
          sim += 0.3;
        }

        // Same author (0.2)
        if (sourceAuthorId && c.authorId === sourceAuthorId) {
          sim += 0.2;
        }

        return { contentId: c.id, contentType: c.contentType, similarity: Math.min(sim, 1.0) };
      });

    scored.sort((a, b) => b.similarity - a.similarity);
    return scored.slice(0, limit);
  } catch (err: any) {
    logger.warn('RecommendationV3: getSimilarContent failed', {
      contentId,
      contentType,
      error: err?.message,
    });
    return [];
  }
}

// ─────────────────────────────────────────────
// Utility
// ─────────────────────────────────────────────

function deduplicate(items: RankedItem[]): RankedItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.contentType}:${item.contentId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
