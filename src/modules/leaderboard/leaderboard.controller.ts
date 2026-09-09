import { Request, Response } from 'express';
import * as leaderboardService from './leaderboard.service';
import { asyncHandler } from '../../middleware/errorHandler';

export const getLeaderboardHandler = asyncHandler(async (req: Request, res: Response) => {
  const limit = req.query.limit ? Math.min(parseInt(req.query.limit as string, 10), 500) : 100;
  const rows = await leaderboardService.getLeaderboard(req.params.id, limit);
  res.json({ seasonId: req.params.id, entries: rows });
});
