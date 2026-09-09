import { pool, withTransaction } from '../../db/pool';
import { ApiError } from '../../middleware/errorHandler';

/**
 * Preliminary (off-chain) OOPS reward formula:
 *   player_rush / total_season_rush * reward_pool
 * capped by the season's max_oops_per_player.
 *
 * This is an ESTIMATE stored in Postgres only — nothing here touches a wallet
 * or the blockchain. TON Connect / on-chain distribution is a separate,
 * later phase.
 */
export function calculateOopsReward(params: {
  playerRush: number;
  totalSeasonRush: number;
  rewardPool: number;
  maxOopsPerPlayer: number;
}): number {
  if (params.totalSeasonRush <= 0 || params.rewardPool <= 0) return 0;
  const raw = (params.playerRush / params.totalSeasonRush) * params.rewardPool;
  return Math.min(raw, params.maxOopsPerPlayer);
}

export async function getPlayerRewardEstimate(seasonId: string, userId: string) {
  const seasonResult = await pool.query(
    'SELECT id, reward_pool_oops, max_oops_per_player, total_season_rush FROM seasons WHERE id = $1',
    [seasonId],
  );
  if (seasonResult.rowCount === 0) throw new ApiError(404, 'season_not_found');
  const season = seasonResult.rows[0];

  const statsResult = await pool.query(
    'SELECT rush_earned FROM season_player_stats WHERE season_id = $1 AND user_id = $2',
    [seasonId, userId],
  );
  const playerRush = statsResult.rowCount ? Number(statsResult.rows[0].rush_earned) : 0;

  const oopsEstimated = calculateOopsReward({
    playerRush,
    totalSeasonRush: Number(season.total_season_rush),
    rewardPool: Number(season.reward_pool_oops),
    maxOopsPerPlayer: Number(season.max_oops_per_player),
  });

  return {
    seasonId,
    playerRush,
    totalSeasonRush: Number(season.total_season_rush),
    rewardPoolOops: Number(season.reward_pool_oops),
    maxOopsPerPlayer: Number(season.max_oops_per_player),
    oopsEstimated,
  };
}

/**
 * Recomputes oops_estimated for every player in the season and persists it to
 * season_player_stats. Intended to be run when a season closes (or on demand
 * by an admin). Runs in a single transaction for consistency.
 */
export async function recomputeSeasonRewards(seasonId: string) {
  return withTransaction(async (client) => {
    const seasonResult = await client.query(
      'SELECT id, reward_pool_oops, max_oops_per_player, total_season_rush FROM seasons WHERE id = $1 FOR UPDATE',
      [seasonId],
    );
    if (seasonResult.rowCount === 0) throw new ApiError(404, 'season_not_found');
    const season = seasonResult.rows[0];
    const totalSeasonRush = Number(season.total_season_rush);
    const rewardPool = Number(season.reward_pool_oops);
    const maxPerPlayer = Number(season.max_oops_per_player);

    const players = await client.query('SELECT user_id, rush_earned FROM season_player_stats WHERE season_id = $1', [
      seasonId,
    ]);

    let updated = 0;
    for (const row of players.rows) {
      const oops = calculateOopsReward({
        playerRush: Number(row.rush_earned),
        totalSeasonRush,
        rewardPool,
        maxOopsPerPlayer: maxPerPlayer,
      });
      await client.query(
        'UPDATE season_player_stats SET oops_estimated = $3, updated_at = now() WHERE season_id = $1 AND user_id = $2',
        [seasonId, row.user_id, oops],
      );
      updated += 1;
    }

    return { seasonId, playersUpdated: updated, totalSeasonRush, rewardPool, maxOopsPerPlayer: maxPerPlayer };
  });
}
