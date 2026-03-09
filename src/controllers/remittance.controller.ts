/**
 * Remittance controller.
 * Handles /remittance routes.
 */

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as RemittanceService from '../services/remittance.service';
import { SUPPORTED_CORRIDORS } from '../utils/constants';
import type { AuthenticatedRequest } from '../types';

// ─────────────────────────────────────────────
// Zod schemas
// ─────────────────────────────────────────────

export const quoteSchema = z.object({
  amount: z.number().positive('Amount must be positive'),
  corridor: z.string().refine(
    (c) => SUPPORTED_CORRIDORS.includes(c as (typeof SUPPORTED_CORRIDORS)[number]),
    `Corridor must be one of: ${SUPPORTED_CORRIDORS.join(', ')}`,
  ),
});

export const sendRemittanceSchema = z.object({
  amount: z.number().positive('Amount must be positive'),
  corridor: z.string().refine(
    (c) => SUPPORTED_CORRIDORS.includes(c as (typeof SUPPORTED_CORRIDORS)[number]),
    `Corridor must be one of: ${SUPPORTED_CORRIDORS.join(', ')}`,
  ),
  recipientName: z.string().min(2).max(100),
  recipientPhone: z.string().optional(),
  recipientBank: z.string().optional(),
});

// ─────────────────────────────────────────────
// Handlers
// ─────────────────────────────────────────────

/**
 * POST /remittance/quote
 * Calculate a remittance quote without creating a transaction.
 */
export async function getQuote(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { amount, corridor } = quoteSchema.parse(req.body);
    const quote = RemittanceService.getRemittanceQuote(amount, corridor);

    res.status(200).json({
      success: true,
      data: quote,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /remittance/send
 * Initiate a remittance transaction.
 */
export async function sendRemittance(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id: userId } = (req as AuthenticatedRequest).user;
    const input = sendRemittanceSchema.parse(req.body);

    const remittance = await RemittanceService.sendRemittance(userId, input);

    res.status(201).json({
      success: true,
      data: remittance,
      message: 'Remittance initiated successfully',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /remittance
 * Get all remittances for the authenticated user.
 */
export async function getUserRemittances(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id: userId } = (req as AuthenticatedRequest).user;
    const remittances = await RemittanceService.getUserRemittances(userId);

    res.status(200).json({
      success: true,
      data: remittances,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /remittance/:id
 * Get a single remittance by ID.
 */
export async function getRemittanceById(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id: userId } = (req as AuthenticatedRequest).user;
    const remittance = await RemittanceService.getRemittanceById(
      req.params.id,
      userId,
    );

    res.status(200).json({
      success: true,
      data: remittance,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /remittance/corridors
 * List supported corridors and current exchange rates.
 */
export async function listCorridors(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { EXCHANGE_RATES, RECIPIENT_CURRENCIES, REMITTANCE_FEE_PERCENT } =
      await import('../utils/constants');

    const corridors = SUPPORTED_CORRIDORS.map((corridor) => ({
      corridor,
      exchangeRate: EXCHANGE_RATES[corridor],
      recipientCurrency: RECIPIENT_CURRENCIES[corridor],
      feePercent: REMITTANCE_FEE_PERCENT * 100,
    }));

    res.status(200).json({
      success: true,
      data: corridors,
    });
  } catch (err) {
    next(err);
  }
}
