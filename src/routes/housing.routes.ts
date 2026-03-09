/**
 * Housing & Roommate Routes.
 *
 * POST   /housing                     — Create listing
 * GET    /housing                     — Browse listings (with filters)
 * GET    /housing/my-listings         — User's own listings
 * GET    /housing/saved               — User's saved listings
 * GET    /housing/roommate/profile    — Get own roommate profile
 * POST   /housing/roommate/profile    — Create/update roommate profile
 * GET    /housing/roommate/matches    — Find compatible roommates
 * GET    /housing/:id                 — Get listing detail
 * PUT    /housing/:id                 — Update listing
 * DELETE /housing/:id                 — Withdraw listing
 * POST   /housing/:id/inquire        — Send inquiry
 * GET    /housing/:id/inquiries      — Get inquiries (poster only)
 * POST   /housing/:id/save           — Toggle save/unsave
 */

import { Router } from 'express';
import { authenticate } from '../middlewares/auth';
import { housingController } from '../controllers/housing.controller';

const router = Router();

// All housing routes require auth
router.use(authenticate);

// Listing CRUD
router.post('/', housingController.createListing);
router.get('/', housingController.getListings);
router.get('/my-listings', housingController.getMyListings);
router.get('/saved', housingController.getSavedListings);

// Roommate matching (must come before /:id to avoid conflicts)
router.post('/roommate/profile', housingController.upsertRoommateProfile);
router.get('/roommate/profile', housingController.getRoommateProfile);
router.get('/roommate/matches', housingController.findRoommateMatches);

// Listing detail & actions
router.get('/:id', housingController.getListingById);
router.put('/:id', housingController.updateListing);
router.delete('/:id', housingController.deleteListing);

// Inquiries & saves
router.post('/:id/inquire', housingController.sendInquiry);
router.get('/:id/inquiries', housingController.getInquiries);
router.post('/:id/save', housingController.toggleSave);

export default router;
