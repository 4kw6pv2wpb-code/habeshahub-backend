/**
 * Jobs service.
 * CRUD operations for job listings plus AI-powered applicant matching.
 */

import { prisma } from '../config/database';
import { AppError } from '../middlewares/errorHandler';
import { logger } from '../utils/logger';
import { parsePagination } from '../utils/helpers';
import type { PaginationQuery } from '../types';
import { JobType } from '@prisma/client';

// ─────────────────────────────────────────────
// Input types
// ─────────────────────────────────────────────

export interface CreateJobInput {
  title: string;
  description: string;
  skills: string[];
  payMin?: number;
  payMax?: number;
  city?: string;
  country?: string;
  remote?: boolean;
  jobType?: JobType;
}

export interface JobFilters {
  city?: string;
  remote?: boolean;
  jobType?: JobType;
  skills?: string[];
  search?: string;
  page?: number;
  limit?: number;
}

// ─────────────────────────────────────────────
// CRUD operations
// ─────────────────────────────────────────────

/**
 * List all active jobs with optional filtering.
 */
export async function listJobs(filters: JobFilters) {
  const { city, remote, jobType, skills, search } = filters;
  const { page, limit, skip } = parsePagination(filters as PaginationQuery);

  const where = {
    isActive: true,
    ...(city ? { city: { contains: city, mode: 'insensitive' as const } } : {}),
    ...(remote !== undefined ? { remote } : {}),
    ...(jobType ? { jobType } : {}),
    ...(skills && skills.length > 0
      ? { skills: { hasSome: skills } }
      : {}),
    ...(search
      ? {
          OR: [
            { title: { contains: search, mode: 'insensitive' as const } },
            { description: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };

  const [jobs, total] = await Promise.all([
    prisma.job.findMany({
      where,
      include: {
        poster: {
          select: { id: true, name: true, avatarUrl: true, city: true },
        },
        _count: { select: { applications: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip,
    }),
    prisma.job.count({ where }),
  ]);

  return { jobs, total, page, limit };
}

/**
 * Get a single job by ID.
 */
export async function getJobById(jobId: string) {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: {
      poster: {
        select: { id: true, name: true, avatarUrl: true, city: true, email: true },
      },
      _count: { select: { applications: true } },
    },
  });

  if (!job) {
    throw AppError.notFound('Job not found');
  }

  return job;
}

/**
 * Create a new job listing.
 */
export async function createJob(posterId: string, input: CreateJobInput) {
  const job = await prisma.job.create({
    data: {
      posterId,
      title: input.title,
      description: input.description,
      skills: input.skills,
      payMin: input.payMin ?? null,
      payMax: input.payMax ?? null,
      city: input.city ?? null,
      country: input.country ?? null,
      remote: input.remote ?? false,
      jobType: input.jobType ?? JobType.FULL_TIME,
    },
    include: {
      poster: {
        select: { id: true, name: true, avatarUrl: true },
      },
    },
  });

  logger.info('Job created', { jobId: job.id, posterId });
  return job;
}

/**
 * Apply to a job listing.
 */
export async function applyToJob(
  jobId: string,
  applicantId: string,
  data: { coverLetter?: string; resumeUrl?: string },
) {
  // Ensure job exists and is active
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { id: true, isActive: true, posterId: true, skills: true },
  });

  if (!job) {
    throw AppError.notFound('Job not found');
  }

  if (!job.isActive) {
    throw AppError.badRequest('This job listing is no longer active');
  }

  if (job.posterId === applicantId) {
    throw AppError.badRequest('You cannot apply to your own job listing');
  }

  // Calculate AI match score between applicant profile and job
  const matchScore = await computeJobMatchScore(applicantId, job.skills);

  const application = await prisma.application.create({
    data: {
      jobId,
      applicantId,
      coverLetter: data.coverLetter ?? null,
      resumeUrl: data.resumeUrl ?? null,
      matchScore,
    },
  });

  logger.info('Job application submitted', {
    applicationId: application.id,
    jobId,
    applicantId,
    matchScore,
  });

  return application;
}

// ─────────────────────────────────────────────
// AI matching
// ─────────────────────────────────────────────

/**
 * Compute a simple skill-overlap match score between a user and a job's skills.
 * Returns a 0–1 float.
 *
 * In production this would call an embedding model via OpenAI to compute
 * semantic similarity. Here we implement a keyword-overlap heuristic.
 */
async function computeJobMatchScore(
  applicantId: string,
  jobSkills: string[],
): Promise<number> {
  if (jobSkills.length === 0) return 0;

  // Fetch past applications to infer the applicant's skill set
  const pastApplications = await prisma.application.findMany({
    where: { applicantId },
    include: { job: { select: { skills: true } } },
    take: 10,
  });

  // Aggregate all skills from past jobs the user applied to
  const userSkills = new Set<string>(
    pastApplications.flatMap((a) =>
      a.job.skills.map((s) => s.toLowerCase()),
    ),
  );

  if (userSkills.size === 0) {
    // No history — neutral score
    return 0.5;
  }

  const normalizedJobSkills = jobSkills.map((s) => s.toLowerCase());
  const matchingSkills = normalizedJobSkills.filter((s) => userSkills.has(s));

  const jaccardScore =
    matchingSkills.length /
    (userSkills.size + normalizedJobSkills.length - matchingSkills.length);

  logger.debug('Job match score computed', {
    applicantId,
    jobSkillCount: jobSkills.length,
    matchingSkills: matchingSkills.length,
    score: jaccardScore,
  });

  return parseFloat(jaccardScore.toFixed(4));
}
