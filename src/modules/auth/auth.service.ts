import { v4 as uuidv4 } from 'uuid';
import { pool } from '../../db/pool';
import { hashPassword, verifyPassword } from '../../utils/password';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../utils/jwt';
import { redis } from '../../redis/client';
import { ApiError } from '../../middleware/errorHandler';

interface RegisterInput {
  username: string;
  email: string;
  password: string;
  displayName?: string;
}

interface UpgradeInput {
  username?: string;
  email: string;
  password: string;
}

interface UserRow {
  id: string;
  username: string;
  email: string | null;
  password_hash: string | null;
  role: 'player' | 'admin';
  is_guest: boolean;
}

const REFRESH_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days, mirrors JWT_REFRESH_TTL default

function toPublicUser(user: UserRow) {
  return { id: user.id, username: user.username, email: user.email, role: user.role, isGuest: user.is_guest };
}

async function issueTokens(user: UserRow) {
  const accessToken = signAccessToken({
    sub: user.id,
    role: user.role,
    username: user.username,
    isGuest: user.is_guest,
  });
  const tokenId = uuidv4();
  const refreshToken = signRefreshToken(user.id, tokenId);
  // Store refresh token id so it can be revoked on logout / rotated on refresh.
  await redis.set(`refresh:${user.id}:${tokenId}`, '1', 'EX', REFRESH_TTL_SECONDS);
  return { accessToken, refreshToken };
}

export async function register(input: RegisterInput) {
  const existing = await pool.query('SELECT id FROM users WHERE username = $1 OR email = $2', [
    input.username,
    input.email,
  ]);
  if (existing.rowCount && existing.rowCount > 0) {
    throw new ApiError(409, 'username_or_email_taken');
  }

  const passwordHash = await hashPassword(input.password);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const userResult = await client.query<UserRow>(
      `INSERT INTO users (username, email, password_hash, is_guest)
       VALUES ($1, $2, $3, false)
       RETURNING id, username, email, password_hash, role, is_guest`,
      [input.username, input.email, passwordHash],
    );
    const user = userResult.rows[0];
    await client.query(
      `INSERT INTO player_profiles (user_id, display_name) VALUES ($1, $2)`,
      [user.id, input.displayName ?? input.username],
    );
    await client.query('COMMIT');
    const tokens = await issueTokens(user);
    return { user: toPublicUser(user), ...tokens };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Creates a fully anonymous player: no email, no password, a random unique
 * username. Returns the same token pair shape as register()/login() so the
 * frontend needs no special-case handling. This is the entry point for the
 * "PLAY NOW, no form" onboarding flow.
 */
export async function createGuest() {
  const guestUsername = `guest_${uuidv4().replace(/-/g, '').slice(0, 10)}`;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const userResult = await client.query<UserRow>(
      `INSERT INTO users (username, email, password_hash, is_guest)
       VALUES ($1, NULL, NULL, true)
       RETURNING id, username, email, password_hash, role, is_guest`,
      [guestUsername],
    );
    const user = userResult.rows[0];
    await client.query(
      `INSERT INTO player_profiles (user_id, display_name) VALUES ($1, $2)`,
      [user.id, 'Guest'],
    );
    await client.query('COMMIT');
    const tokens = await issueTokens(user);
    return { user: toPublicUser(user), ...tokens };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Upgrades the CURRENTLY AUTHENTICATED guest to a full account in place.
 * Same user id -> rush_balance, rush_transactions, game_sessions and
 * season_player_stats all carry over automatically, no data migration needed.
 */
export async function upgradeGuest(userId: string, input: UpgradeInput) {
  const current = await pool.query<UserRow>('SELECT * FROM users WHERE id = $1', [userId]);
  if (current.rowCount === 0) throw new ApiError(404, 'user_not_found');
  if (!current.rows[0].is_guest) throw new ApiError(409, 'not_a_guest_account');

  const desiredUsername = input.username ?? current.rows[0].username;
  const conflict = await pool.query('SELECT id FROM users WHERE (username = $1 OR email = $2) AND id != $3', [
    desiredUsername,
    input.email,
    userId,
  ]);
  if (conflict.rowCount && conflict.rowCount > 0) {
    throw new ApiError(409, 'username_or_email_taken');
  }

  const passwordHash = await hashPassword(input.password);
  const result = await pool.query<UserRow>(
    `UPDATE users SET username = $2, email = $3, password_hash = $4, is_guest = false, updated_at = now()
     WHERE id = $1
     RETURNING id, username, email, password_hash, role, is_guest`,
    [userId, desiredUsername, input.email, passwordHash],
  );
  const user = result.rows[0];
  const tokens = await issueTokens(user);
  return { user: toPublicUser(user), ...tokens };
}

export async function login(usernameOrEmail: string, password: string) {
  const result = await pool.query<UserRow>(
    'SELECT id, username, email, password_hash, role, is_guest FROM users WHERE username = $1 OR email = $1',
    [usernameOrEmail],
  );
  const user = result.rows[0];
  if (!user || !user.password_hash) throw new ApiError(401, 'invalid_credentials');
  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) throw new ApiError(401, 'invalid_credentials');
  const tokens = await issueTokens(user);
  return { user: toPublicUser(user), ...tokens };
}

export async function refresh(refreshToken: string) {
  let payload: { sub: string; tid: string };
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new ApiError(401, 'invalid_refresh_token');
  }
  const stillValid = await redis.get(`refresh:${payload.sub}:${payload.tid}`);
  if (!stillValid) throw new ApiError(401, 'refresh_token_revoked_or_expired');

  // Rotate: invalidate old refresh token id, issue a new pair.
  await redis.del(`refresh:${payload.sub}:${payload.tid}`);

  const result = await pool.query<UserRow>(
    'SELECT id, username, email, password_hash, role, is_guest FROM users WHERE id = $1',
    [payload.sub],
  );
  const user = result.rows[0];
  if (!user) throw new ApiError(401, 'user_not_found');
  const tokens = await issueTokens(user);
  return { user: toPublicUser(user), ...tokens };
}

export async function logout(userId: string, refreshToken: string) {
  try {
    const payload = verifyRefreshToken(refreshToken);
    if (payload.sub !== userId) throw new ApiError(403, 'token_user_mismatch');
    await redis.del(`refresh:${payload.sub}:${payload.tid}`);
  } catch {
    // Already invalid/expired — logout is idempotent from the caller's perspective.
  }
}
