# HabeshaHub Backend Code Patterns

## Service pattern
```typescript
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();
const db = prisma as any; // For models not yet generated

export async function myFunction(args) {
  return db.video.findMany({ ... });
}
```

## Controller pattern
```typescript
import { Request, Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../types';
import * as myService from '../services/my.service';

export const myController = {
  async myMethod(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: userId } = (req as AuthenticatedRequest).user;
      const result = await myService.doSomething(userId, req.body);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },
};
```

## Route pattern
```typescript
import { Router } from 'express';
import { authenticate } from '../middlewares/auth';
import { myController } from '../controllers/my.controller';

const router = Router();
router.get('/', authenticate, myController.list);
export default router;
```

## Key rules
- Export `authenticate` from `../middlewares/auth` (NOT `requireAuth`)
- Export `{ logger }` from `../utils/logger` (named, NOT default)
- Export `{ redis }` from `../config/redis` (named, NOT default) — it's an ioredis instance
- Export `{ prisma }` from `../config/database` (named, NOT default)
- Export `{ env }` from `../config/env` (named, NOT default)
- Use `const db = prisma as any;` for Phase 2+ models
- Controllers: `export const xController = { async method(req, res, next) { try { ... } catch(err) { next(err) } } }`
- Route files: `export default router;`
- Auth user: `const { id: userId } = (req as AuthenticatedRequest).user;`
- For admin-only routes: `import { requireModerator, requireAdmin } from '../middlewares/auth';`
- All IDs are uuid strings
- Env vars are defined in src/config/env.ts using zod with defaults
- Redis is ioredis 5.x (not node-redis)
- MeiliSearch client: `import { MeiliSearch } from 'meilisearch';`
- Available in package.json already: meilisearch, ioredis, openai, uuid, zod, winston

## Existing env vars (in src/config/env.ts):
NODE_ENV, PORT, DATABASE_URL, REDIS_URL, JWT_SECRET, JWT_EXPIRES_IN, OPENAI_API_KEY, MEILISEARCH_HOST, MEILISEARCH_KEY, CORS_ORIGINS, RATE_LIMIT_POINTS, RATE_LIMIT_DURATION
