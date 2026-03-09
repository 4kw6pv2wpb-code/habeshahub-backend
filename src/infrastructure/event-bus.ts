/**
 * Event Bus — typed, abstracted event system.
 *
 * Development: in-process Node.js EventEmitter (zero dependencies, instant start).
 * Production:  NATS JetStream — conditionally imported; falls back to in-process
 *              if NATS_URL is not configured or the connection fails.
 *
 * Usage:
 *   import { eventBus, EventType } from './event-bus';
 *   eventBus.publish(EventType.USER_REGISTERED, { userId: '...', email: '...' });
 *   eventBus.subscribe(EventType.USER_REGISTERED, async (payload) => { ... });
 */

import { EventEmitter } from 'events';
import { logger } from '../utils/logger';

// ─────────────────────────────────────────────
// Event Types Enum
// ─────────────────────────────────────────────

export enum EventType {
  USER_REGISTERED       = 'USER_REGISTERED',
  VIDEO_UPLOADED        = 'VIDEO_UPLOADED',
  POST_CREATED          = 'POST_CREATED',
  JOB_POSTED            = 'JOB_POSTED',
  MESSAGE_SENT          = 'MESSAGE_SENT',
  WALLET_TRANSACTION    = 'WALLET_TRANSACTION',
  EQUB_CYCLE_COMPLETE   = 'EQUB_CYCLE_COMPLETE',
  STREAM_STARTED        = 'STREAM_STARTED',
  CONTENT_FLAGGED       = 'CONTENT_FLAGGED',
  CREATOR_TIPPED        = 'CREATOR_TIPPED',
}

// ─────────────────────────────────────────────
// Typed Payload Interfaces
// ─────────────────────────────────────────────

export interface UserRegisteredPayload {
  userId: string;
  email: string;
  name: string;
  referralCode?: string;
  city?: string;
  country?: string;
  languages?: string[];
}

export interface VideoUploadedPayload {
  videoId: string;
  userId: string;
  title: string;
  rawUrl: string;
  duration?: number;
  language?: string;
}

export interface PostCreatedPayload {
  postId: string;
  userId: string;
  content: string;
  mediaUrl?: string;
  hashtags?: string[];
  city?: string;
}

export interface JobPostedPayload {
  jobId: string;
  userId: string;
  title: string;
  company: string;
  city?: string;
  country?: string;
  requiredLanguages?: string[];
  tags?: string[];
}

export interface MessageSentPayload {
  messageId: string;
  threadId: string;
  senderId: string;
  recipientId: string;
  preview: string;
}

export interface WalletTransactionPayload {
  transactionId: string;
  walletId: string;
  userId: string;
  type: 'DEPOSIT' | 'WITHDRAWAL' | 'TIP' | 'EQUB_CONTRIBUTION' | 'EQUB_PAYOUT' | 'SUBSCRIPTION' | 'GIFT' | string;
  amount: number;
  currency: string;
  status: 'PENDING' | 'COMPLETED' | 'FAILED' | string;
  metadata?: Record<string, unknown>;
}

export interface EqubCycleCompletePayload {
  equbId: string;
  cycleNumber: number;
  payoutUserId: string;
  payoutAmount: number;
  currency: string;
  memberIds: string[];
}

export interface StreamStartedPayload {
  streamId: string;
  userId: string;
  title: string;
  thumbnailUrl?: string;
  followerIds?: string[];
}

export interface ContentFlaggedPayload {
  contentId: string;
  contentType: 'POST' | 'VIDEO' | 'COMMENT' | 'MESSAGE' | 'STORY' | string;
  reportedByUserId: string;
  reason: string;
  details?: string;
}

export interface CreatorTippedPayload {
  tipId: string;
  creatorId: string;
  tipperId: string;
  amount: number;
  currency: string;
  contentId?: string;
  contentType?: string;
  message?: string;
}

// ─────────────────────────────────────────────
// EventPayloadMap — maps EventType → payload type for type inference
// ─────────────────────────────────────────────

export interface EventPayloadMap {
  [EventType.USER_REGISTERED]:     UserRegisteredPayload;
  [EventType.VIDEO_UPLOADED]:      VideoUploadedPayload;
  [EventType.POST_CREATED]:        PostCreatedPayload;
  [EventType.JOB_POSTED]:          JobPostedPayload;
  [EventType.MESSAGE_SENT]:        MessageSentPayload;
  [EventType.WALLET_TRANSACTION]:  WalletTransactionPayload;
  [EventType.EQUB_CYCLE_COMPLETE]: EqubCycleCompletePayload;
  [EventType.STREAM_STARTED]:      StreamStartedPayload;
  [EventType.CONTENT_FLAGGED]:     ContentFlaggedPayload;
  [EventType.CREATOR_TIPPED]:      CreatorTippedPayload;
}

export type EventHandler<E extends EventType> = (
  payload: EventPayloadMap[E],
) => Promise<void> | void;

// ─────────────────────────────────────────────
// EventBus Class
// ─────────────────────────────────────────────

class EventBus {
  private static instance: EventBus;
  private emitter: EventEmitter;
  /** NATS connection — typed as `any` to avoid requiring the optional nats package */
  private natsConnection: any = null;
  private useNats = false;

  private constructor() {
    this.emitter = new EventEmitter();
    // Increase max listeners to accommodate many handler registrations
    this.emitter.setMaxListeners(100);
  }

  /** Returns the singleton instance (creates it if necessary). */
  static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  // ─────────────────────────────────────────
  // NATS Connection (optional, production)
  // ─────────────────────────────────────────

  /**
   * Attempt to establish a NATS connection.
   * Called explicitly at server startup when NATS_URL is set.
   * If NATS is unavailable, the bus continues with in-process EventEmitter.
   */
  async connectNats(natsUrl: string): Promise<void> {
    try {
      // Dynamic import so the `nats` package is only required when used.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { connect, StringCodec } = await (Function('return import')('nats') as Promise<any>);
      this.natsConnection = await connect({ servers: natsUrl });
      this.useNats = true;
      logger.info('EventBus: NATS connected', { natsUrl });

      // Mirror incoming NATS messages into the local emitter so in-process
      // subscribers also receive events published via NATS from other services.
      const sc = StringCodec();
      const sub = this.natsConnection.subscribe('>');
      (async () => {
        for await (const msg of sub) {
          try {
            const eventType = msg.subject as EventType;
            const payload = JSON.parse(sc.decode(msg.data));
            this.emitter.emit(eventType, payload);
          } catch {
            // Malformed message — skip
          }
        }
      })();
    } catch (err: any) {
      logger.warn('EventBus: NATS connection failed, falling back to in-process EventEmitter', {
        error: err?.message,
      });
      this.useNats = false;
      this.natsConnection = null;
    }
  }

  /** Gracefully close the NATS connection if open. */
  async disconnectNats(): Promise<void> {
    if (this.natsConnection) {
      await this.natsConnection.drain();
      this.natsConnection = null;
      this.useNats = false;
      logger.info('EventBus: NATS disconnected');
    }
  }

  // ─────────────────────────────────────────
  // Core API
  // ─────────────────────────────────────────

  /**
   * Publish an event with a typed payload.
   * If NATS is connected, publishes to the NATS subject matching the event type.
   * Always emits locally so in-process subscribers are notified.
   */
  async publish<E extends EventType>(
    event: E,
    payload: EventPayloadMap[E],
  ): Promise<void> {
    logger.info('EventBus: publish', { event, payload });

    if (this.useNats && this.natsConnection) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { StringCodec } = await (Function('return import')('nats') as Promise<any>);
        const sc = StringCodec();
        this.natsConnection.publish(event, sc.encode(JSON.stringify(payload)));
        // Note: local emit is handled by the NATS subscription mirror above,
        // but we emit locally anyway to keep latency low for same-process handlers.
      } catch (err: any) {
        logger.warn('EventBus: NATS publish failed, emitting locally only', {
          event,
          error: err?.message,
        });
      }
    }

    // Always emit locally (ensures in-process handlers fire regardless)
    this.emitter.emit(event, payload);
  }

  /**
   * Subscribe to an event type with a typed async handler.
   * Multiple handlers can be registered for the same event.
   */
  subscribe<E extends EventType>(
    event: E,
    handler: EventHandler<E>,
  ): void {
    this.emitter.on(event, handler as (...args: any[]) => void);
    logger.debug('EventBus: handler registered', { event });
  }

  /**
   * Unsubscribe a previously registered handler.
   */
  unsubscribe<E extends EventType>(
    event: E,
    handler: EventHandler<E>,
  ): void {
    this.emitter.off(event, handler as (...args: any[]) => void);
    logger.debug('EventBus: handler unregistered', { event });
  }

  /**
   * Subscribe to an event, automatically removing the handler after it fires once.
   */
  once<E extends EventType>(
    event: E,
    handler: EventHandler<E>,
  ): void {
    this.emitter.once(event, handler as (...args: any[]) => void);
  }

  /** Returns true if the bus is using NATS for cross-process messaging. */
  get isUsingNats(): boolean {
    return this.useNats;
  }
}

// ─────────────────────────────────────────────
// Singleton Export
// ─────────────────────────────────────────────

export const eventBus = EventBus.getInstance();
