import { Request, Response } from 'express';
import { z } from 'zod';
import * as authService from './auth.service';
import { asyncHandler } from '../../middleware/errorHandler';
import { AuthedRequest } from '../../middleware/auth.middleware';

const registerSchema = z.object({
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_]+$/),
  email: z.string().email(),
  password: z.string().min(8).max(128),
  displayName: z.string().min(1).max(64).optional(),
});

const loginSchema = z.object({
  usernameOrEmail: z.string().min(3),
  password: z.string().min(1),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

const upgradeSchema = z.object({
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_]+$/).optional(),
  email: z.string().email(),
  password: z.string().min(8).max(128),
});

export const registerHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = registerSchema.parse(req.body);
  const result = await authService.register(input);
  res.status(201).json(result);
});

export const loginHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = loginSchema.parse(req.body);
  const result = await authService.login(input.usernameOrEmail, input.password);
  res.status(200).json(result);
});

export const refreshHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = refreshSchema.parse(req.body);
  const result = await authService.refresh(input.refreshToken);
  res.status(200).json(result);
});

export const logoutHandler = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const input = refreshSchema.parse(req.body);
  await authService.logout(req.user!.sub, input.refreshToken);
  res.status(204).send();
});

export const guestHandler = asyncHandler(async (_req: Request, res: Response) => {
  const result = await authService.createGuest();
  res.status(201).json(result);
});

export const upgradeHandler = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const input = upgradeSchema.parse(req.body);
  const result = await authService.upgradeGuest(req.user!.sub, input);
  res.status(200).json(result);
});
