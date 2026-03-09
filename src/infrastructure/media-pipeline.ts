/**
 * Media Processing Pipeline
 * Handles video/image upload, transcoding, thumbnail generation, and HLS packaging.
 * Transcoding operations are simulated (logged) — wire up real ffmpeg/S3 in production.
 */

import { logger } from '../utils/logger';

// ─────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────

export interface MediaConfig {
  s3Bucket: string;
  s3Region: string;
  cdnBaseUrl: string;
  ffmpegPath: string;
  maxFileSize: number; // bytes
  allowedVideoFormats: string[];
  allowedImageFormats: string[];
}

const defaultConfig: MediaConfig = {
  s3Bucket: process.env.S3_BUCKET ?? 'habeshahub-media',
  s3Region: process.env.S3_REGION ?? 'us-east-1',
  cdnBaseUrl: process.env.CDN_BASE_URL ?? 'https://cdn.habeshahub.com',
  ffmpegPath: process.env.FFMPEG_PATH ?? '/usr/bin/ffmpeg',
  maxFileSize: parseInt(process.env.MAX_FILE_SIZE ?? '') || 500 * 1024 * 1024, // 500 MB
  allowedVideoFormats: ['mp4', 'mov', 'avi', 'webm', 'mkv'],
  allowedImageFormats: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
};

// ─────────────────────────────────────────────
// Result Types
// ─────────────────────────────────────────────

export interface UploadResult {
  /** S3 object key */
  key: string;
  /** Full CDN URL */
  url: string;
  /** File size in bytes */
  size: number;
  mimeType: string;
}

export interface TranscodeJob {
  videoId: string;
  inputKey: string;
  outputKey: string;
  /** Target vertical resolution, e.g. 720 */
  resolution: number;
  status: 'pending' | 'processing' | 'done' | 'failed';
}

export interface ThumbnailResult {
  url: string;
  width: number;
  height: number;
}

export interface ProcessingResult {
  videoId: string;
  hlsUrl: string;
  thumbnailUrl: string;
  /** Duration in seconds */
  duration: number;
  dimensions: { width: number; height: number };
  status: 'READY' | 'FAILED';
  transcodedKeys: string[];
}

export interface ImageProcessingResult {
  userId: string;
  thumbnail: string;
  medium: string;
  large: string;
}

// ─────────────────────────────────────────────
// URL Helpers
// ─────────────────────────────────────────────

/**
 * Construct a full CDN URL from an S3 object key.
 */
export function getMediaUrl(key: string, config: MediaConfig = defaultConfig): string {
  return `${config.cdnBaseUrl}/${key}`;
}

// ─────────────────────────────────────────────
// Pre-signed Upload URL
// ─────────────────────────────────────────────

/**
 * Generate a pre-signed S3 upload URL for direct client uploads.
 * Returns the upload URL, the target S3 key, and the resulting CDN URL.
 *
 * NOTE: In production replace with `@aws-sdk/s3-request-presigner`.
 */
export async function generateUploadUrl(
  userId: string,
  fileType: 'video' | 'image',
  extension: string,
  config: MediaConfig = defaultConfig,
): Promise<{ uploadUrl: string; key: string; cdnUrl: string }> {
  const timestamp = Date.now();
  const key = `uploads/${fileType}s/${userId}/${timestamp}.${extension.replace(/^\./, '')}`;
  const uploadUrl = `https://${config.s3Bucket}.s3.${config.s3Region}.amazonaws.com/${key}?X-Amz-Signature=MOCK`;
  const cdnUrl = getMediaUrl(key, config);

  logger.info('generateUploadUrl: generated pre-signed URL', {
    userId,
    fileType,
    extension,
    key,
  });

  return { uploadUrl, key, cdnUrl };
}

// ─────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────

function validateFile(
  key: string,
  fileType: 'video' | 'image',
  config: MediaConfig,
): { valid: boolean; reason?: string } {
  const ext = key.split('.').pop()?.toLowerCase() ?? '';
  const allowed =
    fileType === 'video' ? config.allowedVideoFormats : config.allowedImageFormats;

  if (!allowed.includes(ext)) {
    return {
      valid: false,
      reason: `Extension ".${ext}" not in allowed list: ${allowed.join(', ')}`,
    };
  }
  return { valid: true };
}

// ─────────────────────────────────────────────
// FFmpeg Simulation Helpers
// ─────────────────────────────────────────────

/**
 * Transcode a single video to the target resolution.
 * Logs the ffmpeg command that would be executed in production.
 */
export async function transcodeVideo(
  job: TranscodeJob,
  config: MediaConfig = defaultConfig,
): Promise<TranscodeJob> {
  const inputPath = `s3://${config.s3Bucket}/${job.inputKey}`;
  const outputPath = `s3://${config.s3Bucket}/${job.outputKey}`;

  const command =
    `${config.ffmpegPath} -i "${inputPath}" ` +
    `-vf scale=-2:${job.resolution} ` +
    `-c:v libx264 -preset fast -crf 23 ` +
    `-c:a aac ` +
    `"${outputPath}.mp4"`;

  logger.info('transcodeVideo: simulating ffmpeg transcode', {
    videoId: job.videoId,
    resolution: job.resolution,
    command,
  });

  // Simulate async transcoding delay
  await new Promise((resolve) => setTimeout(resolve, 0));

  return { ...job, status: 'done' };
}

/**
 * Generate a thumbnail image at the specified timestamp.
 * Logs the ffmpeg command that would be executed.
 */
export async function generateThumbnail(
  inputKey: string,
  timestamp: number = 1,
  config: MediaConfig = defaultConfig,
): Promise<ThumbnailResult> {
  const thumbKey = `thumbnails/${inputKey.replace(/\.[^.]+$/, '')}_thumb.jpg`;
  const inputPath = `s3://${config.s3Bucket}/${inputKey}`;
  const outputPath = `s3://${config.s3Bucket}/${thumbKey}`;

  const command =
    `${config.ffmpegPath} -ss ${timestamp} -i "${inputPath}" ` +
    `-vframes 1 -vf scale=1280:720 "${outputPath}"`;

  logger.info('generateThumbnail: simulating ffmpeg thumbnail extraction', {
    inputKey,
    timestamp,
    command,
  });

  await new Promise((resolve) => setTimeout(resolve, 0));

  return {
    url: getMediaUrl(thumbKey, config),
    width: 1280,
    height: 720,
  };
}

/**
 * Generate HLS playlist and segments from a source video.
 * Logs the ffmpeg command that would be executed.
 */
export async function generateHLSPlaylist(
  inputKey: string,
  outputPrefix: string,
  config: MediaConfig = defaultConfig,
): Promise<string> {
  const inputPath = `s3://${config.s3Bucket}/${inputKey}`;
  const outputPath = `s3://${config.s3Bucket}/${outputPrefix}/playlist.m3u8`;

  const command =
    `${config.ffmpegPath} -i "${inputPath}" ` +
    `-profile:v baseline -level 3.0 ` +
    `-start_number 0 -hls_time 10 -hls_list_size 0 ` +
    `-f hls "${outputPath}"`;

  logger.info('generateHLSPlaylist: simulating HLS segmentation', {
    inputKey,
    outputPrefix,
    command,
  });

  await new Promise((resolve) => setTimeout(resolve, 0));

  return getMediaUrl(`${outputPrefix}/playlist.m3u8`, config);
}

// ─────────────────────────────────────────────
// Full Video Processing Pipeline
// ─────────────────────────────────────────────

/**
 * Orchestrates the complete video processing pipeline:
 *  1. Validate file format
 *  2. Queue and run transcode jobs for 360p, 720p, 1080p
 *  3. Generate thumbnail at 1s mark
 *  4. Generate HLS playlist
 *  5. Return ProcessingResult with metadata (caller should persist to DB)
 */
export async function processVideoUpload(
  videoId: string,
  inputKey: string,
  config: MediaConfig = defaultConfig,
): Promise<ProcessingResult> {
  logger.info('processVideoUpload: starting pipeline', { videoId, inputKey });

  // Step 1 — Validate
  const validation = validateFile(inputKey, 'video', config);
  if (!validation.valid) {
    logger.error('processVideoUpload: validation failed', {
      videoId,
      reason: validation.reason,
    });
    return {
      videoId,
      hlsUrl: '',
      thumbnailUrl: '',
      duration: 0,
      dimensions: { width: 0, height: 0 },
      status: 'FAILED',
      transcodedKeys: [],
    };
  }

  // Step 2 — Transcode to multiple resolutions
  const resolutions = [360, 720, 1080];
  const transcodeJobs: TranscodeJob[] = resolutions.map((resolution) => ({
    videoId,
    inputKey,
    outputKey: `transcoded/${videoId}/${resolution}p`,
    resolution,
    status: 'pending' as const,
  }));

  logger.info('processVideoUpload: queuing transcode jobs', {
    videoId,
    resolutions,
  });

  const completedJobs = await Promise.all(
    transcodeJobs.map((job) => transcodeVideo(job, config)),
  );
  const transcodedKeys = completedJobs.map((j) => j.outputKey);

  // Step 3 — Generate thumbnail
  const thumbnail = await generateThumbnail(inputKey, 1, config);

  // Step 4 — Generate HLS playlist
  const hlsPrefix = `hls/${videoId}`;
  const hlsUrl = await generateHLSPlaylist(inputKey, hlsPrefix, config);

  // Step 5 — Build result (caller persists to Video record)
  const result: ProcessingResult = {
    videoId,
    hlsUrl,
    thumbnailUrl: thumbnail.url,
    duration: 0,       // Would be extracted by ffprobe in production
    dimensions: { width: 1920, height: 1080 }, // Would be extracted by ffprobe
    status: 'READY',
    transcodedKeys,
  };

  logger.info('processVideoUpload: pipeline complete', {
    videoId,
    hlsUrl,
    thumbnailUrl: thumbnail.url,
    status: result.status,
  });

  return result;
}

// ─────────────────────────────────────────────
// Image Processing
// ─────────────────────────────────────────────

/**
 * Process an uploaded image by resizing to three standard sizes:
 *  - thumbnail: 150px wide
 *  - medium: 600px wide
 *  - large: 1200px wide
 */
export async function processImageUpload(
  userId: string,
  inputKey: string,
  config: MediaConfig = defaultConfig,
): Promise<ImageProcessingResult> {
  logger.info('processImageUpload: resizing image', { userId, inputKey });

  const validation = validateFile(inputKey, 'image', config);
  if (!validation.valid) {
    logger.error('processImageUpload: validation failed', {
      userId,
      reason: validation.reason,
    });
    throw new Error(`Invalid image file: ${validation.reason}`);
  }

  const base = inputKey.replace(/\.[^.]+$/, '');
  const ext = inputKey.split('.').pop() ?? 'jpg';

  const sizes: Array<{ name: keyof ImageProcessingResult; width: number }> = [
    { name: 'thumbnail', width: 150 },
    { name: 'medium', width: 600 },
    { name: 'large', width: 1200 },
  ];

  const urls: Partial<ImageProcessingResult> = { userId };

  for (const { name, width } of sizes) {
    const outputKey = `images/${userId}/${base}_${name}.${ext}`;
    const inputPath = `s3://${config.s3Bucket}/${inputKey}`;
    const outputPath = `s3://${config.s3Bucket}/${outputKey}`;

    const command =
      `${config.ffmpegPath} -i "${inputPath}" ` +
      `-vf scale=${width}:-1 "${outputPath}"`;

    logger.info(`processImageUpload: resizing to ${name}`, { width, command });

    await new Promise((resolve) => setTimeout(resolve, 0));

    (urls as Record<string, string>)[name] = getMediaUrl(outputKey, config);
  }

  return urls as ImageProcessingResult;
}

// ─────────────────────────────────────────────
// Storage Management
// ─────────────────────────────────────────────

/**
 * Delete a media object from storage by its S3 key.
 * Logs the operation; wire up real AWS SDK in production.
 */
export async function deleteMedia(
  key: string,
  config: MediaConfig = defaultConfig,
): Promise<void> {
  logger.info('deleteMedia: deleting object from storage', {
    bucket: config.s3Bucket,
    key,
  });
  // In production: await s3Client.send(new DeleteObjectCommand({ Bucket, Key }));
  await new Promise((resolve) => setTimeout(resolve, 0));
}
