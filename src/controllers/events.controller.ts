/**
 * Events controller.
 * Handles /events routes.
 */

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as EventsService from '../services/events.service';
import { buildPaginationMeta } from '../utils/helpers';
import type { AuthenticatedRequest } from '../types';

// ─────────────────────────────────────────────
// Zod schemas
// ─────────────────────────────────────────────

export const createEventSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().max(5000).optional(),
  location: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  isOnline: z.boolean().optional(),
  meetingUrl: z.string().url().optional(),
  date: z.coerce.date().refine(
    (d) => d > new Date(),
    'Event date must be in the future',
  ),
  endDate: z.coerce.date().optional(),
  coverUrl: z.string().url().optional(),
  maxAttendees: z.number().int().positive().optional(),
  isPublic: z.boolean().optional(),
});

export const eventFilterSchema = z.object({
  city: z.string().optional(),
  upcoming: z
    .string()
    .transform((v) => v === 'true')
    .optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

// ─────────────────────────────────────────────
// Handlers
// ─────────────────────────────────────────────

/**
 * GET /events
 */
export async function listEvents(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const filters = eventFilterSchema.parse(req.query);
    const result = await EventsService.listEvents(filters);

    res.status(200).json({
      success: true,
      data: result.events,
      meta: buildPaginationMeta(result.total, result.page, result.limit),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /events/:id
 */
export async function getEvent(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const event = await EventsService.getEventById(req.params.id);
    res.status(200).json({ success: true, data: event });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /events
 */
export async function createEvent(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id: organizerId } = (req as AuthenticatedRequest).user;
    const input = createEventSchema.parse(req.body);

    const event = await EventsService.createEvent(organizerId, input);

    res.status(201).json({
      success: true,
      data: event,
      message: 'Event created successfully',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /events/:id/rsvp
 */
export async function rsvpEvent(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id: userId } = (req as AuthenticatedRequest).user;
    const { id: eventId } = req.params;

    const result = await EventsService.rsvpToEvent(eventId, userId);

    res.status(200).json({
      success: true,
      data: result,
      message: result.attending ? 'RSVP confirmed' : 'RSVP removed',
    });
  } catch (err) {
    next(err);
  }
}
