import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import type { Prisma } from '@prisma/client';

interface CreateNotificationInput {
  userId: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export const notificationService = {
  async create(input: CreateNotificationInput) {
    const notification = await prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        data: (input.data as Prisma.InputJsonValue) ?? undefined,
      },
    });

    logger.info('Notification created', {
      id: notification.id,
      userId: input.userId,
      type: input.type,
    });

    return notification;
  },

  async getByUser(userId: string, options: { unreadOnly?: boolean; limit?: number; offset?: number } = {}) {
    const { unreadOnly = false, limit = 50, offset = 0 } = options;

    const where: { userId: string; isRead?: boolean } = { userId };
    if (unreadOnly) {
      where.isRead = false;
    }

    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.notification.count({ where }),
    ]);

    return { notifications, total };
  },

  async markAsRead(notificationId: string, userId: string) {
    const notification = await prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { isRead: true },
    });

    return notification.count > 0;
  },

  async markAllAsRead(userId: string) {
    const result = await prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });

    logger.info('Marked all notifications read', { userId, count: result.count });
    return result.count;
  },

  async getUnreadCount(userId: string): Promise<number> {
    return prisma.notification.count({
      where: { userId, isRead: false },
    });
  },

  async deleteOld(daysOld: number = 30) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysOld);

    const result = await prisma.notification.deleteMany({
      where: {
        createdAt: { lt: cutoff },
        isRead: true,
      },
    });

    logger.info('Cleaned old notifications', { deleted: result.count });
    return result.count;
  },

  // Helper: send notification for common events
  async notifyLike(postId: string, likerId: string, postAuthorId: string) {
    if (likerId === postAuthorId) return null;

    const liker = await prisma.user.findUnique({ where: { id: likerId }, select: { name: true } });
    return this.create({
      userId: postAuthorId,
      type: 'like',
      title: 'New Like',
      body: `${liker?.name ?? 'Someone'} liked your post`,
      data: { postId, likerId },
    });
  },

  async notifyComment(postId: string, commenterId: string, postAuthorId: string) {
    if (commenterId === postAuthorId) return null;

    const commenter = await prisma.user.findUnique({ where: { id: commenterId }, select: { name: true } });
    return this.create({
      userId: postAuthorId,
      type: 'comment',
      title: 'New Comment',
      body: `${commenter?.name ?? 'Someone'} commented on your post`,
      data: { postId, commenterId },
    });
  },

  async notifyJobMatch(userId: string, jobId: string, matchScore: number) {
    const job = await prisma.job.findUnique({ where: { id: jobId }, select: { title: true } });
    return this.create({
      userId,
      type: 'job_match',
      title: 'Job Match',
      body: `${Math.round(matchScore * 100)}% match: ${job?.title ?? 'New job'}`,
      data: { jobId, matchScore },
    });
  },

  async notifyMessage(userId: string, senderId: string, threadId: string) {
    const sender = await prisma.user.findUnique({ where: { id: senderId }, select: { name: true } });
    return this.create({
      userId,
      type: 'message',
      title: 'New Message',
      body: `${sender?.name ?? 'Someone'} sent you a message`,
      data: { threadId, senderId },
    });
  },
};
