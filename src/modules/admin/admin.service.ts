import { pool } from '../../db/pool';

export async function listPlayers(limit = 50, offset = 0) {
  const result = await pool.query(
    `SELECT u.id, u.username, u.email, u.role, u.rush_balance, u.is_guest, u.created_at, p.display_name
     FROM users u
     JOIN player_profiles p ON p.user_id = u.id
     ORDER BY u.created_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset],
  );
  return result.rows;
}

export async function getPlayer(userId: string) {
  const userResult = await pool.query(
    `SELECT u.id, u.username, u.email, u.role, u.rush_balance, u.is_guest, u.created_at, p.display_name
     FROM users u JOIN player_profiles p ON p.user_id = u.id WHERE u.id = $1`,
    [userId],
  );
  const seasonStats = await pool.query(
    `SELECT season_id, rush_earned, oops_estimated FROM season_player_stats WHERE user_id = $1`,
    [userId],
  );
  const recentSessions = await pool.query(
    `SELECT id, season_id, status, started_at, ended_at FROM game_sessions WHERE user_id = $1 ORDER BY started_at DESC LIMIT 20`,
    [userId],
  );
  return { user: userResult.rows[0] ?? null, seasonStats: seasonStats.rows, recentSessions: recentSessions.rows };
}

export async function getGlobalStats() {
  const [players, activeSeasons, sessionsToday, totalRush] = await Promise.all([
    pool.query('SELECT COUNT(*)::int AS count FROM users'),
    pool.query("SELECT id, name FROM seasons WHERE status = 'active'"),
    pool.query("SELECT COUNT(*)::int AS count FROM game_sessions WHERE started_at > now() - interval '24 hours'"),
    pool.query('SELECT COALESCE(SUM(rush_balance), 0)::bigint AS total FROM users'),
  ]);
  return {
    totalPlayers: players.rows[0].count,
    activeSeason: activeSeasons.rows[0] ?? null,
    sessionsLast24h: sessionsToday.rows[0].count,
    totalRushInCirculation: Number(totalRush.rows[0].total),
  };
}
