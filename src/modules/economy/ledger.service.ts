import { PoolClient } from 'pg';
import { ApiError } from '../../middleware/errorHandler';

/**
 * The ONLY function in the codebase allowed to change a user's RUSH balance.
 * Must be called within an existing transaction (client) so the balance update,
 * the ledger row, and the caller's other writes (e.g. game_results, season stats)
 * commit or roll back together.
 */
export async function creditRush(
  client: PoolClient,
  params: { userId: string; amount: number; reason: string; sessionId?: string },
): Promise<number> {
  if (params.amount < 0) {
    throw new ApiError(400, 'negative_credit_not_allowed', { hint: 'use debitRush for deductions' });
  }
  const result = await client.query<{ rush_balance: number }>(
    `UPDATE users SET rush_balance = rush_balance + $1, updated_at = now()
     WHERE id = $2
     RETURNING rush_balance`,
    [params.amount, params.userId],
  );
  if (result.rowCount === 0) throw new ApiError(404, 'user_not_found');
  const balanceAfter = result.rows[0].rush_balance;

  await client.query(
    `INSERT INTO rush_transactions (user_id, session_id, amount, reason, balance_after)
     VALUES ($1, $2, $3, $4, $5)`,
    [params.userId, params.sessionId ?? null, params.amount, params.reason, balanceAfter],
  );
  return balanceAfter;
}

export async function debitRush(
  client: PoolClient,
  params: { userId: string; amount: number; reason: string; sessionId?: string },
): Promise<number> {
  if (params.amount < 0) throw new ApiError(400, 'positive_amount_required');
  const result = await client.query<{ rush_balance: number }>(
    `UPDATE users SET rush_balance = rush_balance - $1, updated_at = now()
     WHERE id = $2 AND rush_balance >= $1
     RETURNING rush_balance`,
    [params.amount, params.userId],
  );
  if (result.rowCount === 0) throw new ApiError(409, 'insufficient_balance');
  const balanceAfter = result.rows[0].rush_balance;

  await client.query(
    `INSERT INTO rush_transactions (user_id, session_id, amount, reason, balance_after)
     VALUES ($1, $2, $3, $4, $5)`,
    [params.userId, params.sessionId ?? null, -params.amount, params.reason, balanceAfter],
  );
  return balanceAfter;
}
