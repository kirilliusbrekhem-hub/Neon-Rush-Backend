import { pool } from '../../db/pool';
import { ApiError } from '../../middleware/errorHandler';

export async function getProfile(userId: string) {
  const result = await pool.query(
    `SELECT u.id, u.username, u.email, u.role, u.rush_balance, u.is_guest, u.created_at,
            p.display_name, p.avatar_url
     FROM users u
     JOIN player_profiles p ON p.user_id = u.id
     WHERE u.id = $1`,
    [userId],
  );
  if (result.rowCount === 0) throw new ApiError(404, 'user_not_found');
  return result.rows[0];
}

export async function updateProfile(userId: string, input: { displayName?: string; avatarUrl?: string }) {
  const result = await pool.query(
    `UPDATE player_profiles
     SET display_name = COALESCE($2, display_name),
         avatar_url = COALESCE($3, avatar_url),
         updated_at = now()
     WHERE user_id = $1
     RETURNING user_id, display_name, avatar_url`,
    [userId, input.displayName ?? null, input.avatarUrl ?? null],
  );
  if (result.rowCount === 0) throw new ApiError(404, 'user_not_found');
  return result.rows[0];
}

export async function getBalance(userId: string) {
  const result = await pool.query('SELECT rush_balance FROM users WHERE id = $1', [userId]);
  if (result.rowCount === 0) throw new ApiError(404, 'user_not_found');
  return { rushBalance: Number(result.rows[0].rush_balance) };
}
