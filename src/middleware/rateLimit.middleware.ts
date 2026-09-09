import { Response, NextFunction } from 'express';
import { redis } from '../redis/client';
import { AuthedRequest } from './auth.middleware';
import { ApiError } from './errorHandler';

interface RateLimitOptions {
  windowSeconds: number;
  maxRequests: number;
  keyPrefix: string;
}

/**
 * Fixed-window rate limiter backed by Redis (INCR + EXPIRE).
 * Keyed by authenticated user id when available, otherwise by IP.
 */
export function rateLimit(opts: RateLimitOptions) {
  return async (req: AuthedRequest, res: Response, next: NextFunction) => {
    const identity = req.user?.sub ?? req.ip ?? 'anonymous';
    const key = `ratelimit:${opts.keyPrefix}:${identity}`;
    try {
      const count = await redis.incr(key);
      if (count === 1) {
        await redis.expire(key, opts.windowSeconds);
      }
      if (count > opts.maxRequests) {
        const ttl = await redis.ttl(key);
        res.setHeader('Retry-After', Math.max(ttl, 1).toString());
        return next(new ApiError(429, 'rate_limit_exceeded'));
      }
      next();
    } catch (err) {
      // Fail open on Redis errors so the game stays playable, but log loudly.
      // eslint-disable-next-line no-console
      console.error('rateLimit redis error', err);
      next();
    }
  };
}
