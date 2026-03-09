/**
 * Remittance service.
 * Handles corridor routing, fee calculation, exchange rates, and status tracking.
 *
 * Supported corridors:
 *   US-ET  — USD → ETB (US to Ethiopia)
 *   EU-ET  — EUR → ETB (Europe to Ethiopia)
 *   US-ER  — USD → ERN (US to Eritrea)
 */

import { prisma } from '../config/database';
import { AppError } from '../middlewares/errorHandler';
import { logger } from '../utils/logger';
import {
  SUPPORTED_CORRIDORS,
  EXCHANGE_RATES,
  REMITTANCE_FEE_PERCENT,
  RECIPIENT_CURRENCIES,
  type Corridor,
} from '../utils/constants';
import type { RemittanceQuote } from '../types';
import { RemittanceStatus } from '@prisma/client';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface SendRemittanceInput {
  amount: number;
  corridor: string;
  recipientName: string;
  recipientPhone?: string;
  recipientBank?: string;
}

// ─────────────────────────────────────────────
// Quote
// ─────────────────────────────────────────────

/**
 * Calculate a remittance quote without creating a record.
 *
 * Formula:
 *   feeAmount       = amount * FEE_PERCENT (1%)
 *   netSendAmount   = amount - feeAmount
 *   recipientAmount = netSendAmount * exchangeRate
 */
export function getRemittanceQuote(
  amount: number,
  corridor: string,
): RemittanceQuote {
  validateCorridor(corridor);

  if (amount <= 0) {
    throw AppError.badRequest('Amount must be greater than 0');
  }

  const exchangeRate = EXCHANGE_RATES[corridor];
  const recipientCurrency = RECIPIENT_CURRENCIES[corridor] ?? 'ETB';

  const feeAmount = parseFloat((amount * REMITTANCE_FEE_PERCENT).toFixed(2));
  const netSendAmount = amount - feeAmount;
  const recipientAmount = parseFloat((netSendAmount * exchangeRate).toFixed(2));

  // Derive send currency from corridor prefix
  const sendCurrency = corridor.startsWith('EU') ? 'EUR' : 'USD';

  return {
    sendAmount: amount,
    sendCurrency,
    feeAmount,
    exchangeRate,
    recipientAmount,
    recipientCurrency,
    corridor,
    estimatedDelivery: '1-2 business days',
  };
}

// ─────────────────────────────────────────────
// Send
// ─────────────────────────────────────────────

/**
 * Create a remittance transaction record with CREATED status.
 * In production, this would call the payment provider API and move the
 * status to IN_FLIGHT. Here we simulate that with a mock provider ref.
 */
export async function sendRemittance(
  userId: string,
  input: SendRemittanceInput,
) {
  const { amount, corridor, recipientName, recipientPhone, recipientBank } =
    input;

  validateCorridor(corridor);

  if (amount <= 0) {
    throw AppError.badRequest('Amount must be greater than 0');
  }

  const quote = getRemittanceQuote(amount, corridor);

  // Generate a mock provider reference (real system would call provider API)
  const providerRef = `HH-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

  const remittance = await prisma.remittance.create({
    data: {
      userId,
      amount,
      currency: quote.sendCurrency,
      corridor,
      feeAmount: quote.feeAmount,
      exchangeRate: quote.exchangeRate,
      recipientAmount: quote.recipientAmount,
      recipientCurrency: quote.recipientCurrency,
      recipientName,
      recipientPhone: recipientPhone ?? null,
      recipientBank: recipientBank ?? null,
      status: RemittanceStatus.IN_FLIGHT, // Immediately move to IN_FLIGHT after creation
      providerRef,
    },
  });

  logger.info('Remittance created', {
    remittanceId: remittance.id,
    userId,
    corridor,
    amount,
    providerRef,
  });

  return remittance;
}

// ─────────────────────────────────────────────
// Status tracking
// ─────────────────────────────────────────────

/**
 * Get all remittances for a user.
 */
export async function getUserRemittances(userId: string) {
  const remittances = await prisma.remittance.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
  return remittances;
}

/**
 * Get a single remittance by ID (validates ownership).
 */
export async function getRemittanceById(
  remittanceId: string,
  userId: string,
) {
  const remittance = await prisma.remittance.findFirst({
    where: { id: remittanceId, userId },
  });

  if (!remittance) {
    throw AppError.notFound('Remittance not found');
  }

  return remittance;
}

/**
 * Simulate a webhook/status update from the provider (demo only).
 * In production this would be called by a provider webhook endpoint.
 */
export async function updateRemittanceStatus(
  remittanceId: string,
  status: RemittanceStatus,
) {
  const remittance = await prisma.remittance.findUnique({
    where: { id: remittanceId },
    select: { id: true, status: true },
  });

  if (!remittance) {
    throw AppError.notFound('Remittance not found');
  }

  // Validate status transitions
  const validTransitions: Record<RemittanceStatus, RemittanceStatus[]> = {
    [RemittanceStatus.CREATED]: [RemittanceStatus.IN_FLIGHT, RemittanceStatus.FAILED],
    [RemittanceStatus.IN_FLIGHT]: [RemittanceStatus.PAID, RemittanceStatus.FAILED],
    [RemittanceStatus.PAID]: [], // terminal
    [RemittanceStatus.FAILED]: [], // terminal
  };

  if (!validTransitions[remittance.status].includes(status)) {
    throw AppError.badRequest(
      `Cannot transition from ${remittance.status} to ${status}`,
    );
  }

  const updated = await prisma.remittance.update({
    where: { id: remittanceId },
    data: {
      status,
      ...(status === RemittanceStatus.PAID ? { paidAt: new Date() } : {}),
    },
  });

  logger.info('Remittance status updated', {
    remittanceId,
    from: remittance.status,
    to: status,
  });

  return updated;
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function validateCorridor(corridor: string): asserts corridor is Corridor {
  if (!SUPPORTED_CORRIDORS.includes(corridor as Corridor)) {
    throw AppError.badRequest(
      `Unsupported corridor "${corridor}". Supported corridors: ${SUPPORTED_CORRIDORS.join(', ')}`,
      'INVALID_CORRIDOR',
    );
  }
}
