/**
 * AI Module Controller.
 * Handles translation, resume assistant, immigration helper, and recommendations.
 */

import { Request, Response, NextFunction } from 'express';
import { translationService } from '../services/translation.service';
import { resumeService } from '../services/resume.service';
import { immigrationService } from '../services/immigration.service';
import { recommendationService } from '../services/recommendation.service';
import type { AuthenticatedRequest } from '../types';

export const aiController = {
  // ─── Translation ────────────────────────────

  async translate(req: Request, res: Response, next: NextFunction) {
    try {
      const { text, from, to } = req.body;

      if (!text || !from || !to) {
        res.status(400).json({ error: 'text, from, and to are required' });
        return;
      }

      const result = await translationService.translate(text, from, to);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },

  async translateBatch(req: Request, res: Response, next: NextFunction) {
    try {
      const { texts, from, to } = req.body;

      if (!Array.isArray(texts) || !from || !to) {
        res.status(400).json({ error: 'texts (array), from, and to are required' });
        return;
      }

      const result = await translationService.translateBatch(texts, from, to);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },

  async detectLanguage(req: Request, res: Response, next: NextFunction) {
    try {
      const { text } = req.body;

      if (!text) {
        res.status(400).json({ error: 'text is required' });
        return;
      }

      const language = await translationService.detectLanguage(text);
      res.json({ success: true, data: { language } });
    } catch (error) {
      next(error);
    }
  },

  // ─── Resume Assistant ───────────────────────

  async reviewResume(req: Request, res: Response, next: NextFunction) {
    try {
      const resume = req.body;

      if (!resume.name || !resume.skills || !resume.experience) {
        res.status(400).json({ error: 'name, skills, and experience are required' });
        return;
      }

      const review = await resumeService.reviewResume(resume);
      res.json({ success: true, data: review });
    } catch (error) {
      next(error);
    }
  },

  async matchResumeToJob(req: Request, res: Response, next: NextFunction) {
    try {
      const { resume, jobId } = req.body;

      if (!resume || !jobId) {
        res.status(400).json({ error: 'resume and jobId are required' });
        return;
      }

      const match = await resumeService.matchToJob(resume, jobId);
      res.json({ success: true, data: match });
    } catch (error) {
      next(error);
    }
  },

  async generateSummary(req: Request, res: Response, next: NextFunction) {
    try {
      const resume = req.body;
      const summary = await resumeService.generateSummary(resume);
      res.json({ success: true, data: { summary } });
    } catch (error) {
      next(error);
    }
  },

  async suggestSkills(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: userId } = (req as AuthenticatedRequest).user;
      const suggestions = await resumeService.suggestSkills(userId);
      res.json({ success: true, data: suggestions });
    } catch (error) {
      next(error);
    }
  },

  // ─── Immigration Helper ────────────────────

  async askImmigration(req: Request, res: Response, next: NextFunction) {
    try {
      const { question, context } = req.body;

      if (!question) {
        res.status(400).json({ error: 'question is required' });
        return;
      }

      const response = await immigrationService.askQuestion({ question, context });
      res.json({ success: true, data: response });
    } catch (error) {
      next(error);
    }
  },

  async getVisaInfo(req: Request, res: Response, next: NextFunction) {
    try {
      const { visaType, country } = req.query;

      if (!visaType || !country) {
        res.status(400).json({ error: 'visaType and country query params are required' });
        return;
      }

      const info = await immigrationService.getVisaInfo(visaType as string, country as string);
      res.json({ success: true, data: info });
    } catch (error) {
      next(error);
    }
  },

  async getVisaCategories(_req: Request, res: Response) {
    const categories = immigrationService.getVisaCategories();
    res.json({ success: true, data: categories });
  },

  async checkTPS(req: Request, res: Response, next: NextFunction) {
    try {
      const { nationality } = req.query;

      if (!nationality) {
        res.status(400).json({ error: 'nationality query param is required' });
        return;
      }

      const result = await immigrationService.checkTPSEligibility(nationality as string);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },

  // ─── Recommendations ───────────────────────

  async getPersonalizedFeed(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: userId } = (req as AuthenticatedRequest).user;
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);

      const feed = await recommendationService.getPersonalizedFeed(userId, { page, limit });
      res.json({ success: true, ...feed });
    } catch (error) {
      next(error);
    }
  },

  async getRecommendedJobs(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: userId } = (req as AuthenticatedRequest).user;
      const limit = Math.min(parseInt(req.query.limit as string) || 10, 30);

      const jobs = await recommendationService.recommendJobs(userId, { limit });
      res.json({ success: true, data: jobs });
    } catch (error) {
      next(error);
    }
  },

  async getRecommendedEvents(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: userId } = (req as AuthenticatedRequest).user;
      const limit = Math.min(parseInt(req.query.limit as string) || 10, 30);

      const events = await recommendationService.recommendEvents(userId, limit);
      res.json({ success: true, data: events });
    } catch (error) {
      next(error);
    }
  },
};
