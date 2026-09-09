import { Response, NextFunction } from 'express';
import { AuthedRequest } from './auth.middleware';
import { ApiError } from './errorHandler';

export function requireAdmin(req: AuthedRequest, _res: Response, next: NextFunction) {
  if (!req.user) return next(new ApiError(401, 'missing_authorization_header'));
  if (req.user.role !== 'admin') return next(new ApiError(403, 'admin_only'));
  next();
}
