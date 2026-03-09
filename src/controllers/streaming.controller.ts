import { Request, Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../types';
import * as streamingService from '../services/streaming.service';

export const streamingController = {
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: hostId } = (req as AuthenticatedRequest).user;
      const result = await streamingService.createStream(hostId, req.body);
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  async getActive(req: Request, res: Response, next: NextFunction) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const { items, total, totalPages } = await streamingService.getActiveStreams(page, limit);
      res.json({ success: true, data: items, meta: { total, page, limit, totalPages } });
    } catch (err) {
      next(err);
    }
  },

  async getUpcoming(req: Request, res: Response, next: NextFunction) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const { items, total, totalPages } = await streamingService.getUpcomingStreams(page, limit);
      res.json({ success: true, data: items, meta: { total, page, limit, totalPages } });
    } catch (err) {
      next(err);
    }
  },

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const result = await streamingService.getStreamById(id);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  async start(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: hostId } = (req as AuthenticatedRequest).user;
      const { id: streamId } = req.params;
      const result = await streamingService.startStream(streamId, hostId);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  async end(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: hostId } = (req as AuthenticatedRequest).user;
      const { id: streamId } = req.params;
      const result = await streamingService.endStream(streamId, hostId);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  async sendGift(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: senderId } = (req as AuthenticatedRequest).user;
      const { id: streamId } = req.params;
      const { giftType, amount, message } = req.body;
      const result = await streamingService.sendGift(streamId, senderId, giftType, amount, message);
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  async getGifts(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: streamId } = req.params;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const { items, total, totalPages } = await streamingService.getStreamGifts(streamId, page, limit);
      res.json({ success: true, data: items, meta: { total, page, limit, totalPages } });
    } catch (err) {
      next(err);
    }
  },

  async getUserStreams(req: Request, res: Response, next: NextFunction) {
    try {
      const { userId } = req.params;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const { items, total, totalPages } = await streamingService.getUserStreams(userId, page, limit);
      res.json({ success: true, data: items, meta: { total, page, limit, totalPages } });
    } catch (err) {
      next(err);
    }
  },

  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: hostId } = (req as AuthenticatedRequest).user;
      const { id: streamId } = req.params;
      const result = await streamingService.deleteStream(streamId, hostId);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },
};
