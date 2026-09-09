import { pool } from '../../src/db/pool';
import { redis } from '../../src/redis/client';

export async function truncateAll() {
  await pool.query(`
    TRUNCATE TABLE
      rush_transactions,
      game_results,
      game_sessions,
      season_player_stats,
      seasons,
      player_profiles,
      users,
      processed_events
    RESTART IDENTITY CASCADE
  `);
  const keys = await redis.keys('*');
  if (keys.length) await redis.del(...keys);
}

export async function closeAll() {
  await pool.end();
  redis.disconnect();
}
