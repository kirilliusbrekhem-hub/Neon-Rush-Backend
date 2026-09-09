import { Response } from 'express';
import { z } from 'zod';
import * as playersService from './players.service';
import { asyncHandler } from '../../middleware/errorHandler';
import { AuthedRequest } from '../../middleware/auth.middleware';

const updateSchema = z.object({
  displayName: z.string().min(1).max(64).optional(),
  avatarUrl: z.string().url().optional(),
});

export const getMeHandler = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const profile = await playersService.getProfile(req.user!.sub);
  res.json(profile);
});

export const updateMeHandler = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const input = updateSchema.parse(req.body);
  const profile = await playersService.updateProfile(req.user!.sub, input);
  res.json(profile);
});

export const getBalanceHandler = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const balance = await playersService.getBalance(req.user!.sub);
  res.json(balance);
});
