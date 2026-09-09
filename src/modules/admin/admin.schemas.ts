import { z } from 'zod';

export const createSeasonSchema = z.object({
  name: z.string().min(1).max(64),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime().optional(),
  rewardPoolOops: z.number().nonnegative(),
  maxOopsPerPlayer: z.number().nonnegative(),
});

export const updateSeasonSchema = z.object({
  name: z.string().min(1).max(64).optional(),
  endsAt: z.string().datetime().optional(),
  rewardPoolOops: z.number().nonnegative().optional(),
  maxOopsPerPlayer: z.number().nonnegative().optional(),
  status: z.enum(['upcoming', 'active', 'closed']).optional(),
});
