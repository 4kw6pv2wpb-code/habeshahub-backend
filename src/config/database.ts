/**
 * Prisma Client singleton.
 * Reuses the same instance across hot-reloads in development.
 */

import { PrismaClient } from '@prisma/client';
import { isDev } from './env';

// Extend the global type to cache PrismaClient in dev
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    log: isDev
      ? ['query', 'info', 'warn', 'error']
      : ['error'],
    errorFormat: 'pretty',
  });
}

// In development, reuse the global instance to avoid connection pool exhaustion
// during hot-reloads. In production, always create a fresh singleton.
export const prisma: PrismaClient =
  global.__prisma ?? createPrismaClient();

if (isDev) {
  global.__prisma = prisma;
}

/**
 * Connect and verify the database is reachable.
 */
export async function connectDatabase(): Promise<void> {
  await prisma.$connect();
}

/**
 * Disconnect from the database gracefully.
 */
export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}
