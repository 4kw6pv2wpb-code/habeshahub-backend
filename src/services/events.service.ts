/**
 * Events service.
 * Manages community events including creation, listing, and RSVP.
 */

import { prisma } from '../config/database';
import { AppError } from '../middlewares/errorHandler';
import { logger } from '../utils/logger';
import { parsePagination } from '../utils/helpers';
import type { PaginationQuery } from '../types';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface CreateEventInput {
  title: string;
  description?: string;
  location?: string;
  city?: string;
  country?: string;
  isOnline?: boolean;
  meetingUrl?: string;
  date: Date;
  endDate?: Date;
  coverUrl?: string;
  maxAttendees?: number;
  isPublic?: boolean;
}

export interface EventFilters extends PaginationQuery {
  city?: string;
  upcoming?: boolean;
  search?: string;
}

// ─────────────────────────────────────────────
// Service operations
// ─────────────────────────────────────────────

/**
 * List events with optional filters.
 */
export async function listEvents(filters: EventFilters) {
  const { city, upcoming, search } = filters;
  const { page, limit, skip } = parsePagination(filters);
  const now = new Date();

  const where = {
    isPublic: true,
    ...(city ? { city: { contains: city, mode: 'insensitive' as const } } : {}),
    ...(upcoming ? { date: { gte: now } } : {}),
    ...(search
      ? {
          OR: [
            { title: { contains: search, mode: 'insensitive' as const } },
            { description: { contains: search, mode: 'insensitive' as const } },
            { location: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };

  const [events, total] = await Promise.all([
    prisma.event.findMany({
      where,
      include: {
        organizer: {
          select: { id: true, name: true, avatarUrl: true },
        },
        _count: { select: { attendees: true } },
      },
      orderBy: { date: 'asc' },
      take: limit,
      skip,
    }),
    prisma.event.count({ where }),
  ]);

  return { events, total, page, limit };
}

/**
 * Get a single event by ID.
 */
export async function getEventById(eventId: string) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      organizer: {
        select: { id: true, name: true, avatarUrl: true, city: true },
      },
      attendees: {
        select: { id: true, name: true, avatarUrl: true },
        take: 20,
      },
      _count: { select: { attendees: true } },
    },
  });

  if (!event) {
    throw AppError.notFound('Event not found');
  }

  return event;
}

/**
 * Create a new event.
 */
export async function createEvent(
  organizerId: string,
  input: CreateEventInput,
) {
  const event = await prisma.event.create({
    data: {
      organizerId,
      title: input.title,
      description: input.description ?? null,
      location: input.location ?? null,
      city: input.city ?? null,
      country: input.country ?? null,
      isOnline: input.isOnline ?? false,
      meetingUrl: input.meetingUrl ?? null,
      date: input.date,
      endDate: input.endDate ?? null,
      coverUrl: input.coverUrl ?? null,
      maxAttendees: input.maxAttendees ?? null,
      isPublic: input.isPublic ?? true,
    },
    include: {
      organizer: {
        select: { id: true, name: true, avatarUrl: true },
      },
    },
  });

  logger.info('Event created', { eventId: event.id, organizerId });
  return event;
}

/**
 * RSVP to an event (toggle — calling again will remove the RSVP).
 */
export async function rsvpToEvent(
  eventId: string,
  userId: string,
): Promise<{ attending: boolean; attendeeCount: number }> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      _count: { select: { attendees: true } },
      attendees: { where: { id: userId }, select: { id: true } },
    },
  });

  if (!event) {
    throw AppError.notFound('Event not found');
  }

  const isAlreadyAttending = event.attendees.length > 0;

  if (isAlreadyAttending) {
    // Remove RSVP
    await prisma.event.update({
      where: { id: eventId },
      data: { attendees: { disconnect: { id: userId } } },
    });

    const newCount = event._count.attendees - 1;
    logger.info('RSVP removed', { eventId, userId });
    return { attending: false, attendeeCount: newCount };
  } else {
    // Check capacity if set
    if (
      event.maxAttendees !== null &&
      event._count.attendees >= event.maxAttendees
    ) {
      throw AppError.badRequest('This event has reached its maximum capacity');
    }

    await prisma.event.update({
      where: { id: eventId },
      data: { attendees: { connect: { id: userId } } },
    });

    const newCount = event._count.attendees + 1;
    logger.info('RSVP added', { eventId, userId });
    return { attending: true, attendeeCount: newCount };
  }
}
