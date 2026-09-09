import { Router } from 'express';
import {
  registerHandler,
  loginHandler,
  refreshHandler,
  logoutHandler,
  guestHandler,
  upgradeHandler,
} from './auth.controller';
import { requireAuth } from '../../middleware/auth.middleware';
import { rateLimit } from '../../middleware/rateLimit.middleware';

const router = Router();

router.post('/register', rateLimit({ windowSeconds: 60, maxRequests: 10, keyPrefix: 'auth:register' }), registerHandler);
router.post('/login', rateLimit({ windowSeconds: 60, maxRequests: 10, keyPrefix: 'auth:login' }), loginHandler);
router.post('/guest', rateLimit({ windowSeconds: 60, maxRequests: 20, keyPrefix: 'auth:guest' }), guestHandler);
router.post('/refresh', refreshHandler);
router.post('/logout', requireAuth, logoutHandler);
router.post('/upgrade', requireAuth, upgradeHandler);

export default router;
