/**
 * Immigration Helper Service.
 * Provides AI-powered guidance for common diaspora immigration questions.
 * Covers visa types, work permits, family sponsorship, and country-specific info.
 *
 * DISCLAIMER: This service provides general information only —
 * users should always consult a qualified immigration attorney.
 */

import OpenAI from 'openai';
import { env } from '../config/env';
import { redis } from '../config/redis';
import { logger } from '../utils/logger';

let _openai: OpenAI | null = null;

function getOpenAI(): OpenAI | null {
  if (_openai) return _openai;
  const key = env.OPENAI_API_KEY;
  if (!key || key === 'your-openai-api-key' || key.startsWith('sk-placeholder')) return null;
  _openai = new OpenAI({ apiKey: key });
  return _openai;
}

const CACHE_TTL = 60 * 60 * 24 * 7; // 7 days for immigration FAQs

interface ImmigrationQuery {
  question: string;
  context?: {
    currentCountry?: string;
    targetCountry?: string;
    visaType?: string;
    nationality?: string;
  };
}

interface ImmigrationResponse {
  answer: string;
  disclaimer: string;
  relatedTopics: string[];
  resources: { title: string; url: string; description: string }[];
  cached: boolean;
}

interface VisaInfo {
  visaType: string;
  country: string;
  description: string;
  requirements: string[];
  processingTime: string;
  fees: string;
  tips: string[];
}

// Common visa categories relevant to diaspora
const VISA_CATEGORIES = [
  'H-1B (US Work Visa)',
  'O-1 (US Extraordinary Ability)',
  'EB-1/EB-2/EB-3 (US Employment Green Card)',
  'F-1 (US Student Visa)',
  'DV Lottery (US Diversity Visa)',
  'TPS (US Temporary Protected Status)',
  'Express Entry (Canada)',
  'PGWP (Canada Post-Grad Work Permit)',
  'Skilled Worker (UK)',
  'Family Reunion (EU)',
  'Asylum / Refugee Status',
] as const;

export const immigrationService = {
  /**
   * Answer an immigration question with AI guidance.
   */
  async askQuestion(query: ImmigrationQuery): Promise<ImmigrationResponse> {
    const cacheKey = `immigration:${Buffer.from(query.question).toString('base64').slice(0, 48)}`;
    const cached = await redis.get(cacheKey);

    if (cached) {
      const parsed = JSON.parse(cached);
      return { ...parsed, cached: true };
    }

    const contextStr = query.context
      ? `\nContext: Currently in ${query.context.currentCountry ?? 'unknown'}, targeting ${query.context.targetCountry ?? 'unknown'}, nationality: ${query.context.nationality ?? 'Ethiopian/Eritrean'}, visa type of interest: ${query.context.visaType ?? 'not specified'}`
      : '';

    const client = getOpenAI();
    if (!client) {
      logger.warn('OpenAI not configured — immigration AI features disabled');
      return { answer: 'AI features require OpenAI configuration.', disclaimer: true } as any;
    }

    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.3,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You are an immigration information assistant specializing in East African diaspora immigration topics (Ethiopian, Eritrean, Somali communities). You provide accurate general information about immigration processes, visa types, and requirements for the US, Canada, UK, and EU.

IMPORTANT: Always include a disclaimer that this is general information and not legal advice. Always recommend consulting a licensed immigration attorney for individual cases.

Focus on being helpful to Habesha community members navigating immigration systems. Reference community-specific resources (Ethiopian/Eritrean embassies, diaspora organizations, TPS updates, DV lottery) when relevant.

Respond in JSON:
{
  "answer": "detailed answer",
  "disclaimer": "standard legal disclaimer",
  "relatedTopics": ["topic1", "topic2"],
  "resources": [{"title": "", "url": "", "description": ""}]
}`,
        },
        {
          role: 'user',
          content: `${query.question}${contextStr}`,
        },
      ],
    });

    const result = JSON.parse(completion.choices[0]?.message?.content ?? '{}');

    const response: ImmigrationResponse = {
      answer: result.answer ?? 'Unable to process your question. Please try again.',
      disclaimer:
        result.disclaimer ??
        'This information is for general guidance only and does not constitute legal advice. Please consult a qualified immigration attorney for your specific situation.',
      relatedTopics: result.relatedTopics ?? [],
      resources: result.resources ?? [],
      cached: false,
    };

    // Cache the response
    await redis.set(cacheKey, JSON.stringify(response), 'EX', CACHE_TTL);

    logger.info('Immigration question answered', { questionLength: query.question.length });

    return response;
  },

  /**
   * Get info about a specific visa type.
   */
  async getVisaInfo(visaType: string, targetCountry: string): Promise<VisaInfo> {
    const cacheKey = `visa:${visaType}:${targetCountry}`;
    const cached = await redis.get(cacheKey);

    if (cached) return JSON.parse(cached);

    const client = getOpenAI();
    if (!client) {
      logger.warn('OpenAI not configured — immigration AI features disabled');
      return { answer: 'AI features require OpenAI configuration.', disclaimer: true } as any;
    }

    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      max_tokens: 1500,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'Provide detailed visa information. Respond in JSON: {"visaType":"","country":"","description":"","requirements":[""],"processingTime":"","fees":"","tips":[""]}',
        },
        {
          role: 'user',
          content: `Provide detailed information about the ${visaType} visa for ${targetCountry}, with tips specific to Ethiopian/Eritrean applicants.`,
        },
      ],
    });

    const result = JSON.parse(completion.choices[0]?.message?.content ?? '{}');

    const visaInfo: VisaInfo = {
      visaType: result.visaType ?? visaType,
      country: result.country ?? targetCountry,
      description: result.description ?? '',
      requirements: result.requirements ?? [],
      processingTime: result.processingTime ?? 'Varies',
      fees: result.fees ?? 'Varies',
      tips: result.tips ?? [],
    };

    await redis.set(cacheKey, JSON.stringify(visaInfo), 'EX', CACHE_TTL);

    return visaInfo;
  },

  /**
   * Get list of supported visa categories.
   */
  getVisaCategories() {
    return VISA_CATEGORIES;
  },

  /**
   * Check TPS (Temporary Protected Status) eligibility guidance.
   * Particularly relevant for Ethiopian, Eritrean, and Somali nationals.
   */
  async checkTPSEligibility(nationality: string): Promise<{
    eligible: boolean;
    details: string;
    registrationDeadline: string | null;
    resources: { title: string; url: string }[];
  }> {
    const client = getOpenAI();
    if (!client) {
      logger.warn('OpenAI not configured — immigration AI features disabled');
      return { answer: 'AI features require OpenAI configuration.', disclaimer: true } as any;
    }

    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      max_tokens: 800,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'Provide TPS eligibility information. Respond in JSON: {"eligible":true/false,"details":"","registrationDeadline":"","resources":[{"title":"","url":""}]}',
        },
        {
          role: 'user',
          content: `Is TPS (Temporary Protected Status) currently available for ${nationality} nationals in the US? Provide the latest information you have.`,
        },
      ],
    });

    const result = JSON.parse(completion.choices[0]?.message?.content ?? '{}');

    return {
      eligible: result.eligible ?? false,
      details: result.details ?? 'Please check USCIS.gov for the most current information.',
      registrationDeadline: result.registrationDeadline ?? null,
      resources: result.resources ?? [{ title: 'USCIS TPS Page', url: 'https://www.uscis.gov/humanitarian/temporary-protected-status' }],
    };
  },
};
