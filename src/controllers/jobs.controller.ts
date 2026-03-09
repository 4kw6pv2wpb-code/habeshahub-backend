/**
 * Jobs controller.
 * Handles /jobs routes.
 */

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as JobsService from '../services/jobs.service';
import { buildPaginationMeta } from '../utils/helpers';
import { JobType } from '@prisma/client';
import type { AuthenticatedRequest } from '../types';

// ─────────────────────────────────────────────
// Zod schemas
// ─────────────────────────────────────────────

export const createJobSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().min(10).max(10000),
  skills: z.array(z.string()).min(1, 'At least one skill required'),
  payMin: z.number().int().nonnegative().optional(),
  payMax: z.number().int().nonnegative().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  remote: z.boolean().optional(),
  jobType: z.nativeEnum(JobType).optional(),
}).refine(
  (data) => {
    if (data.payMin !== undefined && data.payMax !== undefined) {
      return data.payMin <= data.payMax;
    }
    return true;
  },
  { message: 'payMin must be less than or equal to payMax' },
);

export const applyJobSchema = z.object({
  coverLetter: z.string().max(5000).optional(),
  resumeUrl: z.string().url().optional(),
});

export const jobFilterSchema = z.object({
  city: z.string().optional(),
  remote: z
    .string()
    .transform((v) => v === 'true')
    .optional(),
  jobType: z.nativeEnum(JobType).optional(),
  skills: z
    .string()
    .transform((v) => v.split(',').map((s) => s.trim()))
    .optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

// ─────────────────────────────────────────────
// Handlers
// ─────────────────────────────────────────────

/**
 * GET /jobs
 */
export async function listJobs(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const filters = jobFilterSchema.parse(req.query);
    const result = await JobsService.listJobs(filters);

    res.status(200).json({
      success: true,
      data: result.jobs,
      meta: buildPaginationMeta(result.total, result.page, result.limit),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /jobs/:id
 */
export async function getJob(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const job = await JobsService.getJobById(req.params.id);
    res.status(200).json({ success: true, data: job });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /jobs
 */
export async function createJob(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id: posterId } = (req as AuthenticatedRequest).user;
    const input = createJobSchema.parse(req.body);

    const job = await JobsService.createJob(posterId, input);

    res.status(201).json({
      success: true,
      data: job,
      message: 'Job listing created',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /jobs/:id/apply
 */
export async function applyToJob(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id: applicantId } = (req as AuthenticatedRequest).user;
    const { id: jobId } = req.params;
    const data = applyJobSchema.parse(req.body);

    const application = await JobsService.applyToJob(jobId, applicantId, data);

    res.status(201).json({
      success: true,
      data: application,
      message: 'Application submitted successfully',
    });
  } catch (err) {
    next(err);
  }
}
