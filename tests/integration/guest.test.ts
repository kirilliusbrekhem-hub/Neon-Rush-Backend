import request from 'supertest';
import { createApp } from '../../src/app';
import { pool } from '../../src/db/pool';
import { closeAll } from './setup';

const app = createApp();

async function makeAdmin(userId: string) {
  await pool.query("UPDATE users SET role = 'admin' WHERE id = $1", [userId]);
}

afterAll(async () => {
  await closeAll();
});

describe('guest-first onboarding', () => {
  it('creates a guest with no email/password and a usable token', async () => {
    const res = await request(app).post('/api/auth/guest');
    expect(res.status).toBe(201);
    expect(res.body.user.isGuest).toBe(true);
    expect(res.body.user.email).toBeNull();
    expect(res.body.accessToken).toBeTruthy();

    const me = await request(app).get('/api/players/me').set('Authorization', `Bearer ${res.body.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.is_guest).toBe(true);
    expect(me.body.username).toMatch(/^guest_/);
  });

  it('lets a guest play a full session before ever registering', async () => {
    const guest = await request(app).post('/api/auth/guest');
    const token = guest.body.accessToken;

    // Need an active season for sessions to start — reuse/activate one via admin.
    const admin = await request(app)
      .post('/api/auth/register')
      .send({ username: 'guest_flow_admin', email: 'gfa@example.com', password: 'SuperSecret123' });
    await makeAdmin(admin.body.user.id);
    const adminLogin = await request(app)
      .post('/api/auth/login')
      .send({ usernameOrEmail: 'guest_flow_admin', password: 'SuperSecret123' });
    const adminToken = adminLogin.body.accessToken;

    let current = await request(app).get('/api/seasons/current');
    if (current.status !== 200) {
      const created = await request(app)
        .post('/api/admin/seasons')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Guest Test Season', startsAt: new Date().toISOString(), rewardPoolOops: 1000, maxOopsPerPlayer: 500 });
      await request(app).post(`/api/admin/seasons/${created.body.id}/activate`).set('Authorization', `Bearer ${adminToken}`);
    }

    const start = await request(app).post('/api/sessions/start').set('Authorization', `Bearer ${token}`);
    expect(start.status).toBe(201);
    const sessionId = start.body.id;
    await pool.query("UPDATE game_sessions SET started_at = now() - interval '15 seconds' WHERE id = $1", [sessionId]);

    const end = await request(app)
      .post(`/api/sessions/${sessionId}/end`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', `guest-evt-${sessionId}`)
      .send({ score: 40 });
    expect(end.status).toBe(201);
    expect(end.body.rush_awarded).toBe(4);

    const balance = await request(app).get('/api/players/me/balance').set('Authorization', `Bearer ${token}`);
    expect(balance.body.rushBalance).toBe(4);
  });

  it('upgrades a guest to a full account and preserves the RUSH balance', async () => {
    const guest = await request(app).post('/api/auth/guest');
    const token = guest.body.accessToken;
    const guestId = guest.body.user.id;

    // Manually credit the guest to simulate prior play, so we can assert it survives the upgrade.
    await pool.query('UPDATE users SET rush_balance = 77 WHERE id = $1', [guestId]);

    const upgrade = await request(app)
      .post('/api/auth/upgrade')
      .set('Authorization', `Bearer ${token}`)
      .send({ username: 'promoted_player', email: 'promoted@example.com', password: 'SuperSecret123' });

    expect(upgrade.status).toBe(200);
    expect(upgrade.body.user.id).toBe(guestId); // same row, same id
    expect(upgrade.body.user.isGuest).toBe(false);
    expect(upgrade.body.user.username).toBe('promoted_player');

    // Old progress must still be there under the new credentials.
    const login = await request(app)
      .post('/api/auth/login')
      .send({ usernameOrEmail: 'promoted_player', password: 'SuperSecret123' });
    expect(login.status).toBe(200);
    const balance = await request(app)
      .get('/api/players/me/balance')
      .set('Authorization', `Bearer ${login.body.accessToken}`);
    expect(balance.body.rushBalance).toBe(77);
  });

  it('rejects upgrading an account that is already registered', async () => {
    const reg = await request(app)
      .post('/api/auth/register')
      .send({ username: 'already_real', email: 'already_real@example.com', password: 'SuperSecret123' });
    const res = await request(app)
      .post('/api/auth/upgrade')
      .set('Authorization', `Bearer ${reg.body.accessToken}`)
      .send({ email: 'new@example.com', password: 'SuperSecret123' });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('not_a_guest_account');
  });

  it('rejects upgrade to a username/email already taken', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ username: 'taken_name', email: 'taken@example.com', password: 'SuperSecret123' });
    const guest = await request(app).post('/api/auth/guest');
    const res = await request(app)
      .post('/api/auth/upgrade')
      .set('Authorization', `Bearer ${guest.body.accessToken}`)
      .send({ username: 'taken_name', email: 'fresh@example.com', password: 'SuperSecret123' });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('username_or_email_taken');
  });
});
