import { Response, NextFunction } from 'express';
import { redis } from '../redis/client';
import { AuthedRequest } from './auth.middleware';
import { ApiError } from './errorHandler';

const LOCK_TTL_SECONDS = 60 * 10; // 10 minutes is enough to cover client retries

/**
 * Requires an `Idempotency-Key` (or `event_id` in body) header/field on
 * game-event submissions. Uses Redis SETNX as a fast first line of defense.
 * A DB-level UNIQUE constraint on game_results.event_id is the durable backstop
 * in case Redis is flushed/unavailable at the exact wrong moment.
 */
export function requireIdempotencyKey(req: AuthedRequest, _res: Response, next: NextFunction) {
  const key = (req.headers['idempotency-key'] as string) || req.body?.event_id;
  if (!key || typeof key !== 'string' || key.length < 8) {
    return next(new ApiError(400, 'missing_idempotency_key'));
  }
  (req as any).idempotencyKey = key;
  next();
}

/**
 * Returns true if this is the first time we've seen this key (caller should proceed),
 * false if it's a duplicate (caller should short-circuit with the cached/prior result).
 */
export async function claimIdempotencyKey(key: string): Promise<boolean> {
  const result = await redis.set(`idem:${key}`, '1', 'EX', LOCK_TTL_SECONDS, 'NX');
  return result === 'OK';
}

export async function releaseIdempotencyKey(key: string): Promise<void> {
  await redis.del(`idem:${key}`);
}
