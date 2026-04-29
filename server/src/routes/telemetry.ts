import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { env } from '../env.js';
import { sql } from '../db.js';

const eventBody = z.object({
  events: z
    .array(
      z.object({
        name: z.string().min(1).max(120),
        props: z.record(z.string(), z.unknown()).optional(),
        ts: z.number().optional(),
      }),
    )
    .min(1)
    .max(100),
});

async function tryUserId(req: FastifyRequest): Promise<string | null> {
  try {
    const decoded = await req.jwtVerify<{ sub: string }>();
    return decoded.sub;
  } catch {
    return null;
  }
}

/**
 * Opt-in telemetry. The client only emits events when the user has
 * `telemetryEnabled=true` in settings. The server respects a global kill
 * switch via TELEMETRY_ENABLED env (default true so dev sees data).
 *
 * Anonymous events (no auth) are accepted with userId=null — useful for
 * pre-signup install / first-launch funnels.
 */
export const telemetryRoutes: FastifyPluginAsync = async (app) => {
  app.post('/events', async (req, reply) => {
    if (!env.TELEMETRY_ENABLED) return reply.code(204).send();

    const body = eventBody.parse(req.body);
    const userId = await tryUserId(req);
    const ip = req.ip ?? null;
    const ua = (req.headers['user-agent'] as string | undefined) ?? null;

    for (const ev of body.events) {
      const ts = ev.ts ? new Date(ev.ts) : new Date();
      await sql`
        INSERT INTO "Event" (id, "userId", name, props, ts, "ipAddress", "userAgent")
        VALUES (${randomUUID()}, ${userId}, ${ev.name},
                ${JSON.stringify(ev.props ?? {})}::jsonb, ${ts}, ${ip}, ${ua})
      `;
    }

    reply.code(204).send();
  });
};
