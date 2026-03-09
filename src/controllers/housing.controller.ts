/**
 * Housing & Roommate Controller.
 * Handles HTTP requests for housing listings, inquiries, saves, and roommate matching.
 */

import { Request, Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../types';
import * as housingService from '../services/housing.service';

export const housingController = {
  // ─────────────────────────────────────────────
  // Housing Listings
  // ─────────────────────────────────────────────

  async createListing(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: userId } = (req as AuthenticatedRequest).user;
      const listing = await housingService.createListing({
        posterId: userId,
        ...req.body,
      });
      res.status(201).json({ success: true, data: listing });
    } catch (err) {
      next(err);
    }
  },

  async getListings(req: Request, res: Response, next: NextFunction) {
    try {
      const filters: housingService.ListingFilterInput = {
        city: req.query.city as string,
        listingType: req.query.listingType as housingService.ListingFilterInput['listingType'],
        rentMin: req.query.rentMin ? Number(req.query.rentMin) : undefined,
        rentMax: req.query.rentMax ? Number(req.query.rentMax) : undefined,
        bedrooms: req.query.bedrooms ? Number(req.query.bedrooms) : undefined,
        furnishing: req.query.furnishing as housingService.ListingFilterInput['furnishing'],
        leaseType: req.query.leaseType as housingService.ListingFilterInput['leaseType'],
        petsAllowed: req.query.petsAllowed === 'true' ? true : undefined,
        utilitiesIncluded: req.query.utilitiesIncluded === 'true' ? true : undefined,
        amenities: req.query.amenities ? (req.query.amenities as string).split(',') : undefined,
        language: req.query.language as housingService.ListingFilterInput['language'],
        sortBy: (req.query.sortBy as housingService.ListingFilterInput['sortBy']) ?? 'newest',
        page: req.query.page ? Number(req.query.page) : 1,
        limit: req.query.limit ? Number(req.query.limit) : 20,
      };

      const result = await housingService.getListings(filters);
      res.json({ success: true, data: result.listings, meta: result.meta });
    } catch (err) {
      next(err);
    }
  },

  async getListingById(req: Request, res: Response, next: NextFunction) {
    try {
      const listing = await housingService.getListingById(req.params.id);
      if (!listing) {
        res.status(404).json({ success: false, error: 'Listing not found' });
        return;
      }
      res.json({ success: true, data: listing });
    } catch (err) {
      next(err);
    }
  },

  async updateListing(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: userId } = (req as AuthenticatedRequest).user;
      const listing = await housingService.updateListing(req.params.id, userId, req.body);
      res.json({ success: true, data: listing });
    } catch (err) {
      next(err);
    }
  },

  async deleteListing(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: userId } = (req as AuthenticatedRequest).user;
      const result = await housingService.deleteListing(req.params.id, userId);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  async getMyListings(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: userId } = (req as AuthenticatedRequest).user;
      const listings = await housingService.getMyListings(userId);
      res.json({ success: true, data: listings });
    } catch (err) {
      next(err);
    }
  },

  // ─────────────────────────────────────────────
  // Inquiries & Saves
  // ─────────────────────────────────────────────

  async sendInquiry(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: userId } = (req as AuthenticatedRequest).user;
      const inquiry = await housingService.sendInquiry(
        req.params.id,
        userId,
        req.body.message,
      );
      res.status(201).json({ success: true, data: inquiry });
    } catch (err) {
      next(err);
    }
  },

  async getInquiries(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: userId } = (req as AuthenticatedRequest).user;
      const inquiries = await housingService.getInquiries(req.params.id, userId);
      res.json({ success: true, data: inquiries });
    } catch (err) {
      next(err);
    }
  },

  async toggleSave(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: userId } = (req as AuthenticatedRequest).user;
      const result = await housingService.toggleSaveListing(req.params.id, userId);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  async getSavedListings(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: userId } = (req as AuthenticatedRequest).user;
      const listings = await housingService.getSavedListings(userId);
      res.json({ success: true, data: listings });
    } catch (err) {
      next(err);
    }
  },

  // ─────────────────────────────────────────────
  // Roommate Matching
  // ─────────────────────────────────────────────

  async upsertRoommateProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: userId } = (req as AuthenticatedRequest).user;
      const profile = await housingService.upsertRoommateProfile({
        userId,
        ...req.body,
      });
      res.json({ success: true, data: profile });
    } catch (err) {
      next(err);
    }
  },

  async getRoommateProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: userId } = (req as AuthenticatedRequest).user;
      const profile = await housingService.getRoommateProfile(userId);
      if (!profile) {
        res.status(404).json({ success: false, error: 'No roommate profile found' });
        return;
      }
      res.json({ success: true, data: profile });
    } catch (err) {
      next(err);
    }
  },

  async findRoommateMatches(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: userId } = (req as AuthenticatedRequest).user;
      const page = req.query.page ? Number(req.query.page) : 1;
      const limit = req.query.limit ? Number(req.query.limit) : 20;
      const result = await housingService.findRoommateMatches(userId, page, limit);
      res.json({ success: true, data: result.matches, meta: result.meta });
    } catch (err) {
      next(err);
    }
  },
};
