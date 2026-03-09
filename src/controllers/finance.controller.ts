/**
 * Diaspora Finance Controller
 *
 * Handles HTTP requests for:
 *   Wallet      — /wallet
 *   Equb        — /equb
 *   Investments — /pools, /investments
 *   Loans       — /loans
 */

import { Request, Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../types';
import * as FinanceService from '../services/finance.service';

// ─────────────────────────────────────────────
// WALLET
// ─────────────────────────────────────────────

export const financeController = {
  // ── Wallet ──────────────────────────────────

  /**
   * POST /wallet
   * Create a new diaspora wallet for the authenticated user.
   */
  async createWallet(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: userId } = (req as AuthenticatedRequest).user;
      const wallet = await FinanceService.createWallet(userId);
      res.status(201).json({ success: true, data: wallet });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /wallet
   * Fetch authenticated user's wallet with recent transactions.
   */
  async getWallet(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: userId } = (req as AuthenticatedRequest).user;
      const wallet = await FinanceService.getWallet(userId);
      res.json({ success: true, data: wallet });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /wallet/deposit
   * Body: { amount: number, description?: string }
   */
  async deposit(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: userId } = (req as AuthenticatedRequest).user;
      const { amount, description } = req.body as {
        amount: number;
        description?: string;
      };
      const result = await FinanceService.deposit(userId, amount, description);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /wallet/withdraw
   * Body: { amount: number, description?: string }
   */
  async withdraw(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: userId } = (req as AuthenticatedRequest).user;
      const { amount, description } = req.body as {
        amount: number;
        description?: string;
      };
      const result = await FinanceService.withdraw(userId, amount, description);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /wallet/transactions
   * Query: page?, limit?, type?
   */
  async getTransactions(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: userId } = (req as AuthenticatedRequest).user;
      const page = parseInt(String(req.query.page ?? '1'), 10);
      const limit = parseInt(String(req.query.limit ?? '20'), 10);
      const type = req.query.type as string | undefined;
      const result = await FinanceService.getTransactions(userId, page, limit, type as any);
      res.json({ success: true, data: result.data, meta: result.meta });
    } catch (err) {
      next(err);
    }
  },

  // ── Equb ────────────────────────────────────

  /**
   * POST /equb
   * Body: CreateEqubInput
   */
  async createEqub(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: organizerId } = (req as AuthenticatedRequest).user;
      const equb = await FinanceService.createEqub(organizerId, req.body);
      res.status(201).json({ success: true, data: equb });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /equb
   * Query: page?, limit?, status?
   */
  async getEqubs(req: Request, res: Response, next: NextFunction) {
    try {
      const page = parseInt(String(req.query.page ?? '1'), 10);
      const limit = parseInt(String(req.query.limit ?? '20'), 10);
      const status = req.query.status as string | undefined;
      const result = await FinanceService.getEqubs(page, limit, status as any);
      res.json({ success: true, data: result.data, meta: result.meta });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /equb/mine
   * Returns equbs the user is a member of and ones they organize.
   */
  async getMyEqubs(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: userId } = (req as AuthenticatedRequest).user;
      const result = await FinanceService.getMyEqubs(userId);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /equb/:id
   */
  async getEqubById(req: Request, res: Response, next: NextFunction) {
    try {
      const equb = await FinanceService.getEqubById(req.params.id);
      res.json({ success: true, data: equb });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /equb/:id/join
   */
  async joinEqub(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: userId } = (req as AuthenticatedRequest).user;
      const membership = await FinanceService.joinEqub(req.params.id, userId);
      res.status(201).json({ success: true, data: membership });
    } catch (err) {
      next(err);
    }
  },

  /**
   * DELETE /equb/:id/leave
   */
  async leaveEqub(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: userId } = (req as AuthenticatedRequest).user;
      const result = await FinanceService.leaveEqub(req.params.id, userId);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /equb/:id/payout
   * Advances the cycle and pays the next member.
   */
  async processEqubPayout(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await FinanceService.processEqubPayout(req.params.id);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  // ── Investment Pools ─────────────────────────

  /**
   * POST /pools
   * Body: CreatePoolInput
   */
  async createPool(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: organizerId } = (req as AuthenticatedRequest).user;
      const pool = await FinanceService.createPool(organizerId, req.body);
      res.status(201).json({ success: true, data: pool });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /pools
   * Query: page?, limit?, category?
   */
  async getPools(req: Request, res: Response, next: NextFunction) {
    try {
      const page = parseInt(String(req.query.page ?? '1'), 10);
      const limit = parseInt(String(req.query.limit ?? '20'), 10);
      const category = req.query.category as string | undefined;
      const result = await FinanceService.getPools(page, limit, category);
      res.json({ success: true, data: result.data, meta: result.meta });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /pools/:id
   */
  async getPoolById(req: Request, res: Response, next: NextFunction) {
    try {
      const pool = await FinanceService.getPoolById(req.params.id);
      res.json({ success: true, data: pool });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /pools/:id/invest
   * Body: { amount: number }
   */
  async invest(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: userId } = (req as AuthenticatedRequest).user;
      const { amount } = req.body as { amount: number };
      const result = await FinanceService.investInPool(req.params.id, userId, amount);
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /investments/mine
   */
  async getMyInvestments(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: userId } = (req as AuthenticatedRequest).user;
      const investments = await FinanceService.getMyInvestments(userId);
      res.json({ success: true, data: investments });
    } catch (err) {
      next(err);
    }
  },

  // ── Loans ────────────────────────────────────

  /**
   * POST /loans
   * Body: RequestLoanInput
   */
  async requestLoan(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: userId } = (req as AuthenticatedRequest).user;
      const loan = await FinanceService.requestLoan(userId, req.body);
      res.status(201).json({ success: true, data: loan });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /loans
   * Admin/moderator view. Query: page?, limit?, status?
   */
  async getLoans(req: Request, res: Response, next: NextFunction) {
    try {
      const page = parseInt(String(req.query.page ?? '1'), 10);
      const limit = parseInt(String(req.query.limit ?? '20'), 10);
      const status = req.query.status as string | undefined;
      const result = await FinanceService.getLoans(page, limit, status as any);
      res.json({ success: true, data: result.data, meta: result.meta });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /loans/mine
   */
  async getMyLoans(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: userId } = (req as AuthenticatedRequest).user;
      const loans = await FinanceService.getMyLoans(userId);
      res.json({ success: true, data: loans });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /loans/:id/approve
   */
  async approveLoan(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: approvedById } = (req as AuthenticatedRequest).user;
      const loan = await FinanceService.approveLoan(req.params.id, approvedById);
      res.json({ success: true, data: loan });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /loans/:id/disburse
   */
  async disburseLoan(req: Request, res: Response, next: NextFunction) {
    try {
      const loan = await FinanceService.disburseLoan(req.params.id);
      res.json({ success: true, data: loan });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /loans/:id/repay
   * Body: { amount: number }
   */
  async repayLoan(req: Request, res: Response, next: NextFunction) {
    try {
      const { amount } = req.body as { amount: number };
      const result = await FinanceService.repayLoan(req.params.id, amount);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },
};
