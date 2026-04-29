import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { sql, withTx, pool } from '../db.js';

const pullQuery = z.object({ since: z.coerce.number().optional() });

const pushBody = z.object({
  vocab: z
    .array(z.object({ term: z.string().min(1), weight: z.number().default(1) }))
    .optional(),
  snippets: z
    .array(z.object({ trigger: z.string().min(1), expansion: z.string().min(1) }))
    .optional(),
  dictations: z
    .array(
      z.object({
        rawText: z.string(),
        cleanedText: z.string().nullable().optional(),
        language: z.string().nullable().optional(),
        durationMs: z.number().int().nonnegative(),
        tone: z.string().nullable().optional(),
      }),
    )
    .optional(),
});

const dictationPatch = z
  .object({
    cleanedText: z.string().nullable().optional(),
    tone: z.enum(['neutral', 'casual', 'formal', 'email', 'slack', 'notes']).nullable().optional(),
    language: z.string().nullable().optional(),
  })
  .strict();

const settingsPatch = z
  .object({
    preferredLanguage: z.string().min(2).max(10).optional(),
    defaultTone: z.enum(['neutral', 'casual', 'formal', 'email', 'slack', 'notes']).optional(),
    modelSize: z.enum(['tiny', 'base', 'small', 'medium', 'large-v3']).optional(),
    cleanupEnabled: z.boolean().optional(),
    themeMode: z.enum(['light', 'dark', 'system']).optional(),
    telemetryEnabled: z.boolean().optional(),
  })
  .strict();

async function requireUser(req: FastifyRequest): Promise<string> {
  const decoded = await req.jwtVerify<{ sub: string }>();
  return decoded.sub;
}

async function withAuth<T>(
  req: FastifyRequest,
  reply: import('fastify').FastifyReply,
  fn: (userId: string) => Promise<T>,
): Promise<T | undefined> {
  let userId: string;
  try {
    userId = await requireUser(req);
  } catch {
    reply.code(401).send({ error: 'unauthorized' });
    return undefined;
  }
  return fn(userId);
}

export const syncRoutes: FastifyPluginAsync = async (app) => {
  app.get('/pull', async (req, reply) =>
    withAuth(req, reply, async (userId) => {
      const { since } = pullQuery.parse(req.query);
      const cursor = since ? new Date(since) : new Date(0);

      const [vocab, snippets, dictations, settings] = await Promise.all([
        sql`SELECT * FROM "VocabItem" WHERE "userId" = ${userId} AND "createdAt" > ${cursor}`,
        sql`SELECT * FROM "Snippet"   WHERE "userId" = ${userId} AND "updatedAt" > ${cursor}`,
        sql`SELECT * FROM "Dictation" WHERE "userId" = ${userId} AND "updatedAt" > ${cursor}
            ORDER BY "createdAt" DESC LIMIT 200`,
        sql`SELECT * FROM "UserSettings" WHERE "userId" = ${userId} LIMIT 1`,
      ]);

      return { vocab, snippets, dictations, settings: settings[0] ?? null, ts: Date.now() };
    }),
  );

  app.post('/push', async (req, reply) =>
    withAuth(req, reply, async (userId) => {
      const body = pushBody.parse(req.body);
      const now = new Date();
      const dictationIds: string[] = [];

      await withTx(async (tx) => {
        for (const v of body.vocab ?? []) {
          await tx.query(
            `INSERT INTO "VocabItem" (id, "userId", term, weight, "createdAt")
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT ("userId", term) DO UPDATE SET weight = EXCLUDED.weight`,
            [randomUUID(), userId, v.term, v.weight, now],
          );
        }
        for (const s of body.snippets ?? []) {
          await tx.query(
            `INSERT INTO "Snippet" (id, "userId", trigger, expansion, "createdAt", "updatedAt")
             VALUES ($1, $2, $3, $4, $5, $5)
             ON CONFLICT ("userId", trigger) DO UPDATE
             SET expansion = EXCLUDED.expansion, "updatedAt" = EXCLUDED."updatedAt"`,
            [randomUUID(), userId, s.trigger, s.expansion, now],
          );
        }
        for (const d of body.dictations ?? []) {
          const id = randomUUID();
          dictationIds.push(id);
          await tx.query(
            `INSERT INTO "Dictation"
              (id, "userId", "rawText", "cleanedText", language, "durationMs", tone, "createdAt", "updatedAt")
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)`,
            [
              id,
              userId,
              d.rawText,
              d.cleanedText ?? null,
              d.language ?? null,
              d.durationMs,
              d.tone ?? null,
              now,
            ],
          );
        }
      });

      return { ok: true, ts: Date.now(), dictationIds };
    }),
  );

  // ---------- settings ----------
  app.patch('/settings', async (req, reply) =>
    withAuth(req, reply, async (userId) => {
      const patch = settingsPatch.parse(req.body);
      const keys = Object.keys(patch) as (keyof typeof patch)[];
      if (keys.length === 0) {
        const [current] = await sql`SELECT * FROM "UserSettings" WHERE "userId" = ${userId}`;
        return current ?? null;
      }
      const setSql = keys.map((k, i) => `"${k}" = $${i + 2}`).join(', ');
      const values = keys.map((k) => patch[k]);
      const res = await pool.query(
        `UPDATE "UserSettings" SET ${setSql}, "updatedAt" = now()
         WHERE "userId" = $1 RETURNING *`,
        [userId, ...values],
      );
      return res.rows[0] ?? null;
    }),
  );

  // ---------- patch dictation (e.g. attach LLM-cleaned text + tone) ----------
  app.patch('/dictations/:id', async (req, reply) =>
    withAuth(req, reply, async (userId) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const patch = dictationPatch.parse(req.body);
      const keys = Object.keys(patch) as (keyof typeof patch)[];
      if (keys.length === 0) {
        const [current] = await sql`
          SELECT * FROM "Dictation" WHERE id = ${id} AND "userId" = ${userId}
        `;
        if (!current) return reply.code(404).send({ error: 'not_found' });
        return current;
      }
      const setSql = keys.map((k, i) => `"${k}" = $${i + 3}`).join(', ');
      const values = keys.map((k) => patch[k] ?? null);
      const res = await pool.query(
        `UPDATE "Dictation" SET ${setSql}, "updatedAt" = now()
         WHERE id = $1 AND "userId" = $2 RETURNING *`,
        [id, userId, ...values],
      );
      if (res.rows.length === 0) return reply.code(404).send({ error: 'not_found' });
      return res.rows[0];
    }),
  );

  // ---------- deletes ----------
  app.delete('/vocab/:id', async (req, reply) =>
    withAuth(req, reply, async (userId) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const rows = await sql`
        DELETE FROM "VocabItem" WHERE id = ${id} AND "userId" = ${userId} RETURNING id
      `;
      if (rows.length === 0) return reply.code(404).send({ error: 'not_found' });
      return { ok: true };
    }),
  );

  app.delete('/snippets/:id', async (req, reply) =>
    withAuth(req, reply, async (userId) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const rows = await sql`
        DELETE FROM "Snippet" WHERE id = ${id} AND "userId" = ${userId} RETURNING id
      `;
      if (rows.length === 0) return reply.code(404).send({ error: 'not_found' });
      return { ok: true };
    }),
  );

  app.delete('/dictations/:id', async (req, reply) =>
    withAuth(req, reply, async (userId) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const rows = await sql`
        DELETE FROM "Dictation" WHERE id = ${id} AND "userId" = ${userId} RETURNING id
      `;
      if (rows.length === 0) return reply.code(404).send({ error: 'not_found' });
      return { ok: true };
    }),
  );
};
