/**
 * Dating Service.
 * Handles profile creation, discover feed, swiping, and match detection.
 * Uses the DatingProfile, Swipe, and Match Prisma models.
 */

import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { pushNotification } from './socket.gateway';
import type { DatingGoal } from '@prisma/client';

interface DiscoverOptions {
  limit?: number;
  offset?: number;
}

interface SwipeInput {
  swiperId: string;
  targetId: string;
  direction: 'left' | 'right';
}

interface ProfileInput {
  headline?: string;
  aboutMe?: string;
  interests?: string[];
  ageMin?: number;
  ageMax?: number;
  goal?: DatingGoal;
  birthDate?: string;
  height?: number;
  education?: string;
  occupation?: string;
  photoUrls?: string[];
  maxDistance?: number;
}

export const datingService = {
  /**
   * Get or create a dating profile for a user.
   */
  async getProfile(userId: string) {
    let profile = await prisma.datingProfile.findUnique({
      where: { userId },
      include: { user: { select: { name: true, avatarUrl: true, city: true, country: true, languages: true } } },
    });

    if (!profile) {
      profile = await prisma.datingProfile.create({
        data: { userId },
        include: { user: { select: { name: true, avatarUrl: true, city: true, country: true, languages: true } } },
      });
    }

    return profile;
  },

  /**
   * Update a user's dating profile.
   */
  async updateProfile(userId: string, data: ProfileInput) {
    const profile = await prisma.datingProfile.upsert({
      where: { userId },
      create: {
        userId,
        ...data,
        birthDate: data.birthDate ? new Date(data.birthDate) : undefined,
      },
      update: {
        ...data,
        birthDate: data.birthDate ? new Date(data.birthDate) : undefined,
      },
      include: { user: { select: { name: true, avatarUrl: true, city: true, country: true } } },
    });

    return profile;
  },

  /**
   * Get discover profiles — people the user hasn't swiped on yet.
   */
  async getDiscoverProfiles(userId: string, options: DiscoverOptions = {}) {
    const { limit = 10, offset = 0 } = options;

    // Get IDs the user has already swiped on
    const swipedIds = await prisma.swipe.findMany({
      where: { swiperId: userId },
      select: { targetId: true },
    });
    const excludeIds = [userId, ...swipedIds.map((s) => s.targetId)];

    // Find active dating profiles not yet swiped
    const profiles = await prisma.datingProfile.findMany({
      where: {
        isActive: true,
        userId: { notIn: excludeIds },
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
            city: true,
            country: true,
            languages: true,
            bio: true,
          },
        },
      },
      take: limit,
      skip: offset,
      orderBy: { createdAt: 'desc' },
    });

    return profiles;
  },

  /**
   * Record a swipe and check for mutual match.
   */
  async swipe(input: SwipeInput) {
    const { swiperId, targetId, direction } = input;

    // Record the swipe
    const swipe = await prisma.swipe.upsert({
      where: { swiperId_targetId: { swiperId, targetId } },
      create: {
        swiperId,
        targetId,
        direction: direction === 'right' ? 'RIGHT' : 'LEFT',
      },
      update: {
        direction: direction === 'right' ? 'RIGHT' : 'LEFT',
      },
    });

    // If left swipe, no match possible
    if (direction === 'left') {
      return { swipe, isMatch: false, match: null };
    }

    // Check if the other person already swiped right on us
    const reciprocal = await prisma.swipe.findUnique({
      where: { swiperId_targetId: { swiperId: targetId, targetId: swiperId } },
    });

    if (reciprocal && reciprocal.direction === 'RIGHT') {
      // Mutual match — create a match and DM thread
      const [userA, userB] = swiperId < targetId ? [swiperId, targetId] : [targetId, swiperId];

      // Create thread for the match
      const thread = await prisma.thread.create({
        data: {
          participants: { connect: [{ id: swiperId }, { id: targetId }] },
        },
      });

      const match = await prisma.match.create({
        data: {
          userAId: userA,
          userBId: userB,
          threadId: thread.id,
        },
      });

      // Notify both users
      const swiperUser = await prisma.user.findUnique({ where: { id: swiperId }, select: { name: true } });
      const targetUser = await prisma.user.findUnique({ where: { id: targetId }, select: { name: true } });

      pushNotification(swiperId, {
        id: match.id,
        type: 'dating_match',
        title: 'New Match!',
        body: `You matched with ${targetUser?.name ?? 'someone'}`,
        data: { matchId: match.id, threadId: thread.id },
      });

      pushNotification(targetId, {
        id: match.id,
        type: 'dating_match',
        title: 'New Match!',
        body: `You matched with ${swiperUser?.name ?? 'someone'}`,
        data: { matchId: match.id, threadId: thread.id },
      });

      logger.info('Dating match created', { userA, userB, matchId: match.id });

      return { swipe, isMatch: true, match: { ...match, threadId: thread.id } };
    }

    return { swipe, isMatch: false, match: null };
  },

  /**
   * Get all matches for a user.
   */
  async getMatches(userId: string) {
    const matches = await prisma.match.findMany({
      where: {
        OR: [{ userAId: userId }, { userBId: userId }],
      },
      include: {
        userA: { select: { id: true, name: true, avatarUrl: true, city: true } },
        userB: { select: { id: true, name: true, avatarUrl: true, city: true } },
        thread: { select: { id: true, lastMessageAt: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Return with the "other" user highlighted
    return matches.map((match) => {
      const otherUser = match.userAId === userId ? match.userB : match.userA;
      return {
        matchId: match.id,
        otherUser,
        threadId: match.threadId,
        lastMessageAt: match.thread?.lastMessageAt,
        matchedAt: match.createdAt,
      };
    });
  },

  /**
   * Unmatch — remove a match and optionally delete the thread.
   */
  async unmatch(userId: string, matchId: string) {
    const match = await prisma.match.findFirst({
      where: {
        id: matchId,
        OR: [{ userAId: userId }, { userBId: userId }],
      },
    });

    if (!match) throw new Error('Match not found');

    await prisma.match.delete({ where: { id: matchId } });

    logger.info('Match removed', { matchId, userId });

    return { success: true };
  },
};
