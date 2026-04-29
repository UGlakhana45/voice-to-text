import type { FastifyPluginAsync } from 'fastify';
import { env } from '../env.js';

// Stub for v1 — billing disabled. Architecture-ready for RevenueCat or Stripe later.
export const billingRoutes: FastifyPluginAsync = async (app) => {
  app.get('/status', async () => ({ enabled: env.BILLING_ENABLED }));

  app.post('/webhook', async (_req, reply) => {
    if (!env.BILLING_ENABLED) return reply.code(503).send({ error: 'billing_disabled' });
    return { received: true };
  });
};
