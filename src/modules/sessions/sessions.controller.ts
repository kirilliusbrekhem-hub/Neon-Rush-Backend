import { Response } from 'express';
import { z } from 'zod';
import * as sessionsService from './sessions.service';
import { asyncHandler } from '../../middleware/errorHandler';
import { AuthedRequest } from '../../middleware/auth.middleware';

const endSessionSchema = z.object({
  event_id: z.string().min(8).optional(), // may also arrive via Idempotency-Key header
  score: z.number().nonnegative(),
  clientMeta: z.record(z.unknown()).optional(),
});

export const startHandler = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const session = await sessionsService.startSession(req.user!.sub);
  res.status(201).json(session);
});

export const endHandler = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const input = endSessionSchema.parse(req.body);
  const eventId = (req.headers['idempotency-key'] as string) || input.event_id!;
  const outcome = await sessionsService.endSession({
    userId: req.user!.sub,
    sessionId: req.params.id,
    eventId,
    clientReportedScore: input.score,
    clientMeta: input.clientMeta,
  });
  res.status(outcome.duplicate ? 200 : 201).json(outcome.result);
});

export const getHandler = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const session = await sessionsService.getSession(req.user!.sub, req.params.id);
  res.json(session);
});
