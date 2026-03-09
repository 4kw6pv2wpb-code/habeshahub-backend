/**
 * MeiliSearch Engine
 * Manages all search indexes, provides CRUD helpers, and exposes a unified
 * search function. Acts as the low-level adapter over the MeiliSearch client.
 */

import { MeiliSearch, Index, SearchParams, SearchResponse } from 'meilisearch';
import { env } from '../config/env';
import { logger } from '../utils/logger';

// ─────────────────────────────────────────────
// Index Names
// ─────────────────────────────────────────────

export const INDEXES = {
  USERS: 'users',
  POSTS: 'posts',
  VIDEOS: 'videos',
  JOBS: 'jobs',
  HOUSING: 'housing',
  EVENTS: 'events',
  CREATORS: 'creators',
} as const;

export type IndexName = (typeof INDEXES)[keyof typeof INDEXES];

// ─────────────────────────────────────────────
// Index Settings
// ─────────────────────────────────────────────

interface IndexSettings {
  searchableAttributes?: string[];
  filterableAttributes?: string[];
  sortableAttributes?: string[];
}

const INDEX_SETTINGS: Record<IndexName, IndexSettings> = {
  [INDEXES.USERS]: {
    searchableAttributes: ['name', 'bio', 'city'],
    filterableAttributes: ['city', 'languages', 'isVerified'],
  },
  [INDEXES.POSTS]: {
    searchableAttributes: ['content'],
    filterableAttributes: ['authorId', 'status', 'createdAt'],
    sortableAttributes: ['createdAt', 'likesCount'],
  },
  [INDEXES.VIDEOS]: {
    searchableAttributes: ['title', 'description', 'hashtags'],
    filterableAttributes: ['status', 'language'],
    sortableAttributes: ['viewCount', 'createdAt'],
  },
  [INDEXES.JOBS]: {
    searchableAttributes: ['title', 'description', 'skills'],
    filterableAttributes: ['city', 'jobType', 'remote', 'isActive'],
    sortableAttributes: ['createdAt'],
  },
  [INDEXES.HOUSING]: {
    searchableAttributes: ['title', 'description', 'neighborhood'],
    filterableAttributes: ['city', 'listingType', 'rent', 'status'],
    sortableAttributes: ['rent', 'createdAt'],
  },
  [INDEXES.EVENTS]: {
    searchableAttributes: ['title', 'description', 'location'],
    filterableAttributes: ['city', 'isOnline', 'date'],
    sortableAttributes: ['date'],
  },
  [INDEXES.CREATORS]: {
    searchableAttributes: ['displayName', 'bio', 'category'],
    filterableAttributes: ['category', 'isMonetized'],
    sortableAttributes: ['subscriberCount'],
  },
};

// ─────────────────────────────────────────────
// Singleton Client
// ─────────────────────────────────────────────

let searchClient: MeiliSearch | null = null;

/**
 * Return the singleton MeiliSearch client, creating it on first call.
 */
export function getSearchClient(): MeiliSearch {
  if (searchClient) return searchClient;

  searchClient = new MeiliSearch({
    host: env.MEILISEARCH_HOST,
    apiKey: env.MEILISEARCH_KEY || undefined,
  });

  logger.info('searchEngine: MeiliSearch client initialised', {
    host: env.MEILISEARCH_HOST,
  });

  return searchClient;
}

// ─────────────────────────────────────────────
// Index Initialisation
// ─────────────────────────────────────────────

/**
 * Create all 7 indexes (if they don't exist) and apply their settings.
 * Safe to call on every server startup — MeiliSearch is idempotent for
 * existing indexes.
 */
export async function initializeIndexes(): Promise<void> {
  const client = getSearchClient();

  for (const indexName of Object.values(INDEXES)) {
    try {
      // Create index — no-op if already exists
      await client.createIndex(indexName, { primaryKey: 'id' });
      logger.info(`searchEngine: ensured index "${indexName}"`);

      // Apply attribute settings
      const settings = INDEX_SETTINGS[indexName as IndexName];
      const index: Index = client.index(indexName);

      await index.updateSettings({
        searchableAttributes: settings.searchableAttributes,
        filterableAttributes: settings.filterableAttributes,
        sortableAttributes: settings.sortableAttributes,
      });

      logger.info(`searchEngine: applied settings to index "${indexName}"`, settings);
    } catch (err) {
      logger.error(`searchEngine: failed to initialise index "${indexName}"`, { err });
      // Non-fatal — continue with remaining indexes
    }
  }

  logger.info('searchEngine: all indexes initialised');
}

// ─────────────────────────────────────────────
// Document Operations
// ─────────────────────────────────────────────

/**
 * Add or update a single document in an index.
 * The document must have an `id` field.
 */
export async function indexDocument(
  indexName: IndexName,
  document: Record<string, unknown>,
): Promise<void> {
  const client = getSearchClient();

  try {
    await client.index(indexName).addDocuments([document]);
    logger.debug('searchEngine: indexed document', { indexName, id: document['id'] });
  } catch (err) {
    logger.error('searchEngine: indexDocument failed', { indexName, err });
    throw err;
  }
}

/**
 * Bulk add or update documents in an index.
 */
export async function indexDocuments(
  indexName: IndexName,
  documents: Record<string, unknown>[],
): Promise<void> {
  if (documents.length === 0) return;

  const client = getSearchClient();

  try {
    await client.index(indexName).addDocuments(documents);
    logger.info('searchEngine: bulk indexed documents', {
      indexName,
      count: documents.length,
    });
  } catch (err) {
    logger.error('searchEngine: indexDocuments failed', { indexName, err });
    throw err;
  }
}

/**
 * Delete a single document from an index by its ID.
 */
export async function removeDocument(
  indexName: IndexName,
  documentId: string,
): Promise<void> {
  const client = getSearchClient();

  try {
    await client.index(indexName).deleteDocument(documentId);
    logger.debug('searchEngine: removed document', { indexName, documentId });
  } catch (err) {
    logger.error('searchEngine: removeDocument failed', { indexName, documentId, err });
    throw err;
  }
}

// ─────────────────────────────────────────────
// Search
// ─────────────────────────────────────────────

export interface SearchOptions {
  filter?: string | string[];
  sort?: string[];
  facets?: string[];
  /** 1-based page number (default: 1) */
  page?: number;
  /** Results per page (default: 20, max: 100) */
  limit?: number;
}

export interface SearchResult<T = Record<string, unknown>> {
  hits: T[];
  totalHits: number;
  page: number;
  limit: number;
  processingTimeMs: number;
}

/**
 * Execute a full-text search against a named index.
 * Supports optional filters, sorting, facets, and pagination.
 */
export async function search<T extends Record<string, unknown> = Record<string, unknown>>(
  indexName: IndexName,
  query: string,
  options: SearchOptions = {},
): Promise<SearchResult<T>> {
  const client = getSearchClient();
  const { page = 1, limit = 20, filter, sort, facets } = options;

  const hitsPerPage = Math.min(limit, 100);
  const offset = (page - 1) * hitsPerPage;

  const params: SearchParams = {
    offset,
    limit: hitsPerPage,
    ...(filter ? { filter } : {}),
    ...(sort ? { sort } : {}),
    ...(facets ? { facets } : {}),
  };

  try {
    const response: SearchResponse<T> = await client
      .index(indexName)
      .search<T>(query, params);

    logger.debug('searchEngine: search executed', {
      indexName,
      query,
      hits: response.hits.length,
      processingTimeMs: response.processingTimeMs,
    });

    return {
      hits: response.hits,
      totalHits: response.estimatedTotalHits ?? response.hits.length,
      page,
      limit: hitsPerPage,
      processingTimeMs: response.processingTimeMs,
    };
  } catch (err) {
    logger.error('searchEngine: search failed', { indexName, query, err });
    throw err;
  }
}
