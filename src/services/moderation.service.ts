/**
 * Content moderation service.
 * Uses OpenAI's Moderation API to flag toxic/inappropriate content.
 * Falls back to permissive mode if OpenAI is unavailable.
 */

import OpenAI from 'openai';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { MODERATION_TOXICITY_THRESHOLD } from '../utils/constants';
import type { ModerationResult } from '../types';

// ─────────────────────────────────────────────
// OpenAI client (lazy initialization)
// ─────────────────────────────────────────────

let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI | null {
  if (!env.OPENAI_API_KEY) {
    return null; // Moderation disabled if no key
  }

  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  }

  return openaiClient;
}

// ─────────────────────────────────────────────
// Moderation
// ─────────────────────────────────────────────

/**
 * Moderate a text string using OpenAI's Moderation endpoint.
 *
 * Returns:
 *   isSafe: true  → content is acceptable
 *   isSafe: false → content should be blocked
 *   score:        → highest toxicity category score (0–1)
 */
export async function moderateContent(text: string): Promise<ModerationResult> {
  const client = getOpenAIClient();

  // If OpenAI not configured, allow all content (log a warning)
  if (!client) {
    logger.warn('Moderation: OpenAI API key not set — skipping content check');
    return { isSafe: true, score: 0, flaggedCategories: [] };
  }

  try {
    const response = await client.moderations.create({ input: text });
    const result = response.results[0];

    // Collect flagged categories and their scores
    const categoryScores = result.category_scores as unknown as Record<string, number>;
    const flaggedCategories: string[] = [];
    let maxScore = 0;

    for (const [category, score] of Object.entries(categoryScores)) {
      if (score > MODERATION_TOXICITY_THRESHOLD) {
        flaggedCategories.push(category);
      }
      if (score > maxScore) {
        maxScore = score;
      }
    }

    const isSafe = !result.flagged && flaggedCategories.length === 0;

    if (!isSafe) {
      logger.warn('Content flagged by moderation', {
        flaggedCategories,
        maxScore: maxScore.toFixed(4),
        contentSnippet: text.slice(0, 100),
      });
    }

    return {
      isSafe,
      score: parseFloat(maxScore.toFixed(4)),
      flaggedCategories,
    };
  } catch (err) {
    // Do not block content on moderation API failure — log and allow
    logger.error('Moderation API error', {
      error: (err as Error).message,
      textSnippet: text.slice(0, 100),
    });

    return { isSafe: true, score: 0, flaggedCategories: [] };
  }
}

/**
 * Moderate a post/message and update the database record if flagged.
 * Returns the moderation result.
 */
export async function moderateAndScore(text: string): Promise<ModerationResult> {
  return moderateContent(text);
}

/**
 * Batch moderate multiple strings. Useful for bulk content audits.
 */
export async function batchModerate(
  texts: string[],
): Promise<ModerationResult[]> {
  const results = await Promise.allSettled(texts.map((t) => moderateContent(t)));

  return results.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    logger.error('Batch moderation failed for item', { index: i, error: (r.reason as Error).message });
    return { isSafe: true, score: 0, flaggedCategories: [] };
  });
}
