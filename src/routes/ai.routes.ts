/**
 * AI Module Routes.
 *
 * POST   /ai/translate          — Translate text
 * POST   /ai/translate/batch    — Batch translate
 * POST   /ai/detect-language    — Auto-detect language
 * POST   /ai/resume/review      — Review and score a resume
 * POST   /ai/resume/match       — Match resume to a job
 * POST   /ai/resume/summary     — Generate professional summary
 * GET    /ai/resume/skills      — Suggest skills to learn
 * POST   /ai/immigration/ask    — Ask immigration question
 * GET    /ai/immigration/visa   — Get visa type info
 * GET    /ai/immigration/categories — List visa categories
 * GET    /ai/immigration/tps    — Check TPS eligibility
 * GET    /ai/feed               — Personalized recommendation feed
 * GET    /ai/jobs/recommended   — Recommended jobs
 * GET    /ai/events/recommended — Recommended events
 */

import { Router } from 'express';
import { aiController } from '../controllers/ai.controller';
import { authenticate } from '../middlewares/auth';

const router = Router();

// All AI routes require authentication
router.use(authenticate);

// Translation
router.post('/translate', aiController.translate);
router.post('/translate/batch', aiController.translateBatch);
router.post('/detect-language', aiController.detectLanguage);

// Resume Assistant
router.post('/resume/review', aiController.reviewResume);
router.post('/resume/match', aiController.matchResumeToJob);
router.post('/resume/summary', aiController.generateSummary);
router.get('/resume/skills', aiController.suggestSkills);

// Immigration Helper
router.post('/immigration/ask', aiController.askImmigration);
router.get('/immigration/visa', aiController.getVisaInfo);
router.get('/immigration/categories', aiController.getVisaCategories);
router.get('/immigration/tps', aiController.checkTPS);

// Recommendations
router.get('/feed', aiController.getPersonalizedFeed);
router.get('/jobs/recommended', aiController.getRecommendedJobs);
router.get('/events/recommended', aiController.getRecommendedEvents);

export default router;
