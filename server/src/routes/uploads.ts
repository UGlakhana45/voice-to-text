import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { sql } from '../db.js';
import { presignPut, presignGet } from '../s3.js';

async function requireUser(req: FastifyRequest): Promise<string> {
  const decoded = await req.jwtVerify<{ sub: string }>();
  return decoded.sub;
}

const uploadBody = z.object({
  dictationId: z.string().uuid(),
  contentType: z.string().default('audio/wav'),
});

export const uploadsRoutes: FastifyPluginAsync = async (app) => {
  /** Returns a presigned PUT URL the client can directly upload audio to. */
  app.post('/audio-url', async (req, reply) => {
    let userId: string;
    try {
      userId = await requireUser(req);
    } catch {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    const { dictationId, contentType } = uploadBody.parse(req.body);

    const [d] = await sql<{ id: string }>`
      SELECT id FROM "Dictation" WHERE id = ${dictationId} AND "userId" = ${userId} LIMIT 1
    `;
    if (!d) return reply.code(404).send({ error: 'not_found' });

    const key = `audio/${userId}/${dictationId}.${guessExt(contentType)}`;
    const url = await presignPut(key, contentType);

    await sql`UPDATE "Dictation" SET "audioKey" = ${key}, "updatedAt" = now() WHERE id = ${dictationId}`;
    return { url, key, expiresIn: 600 };
  });

  /** Returns a presigned GET URL for playback. */
  app.get('/audio-url/:dictationId', async (req, reply) => {
    let userId: string;
    try {
      userId = await requireUser(req);
    } catch {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    const { dictationId } = z.object({ dictationId: z.string().uuid() }).parse(req.params);
    const [d] = await sql<{ audioKey: string | null }>`
      SELECT "audioKey" FROM "Dictation" WHERE id = ${dictationId} AND "userId" = ${userId} LIMIT 1
    `;
    if (!d || !d.audioKey) return reply.code(404).send({ error: 'not_found' });
    const url = await presignGet(d.audioKey);
    return { url, expiresIn: 600 };
  });
};

function guessExt(ct: string): string {
  if (ct.includes('wav')) return 'wav';
  if (ct.includes('mp4') || ct.includes('m4a') || ct.includes('aac')) return 'm4a';
  if (ct.includes('webm')) return 'webm';
  if (ct.includes('ogg') || ct.includes('opus')) return 'opus';
  return 'bin';
}
