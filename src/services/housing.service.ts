/**
 * Housing & Roommate Service
 * 
 * Enhanced community housing platform — inspired by Facebook housing groups
 * (like Seattle Delta) but with structured data, roommate matching, verified
 * community listings, safety features, and smart filters.
 * 
 * NOTE: After adding the Housing models to schema.prisma, run `npx prisma generate`
 * to create the Prisma client types. Until then, we use (prisma as any) for new models.
 */

import { PrismaClient, Language } from '@prisma/client';
import type { PaginationMeta } from '../types';
import { logger } from '../utils/logger';

// Type aliases matching the Prisma enums defined in schema.prisma
type ListingType = 'ROOM' | 'APARTMENT' | 'HOUSE' | 'SUBLET' | 'SHARED';
type FurnishingStatus = 'FURNISHED' | 'UNFURNISHED' | 'PARTIALLY_FURNISHED';
type LeaseType = 'MONTH_TO_MONTH' | 'SHORT_TERM' | 'LONG_TERM' | 'FLEXIBLE';
type RoommateGender = 'MALE' | 'FEMALE' | 'ANY';

const prisma = new PrismaClient();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any; // Proxy for new models until prisma generate runs

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface CreateListingInput {
  posterId: string;
  title: string;
  description: string;
  listingType?: ListingType;
  rent: number;
  deposit?: number;
  city: string;
  neighborhood?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  bedrooms?: number;
  bathrooms?: number;
  sqft?: number;
  furnishing?: FurnishingStatus;
  leaseType?: LeaseType;
  availableDate: string; // ISO date
  photoUrls?: string[];
  amenities?: string[];
  utilitiesIncluded?: boolean;
  petsAllowed?: boolean;
  smokingAllowed?: boolean;
  preferredLanguages?: Language[];
}

export interface ListingFilterInput {
  city?: string;
  listingType?: ListingType;
  rentMin?: number;
  rentMax?: number;
  bedrooms?: number;
  furnishing?: FurnishingStatus;
  leaseType?: LeaseType;
  petsAllowed?: boolean;
  utilitiesIncluded?: boolean;
  amenities?: string[];
  language?: Language;
  sortBy?: 'newest' | 'price_low' | 'price_high' | 'popular';
  page?: number;
  limit?: number;
}

export interface CreateRoommateProfileInput {
  userId: string;
  headline?: string;
  aboutMe?: string;
  budgetMin: number;
  budgetMax: number;
  preferredCity?: string;
  preferredNeighborhoods?: string[];
  moveInDate?: string;
  genderPreference?: RoommateGender;
  ageMin?: number;
  ageMax?: number;
  occupation?: string;
  lifestyle?: string[];
  languages?: Language[];
  cleanlinessLevel?: number;
  smokingOk?: boolean;
  petsOk?: boolean;
  photoUrls?: string[];
}

export interface RoommateMatchResult {
  profile: {
    id: string;
    userId: string;
    headline: string | null;
    aboutMe: string | null;
    budgetMin: number;
    budgetMax: number;
    preferredCity: string | null;
    occupation: string | null;
    lifestyle: string[];
    languages: Language[];
    cleanlinessLevel: number;
    photoUrls: string[];
    user: {
      id: string;
      name: string;
      avatarUrl: string | null;
      city: string | null;
    };
  };
  matchScore: number;
  matchReasons: string[];
}

// ─────────────────────────────────────────────
// Housing Listing CRUD
// ─────────────────────────────────────────────

/**
 * Create a new housing listing.
 */
export async function createListing(input: CreateListingInput) {
  const listing = await db.housingListing.create({
    data: {
      posterId: input.posterId,
      title: input.title,
      description: input.description,
      listingType: input.listingType ?? 'ROOM',
      rent: input.rent,
      deposit: input.deposit,
      city: input.city,
      neighborhood: input.neighborhood,
      address: input.address,
      latitude: input.latitude,
      longitude: input.longitude,
      bedrooms: input.bedrooms ?? 1,
      bathrooms: input.bathrooms ?? 1,
      sqft: input.sqft,
      furnishing: input.furnishing ?? 'UNFURNISHED',
      leaseType: input.leaseType ?? 'FLEXIBLE',
      availableDate: new Date(input.availableDate),
      photoUrls: input.photoUrls ?? [],
      amenities: input.amenities ?? [],
      utilitiesIncluded: input.utilitiesIncluded ?? false,
      petsAllowed: input.petsAllowed ?? false,
      smokingAllowed: input.smokingAllowed ?? false,
      preferredLanguages: input.preferredLanguages ?? [],
    },
    include: {
      poster: {
        select: { id: true, name: true, avatarUrl: true, city: true, isVerified: true },
      },
    },
  });

  logger.info(`Housing listing created: ${listing.id} by user ${input.posterId}`);
  return listing;
}

/**
 * Get listings with filtering, sorting, and pagination.
 * Enhanced beyond a simple Facebook group — structured filters, geo-sort, etc.
 */
export async function getListings(filters: ListingFilterInput) {
  const page = filters.page ?? 1;
  const limit = Math.min(filters.limit ?? 20, 50);
  const skip = (page - 1) * limit;

  // Build where clause
  const where: Record<string, unknown> = { status: 'ACTIVE' };

  if (filters.city) where.city = { contains: filters.city, mode: 'insensitive' };
  if (filters.listingType) where.listingType = filters.listingType;
  if (filters.bedrooms) where.bedrooms = { gte: filters.bedrooms };
  if (filters.furnishing) where.furnishing = filters.furnishing;
  if (filters.leaseType) where.leaseType = filters.leaseType;
  if (filters.petsAllowed) where.petsAllowed = true;
  if (filters.utilitiesIncluded) where.utilitiesIncluded = true;

  // Price range filter
  if (filters.rentMin || filters.rentMax) {
    const rentFilter: Record<string, number> = {};
    if (filters.rentMin) rentFilter.gte = filters.rentMin;
    if (filters.rentMax) rentFilter.lte = filters.rentMax;
    where.rent = rentFilter;
  }

  // Language preference filter
  if (filters.language) {
    where.preferredLanguages = { has: filters.language };
  }

  // Amenity filter — listing must have ALL requested amenities
  if (filters.amenities && filters.amenities.length > 0) {
    where.amenities = { hasEvery: filters.amenities };
  }

  // Sort order
  let orderBy: Record<string, string>;
  switch (filters.sortBy) {
    case 'price_low':
      orderBy = { rent: 'asc' };
      break;
    case 'price_high':
      orderBy = { rent: 'desc' };
      break;
    case 'popular':
      orderBy = { viewCount: 'desc' };
      break;
    case 'newest':
    default:
      orderBy = { createdAt: 'desc' };
  }

  const [listings, total] = await Promise.all([
    db.housingListing.findMany({
      where,
      orderBy,
      skip,
      take: limit,
      include: {
        poster: {
          select: { id: true, name: true, avatarUrl: true, city: true, isVerified: true },
        },
        _count: { select: { inquiries: true, savedBy: true } },
      },
    }),
    db.housingListing.count({ where }),
  ]);

  const meta: PaginationMeta = {
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };

  return { listings, meta };
}

/**
 * Get a single listing by ID. Increments view count.
 */
export async function getListingById(listingId: string) {
  const listing = await db.housingListing.update({
    where: { id: listingId },
    data: { viewCount: { increment: 1 } },
    include: {
      poster: {
        select: { id: true, name: true, avatarUrl: true, city: true, isVerified: true, languages: true },
      },
      inquiries: {
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: {
          sender: { select: { id: true, name: true, avatarUrl: true } },
        },
      },
      _count: { select: { inquiries: true, savedBy: true } },
    },
  });

  return listing;
}

/**
 * Update a listing (only by poster).
 */
export async function updateListing(listingId: string, posterId: string, data: Partial<CreateListingInput>) {
  const listing = await db.housingListing.findFirst({
    where: { id: listingId, posterId },
  });

  if (!listing) throw new Error('Listing not found or unauthorized');

  const updateData: Record<string, unknown> = {};
  const allowedFields = [
    'title', 'description', 'listingType', 'rent', 'deposit', 'city', 'neighborhood',
    'address', 'latitude', 'longitude', 'bedrooms', 'bathrooms', 'sqft', 'furnishing',
    'leaseType', 'photoUrls', 'amenities', 'utilitiesIncluded', 'petsAllowed',
    'smokingAllowed', 'preferredLanguages', 'status',
  ];

  for (const field of allowedFields) {
    if (field in data) {
      updateData[field] = (data as Record<string, unknown>)[field];
    }
  }

  if (data.availableDate) {
    updateData.availableDate = new Date(data.availableDate);
  }

  return db.housingListing.update({
    where: { id: listingId },
    data: updateData,
    include: {
      poster: {
        select: { id: true, name: true, avatarUrl: true },
      },
    },
  });
}

/**
 * Delete listing (mark as withdrawn).
 */
export async function deleteListing(listingId: string, posterId: string) {
  const listing = await db.housingListing.findFirst({
    where: { id: listingId, posterId },
  });

  if (!listing) throw new Error('Listing not found or unauthorized');

  await db.housingListing.update({
    where: { id: listingId },
    data: { status: 'WITHDRAWN' },
  });

  return { success: true };
}

// ─────────────────────────────────────────────
// Inquiries & Saves
// ─────────────────────────────────────────────

/**
 * Send an inquiry on a listing (replaces DMs in Facebook groups).
 */
export async function sendInquiry(listingId: string, senderId: string, message: string) {
  const inquiry = await db.housingInquiry.create({
    data: { listingId, senderId, message },
    include: {
      sender: { select: { id: true, name: true, avatarUrl: true } },
      listing: { select: { id: true, title: true, posterId: true } },
    },
  });

  logger.info(`Housing inquiry sent: ${inquiry.id} on listing ${listingId}`);
  return inquiry;
}

/**
 * Get inquiries for a listing (for the poster).
 */
export async function getInquiries(listingId: string, posterId: string) {
  // Verify ownership
  const listing = await db.housingListing.findFirst({
    where: { id: listingId, posterId },
  });
  if (!listing) throw new Error('Listing not found or unauthorized');

  return db.housingInquiry.findMany({
    where: { listingId },
    orderBy: { createdAt: 'desc' },
    include: {
      sender: { select: { id: true, name: true, avatarUrl: true, city: true } },
    },
  });
}

/**
 * Save/unsave a listing.
 */
export async function toggleSaveListing(listingId: string, userId: string) {
  const existing = await db.savedListing.findUnique({
    where: { listingId_userId: { listingId, userId } },
  });

  if (existing) {
    await db.savedListing.delete({ where: { id: existing.id } });
    return { saved: false };
  }

  await db.savedListing.create({ data: { listingId, userId } });
  return { saved: true };
}

/**
 * Get user's saved listings.
 */
export async function getSavedListings(userId: string) {
  const saved = await db.savedListing.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    include: {
      listing: {
        include: {
          poster: { select: { id: true, name: true, avatarUrl: true } },
          _count: { select: { inquiries: true, savedBy: true } },
        },
      },
    },
  });

  return saved.map((s: { listing: unknown }) => s.listing);
}

// ─────────────────────────────────────────────
// Roommate Matching System
// ─────────────────────────────────────────────

/**
 * Create or update a roommate profile.
 */
export async function upsertRoommateProfile(input: CreateRoommateProfileInput) {
  const data = {
    headline: input.headline,
    aboutMe: input.aboutMe,
    budgetMin: input.budgetMin,
    budgetMax: input.budgetMax,
    preferredCity: input.preferredCity,
    preferredNeighborhoods: input.preferredNeighborhoods ?? [],
    moveInDate: input.moveInDate ? new Date(input.moveInDate) : null,
    genderPreference: input.genderPreference ?? 'ANY',
    ageMin: input.ageMin ?? 18,
    ageMax: input.ageMax ?? 60,
    occupation: input.occupation,
    lifestyle: input.lifestyle ?? [],
    languages: input.languages ?? [],
    cleanlinessLevel: input.cleanlinessLevel ?? 3,
    smokingOk: input.smokingOk ?? false,
    petsOk: input.petsOk ?? false,
    photoUrls: input.photoUrls ?? [],
  };

  const profile = await db.roommateProfile.upsert({
    where: { userId: input.userId },
    create: { userId: input.userId, ...data },
    update: data,
    include: {
      user: { select: { id: true, name: true, avatarUrl: true, city: true } },
    },
  });

  return profile;
}

interface ProfileForMatch {
  budgetMin: number;
  budgetMax: number;
  preferredCity: string | null;
  lifestyle: string[];
  languages: Language[];
  cleanlinessLevel: number;
  smokingOk: boolean;
  petsOk: boolean;
  preferredNeighborhoods: string[];
}

/**
 * Compute roommate compatibility score between two profiles.
 * Algorithm considers: budget overlap, lifestyle alignment, language match,
 * city preference, cleanliness level, smoking/pet preferences.
 */
function computeMatchScore(
  profile: ProfileForMatch,
  candidate: ProfileForMatch,
): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  const maxScore = 100;

  // Budget overlap (30 points)
  const budgetOverlap = Math.min(profile.budgetMax, candidate.budgetMax) - Math.max(profile.budgetMin, candidate.budgetMin);
  if (budgetOverlap > 0) {
    const overlapRatio = budgetOverlap / Math.max(profile.budgetMax - profile.budgetMin, 1);
    const budgetScore = Math.min(30, Math.round(overlapRatio * 30));
    score += budgetScore;
    if (budgetScore >= 20) reasons.push('Great budget alignment');
  }

  // City match (15 points)
  if (profile.preferredCity && candidate.preferredCity) {
    if (profile.preferredCity.toLowerCase() === candidate.preferredCity.toLowerCase()) {
      score += 15;
      reasons.push(`Both prefer ${profile.preferredCity}`);
    }
  }

  // Neighborhood overlap (10 points)
  const neighborhoodOverlap = profile.preferredNeighborhoods.filter(
    (n) => candidate.preferredNeighborhoods.map((c) => c.toLowerCase()).includes(n.toLowerCase()),
  );
  if (neighborhoodOverlap.length > 0) {
    score += Math.min(10, neighborhoodOverlap.length * 5);
    reasons.push(`Shared neighborhood: ${neighborhoodOverlap[0]}`);
  }

  // Lifestyle alignment (20 points)
  const lifestyleOverlap = profile.lifestyle.filter((l) => candidate.lifestyle.includes(l));
  if (lifestyleOverlap.length > 0) {
    const lifestyleScore = Math.min(20, lifestyleOverlap.length * 5);
    score += lifestyleScore;
    reasons.push(`${lifestyleOverlap.length} lifestyle traits in common`);
  }

  // Language match (10 points)
  const languageOverlap = profile.languages.filter((l) => candidate.languages.includes(l));
  if (languageOverlap.length > 0) {
    score += Math.min(10, languageOverlap.length * 5);
    reasons.push('Shared language');
  }

  // Cleanliness compatibility (10 points)
  const cleanlinessDiff = Math.abs(profile.cleanlinessLevel - candidate.cleanlinessLevel);
  if (cleanlinessDiff <= 1) {
    score += 10;
    reasons.push('Similar cleanliness standards');
  } else if (cleanlinessDiff === 2) {
    score += 5;
  }

  // Smoking/pet compatibility (5 points)
  if (profile.smokingOk === candidate.smokingOk) {
    score += 2;
  }
  if (profile.petsOk === candidate.petsOk) {
    score += 3;
    if (profile.petsOk) reasons.push('Both pet-friendly');
  }

  return { score: Math.min(maxScore, score), reasons };
}

/**
 * Find compatible roommates for a user's profile.
 * Returns ranked list of matches with compatibility scores.
 */
export async function findRoommateMatches(userId: string, page = 1, limit = 20): Promise<{ matches: RoommateMatchResult[]; meta: PaginationMeta }> {
  // Get user's profile
  const myProfile = await db.roommateProfile.findUnique({
    where: { userId },
  });

  if (!myProfile) throw new Error('Create a roommate profile first');

  // Get candidate profiles (exclude self)
  const candidates = await db.roommateProfile.findMany({
    where: {
      userId: { not: userId },
      isActive: true,
    },
    include: {
      user: { select: { id: true, name: true, avatarUrl: true, city: true } },
    },
  });

  // Compute scores
  const scored: RoommateMatchResult[] = candidates.map((candidate: RoommateMatchResult['profile']) => {
    const { score, reasons } = computeMatchScore(myProfile as ProfileForMatch, candidate as unknown as ProfileForMatch);
    return {
      profile: candidate,
      matchScore: score,
      matchReasons: reasons,
    };
  });

  // Sort by score descending
  scored.sort((a, b) => b.matchScore - a.matchScore);

  // Paginate
  const total = scored.length;
  const start = (page - 1) * limit;
  const paginated = scored.slice(start, start + limit);

  return {
    matches: paginated,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Get user's own roommate profile.
 */
export async function getRoommateProfile(userId: string) {
  return db.roommateProfile.findUnique({
    where: { userId },
    include: {
      user: { select: { id: true, name: true, avatarUrl: true, city: true } },
    },
  });
}

/**
 * Get user's own listings.
 */
export async function getMyListings(userId: string) {
  return db.housingListing.findMany({
    where: { posterId: userId },
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { inquiries: true, savedBy: true } },
    },
  });
}
