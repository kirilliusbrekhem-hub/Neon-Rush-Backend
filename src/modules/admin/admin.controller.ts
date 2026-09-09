import { Request, Response } from 'express';
import * as adminService from './admin.service';
import * as seasonsService from '../seasons/seasons.service';
import * as rewardsService from '../rewards/rewards.service';
import * as leaderboardService from '../leaderboard/leaderboard.service';
import { asyncHandler } from '../../middleware/errorHandler';
import {
  createSeasonSchema,
  updateSeasonSchema,
} from './admin.schemas';

export const listPlayersHandler = asyncHandler(async (req: Request, res: Response) => {
  const limit = req.query.limit ? Math.min(parseInt(req.query.limit as string, 10), 200) : 50;
  const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;
  res.json(await adminService.listPlayers(limit, offset));
});

export const getPlayerHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json(await adminService.getPlayer(req.params.id));
});

export const getStatsHandler = asyncHandler(async (_req: Request, res: Response) => {
  res.json(await adminService.getGlobalStats());
});

export const listSeasonsHandler = asyncHandler(async (_req: Request, res: Response) => {
  res.json(await seasonsService.listSeasons());
});

export const createSeasonHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = createSeasonSchema.parse(req.body);
  res.status(201).json(await seasonsService.createSeason(input));
});

export const updateSeasonHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = updateSeasonSchema.parse(req.body);
  res.json(await seasonsService.updateSeason(req.params.id, input));
});

export const activateSeasonHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json(await seasonsService.activateSeason(req.params.id));
});

export const closeSeasonHandler = asyncHandler(async (req: Request, res: Response) => {
  const season = await seasonsService.closeSeason(req.params.id);
  const recompute = await rewardsService.recomputeSeasonRewards(req.params.id);
  res.json({ season, recompute });
});

export const recomputeRewardsHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json(await rewardsService.recomputeSeasonRewards(req.params.id));
});

export const adminSeasonLeaderboardHandler = asyncHandler(async (req: Request, res: Response) => {
  const limit = req.query.limit ? Math.min(parseInt(req.query.limit as string, 10), 1000) : 100;
  res.json(await leaderboardService.getLeaderboard(req.params.id, limit));
});

export const syncLeaderboardHandler = asyncHandler(async (req: Request, res: Response) => {
  const count = await leaderboardService.syncLeaderboardToFirestore(req.params.id);
  res.json({ seasonId: req.params.id, syncedEntries: count });
});
