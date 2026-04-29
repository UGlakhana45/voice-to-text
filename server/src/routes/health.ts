import type { FastifyPluginAsync } from 'fastify';
import { sql } from '../db.js';

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async () => ({ status: 'ok', service: 'voiceflow', ts: Date.now() }));

  app.get('/db', async () => {
    await sql`SELECT 1`;
    return { db: 'ok' };
  });
};
