/**
 * AI Resume Assistant Service.
 * Helps users build, optimize, and match their resumes for diaspora job opportunities.
 * Uses OpenAI for intelligent suggestions and skill gap analysis.
 */

import OpenAI from 'openai';
import { prisma } from '../config/database';
import { env } from '../config/env';
import { logger } from '../utils/logger';

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

interface ResumeData {
  name: string;
  email: string;
  phone?: string;
  summary?: string;
  experience: {
    title: string;
    company: string;
    startDate: string;
    endDate?: string;
    description: string;
  }[];
  education: {
    degree: string;
    institution: string;
    year: number;
  }[];
  skills: string[];
  languages: string[];
  certifications?: string[];
}

interface ResumeReview {
  overallScore: number;       // 0-100
  strengths: string[];
  improvements: string[];
  missingKeywords: string[];
  formattingSuggestions: string[];
  atsScore: number;           // ATS compatibility score 0-100
}

interface JobMatchAnalysis {
  matchScore: number;         // 0-100
  matchedSkills: string[];
  missingSkills: string[];
  suggestions: string[];
  customSummary: string;      // AI-generated summary tailored to the job
}

export const resumeService = {
  /**
   * Analyze and score a resume, providing actionable feedback.
   */
  async reviewResume(resume: ResumeData): Promise<ResumeReview> {
    const prompt = `You are an expert career advisor specializing in the African diaspora job market in the US, Canada, and Europe. Review this resume and provide detailed feedback.

Resume:
Name: ${resume.name}
Summary: ${resume.summary ?? 'Not provided'}
Experience: ${resume.experience.map((e) => `${e.title} at ${e.company} (${e.startDate} - ${e.endDate ?? 'Present'}): ${e.description}`).join('\n')}
Education: ${resume.education.map((e) => `${e.degree} from ${e.institution} (${e.year})`).join('\n')}
Skills: ${resume.skills.join(', ')}
Languages: ${resume.languages.join(', ')}

Respond in JSON format:
{
  "overallScore": <0-100>,
  "strengths": ["..."],
  "improvements": ["..."],
  "missingKeywords": ["..."],
  "formattingSuggestions": ["..."],
  "atsScore": <0-100>
}`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.4,
      max_tokens: 1500,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'You are a professional resume reviewer. Always respond in valid JSON.' },
        { role: 'user', content: prompt },
      ],
    });

    const result = JSON.parse(completion.choices[0]?.message?.content ?? '{}');

    logger.info('Resume reviewed', { name: resume.name, score: result.overallScore });

    return {
      overallScore: result.overallScore ?? 50,
      strengths: result.strengths ?? [],
      improvements: result.improvements ?? [],
      missingKeywords: result.missingKeywords ?? [],
      formattingSuggestions: result.formattingSuggestions ?? [],
      atsScore: result.atsScore ?? 50,
    };
  },

  /**
   * Match a resume against a specific job posting.
   */
  async matchToJob(resume: ResumeData, jobId: string): Promise<JobMatchAnalysis> {
    const job = await prisma.job.findUnique({ where: { id: jobId } });

    if (!job) throw new Error('Job not found');

    const prompt = `Analyze how well this candidate matches the job posting. Provide match analysis.

CANDIDATE:
Skills: ${resume.skills.join(', ')}
Experience: ${resume.experience.map((e) => `${e.title} at ${e.company}`).join(', ')}
Languages: ${resume.languages.join(', ')}

JOB POSTING:
Title: ${job.title}
Description: ${job.description}
Required Skills: ${job.skills.join(', ')}
Location: ${job.city ?? 'Not specified'}, ${job.country ?? ''}
Type: ${job.jobType}
Remote: ${job.remote ? 'Yes' : 'No'}

Respond in JSON:
{
  "matchScore": <0-100>,
  "matchedSkills": ["..."],
  "missingSkills": ["..."],
  "suggestions": ["..."],
  "customSummary": "A tailored professional summary for this specific job"
}`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.4,
      max_tokens: 1500,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'You are an expert ATS optimizer and career coach. Respond in valid JSON.' },
        { role: 'user', content: prompt },
      ],
    });

    const result = JSON.parse(completion.choices[0]?.message?.content ?? '{}');

    logger.info('Job match analysis completed', { jobId, matchScore: result.matchScore });

    return {
      matchScore: result.matchScore ?? 0,
      matchedSkills: result.matchedSkills ?? [],
      missingSkills: result.missingSkills ?? [],
      suggestions: result.suggestions ?? [],
      customSummary: result.customSummary ?? '',
    };
  },

  /**
   * Generate a professional summary tailored for diaspora professionals.
   */
  async generateSummary(resume: ResumeData): Promise<string> {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.6,
      max_tokens: 300,
      messages: [
        {
          role: 'system',
          content:
            'You are a professional resume writer who specializes in helping East African diaspora professionals. Write a compelling professional summary that highlights their unique multicultural perspective and professional capabilities.',
        },
        {
          role: 'user',
          content: `Write a professional summary for:\nName: ${resume.name}\nExperience: ${resume.experience.map((e) => `${e.title} at ${e.company}`).join(', ')}\nSkills: ${resume.skills.join(', ')}\nLanguages: ${resume.languages.join(', ')}\nEducation: ${resume.education.map((e) => `${e.degree} from ${e.institution}`).join(', ')}`,
        },
      ],
    });

    return completion.choices[0]?.message?.content?.trim() ?? '';
  },

  /**
   * Suggest skills to learn based on current profile and target jobs.
   */
  async suggestSkills(userId: string): Promise<{ skill: string; reason: string; priority: string }[]> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { bio: true, city: true },
    });

    // Get recent jobs the user has viewed/applied to
    const applications = await prisma.application.findMany({
      where: { applicantId: userId },
      include: { job: { select: { skills: true, title: true } } },
      take: 10,
      orderBy: { createdAt: 'desc' },
    });

    const targetSkills = applications.flatMap((app) => app.job.skills);
    const uniqueTargetSkills = [...new Set(targetSkills)];

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.4,
      max_tokens: 800,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'Suggest skills to learn based on the user profile and job market trends. Respond in JSON: { "suggestions": [{ "skill": "", "reason": "", "priority": "high|medium|low" }] }',
        },
        {
          role: 'user',
          content: `User bio: ${user?.bio ?? 'Not provided'}\nLocation: ${user?.city ?? 'Unknown'}\nTarget job skills: ${uniqueTargetSkills.join(', ')}\nApplied to: ${applications.map((a) => a.job.title).join(', ')}`,
        },
      ],
    });

    const result = JSON.parse(completion.choices[0]?.message?.content ?? '{"suggestions":[]}');
    return result.suggestions ?? [];
  },
};
