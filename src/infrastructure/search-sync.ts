/**
 * Search Sync Service
 * Keeps MeiliSearch indexes in sync with the Prisma database.
 * Performs full reindexes of all 7 collections, processing records in
 * batches of 1000 to stay memory-efficient.
 */

import { PrismaClient } from '@prisma/client';
import * as searchEngine from './search-engine';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();
const db = prisma as any;

const BATCH_SIZE = 1000;

// ─────────────────────────────────────────────
// Full Reindex
// ─────────────────────────────────────────────

/**
 * Trigger a full reindex of all 7 collections.
 * Each sync is independent — a failure in one collection does not abort others.
 */
export async function syncAllIndexes(): Promise<void> {
  logger.info('searchSync: starting full reindex of all indexes');

  const syncs = [
    syncUsers,
    syncPosts,
    syncVideos,
    syncJobs,
    syncHousing,
    syncEvents,
    syncCreators,
  ];

  for (const syncFn of syncs) {
    try {
      await syncFn();
    } catch (err) {
      logger.error(`searchSync: ${syncFn.name} failed`, { err });
      // Continue with remaining syncs
    }
  }

  logger.info('searchSync: full reindex complete');
}

// ─────────────────────────────────────────────
// Per-Collection Sync Functions
// ─────────────────────────────────────────────

/**
 * Sync all users to the 'users' search index.
 * Maps: id, name, bio, city, languages, isVerified, avatarUrl
 */
export async function syncUsers(): Promise<void> {
  logger.info('searchSync: syncing users');

  const total = await db.user.count();
  let offset = 0;
  let indexed = 0;

  while (offset < total) {
    const rows = await db.user.findMany({
      skip: offset,
      take: BATCH_SIZE,
      select: {
        id: true,
        name: true,
        bio: true,
        city: true,
        languages: true,
        isVerified: true,
        avatarUrl: true,
      },
    });

    if (rows.length === 0) break;

    const docs = rows.map((u: any) => ({
      id: u.id,
      name: u.name ?? '',
      bio: u.bio ?? '',
      city: u.city ?? '',
      languages: u.languages ?? [],
      isVerified: u.isVerified ?? false,
      avatarUrl: u.avatarUrl ?? '',
    }));

    await searchEngine.indexDocuments(searchEngine.INDEXES.USERS, docs);

    indexed += rows.length;
    offset += BATCH_SIZE;

    logger.info(`searchSync: users — indexed ${indexed}/${total}`);
  }

  logger.info('searchSync: users sync complete', { total: indexed });
}

/**
 * Sync active posts to the 'posts' search index.
 * Maps: id, content, authorId, authorName, status, likesCount, createdAt
 */
export async function syncPosts(): Promise<void> {
  logger.info('searchSync: syncing posts');

  const total = await db.post.count({ where: { status: 'ACTIVE' } });
  let offset = 0;
  let indexed = 0;

  while (offset < total) {
    const rows = await db.post.findMany({
      where: { status: 'ACTIVE' },
      skip: offset,
      take: BATCH_SIZE,
      select: {
        id: true,
        content: true,
        authorId: true,
        status: true,
        likesCount: true,
        createdAt: true,
        author: { select: { name: true } },
      },
    });

    if (rows.length === 0) break;

    const docs = rows.map((p: any) => ({
      id: p.id,
      content: p.content ?? '',
      authorId: p.authorId,
      authorName: p.author?.name ?? '',
      status: p.status,
      likesCount: p.likesCount ?? 0,
      createdAt: p.createdAt?.toISOString?.() ?? p.createdAt,
    }));

    await searchEngine.indexDocuments(searchEngine.INDEXES.POSTS, docs);

    indexed += rows.length;
    offset += BATCH_SIZE;

    logger.info(`searchSync: posts — indexed ${indexed}/${total}`);
  }

  logger.info('searchSync: posts sync complete', { total: indexed });
}

/**
 * Sync READY + ACTIVE videos to the 'videos' search index.
 * Maps: id, title, description, hashtags, status, language, viewCount, createdAt, thumbnailUrl
 */
export async function syncVideos(): Promise<void> {
  logger.info('searchSync: syncing videos');

  const where = { status: 'READY', isActive: true };
  const total = await db.video.count({ where });
  let offset = 0;
  let indexed = 0;

  while (offset < total) {
    const rows = await db.video.findMany({
      where,
      skip: offset,
      take: BATCH_SIZE,
      select: {
        id: true,
        title: true,
        description: true,
        hashtags: true,
        status: true,
        language: true,
        viewCount: true,
        createdAt: true,
        thumbnailUrl: true,
      },
    });

    if (rows.length === 0) break;

    const docs = rows.map((v: any) => ({
      id: v.id,
      title: v.title ?? '',
      description: v.description ?? '',
      hashtags: v.hashtags ?? [],
      status: v.status,
      language: v.language ?? '',
      viewCount: v.viewCount ?? 0,
      createdAt: v.createdAt?.toISOString?.() ?? v.createdAt,
      thumbnailUrl: v.thumbnailUrl ?? '',
    }));

    await searchEngine.indexDocuments(searchEngine.INDEXES.VIDEOS, docs);

    indexed += rows.length;
    offset += BATCH_SIZE;

    logger.info(`searchSync: videos — indexed ${indexed}/${total}`);
  }

  logger.info('searchSync: videos sync complete', { total: indexed });
}

/**
 * Sync active jobs to the 'jobs' search index.
 * Maps: id, title, description, skills, city, jobType, remote, isActive, createdAt
 */
export async function syncJobs(): Promise<void> {
  logger.info('searchSync: syncing jobs');

  const where = { isActive: true };
  const total = await db.job.count({ where });
  let offset = 0;
  let indexed = 0;

  while (offset < total) {
    const rows = await db.job.findMany({
      where,
      skip: offset,
      take: BATCH_SIZE,
      select: {
        id: true,
        title: true,
        description: true,
        skills: true,
        city: true,
        jobType: true,
        remote: true,
        isActive: true,
        createdAt: true,
      },
    });

    if (rows.length === 0) break;

    const docs = rows.map((j: any) => ({
      id: j.id,
      title: j.title ?? '',
      description: j.description ?? '',
      skills: j.skills ?? [],
      city: j.city ?? '',
      jobType: j.jobType ?? '',
      remote: j.remote ?? false,
      isActive: j.isActive,
      createdAt: j.createdAt?.toISOString?.() ?? j.createdAt,
    }));

    await searchEngine.indexDocuments(searchEngine.INDEXES.JOBS, docs);

    indexed += rows.length;
    offset += BATCH_SIZE;

    logger.info(`searchSync: jobs — indexed ${indexed}/${total}`);
  }

  logger.info('searchSync: jobs sync complete', { total: indexed });
}

/**
 * Sync active housing listings to the 'housing' search index.
 * Maps: id, title, description, neighborhood, city, listingType, rent, status, createdAt
 */
export async function syncHousing(): Promise<void> {
  logger.info('searchSync: syncing housing');

  const where = { status: 'ACTIVE' };
  const total = await db.housingListing.count({ where });
  let offset = 0;
  let indexed = 0;

  while (offset < total) {
    const rows = await db.housingListing.findMany({
      where,
      skip: offset,
      take: BATCH_SIZE,
      select: {
        id: true,
        title: true,
        description: true,
        neighborhood: true,
        city: true,
        listingType: true,
        rent: true,
        status: true,
        createdAt: true,
      },
    });

    if (rows.length === 0) break;

    const docs = rows.map((h: any) => ({
      id: h.id,
      title: h.title ?? '',
      description: h.description ?? '',
      neighborhood: h.neighborhood ?? '',
      city: h.city ?? '',
      listingType: h.listingType ?? '',
      rent: h.rent ?? 0,
      status: h.status,
      createdAt: h.createdAt?.toISOString?.() ?? h.createdAt,
    }));

    await searchEngine.indexDocuments(searchEngine.INDEXES.HOUSING, docs);

    indexed += rows.length;
    offset += BATCH_SIZE;

    logger.info(`searchSync: housing — indexed ${indexed}/${total}`);
  }

  logger.info('searchSync: housing sync complete', { total: indexed });
}

/**
 * Sync upcoming events to the 'events' search index.
 * Maps: id, title, description, location, city, isOnline, date
 */
export async function syncEvents(): Promise<void> {
  logger.info('searchSync: syncing events');

  const now = new Date();
  const where = { date: { gte: now } };
  const total = await db.event.count({ where });
  let offset = 0;
  let indexed = 0;

  while (offset < total) {
    const rows = await db.event.findMany({
      where,
      skip: offset,
      take: BATCH_SIZE,
      select: {
        id: true,
        title: true,
        description: true,
        location: true,
        city: true,
        isOnline: true,
        date: true,
      },
    });

    if (rows.length === 0) break;

    const docs = rows.map((e: any) => ({
      id: e.id,
      title: e.title ?? '',
      description: e.description ?? '',
      location: e.location ?? '',
      city: e.city ?? '',
      isOnline: e.isOnline ?? false,
      date: e.date?.toISOString?.() ?? e.date,
    }));

    await searchEngine.indexDocuments(searchEngine.INDEXES.EVENTS, docs);

    indexed += rows.length;
    offset += BATCH_SIZE;

    logger.info(`searchSync: events — indexed ${indexed}/${total}`);
  }

  logger.info('searchSync: events sync complete', { total: indexed });
}

/**
 * Sync creator profiles to the 'creators' search index.
 * Maps: id, displayName, bio, category, isMonetized, subscriberCount, avatarUrl
 */
export async function syncCreators(): Promise<void> {
  logger.info('searchSync: syncing creators');

  const total = await db.creatorProfile.count();
  let offset = 0;
  let indexed = 0;

  while (offset < total) {
    const rows = await db.creatorProfile.findMany({
      skip: offset,
      take: BATCH_SIZE,
      select: {
        id: true,
        displayName: true,
        bio: true,
        category: true,
        isMonetized: true,
        subscriberCount: true,
        user: { select: { avatarUrl: true } },
      },
    });

    if (rows.length === 0) break;

    const docs = rows.map((c: any) => ({
      id: c.id,
      displayName: c.displayName ?? '',
      bio: c.bio ?? '',
      category: c.category ?? '',
      isMonetized: c.isMonetized ?? false,
      subscriberCount: c.subscriberCount ?? 0,
      avatarUrl: c.user?.avatarUrl ?? '',
    }));

    await searchEngine.indexDocuments(searchEngine.INDEXES.CREATORS, docs);

    indexed += rows.length;
    offset += BATCH_SIZE;

    logger.info(`searchSync: creators — indexed ${indexed}/${total}`);
  }

  logger.info('searchSync: creators sync complete', { total: indexed });
}
