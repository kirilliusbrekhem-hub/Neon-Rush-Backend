import { Router } from 'express';
import { getCurrentHandler, getByIdHandler } from './seasons.controller';
import { getLeaderboardHandler } from '../leaderboard/leaderboard.controller';
import { getMyRewardEstimateHandler } from '../rewards/rewards.controller';
import { requireAuth } from '../../middleware/auth.middleware';

const router = Router();

// Public read endpoints. Admin write endpoints live under /api/admin/seasons.
router.get('/current', getCurrentHandler);
router.get('/:id', getByIdHandler);
router.get('/:id/leaderboard', getLeaderboardHandler);
router.get('/:id/reward-estimate', requireAuth, getMyRewardEstimateHandler);

export default router;
