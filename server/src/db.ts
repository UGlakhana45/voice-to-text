import { Pool, type PoolClient } from 'pg';
import { env } from './env.js';

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
});

pool.on('error', (err) => {
  // eslint-disable-next-line no-console
  console.error('[pg] idle client error', err);
});

/** Tagged-template SQL helper that builds parameterized queries. */
export async function sql<T = any>(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<T[]> {
  const text = strings.reduce(
    (acc, s, i) => acc + s + (i < values.length ? `$${i + 1}` : ''),
    '',
  );
  const res = await pool.query(text, values as any[]);
  return res.rows as T[];
}

export async function withTx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function closeDb() {
  await pool.end();
}
