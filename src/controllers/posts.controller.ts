/**
 * Posts controller.
 * Handles /posts routes — feed, creation, likes, and comments.
 */

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as FeedService from '../services/feed.service';
import { moderateContent } from '../services/moderation.service';
import { AppError } from '../middlewares/errorHandler';
import { prisma } from '../config/database';
import { buildPaginationMeta, parsePagination } from '../utils/helpers';
import type { AuthenticatedRequest } from '../types';

// ─────────────────────────────────────────────
// Zod schemas
// ─────────────────────────────────────────────

export const createPostSchema = z.object({
  content: z.string().min(1, 'Content cannot be empty').max(5000),
  mediaUrl: z.string().url().optional(),
  mediaType: z.enum(['image', 'video']).optional(),
});

export const createCommentSchema = z.object({
  content: z.string().min(1).max(2000),
});

// ─────────────────────────────────────────────
// Handlers
// ─────────────────────────────────────────────

/**
 * GET /posts/feed
 * Returns a personalised, scored feed for the authenticated user.
 */
export async function getFeed(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id: userId } = (req as AuthenticatedRequest).user;
    const { page, limit } = parsePagination(req.query as { page?: number; limit?: number });

    const result = await FeedService.getPersonalisedFeed(userId, { page, limit });

    res.status(200).json({
      success: true,
      data: result.posts,
      meta: buildPaginationMeta(result.total, result.page, result.limit),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /posts
 * Create a new post with content moderation check.
 */
export async function createPost(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id: authorId } = (req as AuthenticatedRequest).user;
    const input = createPostSchema.parse(req.body);

    // Moderate content before creation
    const modResult = await moderateContent(input.content);
    if (!modResult.isSafe) {
      throw AppError.badRequest(
        'Your post contains content that violates our community guidelines',
        'CONTENT_FLAGGED',
      );
    }

    const post = await FeedService.createPost(authorId, input);

    res.status(201).json({
      success: true,
      data: post,
      message: 'Post created successfully',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /posts/:id/like
 * Toggle like on a post.
 */
export async function likePost(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id: userId } = (req as AuthenticatedRequest).user;
    const { id: postId } = req.params;

    // Ensure post exists
    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { id: true },
    });
    if (!post) {
      throw AppError.notFound('Post not found');
    }

    const result = await FeedService.togglePostLike(postId, userId);

    res.status(200).json({
      success: true,
      data: result,
      message: result.liked ? 'Post liked' : 'Post unliked',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /posts/:id
 * Get a single post by ID.
 */
export async function getPost(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id: postId } = req.params;

    const post = await prisma.post.findFirst({
      where: { id: postId, status: 'ACTIVE' },
      include: {
        author: {
          select: { id: true, name: true, avatarUrl: true, city: true },
        },
        comments: {
          where: { status: 'ACTIVE' },
          include: {
            author: { select: { id: true, name: true, avatarUrl: true } },
          },
          orderBy: { createdAt: 'asc' },
          take: 20,
        },
      },
    });

    if (!post) {
      throw AppError.notFound('Post not found');
    }

    res.status(200).json({
      success: true,
      data: post,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /posts/:id/comments
 * Add a comment to a post.
 */
export async function addComment(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id: authorId } = (req as AuthenticatedRequest).user;
    const { id: postId } = req.params;
    const { content } = createCommentSchema.parse(req.body);

    // Moderate comment
    const modResult = await moderateContent(content);
    if (!modResult.isSafe) {
      throw AppError.badRequest(
        'Your comment contains inappropriate content',
        'CONTENT_FLAGGED',
      );
    }

    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { id: true },
    });
    if (!post) {
      throw AppError.notFound('Post not found');
    }

    const [comment] = await prisma.$transaction([
      prisma.comment.create({
        data: { postId, authorId, content, moderationScore: modResult.score },
        include: {
          author: { select: { id: true, name: true, avatarUrl: true } },
        },
      }),
      prisma.post.update({
        where: { id: postId },
        data: { commentsCount: { increment: 1 } },
      }),
    ]);

    res.status(201).json({
      success: true,
      data: comment,
      message: 'Comment added',
    });
  } catch (err) {
    next(err);
  }
}
