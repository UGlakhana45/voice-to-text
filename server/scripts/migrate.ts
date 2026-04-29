#!/usr/bin/env -S node --no-warnings
/**
 * Tiny migration runner. Applies SQL files in `server/migrations/` in
 * lexical order, recording applied filenames in `_migrations`.
 *
 * Usage: pnpm --filter server migrate
 */
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { Pool } from 'pg';
import 'dotenv/config';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname, '../migrations');

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set');
    process.exit(1);
  }
  const pool = new Pool({ connectionString: url });

  await pool.query(`
    CREATE TABLE IF NOT EXISTS "_migrations" (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  const files = (await readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const applied = new Set(
    (await pool.query<{ filename: string }>(`SELECT filename FROM "_migrations"`)).rows.map(
      (r) => r.filename,
    ),
  );

  let count = 0;
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`[skip] ${file}`);
      continue;
    }
    const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(`INSERT INTO "_migrations" (filename) VALUES ($1)`, [file]);
      await client.query('COMMIT');
      console.log(`[apply] ${file}`);
      count++;
    } catch (e) {
      await client.query('ROLLBACK');
      console.error(`[fail] ${file}:`, e);
      process.exit(1);
    } finally {
      client.release();
    }
  }

  console.log(`Done. ${count} migration(s) applied, ${files.length - count} already up-to-date.`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
