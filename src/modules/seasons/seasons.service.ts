import { pool } from '../../db/pool';
import { ApiError } from '../../middleware/errorHandler';

export async function getCurrentSeason() {
  const result = await pool.query('SELECT * FROM seasons WHERE status = $1 LIMIT 1', ['active']);
  if (result.rowCount === 0) throw new ApiError(404, 'no_active_season');
  return result.rows[0];
}

export async function getSeasonById(id: string) {
  const result = await pool.query('SELECT * FROM seasons WHERE id = $1', [id]);
  if (result.rowCount === 0) throw new ApiError(404, 'season_not_found');
  return result.rows[0];
}

export async function listSeasons() {
  const result = await pool.query('SELECT * FROM seasons ORDER BY starts_at DESC');
  return result.rows;
}

export async function createSeason(input: {
  name: string;
  startsAt: string;
  endsAt?: string;
  rewardPoolOops: number;
  maxOopsPerPlayer: number;
}) {
  const result = await pool.query(
    `INSERT INTO seasons (name, starts_at, ends_at, reward_pool_oops, max_oops_per_player, status)
     VALUES ($1, $2, $3, $4, $5, 'upcoming')
     RETURNING *`,
    [input.name, input.startsAt, input.endsAt ?? null, input.rewardPoolOops, input.maxOopsPerPlayer],
  );
  return result.rows[0];
}

export async function updateSeason(
  id: string,
  input: Partial<{ name: string; endsAt: string; rewardPoolOops: number; maxOopsPerPlayer: number; status: string }>,
) {
  const result = await pool.query(
    `UPDATE seasons SET
       name = COALESCE($2, name),
       ends_at = COALESCE($3, ends_at),
       reward_pool_oops = COALESCE($4, reward_pool_oops),
       max_oops_per_player = COALESCE($5, max_oops_per_player),
       status = COALESCE($6, status)
     WHERE id = $1
     RETURNING *`,
    [id, input.name ?? null, input.endsAt ?? null, input.rewardPoolOops ?? null, input.maxOopsPerPlayer ?? null, input.status ?? null],
  );
  if (result.rowCount === 0) throw new ApiError(404, 'season_not_found');
  return result.rows[0];
}

export async function activateSeason(id: string) {
  // Unique partial index on (status='active') guarantees only one active season;
  // if another is active this will throw a unique_violation (23505).
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE seasons SET status = 'closed' WHERE status = 'active' AND id != $1`,
      [id],
    );
    const result = await client.query(`UPDATE seasons SET status = 'active' WHERE id = $1 RETURNING *`, [id]);
    if (result.rowCount === 0) throw new ApiError(404, 'season_not_found');
    await client.query('COMMIT');
    return result.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function closeSeason(id: string) {
  const result = await pool.query(`UPDATE seasons SET status = 'closed' WHERE id = $1 RETURNING *`, [id]);
  if (result.rowCount === 0) throw new ApiError(404, 'season_not_found');
  return result.rows[0];
}
