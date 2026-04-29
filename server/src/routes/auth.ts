import type { FastifyPluginAsync } from 'fastify';
import { randomUUID, randomBytes } from 'node:crypto';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { sql, withTx } from '../db.js';
import { env } from '../env.js';
import { verifyAppleIdToken, verifyGoogleIdToken, type OAuthClaims } from '../oauth.js';

const credsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().min(1).max(80).optional(),
});

const refreshSchema = z.object({ refreshToken: z.string().min(10) });

interface UserRow {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string | null;
}

interface SessionRow {
  id: string;
  userId: string;
  refreshHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

const REFRESH_TTL_DAYS = 30;

function refreshExpiry(): Date {
  return new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);
}

/** Encode a refresh token as `<sessionId>.<rawSecret>` (opaque to client). */
function encodeRefresh(sessionId: string, secret: string): string {
  return `${sessionId}.${secret}`;
}

function decodeRefresh(token: string): { sessionId: string; secret: string } | null {
  const idx = token.indexOf('.');
  if (idx <= 0 || idx === token.length - 1) return null;
  return { sessionId: token.slice(0, idx), secret: token.slice(idx + 1) };
}

async function issueSession(
  userId: string,
  meta: { userAgent?: string | null; ipAddress?: string | null },
): Promise<{ sessionId: string; refreshToken: string }> {
  const sessionId = randomUUID();
  const secret = randomBytes(32).toString('base64url');
  const refreshHash = await bcrypt.hash(secret, env.BCRYPT_ROUNDS);
  await sql`
    INSERT INTO "Session" (id, "userId", "refreshHash", "userAgent", "ipAddress", "expiresAt")
    VALUES (${sessionId}, ${userId}, ${refreshHash}, ${meta.userAgent ?? null}, ${meta.ipAddress ?? null}, ${refreshExpiry()})
  `;
  return { sessionId, refreshToken: encodeRefresh(sessionId, secret) };
}

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post('/signup', async (req, reply) => {
    const body = credsSchema.parse(req.body);

    const [existing] = await sql<UserRow>`
      SELECT id FROM "User" WHERE email = ${body.email} LIMIT 1
    `;
    if (existing) return reply.code(409).send({ error: 'email_taken' });

    const passwordHash = await bcrypt.hash(body.password, env.BCRYPT_ROUNDS);
    const id = randomUUID();
    const now = new Date();

    const user = await withTx(async (tx) => {
      const r = await tx.query(
        `INSERT INTO "User" (id, email, "passwordHash", "displayName", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $5)
         RETURNING id, email, "displayName"`,
        [id, body.email, passwordHash, body.displayName ?? null, now],
      );
      await tx.query(
        `INSERT INTO "UserSettings" ("userId", "updatedAt") VALUES ($1, $2)`,
        [id, now],
      );
      return r.rows[0] as { id: string; email: string; displayName: string | null };
    });

    const accessToken = app.jwt.sign({ sub: user.id }, { expiresIn: env.JWT_ACCESS_TTL });
    const { refreshToken } = await issueSession(user.id, {
      userAgent: req.headers['user-agent'] ?? null,
      ipAddress: req.ip,
    });
    return { token: accessToken, refreshToken, user };
  });

  app.post('/login', async (req, reply) => {
    const body = credsSchema.pick({ email: true, password: true }).parse(req.body);
    const [user] = await sql<UserRow>`
      SELECT id, email, "passwordHash", "displayName"
      FROM "User" WHERE email = ${body.email} LIMIT 1
    `;
    if (!user) return reply.code(401).send({ error: 'invalid_credentials' });

    const ok = await bcrypt.compare(body.password, user.passwordHash);
    if (!ok) return reply.code(401).send({ error: 'invalid_credentials' });

    const accessToken = app.jwt.sign({ sub: user.id }, { expiresIn: env.JWT_ACCESS_TTL });
    const { refreshToken } = await issueSession(user.id, {
      userAgent: req.headers['user-agent'] ?? null,
      ipAddress: req.ip,
    });
    return {
      token: accessToken,
      refreshToken,
      user: { id: user.id, email: user.email, displayName: user.displayName },
    };
  });

  app.post('/refresh', async (req, reply) => {
    const { refreshToken } = refreshSchema.parse(req.body);
    const parsed = decodeRefresh(refreshToken);
    if (!parsed) return reply.code(401).send({ error: 'invalid_refresh' });

    const [session] = await sql<SessionRow>`
      SELECT id, "userId", "refreshHash", "expiresAt", "revokedAt"
      FROM "Session" WHERE id = ${parsed.sessionId} LIMIT 1
    `;
    if (!session || session.revokedAt || new Date(session.expiresAt) < new Date()) {
      return reply.code(401).send({ error: 'invalid_refresh' });
    }

    const ok = await bcrypt.compare(parsed.secret, session.refreshHash);
    if (!ok) return reply.code(401).send({ error: 'invalid_refresh' });

    // Rotate: keep the same session row, swap the secret + extend expiry.
    const newSecret = randomBytes(32).toString('base64url');
    const newHash = await bcrypt.hash(newSecret, env.BCRYPT_ROUNDS);
    await sql`
      UPDATE "Session"
      SET "refreshHash" = ${newHash}, "expiresAt" = ${refreshExpiry()}
      WHERE id = ${session.id}
    `;

    const accessToken = app.jwt.sign({ sub: session.userId }, { expiresIn: env.JWT_ACCESS_TTL });
    return { token: accessToken, refreshToken: encodeRefresh(session.id, newSecret) };
  });

  app.post('/logout', async (req, reply) => {
    const body = z.object({ refreshToken: z.string().optional() }).parse(req.body ?? {});
    if (body.refreshToken) {
      const parsed = decodeRefresh(body.refreshToken);
      if (parsed) {
        await sql`UPDATE "Session" SET "revokedAt" = now() WHERE id = ${parsed.sessionId}`;
      }
    }
    return reply.code(204).send();
  });

  // ---------- OAuth (id-token verify) ----------
  // Mobile flow: client uses native Google Sign-In / Sign in with Apple to
  // obtain an ID token, then POSTs it here. Server verifies via JWKS, then
  // links/creates the local User and issues our own session — same shape as
  // /signup and /login.
  const oauthBody = z.object({ idToken: z.string().min(20) });

  async function loginViaOAuth(
    provider: 'google' | 'apple',
    claims: OAuthClaims,
    meta: { userAgent?: string | null; ipAddress?: string | null },
  ) {
    if (!claims.sub) throw new Error('oauth_missing_sub');

    // 1. Existing identity?
    const [identity] = await sql<{ userId: string }>`
      SELECT "userId" FROM "OAuthIdentity"
      WHERE provider = ${provider} AND subject = ${claims.sub}
      LIMIT 1
    `;

    let userId: string;
    let user: { id: string; email: string; displayName: string | null };

    if (identity) {
      userId = identity.userId;
      const [row] = await sql<{ id: string; email: string; displayName: string | null }>`
        SELECT id, email, "displayName" FROM "User" WHERE id = ${userId} LIMIT 1
      `;
      if (!row) throw new Error('oauth_user_missing');
      user = row;
    } else {
      // 2. Email match (link existing account) or create.
      let existing: { id: string; email: string; displayName: string | null } | undefined;
      if (claims.email) {
        const rows = await sql<{ id: string; email: string; displayName: string | null }>`
          SELECT id, email, "displayName" FROM "User" WHERE email = ${claims.email} LIMIT 1
        `;
        existing = rows[0];
      }

      const now = new Date();
      if (existing) {
        userId = existing.id;
        user = existing;
      } else {
        userId = randomUUID();
        const email = claims.email ?? `${claims.sub}@${provider}.local`;
        await withTx(async (tx) => {
          await tx.query(
            `INSERT INTO "User" (id, email, "passwordHash", "displayName", "createdAt", "updatedAt")
             VALUES ($1, $2, NULL, $3, $4, $4)`,
            [userId, email, claims.name ?? null, now],
          );
          await tx.query(
            `INSERT INTO "UserSettings" ("userId", "updatedAt") VALUES ($1, $2)`,
            [userId, now],
          );
        });
        user = { id: userId, email, displayName: claims.name ?? null };
      }

      await sql`
        INSERT INTO "OAuthIdentity" (id, "userId", provider, subject)
        VALUES (${randomUUID()}, ${userId}, ${provider}, ${claims.sub})
        ON CONFLICT (provider, subject) DO NOTHING
      `;
    }

    const accessToken = app.jwt.sign({ sub: userId }, { expiresIn: env.JWT_ACCESS_TTL });
    const { refreshToken } = await issueSession(userId, meta);
    return { token: accessToken, refreshToken, user };
  }

  app.post('/oauth/google', async (req, reply) => {
    try {
      const { idToken } = oauthBody.parse(req.body);
      const auds = env.GOOGLE_CLIENT_IDS?.split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const claims = await verifyGoogleIdToken(idToken, auds && auds.length ? auds : undefined);
      return await loginViaOAuth('google', claims, {
        userAgent: req.headers['user-agent'] ?? null,
        ipAddress: req.ip,
      });
    } catch (e) {
      app.log.warn({ err: e }, 'google_oauth_failed');
      return reply.code(401).send({ error: 'invalid_id_token' });
    }
  });

  app.post('/oauth/apple', async (req, reply) => {
    try {
      const { idToken } = oauthBody.parse(req.body);
      const auds = env.APPLE_CLIENT_IDS?.split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const claims = await verifyAppleIdToken(idToken, auds && auds.length ? auds : undefined);
      return await loginViaOAuth('apple', claims, {
        userAgent: req.headers['user-agent'] ?? null,
        ipAddress: req.ip,
      });
    } catch (e) {
      app.log.warn({ err: e }, 'apple_oauth_failed');
      return reply.code(401).send({ error: 'invalid_id_token' });
    }
  });

  app.get('/me', async (req, reply) => {
    try {
      const decoded = await req.jwtVerify<{ sub: string }>();
      const [user] = await sql<{ id: string; email: string; displayName: string | null }>`
        SELECT id, email, "displayName" FROM "User" WHERE id = ${decoded.sub} LIMIT 1
      `;
      if (!user) return reply.code(404).send({ error: 'not_found' });
      return user;
    } catch {
      return reply.code(401).send({ error: 'unauthorized' });
    }
  });
};
