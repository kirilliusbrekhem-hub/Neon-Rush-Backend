import { Request, Response } from 'express';
import { z } from 'zod';
import * as seasonsService from './seasons.service';
import { asyncHandler } from '../../middleware/errorHandler';

const createSchema = z.object({
  name: z.string().min(1).max(64),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime().optional(),
  rewardPoolOops: z.number().nonnegative(),
  maxOopsPerPlayer: z.number().nonnegative(),
});

const updateSchema = z.object({
  name: z.string().min(1).max(64).optional(),
  endsAt: z.string().datetime().optional(),
  rewardPoolOops: z.number().nonnegative().optional(),
  maxOopsPerPlayer: z.number().nonnegative().optional(),
  status: z.enum(['upcoming', 'active', 'closed']).optional(),
});

export const getCurrentHandler = asyncHandler(async (_req: Request, res: Response) => {
  const season = await seasonsService.getCurrentSeason();
  res.json(season);
});

export const getByIdHandler = asyncHandler(async (req: Request, res: Response) => {
  const season = await seasonsService.getSeasonById(req.params.id);
  res.json(season);
});

export const listHandler = asyncHandler(async (_req: Request, res: Response) => {
  const seasons = await seasonsService.listSeasons();
  res.json(seasons);
});

export const createHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = createSchema.parse(req.body);
  const season = await seasonsService.createSeason(input);
  res.status(201).json(season);
});

export const updateHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = updateSchema.parse(req.body);
  const season = await seasonsService.updateSeason(req.params.id, input);
  res.json(season);
});

export const activateHandler = asyncHandler(async (req: Request, res: Response) => {
  const season = await seasonsService.activateSeason(req.params.id);
  res.json(season);
});

export const closeHandler = asyncHandler(async (req: Request, res: Response) => {
  const season = await seasonsService.closeSeason(req.params.id);
  res.json(season);
});
