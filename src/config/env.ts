/**
 * Environment variable validation using Zod.
 * Validates and exports all required configuration at startup.
 */

import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  // Database
  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL is required')
    .startsWith('postgresql://', 'DATABASE_URL must be a valid PostgreSQL connection string'),

  // Redis
  REDIS_URL: z
    .string()
    .min(1, 'REDIS_URL is required')
    .default('redis://localhost:6379'),

  // JWT
  JWT_SECRET: z
    .string()
    .min(32, 'JWT_SECRET must be at least 32 characters long'),
  JWT_EXPIRES_IN: z.string().default('24h'),

  // OpenAI
  OPENAI_API_KEY: z.string().optional(),

  // Meilisearch
  MEILISEARCH_HOST: z.string().default('http://localhost:7700'),
  MEILISEARCH_KEY: z.string().default(''),

  // CORS
  CORS_ORIGINS: z.string().default('http://localhost:3001'),

  // Rate limiting
  RATE_LIMIT_POINTS: z.coerce.number().int().positive().default(200),
  RATE_LIMIT_DURATION: z.coerce.number().int().positive().default(86400), // 1 day in seconds

  // Phase 3 — Infrastructure
  // NATS event bus
  NATS_URL: z.string().default('nats://localhost:4222'),
  NATS_ENABLED: z.string().default('false'),

  // S3 / Object storage
  S3_BUCKET: z.string().default('habeshahub-media'),
  S3_REGION: z.string().default('us-west-2'),
  S3_ACCESS_KEY: z.string().default(''),
  S3_SECRET_KEY: z.string().default(''),
  CDN_BASE_URL: z.string().default('https://cdn.habeshahub.com'),

  // Firebase Cloud Messaging
  FCM_PROJECT_ID: z.string().default(''),
  FCM_SERVER_KEY: z.string().default(''),

  // Apple Push Notification Service
  APNS_KEY_ID: z.string().default(''),
  APNS_TEAM_ID: z.string().default(''),
  APNS_BUNDLE_ID: z.string().default('com.habeshahub.app'),

  // Analytics
  CLICKHOUSE_URL: z.string().default(''),
  POSTHOG_API_KEY: z.string().default(''),
});

// Validate environment — throws on failure
const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment configuration:');
  parsed.error.issues.forEach((issue) => {
    console.error(`  • ${issue.path.join('.')}: ${issue.message}`);
  });
  process.exit(1);
}

export const env = parsed.data;

// Derived helpers
export const isDev = env.NODE_ENV === 'development';
export const isProd = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';

export type Env = z.infer<typeof envSchema>;
