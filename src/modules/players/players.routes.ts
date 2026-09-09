import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware';
import { getMeHandler, updateMeHandler, getBalanceHandler } from './players.controller';

const router = Router();

router.get('/me', requireAuth, getMeHandler);
router.patch('/me', requireAuth, updateMeHandler);
router.get('/me/balance', requireAuth, getBalanceHandler);

export default router;
