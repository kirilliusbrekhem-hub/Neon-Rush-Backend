import { pool, withTransaction } from '../../db/pool';
import { ApiError } from '../../middleware/errorHandler';
import { creditRush } from '../economy/ledger.service';
import { validateAndComputeRush } from './validation';
import { claimIdempotencyKey, releaseIdempotencyKey } from '../../middleware/idempotency.middleware';

interface SessionRow {
  id: string;
  user_id: string;
  season_id: string;
  status: 'active' | 'completed' | 'invalidated';
  started_at: Date;
  ended_at: Date | null;
}

export async function startSession(userId: string) {
  const seasonResult = await pool.query('SELECT id FROM seasons WHERE status = $1 LIMIT 1', ['active']);
  if (seasonResult.rowCount === 0) throw new ApiError(409, 'no_active_season');
  const seasonId = seasonResult.rows[0].id;

  const result = await pool.query<SessionRow>(
    `INSERT INTO game_sessions (user_id, season_id, status)
     VALUES ($1, $2, 'active')
     RETURNING id, user_id, season_id, status, started_at, ended_at`,
    [userId, seasonId],
  );
  return result.rows[0];
}

export async function getSession(userId: string, sessionId: string) {
  const result = await pool.query<SessionRow>(
    `SELECT id, user_id, season_id, status, started_at, ended_at FROM game_sessions WHERE id = $1 AND user_id = $2`,
    [sessionId, userId],
  );
  if (result.rowCount === 0) throw new ApiError(404, 'session_not_found');
  return result.rows[0];
}

interface EndSessionInput {
  userId: string;
  sessionId: string;
  eventId: string;
  clientReportedScore: number;
  clientMeta?: Record<string, unknown>;
}

export async function endSession(input: EndSessionInput) {
  // Fast idempotency gate (Redis). If a duplicate slips past this (Redis flush,
  // race), the DB UNIQUE constraint on game_results.event_id is the backstop below.
  const claimed = await claimIdempotencyKey(input.eventId);
  if (!claimed) {
    const existing = await pool.query('SELECT * FROM game_results WHERE event_id = $1', [input.eventId]);
    if (existing.rowCount && existing.rowCount > 0) {
      return { duplicate: true, result: existing.rows[0] };
    }
    // Key claimed by an in-flight request that hasn't written its result yet.
    throw new ApiError(409, 'duplicate_request_in_flight');
  }

  let succeeded = false;
  try {
    const outcome = await withTransaction(async (client) => {
      const sessionResult = await client.query<SessionRow>(
        `SELECT id, user_id, season_id, status, started_at, ended_at
         FROM game_sessions WHERE id = $1 AND user_id = $2 FOR UPDATE`,
        [input.sessionId, input.userId],
      );
      if (sessionResult.rowCount === 0) throw new ApiError(404, 'session_not_found');
      const session = sessionResult.rows[0];
      if (session.status !== 'active') {
        throw new ApiError(409, 'session_not_active', { status: session.status });
      }

      const endedAt = new Date();
      const validation = validateAndComputeRush({
        startedAt: session.started_at,
        endedAt,
        clientReportedScore: input.clientReportedScore,
      });

      await client.query(
        `UPDATE game_sessions SET status = $2, ended_at = $3, client_meta = $4 WHERE id = $1`,
        [session.id, validation.valid ? 'completed' : 'invalidated', endedAt, input.clientMeta ?? null],
      );

      let insertResult;
      try {
        insertResult = await client.query(
          `INSERT INTO game_results (session_id, event_id, raw_client_score, rush_awarded, validated, validation_notes)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING *`,
          [
            session.id,
            input.eventId,
            JSON.stringify({ score: input.clientReportedScore }),
            validation.rushAwarded,
            validation.valid,
            JSON.stringify(validation.notes),
          ],
        );
      } catch (err: any) {
        if (err?.code === '23505') {
          // Unique violation on event_id — genuine duplicate slipped past Redis.
          const existing = await client.query('SELECT * FROM game_results WHERE event_id = $1', [input.eventId]);
          return { duplicate: true, result: existing.rows[0] };
        }
        throw err;
      }

      if (validation.valid && validation.rushAwarded > 0) {
        await creditRush(client, {
          userId: session.user_id,
          amount: validation.rushAwarded,
          reason: 'game_reward',
          sessionId: session.id,
        });

        await client.query(
          `INSERT INTO season_player_stats (season_id, user_id, rush_earned)
           VALUES ($1, $2, $3)
           ON CONFLICT (season_id, user_id)
           DO UPDATE SET rush_earned = season_player_stats.rush_earned + $3, updated_at = now()`,
          [session.season_id, session.user_id, validation.rushAwarded],
        );

        await client.query(
          `UPDATE seasons SET total_season_rush = total_season_rush + $2 WHERE id = $1`,
          [session.season_id, validation.rushAwarded],
        );
      }

      return { duplicate: false, result: insertResult.rows[0] };
    });
    succeeded = true;
    return outcome;
  } finally {
    // Only release the Redis lock on failure. On success we deliberately KEEP
    // it held (until its TTL expires): the lock itself is what makes a replay
    // of the same Idempotency-Key short-circuit to the cached result instead
    // of failing with "session_not_active" because the session already moved
    // on to 'completed'. The DB UNIQUE constraint on game_results.event_id is
    // the durable backstop if the key is ever lost before its TTL.
    if (!succeeded) {
      await releaseIdempotencyKey(input.eventId);
    }
  }
}
