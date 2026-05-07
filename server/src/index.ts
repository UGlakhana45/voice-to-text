import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import { env } from './env.js';
import { healthRoutes } from './routes/health.js';
import { authRoutes } from './routes/auth.js';
import { syncRoutes } from './routes/sync.js';
import { uploadsRoutes } from './routes/uploads.js';
import { billingRoutes } from './routes/billing.js';
import { telemetryRoutes } from './routes/telemetry.js';
import { aiRoutes } from './routes/ai.js';

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      transport:
        env.NODE_ENV === 'development'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
    },
  });

  await app.register(helmet);
  await app.register(cors, { origin: true, credentials: true });
  await app.register(rateLimit, { max: 200, timeWindow: '1 minute' });
  await app.register(jwt, { secret: env.JWT_SECRET });
  await app.register(multipart, {
    limits: { fileSize: env.AI_STT_MAX_BYTES, files: 1 },
  });

  await app.register(healthRoutes, { prefix: '/health' });
  await app.register(authRoutes, { prefix: '/auth' });
  await app.register(syncRoutes, { prefix: '/sync' });
  await app.register(uploadsRoutes, { prefix: '/uploads' });
  await app.register(billingRoutes, { prefix: '/billing' });
  await app.register(telemetryRoutes, { prefix: '/telemetry' });
  await app.register(aiRoutes, { prefix: '/ai' });

  return app;
}

async function main() {
  const app = await buildApp();
  try {
    await app.listen({ host: '0.0.0.0', port: env.PORT });
    app.log.info(`VoiceFlow backend listening on :${env.PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
