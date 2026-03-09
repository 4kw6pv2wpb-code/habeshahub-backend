/**
 * Recommendation Routes.
 *
 *  GET /recommendations/feed                         → getRankedFeed (authenticated)
 *  GET /recommendations/for-you                      → getRecommendations (authenticated)
 *  GET /recommendations/similar/:contentType/:contentId → getSimilar (public)
 */

import { Router } from 'express';
import { authenticate } from '../middlewares/auth';
import { recommendationController } from '../controllers/recommendation.controller';

const router = Router();

/**
 * GET /recommendations/feed
 * Returns a ranked feed of a specific content type for the authenticated user.
 * Query params:
 *   - contentType: POST | VIDEO | JOB | EVENT | STORY  (default: POST)
 *   - page:        number  (default: 1)
 *   - limit:       number  (default: 20, max: 100)
 */
router.get('/feed', authenticate, recommendationController.getRankedFeed);

/**
 * GET /recommendations/for-you
 * Returns a personalised "For You" mix across all content types.
 * Query params:
 *   - limit: number (default: 20, max: 100)
 */
router.get('/for-you', authenticate, recommendationController.getRecommendations);

/**
 * GET /recommendations/similar/:contentType/:contentId
 * Returns content similar to the specified item.
 * Route params:
 *   - contentType: POST | VIDEO | JOB | EVENT | STORY
 *   - contentId:   UUID of the content item
 * Query params:
 *   - limit: number (default: 10, max: 50)
 */
router.get(
  '/similar/:contentType/:contentId',
  recommendationController.getSimilar,
);

export default router;
