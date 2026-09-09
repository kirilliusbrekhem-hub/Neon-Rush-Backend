import { Pool, types } from 'pg';
import { env } from '../config/env';

// BIGINT (OID 20) comes back from node-postgres as a string by default to avoid
// silent precision loss above Number.MAX_SAFE_INTEGER. RUSH/OOPS values in this
// app stay well within safe integer range, so parse them as numbers for a clean
// JSON API contract instead of leaking "10" instead of 10 to clients.
types.setTypeParser(20, (val: string) => parseInt(val, 10));
// NUMERIC (OID 1700) — used for reward_pool_oops / oops_estimated — as float.
types.setTypeParser(1700, (val: string) => parseFloat(val));

export const pool = new Pool({ connectionString: env.databaseUrl });

export async function withTransaction<T>(fn: (client: import('pg').PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
