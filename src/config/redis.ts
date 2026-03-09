/**
 * Redis connection using ioredis.
 * Exports a singleton client used by rate limiter, caching, and pub/sub.
 */

import Redis from 'ioredis';
import { env } from './env';
import { logger } from '../utils/logger';

let redisClient: Redis | null = null;

/**
 * Create and return the Redis singleton.
 */
export function getRedisClient(): Redis {
  if (redisClient) {
    return redisClient;
  }

  redisClient = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    retryStrategy(times: number) {
      if (times > 10) {
        logger.error('Redis: Too many reconnection attempts, giving up');
        return null; // stop retrying
      }
      const delay = Math.min(times * 100, 3000);
      logger.warn(`Redis: reconnecting in ${delay}ms (attempt ${times})`);
      return delay;
    },
    reconnectOnError(err: Error) {
      const targetError = 'READONLY';
      if (err.message.includes(targetError)) {
        return true;
      }
      return false;
    },
  });

  redisClient.on('connect', () => {
    logger.info('Redis: connected');
  });

  redisClient.on('ready', () => {
    logger.info('Redis: ready');
  });

  redisClient.on('error', (err: Error) => {
    logger.error('Redis error:', err.message);
  });

  redisClient.on('close', () => {
    logger.warn('Redis: connection closed');
  });

  return redisClient;
}

/**
 * Gracefully disconnect Redis.
 */
export async function disconnectRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    logger.info('Redis: disconnected');
  }
}

// Export a pre-initialized client for convenience
export const redis = getRedisClient();
