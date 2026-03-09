/**
 * Language Translation Service.
 * Supports Amharic (AM), Tigrinya (TI), Somali (SO), and English (EN).
 * Uses OpenAI for high-quality translations with Habesha cultural context.
 */

import OpenAI from 'openai';
import { env } from '../config/env';
import { redis } from '../config/redis';
import { logger } from '../utils/logger';

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

const LANGUAGE_NAMES: Record<string, string> = {
  EN: 'English',
  AM: 'Amharic',
  TI: 'Tigrinya',
  SO: 'Somali',
};

const CACHE_TTL = 60 * 60 * 24; // 24 hours

interface TranslationResult {
  original: string;
  translated: string;
  from: string;
  to: string;
  cached: boolean;
}

interface BatchTranslationResult {
  translations: TranslationResult[];
  totalTokens: number;
}

export const translationService = {
  /**
   * Translate a single text string between supported languages.
   */
  async translate(text: string, from: string, to: string): Promise<TranslationResult> {
    if (from === to) {
      return { original: text, translated: text, from, to, cached: false };
    }

    // Check cache first
    const cacheKey = `translate:${from}:${to}:${Buffer.from(text).toString('base64').slice(0, 64)}`;
    const cached = await redis.get(cacheKey);

    if (cached) {
      return { original: text, translated: cached, from, to, cached: true };
    }

    const fromLang = LANGUAGE_NAMES[from] ?? from;
    const toLang = LANGUAGE_NAMES[to] ?? to;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.3,
      max_tokens: 2000,
      messages: [
        {
          role: 'system',
          content: `You are a professional translator specializing in East African languages (Amharic, Tigrinya, Somali) and English. Translate accurately while preserving cultural nuance, idioms, and tone. For Habesha-specific terms (e.g., "injera", "jebena", "habesha"), keep them transliterated when no direct equivalent exists. Return ONLY the translated text with no explanations.`,
        },
        {
          role: 'user',
          content: `Translate from ${fromLang} to ${toLang}:\n\n${text}`,
        },
      ],
    });

    const translated = completion.choices[0]?.message?.content?.trim() ?? text;

    // Cache the result
    await redis.set(cacheKey, translated, 'EX', CACHE_TTL);

    logger.info('Translation completed', { from, to, inputLength: text.length });

    return { original: text, translated, from, to, cached: false };
  },

  /**
   * Translate multiple texts in a single batch.
   */
  async translateBatch(
    texts: string[],
    from: string,
    to: string,
  ): Promise<BatchTranslationResult> {
    const results: TranslationResult[] = [];
    let totalTokens = 0;

    // Process in chunks of 10 to avoid token limits
    const chunkSize = 10;
    for (let i = 0; i < texts.length; i += chunkSize) {
      const chunk = texts.slice(i, i + chunkSize);

      const promises = chunk.map((text) => this.translate(text, from, to));
      const chunkResults = await Promise.allSettled(promises);

      for (const result of chunkResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          logger.error('Batch translation item failed', { error: result.reason });
          results.push({
            original: chunk[results.length - (i / chunkSize)] ?? '',
            translated: '',
            from,
            to,
            cached: false,
          });
        }
      }
    }

    return { translations: results, totalTokens };
  },

  /**
   * Auto-detect language of input text.
   */
  async detectLanguage(text: string): Promise<string> {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      max_tokens: 10,
      messages: [
        {
          role: 'system',
          content:
            'Detect the language of the following text. Respond with ONLY the language code: EN, AM, TI, or SO.',
        },
        { role: 'user', content: text },
      ],
    });

    const detected = completion.choices[0]?.message?.content?.trim()?.toUpperCase() ?? 'EN';
    return ['EN', 'AM', 'TI', 'SO'].includes(detected) ? detected : 'EN';
  },

  /**
   * Translate a post/comment for a user viewing in a different language.
   */
  async translateContent(
    contentId: string,
    content: string,
    sourceLang: string,
    targetLang: string,
  ): Promise<TranslationResult> {
    // Content-specific cache key
    const cacheKey = `content:${contentId}:${targetLang}`;
    const cached = await redis.get(cacheKey);

    if (cached) {
      return { original: content, translated: cached, from: sourceLang, to: targetLang, cached: true };
    }

    const result = await this.translate(content, sourceLang, targetLang);

    // Cache with content-specific key for longer
    await redis.set(cacheKey, result.translated, 'EX', CACHE_TTL * 7);

    return result;
  },
};
