/**
 * HabeshaHub Backend — Express server entry point.
 *
 * Responsibilities:
 *   1. Bootstrap Express app with security, logging, and body parsing middleware
 *   2. Mount all API routes under /api
 *   3. Attach Socket.io for real-time messaging
 *   4. Connect to PostgreSQL and Redis on startup
 *   5. Handle graceful shutdown on SIGTERM / SIGINT
 */

// Load and validate env first (throws on invalid config)
import './config/env';

import http from 'http';
import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { Server as SocketServer } from 'socket.io';

import { env } from './config/env';
import { connectDatabase, disconnectDatabase } from './config/database';
import { disconnectRedis } from './config/redis';
import { setupSocketHandlers } from './services/messaging.service';
import { setupSocketGateway, setSocketServer } from './services/socket.gateway';
import { expireStories } from './services/stories.service';
import router from './routes/index';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler';
import { logger } from './utils/logger';
import { eventBus } from './infrastructure/event-bus';
import { registerAllHandlers } from './infrastructure/event-handlers';
import { startProcessor, stopProcessor } from './infrastructure/event-processor';
import { initializeIndexes } from './infrastructure/search-engine';
import { mediaQueue } from './infrastructure/media-queue';
import { processVideoUpload } from './infrastructure/media-pipeline';

// ─────────────────────────────────────────────
// Express app
// ─────────────────────────────────────────────

const app: Express = express();

// ── Security headers ───────────────────────
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }),
);

// ── CORS ───────────────────────────────────
const allowedOrigins = env.CORS_ORIGINS.split(',').map((o) => o.trim());
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, etc.)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: origin ${origin} not allowed`));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
);

// ── Body parsing ───────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── HTTP request logging ───────────────────
app.use(
  morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev', {
    stream: {
      write: (msg: string) => logger.http(msg.trim()),
    },
  }),
);

// ── Trust proxy (for correct IP behind nginx) ─
app.set('trust proxy', 1);

// ─────────────────────────────────────────────
// Health check (before /api prefix — used by Docker / nginx)
// ─────────────────────────────────────────────

app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    data: { status: 'ok', timestamp: new Date().toISOString() },
  });
});

// ─────────────────────────────────────────────
// API routes
// ─────────────────────────────────────────────

app.use('/api', router);

// ─────────────────────────────────────────────
// 404 + error handlers (must be last)
// ─────────────────────────────────────────────

app.use(notFoundHandler);
app.use(errorHandler);

// ─────────────────────────────────────────────
// HTTP server + Socket.io
// ─────────────────────────────────────────────

const httpServer = http.createServer(app);

const io = new SocketServer(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  // Enable long-polling as a fallback for environments where WebSockets
  // are blocked (e.g. some corporate proxies)
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000,
});

// Attach all Socket.io event handlers
setupSocketHandlers(io);

// Attach the centralized Socket.io Gateway (notifications, stories, feed channels)
setupSocketGateway(io);
setSocketServer(io);

// ─────────────────────────────────────────────
// Story expiration scheduler
// Runs every hour to archive expired stories
// ─────────────────────────────────────────────

const STORY_CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

function scheduleStoryCleanup(): NodeJS.Timeout {
  return setInterval(async () => {
    try {
      const count = await expireStories();
      if (count > 0) {
        logger.info('Scheduled story cleanup completed', { expired: count });
      }
    } catch (err) {
      logger.error('Scheduled story cleanup failed', {
        error: (err as Error).message,
      });
    }
  }, STORY_CLEANUP_INTERVAL_MS);
}

// ─────────────────────────────────────────────
// Startup
// ─────────────────────────────────────────────

let storyCleanupTimer: NodeJS.Timeout | null = null;

async function start(): Promise<void> {
  try {
    logger.info('Starting HabeshaHub backend...', { env: env.NODE_ENV });

    // Connect to database
    await connectDatabase();
    logger.info('Database connected');

    // Start the HTTP server
    await new Promise<void>((resolve) => {
      httpServer.listen(env.PORT, () => resolve());
    });

    logger.info(`Server listening on port ${env.PORT}`, {
      port: env.PORT,
      env: env.NODE_ENV,
    });

    // Start background jobs
    storyCleanupTimer = scheduleStoryCleanup();
    logger.info('Background jobs scheduled');

    // Phase 3: Initialize event bus + handlers
    registerAllHandlers();
    logger.info('Event bus handlers registered');

    // Phase 3: Start event processor
    startProcessor();
    logger.info('Event processor started');

    // Phase 3: Initialize MeiliSearch indexes (non-blocking)
    initializeIndexes().catch((err: Error) =>
      logger.warn('MeiliSearch index init skipped', { error: err.message }),
    );

    // Phase 3: Start media processing worker
    mediaQueue.startWorker(async (job) => {
      if (job.type === 'transcode' && job.payload.videoId) {
        await processVideoUpload(
          job.payload.videoId as string,
          job.payload.inputKey as string,
        );
      }
    }, 2);
    logger.info('Media processing worker started');

    // Run initial story cleanup in case of a restart
    expireStories().catch((err: Error) =>
      logger.warn('Initial story cleanup error', { error: err.message }),
    );
  } catch (err) {
    logger.error('Failed to start server', { error: (err as Error).message });
    process.exit(1);
  }
}

// ─────────────────────────────────────────────
// Graceful shutdown
// ─────────────────────────────────────────────

async function shutdown(signal: string): Promise<void> {
  logger.info(`Received ${signal} — shutting down gracefully...`);

  if (storyCleanupTimer) {
    clearInterval(storyCleanupTimer);
  }

  // Stop Phase 3 systems
  stopProcessor();
  mediaQueue.stopWorker();

  // Stop accepting new connections
  httpServer.close(async () => {
    logger.info('HTTP server closed');

    try {
      await disconnectDatabase();
      logger.info('Database disconnected');

      await disconnectRedis();
      logger.info('Redis disconnected');

      logger.info('Shutdown complete');
      process.exit(0);
    } catch (err) {
      logger.error('Error during shutdown', { error: (err as Error).message });
      process.exit(1);
    }
  });

  // Force exit if graceful shutdown takes too long
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 15000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Catch uncaught exceptions to prevent silent crashes
process.on('uncaughtException', (err: Error) => {
  logger.error('Uncaught Exception', { error: err.message, stack: err.stack });
  shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason: unknown) => {
  logger.error('Unhandled Promise Rejection', { reason });
});

// ─────────────────────────────────────────────
// Bootstrap
// ─────────────────────────────────────────────

start();
