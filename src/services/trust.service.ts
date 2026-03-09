/**
 * Trust & Moderation service.
 * Handles user reports and moderator actions.
 */

import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';
import { AppError } from '../middlewares/errorHandler';

const prisma = new PrismaClient();
const db = prisma as any; // For models not yet generated

// ─────────────────────────────────────────────
// Reports
// ─────────────────────────────────────────────

/**
 * File a report against a user or piece of content.
 */
export async function createReport(
  reporterId: string,
  data: {
    reportedId: string;
    reason: string;
    description?: string;
    contentType?: string;
    contentId?: string;
  },
) {
  if (reporterId === data.reportedId) {
    throw new AppError('Cannot report yourself', 400);
  }

  const report = await db.userReport.create({
    data: {
      reporterId,
      reportedId: data.reportedId,
      reason: data.reason,
      description: data.description ?? null,
      contentType: data.contentType ?? null,
      contentId: data.contentId ?? null,
      status: 'PENDING',
    },
  });

  logger.info('User report created', { reportId: report.id, reporterId, reportedId: data.reportedId });
  return report;
}

/**
 * List all reports, optionally filtered by status (admin/moderator).
 */
export async function getReports(page = 1, limit = 20, status?: string) {
  const skip = (page - 1) * limit;
  const where = status ? { status } : {};

  const [items, total] = await Promise.all([
    db.userReport.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    db.userReport.count({ where }),
  ]);

  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
}

/**
 * Get a single report by ID.
 */
export async function getReportById(id: string) {
  const report = await db.userReport.findUnique({ where: { id } });

  if (!report) {
    throw AppError.notFound('Report not found');
  }

  return report;
}

/**
 * Resolve a report — update status and record resolution.
 */
export async function resolveReport(
  reportId: string,
  moderatorId: string,
  resolution: string,
  status: string,
) {
  const report = await db.userReport.findUnique({ where: { id: reportId } });

  if (!report) throw AppError.notFound('Report not found');
  if (report.status === 'RESOLVED' || report.status === 'DISMISSED') {
    throw new AppError('Report is already closed', 400);
  }

  const updated = await db.userReport.update({
    where: { id: reportId },
    data: {
      status,
      resolvedBy: moderatorId,
      resolvedAt: new Date(),
      resolution,
    },
  });

  logger.info('Report resolved', { reportId, moderatorId, status });
  return updated;
}

// ─────────────────────────────────────────────
// Moderation Actions
// ─────────────────────────────────────────────

/**
 * Take a moderation action against a user.
 */
export async function takeModAction(
  moderatorId: string,
  targetId: string,
  action: string,
  reason: string,
  contentType?: string,
  contentId?: string,
  duration?: number, // duration in minutes
) {
  const expiresAt =
    duration ? new Date(Date.now() + duration * 60 * 1000) : null;

  const log = await db.moderationLog.create({
    data: {
      moderatorId,
      targetId,
      action,
      reason,
      contentType: contentType ?? null,
      contentId: contentId ?? null,
      duration: duration ?? null,
      expiresAt,
    },
  });

  logger.info('Moderation action taken', { moderatorId, targetId, action });
  return log;
}

/**
 * Get moderation log entries, optionally filtered by target user.
 */
export async function getModLogs(page = 1, limit = 20, targetId?: string) {
  const skip = (page - 1) * limit;
  const where = targetId ? { targetId } : {};

  const [items, total] = await Promise.all([
    db.moderationLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    db.moderationLog.count({ where }),
  ]);

  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
}

/**
 * Get all reports filed against a specific user.
 */
export async function getUserReportHistory(userId: string) {
  const reports = await db.userReport.findMany({
    where: { reportedId: userId },
    orderBy: { createdAt: 'desc' },
  });

  return reports;
}

/**
 * Aggregate moderation stats.
 */
export async function getModStats() {
  const [
    totalReports,
    pendingReports,
    reviewingReports,
    resolvedReports,
    dismissedReports,
    totalActions,
    actionsByType,
  ] = await Promise.all([
    db.userReport.count(),
    db.userReport.count({ where: { status: 'PENDING' } }),
    db.userReport.count({ where: { status: 'REVIEWING' } }),
    db.userReport.count({ where: { status: 'RESOLVED' } }),
    db.userReport.count({ where: { status: 'DISMISSED' } }),
    db.moderationLog.count(),
    db.moderationLog.groupBy({
      by: ['action'],
      _count: { action: true },
    }),
  ]);

  return {
    reports: {
      total: totalReports,
      pending: pendingReports,
      reviewing: reviewingReports,
      resolved: resolvedReports,
      dismissed: dismissedReports,
    },
    actions: {
      total: totalActions,
      byType: actionsByType,
    },
  };
}
