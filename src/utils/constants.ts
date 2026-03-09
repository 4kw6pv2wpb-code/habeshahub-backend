/**
 * Application-wide constants.
 */

// ─────────────────────────────────────────────
// Authentication
// ─────────────────────────────────────────────

export const JWT_EXPIRES_IN = '24h';
export const BCRYPT_ROUNDS = 12;

// ─────────────────────────────────────────────
// Pagination
// ─────────────────────────────────────────────

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

// ─────────────────────────────────────────────
// Stories
// ─────────────────────────────────────────────

/** Stories expire after 24 hours */
export const STORY_TTL_HOURS = 24;

// ─────────────────────────────────────────────
// Feed Scoring
// ─────────────────────────────────────────────

/** Feed posts decay to 0 freshness after this many hours (1 week) */
export const FEED_FRESHNESS_DECAY_HOURS = 168;
export const FEED_LIKE_WEIGHT = 2;
export const FEED_COMMENT_WEIGHT = 3;
export const FEED_LANGUAGE_MATCH_BOOST = 0.3;
export const FEED_LOCATION_MATCH_BOOST = 0.2;

// ─────────────────────────────────────────────
// Remittance corridors
// ─────────────────────────────────────────────

// Supported corridors in format SEND_CURRENCY-RECV_CURRENCY
export const SUPPORTED_CORRIDORS = ['US-ET', 'EU-ET', 'US-ER'] as const;
export type Corridor = (typeof SUPPORTED_CORRIDORS)[number];

// Mock exchange rates (in a real system these come from a provider API)
export const EXCHANGE_RATES: Record<string, number> = {
  'US-ET': 113.5,  // 1 USD → 113.5 ETB
  'EU-ET': 122.0,  // 1 EUR → 122.0 ETB
  'US-ER': 15.0,   // 1 USD → 15.0 ERN (Eritrean Nakfa)
};

export const REMITTANCE_FEE_PERCENT = 0.01; // 1% flat fee
export const RECIPIENT_CURRENCIES: Record<string, string> = {
  'US-ET': 'ETB',
  'EU-ET': 'ETB',
  'US-ER': 'ERN',
};

// ─────────────────────────────────────────────
// Moderation
// ─────────────────────────────────────────────

export const MODERATION_TOXICITY_THRESHOLD = 0.75;

// ─────────────────────────────────────────────
// Rate limiting
// ─────────────────────────────────────────────

export const RATE_LIMIT_POINTS = 200;
export const RATE_LIMIT_DURATION_SECONDS = 86400; // 24 hours

// ─────────────────────────────────────────────
// Socket.io rooms
// ─────────────────────────────────────────────

export const SOCKET_EVENTS = {
  // Client → Server
  JOIN_THREAD: 'join_thread',
  LEAVE_THREAD: 'leave_thread',
  SEND_MESSAGE: 'send_message',
  TYPING_START: 'typing_start',
  TYPING_STOP: 'typing_stop',

  // Server → Client
  NEW_MESSAGE: 'new_message',
  TYPING_INDICATOR: 'typing_indicator',
  USER_ONLINE: 'user_online',
  USER_OFFLINE: 'user_offline',
  NOTIFICATION: 'notification',
  STORY_UPDATE: 'story_update',
  ERROR: 'error',
} as const;
