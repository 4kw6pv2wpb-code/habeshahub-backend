import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import type { Language } from '@prisma/client';

interface UpdateProfileInput {
  name?: string;
  bio?: string;
  avatarUrl?: string;
  city?: string;
  country?: string;
  phone?: string;
  languages?: Language[];
}

export const userService = {
  async getById(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        bio: true,
        avatarUrl: true,
        city: true,
        country: true,
        languages: true,
        role: true,
        isVerified: true,
        createdAt: true,
        _count: {
          select: {
            posts: true,
            applications: true,
            eventRSVPs: true,
          },
        },
      },
    });

    return user;
  },

  async updateProfile(userId: string, input: UpdateProfileInput) {
    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.bio !== undefined && { bio: input.bio }),
        ...(input.avatarUrl !== undefined && { avatarUrl: input.avatarUrl }),
        ...(input.city !== undefined && { city: input.city }),
        ...(input.country !== undefined && { country: input.country }),
        ...(input.phone !== undefined && { phone: input.phone }),
        ...(input.languages !== undefined && { languages: input.languages }),
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        bio: true,
        avatarUrl: true,
        city: true,
        country: true,
        languages: true,
        role: true,
        isVerified: true,
      },
    });

    logger.info('User profile updated', { userId });
    return user;
  },

  async search(query: string, options: { limit?: number; offset?: number } = {}) {
    const { limit = 20, offset = 0 } = options;

    const users = await prisma.user.findMany({
      where: {
        isActive: true,
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { city: { contains: query, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        name: true,
        avatarUrl: true,
        city: true,
        country: true,
        languages: true,
        bio: true,
      },
      take: limit,
      skip: offset,
      orderBy: { name: 'asc' },
    });

    return users;
  },

  async deactivate(userId: string) {
    await prisma.user.update({
      where: { id: userId },
      data: { isActive: false },
    });

    logger.info('User deactivated', { userId });
  },

  async getStats(userId: string) {
    const [postsCount, jobsApplied, eventsAttended, remittancesSent] = await Promise.all([
      prisma.post.count({ where: { authorId: userId } }),
      prisma.application.count({ where: { applicantId: userId } }),
      prisma.event.count({ where: { attendees: { some: { id: userId } } } }),
      prisma.remittance.count({ where: { userId, status: 'PAID' } }),
    ]);

    return { postsCount, jobsApplied, eventsAttended, remittancesSent };
  },
};
