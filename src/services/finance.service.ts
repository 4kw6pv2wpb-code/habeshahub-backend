/**
 * Diaspora Finance Service
 *
 * Covers four pillars of diaspora community finance:
 *   1. Wallet       — personal diaspora wallet with deposit/withdraw/history
 *   2. Equb         — rotating savings & credit associations (ROSCAs)
 *   3. Investments  — community investment pools
 *   4. Micro-loans  — peer community lending
 *
 * All monetary operations use `db` (prisma as any) because the Diaspora Finance
 * models are Phase 2 additions not yet in the generated Prisma client.
 */

import { PrismaClient } from '@prisma/client';
import { AppError } from '../middlewares/errorHandler';
import { logger } from '../utils/logger';
import type { PaginationMeta } from '../types';

const prisma = new PrismaClient();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

// ─────────────────────────────────────────────
// Enum mirrors (Phase 2 — not yet in Prisma client)
// ─────────────────────────────────────────────

type TransactionType =
  | 'TIP'
  | 'SUBSCRIPTION'
  | 'GIFT'
  | 'WITHDRAWAL'
  | 'DEPOSIT'
  | 'EQUB_CONTRIBUTION'
  | 'EQUB_PAYOUT'
  | 'INVESTMENT'
  | 'LOAN_DISBURSEMENT'
  | 'LOAN_REPAYMENT';

type TransactionStatus = 'PENDING' | 'COMPLETED' | 'FAILED' | 'REVERSED';

type EqubCycleStatus = 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

type LoanStatus =
  | 'REQUESTED'
  | 'APPROVED'
  | 'DISBURSED'
  | 'REPAYING'
  | 'PAID_OFF'
  | 'DEFAULTED';

// ─────────────────────────────────────────────
// Input interfaces
// ─────────────────────────────────────────────

export interface CreateEqubInput {
  name: string;
  description?: string;
  contributionAmount: number;
  currency?: string;
  cycleFrequency: 'weekly' | 'biweekly' | 'monthly';
  maxMembers: number;
  totalCycles: number;
  startDate: string; // ISO date
}

export interface CreatePoolInput {
  name: string;
  description?: string;
  goalAmount: number;
  currency?: string;
  category: string;
  minInvestment: number;
  maxInvestors?: number;
  returnRate: number;
  maturityDate: string; // ISO date
}

export interface RequestLoanInput {
  amount: number;
  currency?: string;
  interestRate: number;
  termMonths: number;
  purpose: string;
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function calcTotalPages(total: number, limit: number): number {
  return Math.ceil(total / limit) || 1;
}

/**
 * Calculate next payout date based on cycle frequency.
 */
function nextPayoutDateFromNow(
  frequency: 'weekly' | 'biweekly' | 'monthly',
  from: Date = new Date(),
): Date {
  const d = new Date(from);
  if (frequency === 'weekly') d.setDate(d.getDate() + 7);
  else if (frequency === 'biweekly') d.setDate(d.getDate() + 14);
  else d.setMonth(d.getMonth() + 1);
  return d;
}

/**
 * Calculate a simple monthly payment for a loan.
 * Formula: M = P * [r(1+r)^n] / [(1+r)^n - 1]
 * where r = monthly interest rate, n = term months.
 */
function calcMonthlyPayment(
  principal: number,
  annualRatePercent: number,
  termMonths: number,
): number {
  const r = annualRatePercent / 100 / 12;
  if (r === 0) return parseFloat((principal / termMonths).toFixed(2));
  const factor = Math.pow(1 + r, termMonths);
  return parseFloat(((principal * r * factor) / (factor - 1)).toFixed(2));
}

// ─────────────────────────────────────────────
// WALLET OPS
// ─────────────────────────────────────────────

/**
 * Create a diaspora wallet for a user.
 * Each user may only have one wallet (userId is unique).
 */
export async function createWallet(userId: string) {
  const existing = await db.diasporaWallet.findUnique({ where: { userId } });
  if (existing) {
    throw AppError.badRequest('Wallet already exists for this user', 'WALLET_EXISTS');
  }

  const wallet = await db.diasporaWallet.create({
    data: {
      userId,
      balance: 0,
      currency: 'USD',
      isActive: true,
      kycVerified: false,
    },
  });

  logger.info('Diaspora wallet created', { walletId: wallet.id, userId });
  return wallet;
}

/**
 * Fetch a wallet with the 10 most recent transactions.
 */
export async function getWallet(userId: string) {
  const wallet = await db.diasporaWallet.findUnique({
    where: { userId },
    include: {
      transactions: {
        orderBy: { createdAt: 'desc' },
        take: 10,
      },
    },
  });

  if (!wallet) {
    throw AppError.notFound('Wallet not found. Create one first.');
  }

  return wallet;
}

/**
 * Add funds to a wallet and record a DEPOSIT transaction.
 */
export async function deposit(
  userId: string,
  amount: number,
  description?: string,
) {
  if (amount <= 0) throw AppError.badRequest('Amount must be greater than 0');

  const wallet = await db.diasporaWallet.findUnique({ where: { userId } });
  if (!wallet) throw AppError.notFound('Wallet not found');
  if (!wallet.isActive) throw AppError.badRequest('Wallet is inactive');

  const [updatedWallet, tx] = await prisma.$transaction([
    db.diasporaWallet.update({
      where: { id: wallet.id },
      data: { balance: { increment: amount } },
    }),
    db.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: 'DEPOSIT' as TransactionType,
        amount,
        currency: wallet.currency,
        status: 'COMPLETED' as TransactionStatus,
        description: description ?? 'Wallet deposit',
        referenceId: `DEP-${Date.now()}`,
      },
    }),
  ]);

  logger.info('Wallet deposit', { walletId: wallet.id, amount });
  return { wallet: updatedWallet, transaction: tx };
}

/**
 * Withdraw funds from a wallet; validates sufficient balance.
 */
export async function withdraw(
  userId: string,
  amount: number,
  description?: string,
) {
  if (amount <= 0) throw AppError.badRequest('Amount must be greater than 0');

  const wallet = await db.diasporaWallet.findUnique({ where: { userId } });
  if (!wallet) throw AppError.notFound('Wallet not found');
  if (!wallet.isActive) throw AppError.badRequest('Wallet is inactive');
  if (!wallet.kycVerified) throw AppError.badRequest('KYC verification required for withdrawals');
  if (wallet.balance < amount) throw AppError.badRequest('Insufficient balance');

  const [updatedWallet, tx] = await prisma.$transaction([
    db.diasporaWallet.update({
      where: { id: wallet.id },
      data: { balance: { decrement: amount } },
    }),
    db.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: 'WITHDRAWAL' as TransactionType,
        amount,
        currency: wallet.currency,
        status: 'COMPLETED' as TransactionStatus,
        description: description ?? 'Wallet withdrawal',
        referenceId: `WDR-${Date.now()}`,
      },
    }),
  ]);

  logger.info('Wallet withdrawal', { walletId: wallet.id, amount });
  return { wallet: updatedWallet, transaction: tx };
}

/**
 * Paginated transaction history for a user's wallet.
 * Optionally filtered by transaction type.
 */
export async function getTransactions(
  userId: string,
  page = 1,
  limit = 20,
  type?: TransactionType,
): Promise<{ data: unknown[]; meta: PaginationMeta }> {
  const wallet = await db.diasporaWallet.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!wallet) throw AppError.notFound('Wallet not found');

  const where = { walletId: wallet.id, ...(type ? { type } : {}) };
  const skip = (page - 1) * limit;

  const [total, items] = await Promise.all([
    db.walletTransaction.count({ where }),
    db.walletTransaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
  ]);

  return {
    data: items,
    meta: { total, page, limit, totalPages: calcTotalPages(total, limit) },
  };
}

// ─────────────────────────────────────────────
// EQUB OPS
// ─────────────────────────────────────────────

/**
 * Create a new Equb rotating savings group.
 */
export async function createEqub(organizerId: string, data: CreateEqubInput) {
  const wallet = await db.diasporaWallet.findUnique({ where: { userId: organizerId } });
  if (!wallet) throw AppError.badRequest('You need a wallet to organize an Equb');

  const startDate = new Date(data.startDate);
  const equb = await db.equbGroup.create({
    data: {
      organizerId,
      name: data.name,
      description: data.description ?? null,
      contributionAmount: data.contributionAmount,
      currency: data.currency ?? 'USD',
      cycleFrequency: data.cycleFrequency,
      maxMembers: data.maxMembers,
      totalCycles: data.totalCycles,
      currentCycle: 0,
      status: 'ACTIVE' as EqubCycleStatus,
      startDate,
      nextPayoutDate: nextPayoutDateFromNow(data.cycleFrequency, startDate),
    },
  });

  logger.info('Equb group created', { equbId: equb.id, organizerId });
  return equb;
}

/**
 * List equb groups, optionally filtered by status, with member count.
 */
export async function getEqubs(
  page = 1,
  limit = 20,
  status?: EqubCycleStatus,
): Promise<{ data: unknown[]; meta: PaginationMeta }> {
  const where = status ? { status } : {};
  const skip = (page - 1) * limit;

  const [total, items] = await Promise.all([
    db.equbGroup.count({ where }),
    db.equbGroup.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: {
        _count: { select: { memberships: true } },
        organizer: { select: { id: true, name: true, avatarUrl: true } },
      },
    }),
  ]);

  return {
    data: items,
    meta: { total, page, limit, totalPages: calcTotalPages(total, limit) },
  };
}

/**
 * Get a single Equb with its members and payout history.
 */
export async function getEqubById(id: string) {
  const equb = await db.equbGroup.findUnique({
    where: { id },
    include: {
      organizer: { select: { id: true, name: true, avatarUrl: true } },
      memberships: {
        include: {
          user: { select: { id: true, name: true, avatarUrl: true } },
        },
        orderBy: { position: 'asc' },
      },
      payouts: { orderBy: { cycle: 'asc' } },
    },
  });

  if (!equb) throw AppError.notFound('Equb group not found');
  return equb;
}

/**
 * Join an Equb — assigns the next available position.
 */
export async function joinEqub(equbId: string, userId: string) {
  const equb = await db.equbGroup.findUnique({
    where: { id: equbId },
    include: { _count: { select: { memberships: true } } },
  });
  if (!equb) throw AppError.notFound('Equb group not found');
  if (equb.status !== 'ACTIVE') throw AppError.badRequest('Equb is not accepting new members');
  if (equb._count.memberships >= equb.maxMembers) {
    throw AppError.badRequest('Equb group is full');
  }

  const wallet = await db.diasporaWallet.findUnique({ where: { userId } });
  if (!wallet) throw AppError.badRequest('You need a wallet to join an Equb');

  // Guard against duplicate membership
  const existing = await db.equbMembership.findUnique({
    where: { equbId_userId: { equbId, userId } },
  });
  if (existing) throw AppError.badRequest('You are already a member of this Equb');

  const position = equb._count.memberships + 1;
  const membership = await db.equbMembership.create({
    data: {
      equbId,
      walletId: wallet.id,
      userId,
      position,
      isPaidOut: false,
    },
  });

  logger.info('User joined Equb', { equbId, userId, position });
  return membership;
}

/**
 * Leave an Equb — only allowed if the member has not yet received a payout.
 */
export async function leaveEqub(equbId: string, userId: string) {
  const membership = await db.equbMembership.findUnique({
    where: { equbId_userId: { equbId, userId } },
  });
  if (!membership) throw AppError.notFound('Membership not found');
  if (membership.isPaidOut) {
    throw AppError.badRequest('Cannot leave Equb after receiving payout');
  }

  await db.equbMembership.delete({
    where: { equbId_userId: { equbId, userId } },
  });

  logger.info('User left Equb', { equbId, userId });
  return { message: 'Successfully left Equb group' };
}

/**
 * Advance the Equb cycle and disburse to the next eligible member.
 * - Finds next unpaid member by position order.
 * - Records a WalletTransaction on the recipient's wallet.
 * - Creates an EqubPayout record.
 * - Advances currentCycle; marks COMPLETED if all cycles done.
 */
export async function processEqubPayout(equbId: string) {
  const equb = await db.equbGroup.findUnique({
    where: { id: equbId },
    include: {
      memberships: {
        where: { isPaidOut: false },
        orderBy: { position: 'asc' },
        take: 1,
      },
    },
  });

  if (!equb) throw AppError.notFound('Equb group not found');
  if (equb.status !== 'ACTIVE') throw AppError.badRequest('Equb is not active');
  if (equb.memberships.length === 0) {
    throw AppError.badRequest('No eligible members remaining for payout');
  }

  const recipient = equb.memberships[0];
  const payoutAmount = equb.contributionAmount * equb.maxMembers;
  const nextCycle = equb.currentCycle + 1;
  const isLastCycle = nextCycle >= equb.totalCycles;

  await prisma.$transaction([
    // Credit recipient wallet
    db.diasporaWallet.update({
      where: { id: recipient.walletId },
      data: { balance: { increment: payoutAmount } },
    }),
    // Record payout transaction
    db.walletTransaction.create({
      data: {
        walletId: recipient.walletId,
        type: 'EQUB_PAYOUT' as TransactionType,
        amount: payoutAmount,
        currency: equb.currency,
        status: 'COMPLETED' as TransactionStatus,
        description: `Equb payout — cycle ${nextCycle} of ${equb.totalCycles}`,
        referenceId: `EQUB-${equbId}-C${nextCycle}`,
      },
    }),
    // Mark member as paid out
    db.equbMembership.update({
      where: { id: recipient.id },
      data: { isPaidOut: true },
    }),
    // Record the payout
    db.equbPayout.create({
      data: {
        equbId,
        recipientId: recipient.userId,
        cycle: nextCycle,
        amount: payoutAmount,
        paidAt: new Date(),
      },
    }),
    // Advance cycle, set next payout date, possibly mark completed
    db.equbGroup.update({
      where: { id: equbId },
      data: {
        currentCycle: nextCycle,
        status: isLastCycle ? ('COMPLETED' as EqubCycleStatus) : ('ACTIVE' as EqubCycleStatus),
        nextPayoutDate: isLastCycle
          ? null
          : nextPayoutDateFromNow(equb.cycleFrequency),
      },
    }),
  ]);

  logger.info('Equb payout processed', {
    equbId,
    recipientId: recipient.userId,
    cycle: nextCycle,
    amount: payoutAmount,
  });

  return {
    cycle: nextCycle,
    recipientId: recipient.userId,
    amount: payoutAmount,
    completed: isLastCycle,
  };
}

/**
 * Get all Equbs the user belongs to (as member or organizer).
 */
export async function getMyEqubs(userId: string) {
  const [memberships, organized] = await Promise.all([
    db.equbMembership.findMany({
      where: { userId },
      include: {
        equb: {
          include: {
            _count: { select: { memberships: true } },
            organizer: { select: { id: true, name: true, avatarUrl: true } },
          },
        },
      },
    }),
    db.equbGroup.findMany({
      where: { organizerId: userId },
      include: { _count: { select: { memberships: true } } },
    }),
  ]);

  return { asMember: memberships, asOrganizer: organized };
}

// ─────────────────────────────────────────────
// INVESTMENT OPS
// ─────────────────────────────────────────────

/**
 * Create a new community investment pool.
 */
export async function createPool(organizerId: string, data: CreatePoolInput) {
  const wallet = await db.diasporaWallet.findUnique({ where: { userId: organizerId } });
  if (!wallet) throw AppError.badRequest('You need a wallet to create an investment pool');

  const pool = await db.investmentPool.create({
    data: {
      organizerId,
      name: data.name,
      description: data.description ?? null,
      goalAmount: data.goalAmount,
      currentAmount: 0,
      currency: data.currency ?? 'USD',
      category: data.category,
      minInvestment: data.minInvestment,
      maxInvestors: data.maxInvestors ?? null,
      returnRate: data.returnRate,
      maturityDate: new Date(data.maturityDate),
      isClosed: false,
    },
  });

  logger.info('Investment pool created', { poolId: pool.id, organizerId });
  return pool;
}

/**
 * List investment pools that are still open, with optional category filter.
 */
export async function getPools(
  page = 1,
  limit = 20,
  category?: string,
): Promise<{ data: unknown[]; meta: PaginationMeta }> {
  const where = {
    isClosed: false,
    ...(category ? { category } : {}),
  };
  const skip = (page - 1) * limit;

  const [total, items] = await Promise.all([
    db.investmentPool.count({ where }),
    db.investmentPool.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: {
        _count: { select: { participants: true } },
        organizer: { select: { id: true, name: true, avatarUrl: true } },
      },
    }),
  ]);

  return {
    data: items,
    meta: { total, page, limit, totalPages: calcTotalPages(total, limit) },
  };
}

/**
 * Get a single investment pool with all participant details.
 */
export async function getPoolById(id: string) {
  const pool = await db.investmentPool.findUnique({
    where: { id },
    include: {
      organizer: { select: { id: true, name: true, avatarUrl: true } },
      participants: {
        include: {
          user: { select: { id: true, name: true, avatarUrl: true } },
        },
        orderBy: { investedAt: 'asc' },
      },
    },
  });

  if (!pool) throw AppError.notFound('Investment pool not found');
  return pool;
}

/**
 * Invest in a pool — deducts from wallet, records participation.
 */
export async function investInPool(
  poolId: string,
  userId: string,
  amount: number,
) {
  if (amount <= 0) throw AppError.badRequest('Investment amount must be positive');

  const pool = await db.investmentPool.findUnique({
    where: { id: poolId },
    include: { _count: { select: { participants: true } } },
  });
  if (!pool) throw AppError.notFound('Investment pool not found');
  if (pool.isClosed) throw AppError.badRequest('Investment pool is closed');
  if (amount < pool.minInvestment) {
    throw AppError.badRequest(`Minimum investment is ${pool.minInvestment} ${pool.currency}`);
  }
  if (pool.maxInvestors && pool._count.participants >= pool.maxInvestors) {
    throw AppError.badRequest('Investment pool has reached maximum investors');
  }

  // Guard duplicates
  const existing = await db.investmentParticipant.findUnique({
    where: { poolId_userId: { poolId, userId } },
  });
  if (existing) throw AppError.badRequest('You have already invested in this pool');

  const wallet = await db.diasporaWallet.findUnique({ where: { userId } });
  if (!wallet) throw AppError.badRequest('You need a wallet to invest');
  if (wallet.balance < amount) throw AppError.badRequest('Insufficient wallet balance');

  const newAmount = pool.currentAmount + amount;
  const sharePercent = parseFloat(((amount / pool.goalAmount) * 100).toFixed(4));
  const closePool = newAmount >= pool.goalAmount;

  await prisma.$transaction([
    // Deduct from wallet
    db.diasporaWallet.update({
      where: { id: wallet.id },
      data: { balance: { decrement: amount } },
    }),
    // Record transaction
    db.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: 'INVESTMENT' as TransactionType,
        amount,
        currency: pool.currency,
        status: 'COMPLETED' as TransactionStatus,
        description: `Investment in pool: ${pool.name}`,
        referenceId: `INV-${poolId}-${Date.now()}`,
      },
    }),
    // Add participant
    db.investmentParticipant.create({
      data: {
        poolId,
        walletId: wallet.id,
        userId,
        amount,
        sharePercent,
      },
    }),
    // Update pool totals, close if goal met
    db.investmentPool.update({
      where: { id: poolId },
      data: {
        currentAmount: newAmount,
        isClosed: closePool,
      },
    }),
  ]);

  logger.info('Investment made', { poolId, userId, amount, sharePercent });
  return { poolId, amount, sharePercent, poolClosed: closePool };
}

/**
 * Get all investments made by a user.
 */
export async function getMyInvestments(userId: string) {
  return db.investmentParticipant.findMany({
    where: { userId },
    include: {
      pool: {
        select: {
          id: true,
          name: true,
          goalAmount: true,
          currentAmount: true,
          currency: true,
          category: true,
          returnRate: true,
          maturityDate: true,
          isClosed: true,
        },
      },
    },
    orderBy: { investedAt: 'desc' },
  });
}

// ─────────────────────────────────────────────
// LOAN OPS
// ─────────────────────────────────────────────

/**
 * Request a new micro-loan. Creates a REQUESTED record.
 */
export async function requestLoan(userId: string, data: RequestLoanInput) {
  if (data.amount <= 0) throw AppError.badRequest('Loan amount must be positive');
  if (data.termMonths <= 0) throw AppError.badRequest('Term must be at least 1 month');

  const wallet = await db.diasporaWallet.findUnique({ where: { userId } });
  if (!wallet) throw AppError.badRequest('You need a wallet to request a loan');

  // Check no active open loan
  const activeLoan = await db.microLoan.findFirst({
    where: {
      borrowerId: userId,
      status: { in: ['REQUESTED', 'APPROVED', 'DISBURSED', 'REPAYING'] as LoanStatus[] },
    },
  });
  if (activeLoan) throw AppError.badRequest('You already have an active loan request');

  const monthlyPayment = calcMonthlyPayment(data.amount, data.interestRate, data.termMonths);

  const loan = await db.microLoan.create({
    data: {
      borrowerWalletId: wallet.id,
      borrowerId: userId,
      amount: data.amount,
      currency: data.currency ?? 'USD',
      interestRate: data.interestRate,
      termMonths: data.termMonths,
      monthlyPayment,
      amountRepaid: 0,
      status: 'REQUESTED' as LoanStatus,
      purpose: data.purpose,
    },
  });

  logger.info('Loan requested', { loanId: loan.id, userId, amount: data.amount });
  return loan;
}

/**
 * List all loans (admin/moderator view), optionally filtered by status.
 */
export async function getLoans(
  page = 1,
  limit = 20,
  status?: LoanStatus,
): Promise<{ data: unknown[]; meta: PaginationMeta }> {
  const where = status ? { status } : {};
  const skip = (page - 1) * limit;

  const [total, items] = await Promise.all([
    db.microLoan.count({ where }),
    db.microLoan.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: {
        borrower: { select: { id: true, name: true, email: true, avatarUrl: true } },
      },
    }),
  ]);

  return {
    data: items,
    meta: { total, page, limit, totalPages: calcTotalPages(total, limit) },
  };
}

/**
 * Get all loans belonging to a user.
 */
export async function getMyLoans(userId: string) {
  return db.microLoan.findMany({
    where: { borrowerId: userId },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Approve a loan request.
 */
export async function approveLoan(loanId: string, approvedById: string) {
  const loan = await db.microLoan.findUnique({ where: { id: loanId } });
  if (!loan) throw AppError.notFound('Loan not found');
  if (loan.status !== 'REQUESTED') {
    throw AppError.badRequest(`Loan is already in status: ${loan.status}`);
  }

  const updated = await db.microLoan.update({
    where: { id: loanId },
    data: {
      status: 'APPROVED' as LoanStatus,
      approvedBy: approvedById,
    },
  });

  logger.info('Loan approved', { loanId, approvedById });
  return updated;
}

/**
 * Disburse an approved loan — credits borrower's wallet.
 */
export async function disburseLoan(loanId: string) {
  const loan = await db.microLoan.findUnique({ where: { id: loanId } });
  if (!loan) throw AppError.notFound('Loan not found');
  if (loan.status !== 'APPROVED') {
    throw AppError.badRequest('Loan must be approved before disbursement');
  }

  const dueDate = new Date();
  dueDate.setMonth(dueDate.getMonth() + loan.termMonths);

  await prisma.$transaction([
    db.diasporaWallet.update({
      where: { id: loan.borrowerWalletId },
      data: { balance: { increment: loan.amount } },
    }),
    db.walletTransaction.create({
      data: {
        walletId: loan.borrowerWalletId,
        type: 'LOAN_DISBURSEMENT' as TransactionType,
        amount: loan.amount,
        currency: loan.currency,
        status: 'COMPLETED' as TransactionStatus,
        description: `Loan disbursement — ${loan.purpose}`,
        referenceId: `LOAN-${loanId}`,
      },
    }),
    db.microLoan.update({
      where: { id: loanId },
      data: {
        status: 'DISBURSED' as LoanStatus,
        disbursedAt: new Date(),
        dueDate,
      },
    }),
  ]);

  logger.info('Loan disbursed', { loanId, amount: loan.amount });
  return db.microLoan.findUnique({ where: { id: loanId } });
}

/**
 * Make a repayment on a loan.
 * Deducts from wallet, records transaction, updates amountRepaid.
 * Marks as PAID_OFF when fully repaid.
 */
export async function repayLoan(loanId: string, amount: number) {
  if (amount <= 0) throw AppError.badRequest('Repayment amount must be positive');

  const loan = await db.microLoan.findUnique({ where: { id: loanId } });
  if (!loan) throw AppError.notFound('Loan not found');
  if (!['DISBURSED', 'REPAYING'].includes(loan.status)) {
    throw AppError.badRequest('Loan is not in a repayable state');
  }

  const wallet = await db.diasporaWallet.findUnique({
    where: { id: loan.borrowerWalletId },
  });
  if (!wallet) throw AppError.notFound('Borrower wallet not found');
  if (wallet.balance < amount) throw AppError.badRequest('Insufficient wallet balance');

  const totalOwed = loan.amount + (loan.amount * loan.interestRate) / 100;
  const newRepaid = Math.min(loan.amountRepaid + amount, totalOwed);
  const isPaidOff = newRepaid >= totalOwed;

  await prisma.$transaction([
    db.diasporaWallet.update({
      where: { id: wallet.id },
      data: { balance: { decrement: amount } },
    }),
    db.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: 'LOAN_REPAYMENT' as TransactionType,
        amount,
        currency: loan.currency,
        status: 'COMPLETED' as TransactionStatus,
        description: `Loan repayment — ${isPaidOff ? 'final' : 'partial'}`,
        referenceId: `REPAY-${loanId}-${Date.now()}`,
      },
    }),
    db.microLoan.update({
      where: { id: loanId },
      data: {
        amountRepaid: newRepaid,
        status: isPaidOff ? ('PAID_OFF' as LoanStatus) : ('REPAYING' as LoanStatus),
      },
    }),
  ]);

  logger.info('Loan repayment made', { loanId, amount, isPaidOff });
  return {
    loanId,
    amountRepaid: newRepaid,
    totalOwed,
    remainingBalance: Math.max(0, totalOwed - newRepaid),
    isPaidOff,
  };
}
