/**
 * Diaspora Finance Routes
 *
 * Wallet:
 *   POST   /wallet                  — create wallet (auth)
 *   GET    /wallet                  — get wallet (auth)
 *   POST   /wallet/deposit          — deposit funds (auth)
 *   POST   /wallet/withdraw         — withdraw funds (auth)
 *   GET    /wallet/transactions     — tx history (auth)
 *
 * Equb (ROSCA):
 *   POST   /equb                    — create group (auth)
 *   GET    /equb                    — list groups (public)
 *   GET    /equb/mine               — my equbs (auth)
 *   GET    /equb/:id                — group detail (public)
 *   POST   /equb/:id/join           — join (auth)
 *   DELETE /equb/:id/leave          — leave (auth)
 *   POST   /equb/:id/payout         — process payout (auth)
 *
 * Investment Pools:
 *   POST   /pools                   — create pool (auth)
 *   GET    /pools                   — list pools (public)
 *   GET    /pools/:id               — pool detail (public)
 *   POST   /pools/:id/invest        — invest (auth)
 *   GET    /investments/mine        — my investments (auth)
 *
 * Micro-Loans:
 *   POST   /loans                   — request loan (auth)
 *   GET    /loans                   — all loans (moderator)
 *   GET    /loans/mine              — my loans (auth)
 *   POST   /loans/:id/approve       — approve (moderator)
 *   POST   /loans/:id/disburse      — disburse (moderator)
 *   POST   /loans/:id/repay         — repay (auth)
 */

import { Router } from 'express';
import { authenticate, requireModerator } from '../middlewares/auth';
import { financeController } from '../controllers/finance.controller';

const router = Router();

// ─────────────────────────────────────────────
// Wallet
// ─────────────────────────────────────────────

router.post('/wallet', authenticate, financeController.createWallet);
router.get('/wallet', authenticate, financeController.getWallet);
router.post('/wallet/deposit', authenticate, financeController.deposit);
router.post('/wallet/withdraw', authenticate, financeController.withdraw);
router.get('/wallet/transactions', authenticate, financeController.getTransactions);

// ─────────────────────────────────────────────
// Equb
// NOTE: /equb/mine must be declared before /equb/:id to avoid Express
// treating "mine" as an :id param.
// ─────────────────────────────────────────────

router.post('/equb', authenticate, financeController.createEqub);
router.get('/equb', financeController.getEqubs);
router.get('/equb/mine', authenticate, financeController.getMyEqubs);
router.get('/equb/:id', financeController.getEqubById);
router.post('/equb/:id/join', authenticate, financeController.joinEqub);
router.delete('/equb/:id/leave', authenticate, financeController.leaveEqub);
router.post('/equb/:id/payout', authenticate, financeController.processEqubPayout);

// ─────────────────────────────────────────────
// Investment Pools
// NOTE: /investments/mine is declared before /pools/:id for the same reason.
// ─────────────────────────────────────────────

router.get('/investments/mine', authenticate, financeController.getMyInvestments);

router.post('/pools', authenticate, financeController.createPool);
router.get('/pools', financeController.getPools);
router.get('/pools/:id', financeController.getPoolById);
router.post('/pools/:id/invest', authenticate, financeController.invest);

// ─────────────────────────────────────────────
// Micro-Loans
// NOTE: /loans/mine must be declared before /loans/:id.
// ─────────────────────────────────────────────

router.post('/loans', authenticate, financeController.requestLoan);
router.get('/loans', authenticate, requireModerator, financeController.getLoans);
router.get('/loans/mine', authenticate, financeController.getMyLoans);
router.post('/loans/:id/approve', authenticate, requireModerator, financeController.approveLoan);
router.post('/loans/:id/disburse', authenticate, requireModerator, financeController.disburseLoan);
router.post('/loans/:id/repay', authenticate, financeController.repayLoan);

export default router;
