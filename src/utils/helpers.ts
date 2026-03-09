/**
 * Common utility / helper functions.
 */

import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants';
import type { PaginationMeta, PaginationQuery } from '../types';

// ─────────────────────────────────────────────
// Pagination
// ─────────────────────────────────────────────

/**
 * Parse and clamp page/limit query params.
 */
export function parsePagination(query: PaginationQuery): {
  page: number;
  limit: number;
  skip: number;
} {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number(query.limit) || DEFAULT_PAGE_SIZE),
  );
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

/**
 * Build a pagination meta object for API responses.
 */
export function buildPaginationMeta(
  total: number,
  page: number,
  limit: number,
): PaginationMeta {
  return {
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

// ─────────────────────────────────────────────
// Date helpers
// ─────────────────────────────────────────────

/**
 * Calculate how many hours ago a date was from now.
 */
export function hoursAgo(date: Date): number {
  const diffMs = Date.now() - date.getTime();
  return diffMs / (1000 * 60 * 60);
}

/**
 * Return a Date that is `hours` hours from now.
 */
export function hoursFromNow(hours: number): Date {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

// ─────────────────────────────────────────────
// Object helpers
// ─────────────────────────────────────────────

/**
 * Omit specified keys from an object (useful for stripping passwordHash, etc.)
 */
export function omitKeys<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: K[],
): Omit<T, K> {
  const result = { ...obj };
  for (const key of keys) {
    delete result[key];
  }
  return result as Omit<T, K>;
}

/**
 * Pick specified keys from an object.
 */
export function pickKeys<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: K[],
): Pick<T, K> {
  const result = {} as Pick<T, K>;
  for (const key of keys) {
    result[key] = obj[key];
  }
  return result;
}

// ─────────────────────────────────────────────
// String helpers
// ─────────────────────────────────────────────

/**
 * Slugify a string for use in URLs or identifiers.
 */
export function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/--+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}

/**
 * Truncate a string to the given length, appending ellipsis.
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

// ─────────────────────────────────────────────
// Validation helpers
// ─────────────────────────────────────────────

/**
 * Check if a string is a valid UUID v4.
 */
export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
