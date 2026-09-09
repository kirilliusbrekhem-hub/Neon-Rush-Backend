import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware';
import { rateLimit } from '../../middleware/rateLimit.middleware';
import { requireIdempotencyKey } from '../../middleware/idempotency.middleware';
import { startHandler, endHandler, getHandler } from './sessions.controller';

const router = Router();

router.post('/start', requireAuth, rateLimit({ windowSeconds: 60, maxRequests: 20, keyPrefix: 'session:start' }), startHandler);
router.post(
  '/:id/end',
  requireAuth,
  rateLimit({ windowSeconds: 60, maxRequests: 20, keyPrefix: 'session:end' }),
  requireIdempotencyKey,
  endHandler,
);
router.get('/:id', requireAuth, getHandler);

export default router;
