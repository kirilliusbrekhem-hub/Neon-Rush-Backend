import { Response } from 'express';
import * as rewardsService from './rewards.service';
import { asyncHandler } from '../../middleware/errorHandler';
import { AuthedRequest } from '../../middleware/auth.middleware';

export const getMyRewardEstimateHandler = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const estimate = await rewardsService.getPlayerRewardEstimate(req.params.id, req.user!.sub);
  res.json(estimate);
});
