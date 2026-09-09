import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireAdmin } from '../../middleware/admin.middleware';
import {
  listPlayersHandler,
  getPlayerHandler,
  getStatsHandler,
  listSeasonsHandler,
  createSeasonHandler,
  updateSeasonHandler,
  activateSeasonHandler,
  closeSeasonHandler,
  recomputeRewardsHandler,
  adminSeasonLeaderboardHandler,
  syncLeaderboardHandler,
} from './admin.controller';

const router = Router();
router.use(requireAuth, requireAdmin);

router.get('/players', listPlayersHandler);
router.get('/players/:id', getPlayerHandler);
router.get('/stats', getStatsHandler);

router.get('/seasons', listSeasonsHandler);
router.post('/seasons', createSeasonHandler);
router.patch('/seasons/:id', updateSeasonHandler);
router.post('/seasons/:id/activate', activateSeasonHandler);
router.post('/seasons/:id/close', closeSeasonHandler);
router.post('/seasons/:id/recompute-rewards', recomputeRewardsHandler);
router.get('/seasons/:id/leaderboard', adminSeasonLeaderboardHandler);
router.post('/seasons/:id/sync-leaderboard', syncLeaderboardHandler);

export default router;
