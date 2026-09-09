import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export interface AccessTokenPayload {
  sub: string; // user id
  role: 'player' | 'admin';
  username: string;
  isGuest: boolean;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.jwtAccessSecret, { expiresIn: env.jwtAccessTtl as any });
}

export function signRefreshToken(userId: string, tokenId: string): string {
  return jwt.sign({ sub: userId, tid: tokenId }, env.jwtRefreshSecret, { expiresIn: env.jwtRefreshTtl as any });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.jwtAccessSecret) as AccessTokenPayload;
}

export function verifyRefreshToken(token: string): { sub: string; tid: string } {
  return jwt.verify(token, env.jwtRefreshSecret) as { sub: string; tid: string };
}
