import { pool } from '../../db/pool';
import { writeLeaderboard } from '../../firestore/client';

export interface LeaderboardRow {
  userId: string;
  username: string;
  displayName: string;
  rushEarned: number;
  rank: number;
}

export async function getLeaderboard(seasonId: string, limit = 100): Promise<LeaderboardRow[]> {
  const result = await pool.query(
    `SELECT
       s.user_id,
       u.username,
       p.display_name,
       s.rush_earned,
       RANK() OVER (ORDER BY s.rush_earned DESC) AS rank
     FROM season_player_stats s
     JOIN users u ON u.id = s.user_id
     JOIN player_profiles p ON p.user_id = s.user_id
     WHERE s.season_id = $1
     ORDER BY s.rush_earned DESC
     LIMIT $2`,
    [seasonId, limit],
  );
  return result.rows.map((r) => ({
    userId: r.user_id,
    username: r.username,
    displayName: r.display_name,
    rushEarned: Number(r.rush_earned),
    rank: Number(r.rank),
  }));
}

/** Recomputes the top-N leaderboard from Postgres (source of truth) and pushes it to Firestore. */
export async function syncLeaderboardToFirestore(seasonId: string, limit = 100): Promise<number> {
  const rows = await getLeaderboard(seasonId, limit);
  await writeLeaderboard(
    seasonId,
    rows.map((r) => ({ userId: r.userId, username: r.username, rushEarned: r.rushEarned, rank: r.rank })),
  );
  return rows.length;
}
