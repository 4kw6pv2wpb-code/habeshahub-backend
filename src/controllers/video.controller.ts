import { Request, Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../types';
import * as videoService from '../services/video.service';

export const videoController = {
  async upload(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: authorId } = (req as AuthenticatedRequest).user;
      const result = await videoService.uploadVideo(authorId, req.body);
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  async getVideoFeed(req: Request, res: Response, next: NextFunction) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const hashtag = req.query.hashtag as string | undefined;
      const language = req.query.language as string | undefined;
      const result = await videoService.getVideoFeed(page, limit, hashtag, language);
      res.json({ success: true, data: result.items, meta: result.meta });
    } catch (err) {
      next(err);
    }
  },

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const result = await videoService.getVideoById(id);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  async getUserVideos(req: Request, res: Response, next: NextFunction) {
    try {
      const { userId } = req.params;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const result = await videoService.getUserVideos(userId, page, limit);
      res.json({ success: true, data: result.items, meta: result.meta });
    } catch (err) {
      next(err);
    }
  },

  async likeVideo(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: userId } = (req as AuthenticatedRequest).user;
      const { id: videoId } = req.params;
      const result = await videoService.likeVideo(videoId, userId);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  async comment(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: authorId } = (req as AuthenticatedRequest).user;
      const { id: videoId } = req.params;
      const { content } = req.body;
      const result = await videoService.commentOnVideo(videoId, authorId, content);
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  async getComments(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: videoId } = req.params;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const result = await videoService.getVideoComments(videoId, page, limit);
      res.json({ success: true, data: result.items, meta: result.meta });
    } catch (err) {
      next(err);
    }
  },

  async deleteVideo(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: authorId } = (req as AuthenticatedRequest).user;
      const { id: videoId } = req.params;
      const result = await videoService.deleteVideo(videoId, authorId);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  async incrementView(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: videoId } = req.params;
      const { watchTime } = req.body;
      const result = await videoService.incrementViewCount(videoId, watchTime);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  async getTrending(req: Request, res: Response, next: NextFunction) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const result = await videoService.getTrendingVideos(page, limit);
      res.json({ success: true, data: result.items, meta: result.meta });
    } catch (err) {
      next(err);
    }
  },

  async searchByHashtag(req: Request, res: Response, next: NextFunction) {
    try {
      const hashtag = req.query.hashtag as string;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const result = await videoService.searchByHashtag(hashtag, page, limit);
      res.json({ success: true, data: result.items, meta: result.meta });
    } catch (err) {
      next(err);
    }
  },

  async updateStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: videoId } = req.params;
      const { status } = req.body;
      const result = await videoService.updateVideoStatus(videoId, status);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },
};
