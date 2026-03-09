import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();
const db = prisma as any; // For Phase 2 models not yet generated

export async function uploadVideo(
  authorId: string,
  data: {
    title: string;
    description?: string;
    originalUrl: string;
    hlsUrl?: string;
    thumbnailUrl?: string;
    duration?: number;
    width?: number;
    height?: number;
    fileSize?: number;
    mimeType?: string;
    hashtags?: string[];
    language?: string;
  }
) {
  logger.info(`Creating video record for author ${authorId}`);
  const video = await db.video.create({
    data: {
      authorId,
      title: data.title,
      description: data.description,
      originalUrl: data.originalUrl,
      hlsUrl: data.hlsUrl,
      thumbnailUrl: data.thumbnailUrl,
      duration: data.duration,
      width: data.width,
      height: data.height,
      fileSize: data.fileSize,
      mimeType: data.mimeType,
      hashtags: data.hashtags ?? [],
      language: data.language,
      status: 'PROCESSING',
      contentStatus: 'ACTIVE',
    },
  });
  return video;
}

export async function getVideoFeed(
  page: number,
  limit: number,
  hashtag?: string,
  language?: string
) {
  const skip = (page - 1) * limit;

  const where: any = { contentStatus: 'ACTIVE', status: 'READY' };
  if (hashtag) {
    where.hashtags = { has: hashtag };
  }
  if (language) {
    where.language = language;
  }

  const [items, total] = await Promise.all([
    db.video.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        author: {
          select: { id: true, name: true, avatarUrl: true },
        },
      },
    }),
    db.video.count({ where }),
  ]);

  return {
    items,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getVideoById(id: string) {
  const video = await db.video.findUnique({
    where: { id },
    include: {
      author: {
        select: { id: true, name: true, avatarUrl: true },
      },
      videoComments: {
        where: { status: 'ACTIVE' },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: {
          author: {
            select: { id: true, name: true, avatarUrl: true },
          },
        },
      },
    },
  });
  return video;
}

export async function getUserVideos(userId: string, page: number, limit: number) {
  const skip = (page - 1) * limit;

  const where = { authorId: userId, contentStatus: 'ACTIVE' };

  const [items, total] = await Promise.all([
    db.video.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        author: {
          select: { id: true, name: true, avatarUrl: true },
        },
      },
    }),
    db.video.count({ where }),
  ]);

  return {
    items,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function likeVideo(videoId: string, userId: string) {
  const existing = await db.videoLike.findUnique({
    where: { videoId_userId: { videoId, userId } },
  });

  if (existing) {
    await db.videoLike.delete({
      where: { videoId_userId: { videoId, userId } },
    });
    await db.video.update({
      where: { id: videoId },
      data: { likesCount: { decrement: 1 } },
    });
    return { liked: false };
  }

  await db.videoLike.create({ data: { videoId, userId } });
  await db.video.update({
    where: { id: videoId },
    data: { likesCount: { increment: 1 } },
  });
  return { liked: true };
}

export async function commentOnVideo(videoId: string, authorId: string, content: string) {
  const comment = await db.videoComment.create({
    data: {
      videoId,
      authorId,
      content,
      status: 'ACTIVE',
    },
    include: {
      author: {
        select: { id: true, name: true, avatarUrl: true },
      },
    },
  });

  await db.video.update({
    where: { id: videoId },
    data: { commentsCount: { increment: 1 } },
  });

  return comment;
}

export async function getVideoComments(videoId: string, page: number, limit: number) {
  const skip = (page - 1) * limit;

  const where = { videoId, status: 'ACTIVE' };

  const [items, total] = await Promise.all([
    db.videoComment.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        author: {
          select: { id: true, name: true, avatarUrl: true },
        },
      },
    }),
    db.videoComment.count({ where }),
  ]);

  return {
    items,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function deleteVideo(videoId: string, authorId: string) {
  logger.info(`Soft-deleting video ${videoId} by author ${authorId}`);
  const video = await db.video.updateMany({
    where: { id: videoId, authorId },
    data: { contentStatus: 'REMOVED' },
  });
  return video;
}

export async function incrementViewCount(videoId: string, watchTime?: number) {
  const video = await db.video.update({
    where: { id: videoId },
    data: {
      viewCount: { increment: 1 },
      watchTimeTotal: { increment: watchTime ?? 0 },
    },
  });
  return video;
}

export async function getTrendingVideos(page: number, limit: number) {
  const skip = (page - 1) * limit;

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const where = {
    contentStatus: 'ACTIVE',
    status: 'READY',
    createdAt: { gte: sevenDaysAgo },
  };

  const [items, total] = await Promise.all([
    db.video.findMany({
      where,
      skip,
      take: limit,
      orderBy: { viewCount: 'desc' },
      include: {
        author: {
          select: { id: true, name: true, avatarUrl: true },
        },
      },
    }),
    db.video.count({ where }),
  ]);

  return {
    items,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function searchByHashtag(hashtag: string, page: number, limit: number) {
  const skip = (page - 1) * limit;

  const where = {
    contentStatus: 'ACTIVE',
    status: 'READY',
    hashtags: { has: hashtag },
  };

  const [items, total] = await Promise.all([
    db.video.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        author: {
          select: { id: true, name: true, avatarUrl: true },
        },
      },
    }),
    db.video.count({ where }),
  ]);

  return {
    items,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function updateVideoStatus(videoId: string, status: string) {
  logger.info(`Updating video ${videoId} status to ${status}`);
  const video = await db.video.update({
    where: { id: videoId },
    data: { status },
  });
  return video;
}
