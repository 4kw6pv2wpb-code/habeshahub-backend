/**
 * Global TypeScript interfaces and types for the HabeshaHub backend.
 */

import { Request } from 'express';
import { Role, Language } from '@prisma/client';

// ─────────────────────────────────────────────
// Auth Types
// ─────────────────────────────────────────────

export interface JwtPayload {
  sub: string;       // User ID
  email: string;
  role: Role;
  iat?: number;
  exp?: number;
}

export interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    email: string;
    role: Role;
  };
}

// ─────────────────────────────────────────────
// API Response Types
// ─────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  meta?: PaginationMeta;
}

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PaginationQuery {
  page?: number;
  limit?: number;
}

// ─────────────────────────────────────────────
// Feed Types
// ─────────────────────────────────────────────

export interface FeedPost {
  id: string;
  content: string;
  mediaUrl: string | null;
  mediaType: string | null;
  likesCount: number;
  commentsCount: number;
  createdAt: Date;
  score: number;
  author: {
    id: string;
    name: string;
    avatarUrl: string | null;
    city: string | null;
    languages: Language[];
  };
}

export interface FeedScoreInput {
  likesCount: number;
  commentsCount: number;
  createdAt: Date;
  authorLanguages: Language[];
  authorCity: string | null;
  viewerLanguages: Language[];
  viewerCity: string | null;
}

// ─────────────────────────────────────────────
// Job Types
// ─────────────────────────────────────────────

export interface JobMatchScore {
  jobId: string;
  score: number;
  reasons: string[];
}

// ─────────────────────────────────────────────
// Remittance Types
// ─────────────────────────────────────────────

export interface RemittanceCorridor {
  from: string; // Currency code, e.g. USD
  to: string;   // Currency code, e.g. ETB
  rate: number;
  feePercent: number;
}

export interface RemittanceQuote {
  sendAmount: number;
  sendCurrency: string;
  feeAmount: number;
  exchangeRate: number;
  recipientAmount: number;
  recipientCurrency: string;
  corridor: string;
  estimatedDelivery: string;
}

// ─────────────────────────────────────────────
// Moderation Types
// ─────────────────────────────────────────────

export interface ModerationResult {
  isSafe: boolean;
  score: number;
  flaggedCategories: string[];
}

// ─────────────────────────────────────────────
// Socket Types
// ─────────────────────────────────────────────

export interface SocketUser {
  userId: string;
  socketId: string;
  connectedAt: Date;
}

export interface IncomingMessage {
  threadId: string;
  text?: string;
  mediaUrl?: string;
  mediaType?: string;
}

export interface OutgoingMessage {
  id: string;
  threadId: string;
  senderId: string;
  senderName: string;
  text: string | null;
  mediaUrl: string | null;
  createdAt: Date;
}

// ─────────────────────────────────────────────
// Error Types
// ─────────────────────────────────────────────

export interface ErrorResponse {
  success: false;
  error: string;
  code?: string;
  statusCode: number;
}

// ─────────────────────────────────────────────
// Housing Types
// ─────────────────────────────────────────────

export interface HousingListingSummary {
  id: string;
  title: string;
  rent: number;
  city: string;
  neighborhood: string | null;
  listingType: string;
  bedrooms: number;
  bathrooms: number;
  photoUrls: string[];
  availableDate: Date;
  poster: {
    id: string;
    name: string;
    avatarUrl: string | null;
    isVerified: boolean;
  };
  inquiryCount: number;
  saveCount: number;
}

export interface RoommateMatchScore {
  profileId: string;
  userId: string;
  score: number;
  reasons: string[];
}
