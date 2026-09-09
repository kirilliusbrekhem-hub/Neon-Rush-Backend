import request from 'supertest';
import { createApp } from '../../src/app';
import { pool } from '../../src/db/pool';
import { truncateAll, closeAll } from './setup';

const app = createApp();

async function registerAndLogin(username: string) {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ username, email: `${username}@example.com`, password: 'SuperSecret123' });
  expect(res.status).toBe(201);
  return res.body as { user: { id: string }; accessToken: string; refreshToken: string };
}

async function makeAdmin(userId: string) {
  await pool.query("UPDATE users SET role = 'admin' WHERE id = $1", [userId]);
}

beforeAll(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeAll();
});

describe('auth + player profile', () => {
  it('registers, logs in, reads profile and balance', async () => {
    const { user, accessToken } = await registerAndLogin('neo_player');

    const login = await request(app)
      .post('/api/auth/login')
      .send({ usernameOrEmail: 'neo_player', password: 'SuperSecret123' });
    expect(login.status).toBe(200);

    const me = await request(app).get('/api/players/me').set('Authorization', `Bearer ${accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.username).toBe('neo_player');
    expect(Number(me.body.rush_balance)).toBe(0);

    const balance = await request(app).get('/api/players/me/balance').set('Authorization', `Bearer ${accessToken}`);
    expect(balance.status).toBe(200);
    expect(balance.body.rushBalance).toBe(0);

    expect(user.id).toBeDefined();
  });

  it('rejects duplicate username/email registration', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'neo_player', email: 'someone_else@example.com', password: 'SuperSecret123' });
    expect(res.status).toBe(409);
  });

  it('rejects invalid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ usernameOrEmail: 'neo_player', password: 'wrong_password' });
    expect(res.status).toBe(401);
  });

  it('rejects requests without a valid token', async () => {
    const res = await request(app).get('/api/players/me');
    expect(res.status).toBe(401);
  });
});

describe('seasons + game sessions + server-side rush accrual', () => {
  let adminToken: string;
  let seasonId: string;
  let playerToken: string;
  let playerId: string;

  beforeAll(async () => {
    const admin = await registerAndLogin('season_admin');
    await makeAdmin(admin.user.id);
    const adminLogin = await request(app)
      .post('/api/auth/login')
      .send({ usernameOrEmail: 'season_admin', password: 'SuperSecret123' });
    adminToken = adminLogin.body.accessToken;

    const player = await registerAndLogin('grinder_one');
    playerToken = player.accessToken;
    playerId = player.user.id;
  });

  it('rejects starting a session with no active season', async () => {
    const res = await request(app).post('/api/sessions/start').set('Authorization', `Bearer ${playerToken}`);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('no_active_season');
  });

  it('admin creates and activates a season', async () => {
    const create = await request(app)
      .post('/api/admin/seasons')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Season 1',
        startsAt: new Date().toISOString(),
        rewardPoolOops: 10000,
        maxOopsPerPlayer: 5000,
      });
    expect(create.status).toBe(201);
    seasonId = create.body.id;

    const activate = await request(app)
      .post(`/api/admin/seasons/${seasonId}/activate`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(activate.status).toBe(200);
    expect(activate.body.status).toBe('active');

    const current = await request(app).get('/api/seasons/current');
    expect(current.status).toBe(200);
    expect(current.body.id).toBe(seasonId);
  });

  it('non-admin cannot access admin endpoints', async () => {
    const res = await request(app).get('/api/admin/players').set('Authorization', `Bearer ${playerToken}`);
    expect(res.status).toBe(403);
  });

  it('plays a full session and receives server-computed RUSH', async () => {
    const start = await request(app).post('/api/sessions/start').set('Authorization', `Bearer ${playerToken}`);
    expect(start.status).toBe(201);
    const sessionId = start.body.id;

    // Backdate started_at so the session clears the MIN_SESSION_SECONDS check
    await pool.query("UPDATE game_sessions SET started_at = now() - interval '30 seconds' WHERE id = $1", [
      sessionId,
    ]);

    const end = await request(app)
      .post(`/api/sessions/${sessionId}/end`)
      .set('Authorization', `Bearer ${playerToken}`)
      .set('Idempotency-Key', `evt-${sessionId}-1`)
      .send({ score: 100 });

    expect(end.status).toBe(201);
    expect(end.body.validated).toBe(true);
    expect(end.body.rush_awarded).toBe(10); // 100 score * 0.1 rate

    const balance = await request(app).get('/api/players/me/balance').set('Authorization', `Bearer ${playerToken}`);
    expect(balance.body.rushBalance).toBe(10);
  });

  it('rejects a client-submitted rush value by recomputing server-side (anti-cheat clamp)', async () => {
    const start = await request(app).post('/api/sessions/start').set('Authorization', `Bearer ${playerToken}`);
    const sessionId = start.body.id;
    await pool.query("UPDATE game_sessions SET started_at = now() - interval '10 seconds' WHERE id = $1", [
      sessionId,
    ]);

    // Client claims an impossible score for a 10s session (max plausible = 10*50=500)
    const end = await request(app)
      .post(`/api/sessions/${sessionId}/end`)
      .set('Authorization', `Bearer ${playerToken}`)
      .set('Idempotency-Key', `evt-${sessionId}-cheat`)
      .send({ score: 999999 });

    expect(end.status).toBe(201);
    expect(end.body.rush_awarded).toBe(50); // clamped to max plausible score for duration
    expect(end.body.validation_notes.clamped).toBe(true);
  });

  it('is idempotent: replaying the same Idempotency-Key does not double-credit RUSH', async () => {
    const start = await request(app).post('/api/sessions/start').set('Authorization', `Bearer ${playerToken}`);
    const sessionId = start.body.id;
    await pool.query("UPDATE game_sessions SET started_at = now() - interval '20 seconds' WHERE id = $1", [
      sessionId,
    ]);

    const balanceBefore = await request(app)
      .get('/api/players/me/balance')
      .set('Authorization', `Bearer ${playerToken}`);

    const key = `evt-${sessionId}-idem`;
    const first = await request(app)
      .post(`/api/sessions/${sessionId}/end`)
      .set('Authorization', `Bearer ${playerToken}`)
      .set('Idempotency-Key', key)
      .send({ score: 50 });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post(`/api/sessions/${sessionId}/end`)
      .set('Authorization', `Bearer ${playerToken}`)
      .set('Idempotency-Key', key)
      .send({ score: 50 });
    // Duplicate submission returns the original result, not a fresh credit
    expect(second.status).toBe(200);
    expect(second.body.id).toBe(first.body.id);

    const balanceAfter = await request(app)
      .get('/api/players/me/balance')
      .set('Authorization', `Bearer ${playerToken}`);
    expect(balanceAfter.body.rushBalance - balanceBefore.body.rushBalance).toBe(5); // credited exactly once
  });

  it('rejects a missing idempotency key', async () => {
    const start = await request(app).post('/api/sessions/start').set('Authorization', `Bearer ${playerToken}`);
    const sessionId = start.body.id;
    const res = await request(app)
      .post(`/api/sessions/${sessionId}/end`)
      .set('Authorization', `Bearer ${playerToken}`)
      .send({ score: 50 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('missing_idempotency_key');
  });

  it('exposes the leaderboard and a per-player OOPS reward estimate', async () => {
    const leaderboard = await request(app).get(`/api/seasons/${seasonId}/leaderboard`);
    expect(leaderboard.status).toBe(200);
    expect(leaderboard.body.entries.length).toBeGreaterThan(0);
    expect(leaderboard.body.entries[0].username).toBe('grinder_one');

    const estimate = await request(app)
      .get(`/api/seasons/${seasonId}/reward-estimate`)
      .set('Authorization', `Bearer ${playerToken}`);
    expect(estimate.status).toBe(200);
    expect(estimate.body.playerRush).toBeGreaterThan(0);
    // sole player in the season -> gets 100% of a share, capped by maxOopsPerPlayer
    expect(estimate.body.oopsEstimated).toBeLessThanOrEqual(estimate.body.maxOopsPerPlayer);
  });

  it('admin can view players, stats, and recompute rewards on season close', async () => {
    const players = await request(app).get('/api/admin/players').set('Authorization', `Bearer ${adminToken}`);
    expect(players.status).toBe(200);
    expect(players.body.find((p: any) => p.id === playerId)).toBeTruthy();

    const stats = await request(app).get('/api/admin/stats').set('Authorization', `Bearer ${adminToken}`);
    expect(stats.status).toBe(200);
    expect(stats.body.totalPlayers).toBeGreaterThanOrEqual(2);

    const close = await request(app)
      .post(`/api/admin/seasons/${seasonId}/close`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(close.status).toBe(200);
    expect(close.body.season.status).toBe('closed');
    expect(close.body.recompute.playersUpdated).toBeGreaterThan(0);
  });
});

describe('rate limiting', () => {
  it('throttles excessive login attempts from the same client', async () => {
    let sawLimit = false;
    for (let i = 0; i < 15; i++) {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ usernameOrEmail: 'nonexistent_user', password: 'whatever123' });
      if (res.status === 429) {
        sawLimit = true;
        break;
      }
    }
    expect(sawLimit).toBe(true);
  });
});
