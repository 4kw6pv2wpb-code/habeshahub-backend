/**
 * Media Job Queue
 * Redis-backed job queue for async media processing tasks.
 * Uses Redis lists for queuing and Redis hashes for job status tracking.
 * Supports configurable concurrency, retry with exponential backoff, and
 * a dead-letter list for persistently failing jobs.
 */

import { redis } from '../config/redis';
import { logger } from '../utils/logger';

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

const QUEUE_KEY = 'media_jobs';
const FAILED_KEY = 'media_jobs_failed';
const JOB_HASH_PREFIX = 'media_job:';
const MAX_RETRIES = 3;

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export type JobType = 'transcode' | 'thumbnail' | 'hls' | 'image_resize' | 'delete';

export interface MediaJob {
  jobId: string;
  type: JobType;
  payload: Record<string, unknown>;
  /** ISO timestamp when the job was created */
  createdAt: string;
  /** Number of attempts made so far */
  attempts: number;
}

export type JobStatus = 'pending' | 'processing' | 'done' | 'failed';

export interface JobStatusRecord {
  jobId: string;
  status: JobStatus;
  attempts: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

// ─────────────────────────────────────────────
// Handler Type
// ─────────────────────────────────────────────

type JobHandler = (job: MediaJob) => Promise<void>;

// ─────────────────────────────────────────────
// MediaQueue Class
// ─────────────────────────────────────────────

export class MediaQueue {
  private running = false;
  private activeWorkers = 0;
  private handler: JobHandler | null = null;

  // ── Enqueue ──────────────────────────────

  /**
   * Push a job onto the Redis queue and initialise its status hash.
   */
  async enqueue(job: Omit<MediaJob, 'createdAt' | 'attempts'>): Promise<string> {
    const fullJob: MediaJob = {
      ...job,
      createdAt: new Date().toISOString(),
      attempts: 0,
    };

    const statusRecord: JobStatusRecord = {
      jobId: fullJob.jobId,
      status: 'pending',
      attempts: 0,
      createdAt: fullJob.createdAt,
    };

    // Persist status hash
    await redis.hset(
      `${JOB_HASH_PREFIX}${fullJob.jobId}`,
      Object.entries(statusRecord).flatMap(([k, v]) => [k, String(v)]),
    );

    // Push serialised job to the queue list
    await redis.rpush(QUEUE_KEY, JSON.stringify(fullJob));

    logger.info('mediaQueue: enqueued job', {
      jobId: fullJob.jobId,
      type: fullJob.type,
    });

    return fullJob.jobId;
  }

  // ── Dequeue ──────────────────────────────

  /**
   * Pop the oldest job from the queue (non-blocking).
   * Returns null when the queue is empty.
   */
  async dequeue(): Promise<MediaJob | null> {
    const raw = await redis.lpop(QUEUE_KEY);
    if (!raw) return null;

    try {
      return JSON.parse(raw) as MediaJob;
    } catch (err) {
      logger.error('mediaQueue: failed to parse job payload', { raw, err });
      return null;
    }
  }

  // ── Status ────────────────────────────────

  /**
   * Return the current status record for a job.
   */
  async getJobStatus(jobId: string): Promise<JobStatusRecord | null> {
    const data = await redis.hgetall(`${JOB_HASH_PREFIX}${jobId}`);
    if (!data || Object.keys(data).length === 0) return null;

    return {
      jobId: data.jobId,
      status: data.status as JobStatus,
      attempts: parseInt(data.attempts ?? '0', 10),
      createdAt: data.createdAt,
      startedAt: data.startedAt,
      completedAt: data.completedAt,
      error: data.error,
    };
  }

  /**
   * Return the number of jobs currently waiting in the queue.
   */
  async getQueueLength(): Promise<number> {
    return redis.llen(QUEUE_KEY);
  }

  // ── Worker ────────────────────────────────

  /**
   * Register the function that processes jobs and start polling the queue.
   * @param handler  Async function that receives a MediaJob and resolves on success.
   * @param concurrency  Maximum number of jobs processed in parallel (default: 2).
   */
  startWorker(handler: JobHandler, concurrency = 2): void {
    if (this.running) {
      logger.warn('mediaQueue: worker is already running');
      return;
    }

    this.handler = handler;
    this.running = true;

    logger.info('mediaQueue: worker started', { concurrency });

    // Polling loop — runs until stopWorker() is called
    const poll = async () => {
      while (this.running) {
        if (this.activeWorkers >= concurrency) {
          // Back off briefly when at max concurrency
          await sleep(200);
          continue;
        }

        const job = await this.dequeue();
        if (!job) {
          // Empty queue — wait before polling again
          await sleep(500);
          continue;
        }

        // Process without awaiting so we can pick up the next job immediately
        this.processJob(job).catch((err) => {
          logger.error('mediaQueue: unhandled error in processJob', {
            jobId: job.jobId,
            err,
          });
        });
      }
    };

    poll().catch((err) => {
      logger.error('mediaQueue: polling loop crashed', { err });
      this.running = false;
    });
  }

  /**
   * Signal the worker to stop accepting new jobs.
   * In-flight jobs will complete before the loop exits.
   */
  stopWorker(): void {
    this.running = false;
    logger.info('mediaQueue: worker stop requested');
  }

  // ── Internal Job Execution ────────────────

  private async processJob(job: MediaJob): Promise<void> {
    if (!this.handler) return;

    this.activeWorkers++;

    const hashKey = `${JOB_HASH_PREFIX}${job.jobId}`;
    const startedAt = new Date().toISOString();

    await redis.hset(hashKey, [
      'status', 'processing',
      'startedAt', startedAt,
      'attempts', String(job.attempts + 1),
    ]);

    logger.info('mediaQueue: processing job', {
      jobId: job.jobId,
      type: job.type,
      attempt: job.attempts + 1,
    });

    try {
      await this.handler(job);

      await redis.hset(hashKey, [
        'status', 'done',
        'completedAt', new Date().toISOString(),
      ]);

      logger.info('mediaQueue: job completed', { jobId: job.jobId });
    } catch (err) {
      const newAttempts = job.attempts + 1;
      const errorMsg = err instanceof Error ? err.message : String(err);

      logger.warn('mediaQueue: job failed', {
        jobId: job.jobId,
        attempt: newAttempts,
        error: errorMsg,
      });

      if (newAttempts < MAX_RETRIES) {
        // Exponential backoff: 2^attempt * 1000 ms
        const delay = Math.pow(2, newAttempts) * 1000;
        logger.info('mediaQueue: scheduling retry', {
          jobId: job.jobId,
          delayMs: delay,
          attempt: newAttempts,
        });

        await sleep(delay);

        const retryJob: MediaJob = { ...job, attempts: newAttempts };
        await redis.rpush(QUEUE_KEY, JSON.stringify(retryJob));

        await redis.hset(hashKey, [
          'status', 'pending',
          'attempts', String(newAttempts),
          'error', errorMsg,
        ]);
      } else {
        // Move to dead-letter queue
        logger.error('mediaQueue: max retries exceeded, moving to failed queue', {
          jobId: job.jobId,
        });

        const failedRecord = {
          ...job,
          attempts: newAttempts,
          failedAt: new Date().toISOString(),
          lastError: errorMsg,
        };

        await redis.rpush(FAILED_KEY, JSON.stringify(failedRecord));

        await redis.hset(hashKey, [
          'status', 'failed',
          'completedAt', new Date().toISOString(),
          'error', errorMsg,
          'attempts', String(newAttempts),
        ]);
      }
    } finally {
      this.activeWorkers--;
    }
  }
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─────────────────────────────────────────────
// Singleton Export
// ─────────────────────────────────────────────

export const mediaQueue = new MediaQueue();
