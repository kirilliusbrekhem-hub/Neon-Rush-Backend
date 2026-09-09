import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import authRoutes from './modules/auth/auth.routes';
import playersRoutes from './modules/players/players.routes';
import sessionsRoutes from './modules/sessions/sessions.routes';
import seasonsRoutes from './modules/seasons/seasons.routes';
import adminRoutes from './modules/admin/admin.routes';
import { errorHandler } from './middleware/errorHandler';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: '32kb' }));

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  app.use('/api/auth', authRoutes);
  app.use('/api/players', playersRoutes);
  app.use('/api/sessions', sessionsRoutes);
  app.use('/api/seasons', seasonsRoutes);
  app.use('/api/admin', adminRoutes);

  app.use(errorHandler);

  return app;
}
