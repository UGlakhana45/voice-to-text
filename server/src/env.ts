import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  LOG_LEVEL: z.string().default('info'),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string().default('us-east-1'),
  S3_ACCESS_KEY: z.string(),
  S3_SECRET_KEY: z.string(),
  S3_BUCKET: z.string(),
  S3_FORCE_PATH_STYLE: z.coerce.boolean().default(true),

  JWT_SECRET: z.string().min(16),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),
  BCRYPT_ROUNDS: z.coerce.number().default(10),

  BILLING_ENABLED: z.coerce.boolean().default(false),
  TELEMETRY_ENABLED: z.coerce.boolean().default(false),

  // --- AI proxy ---
  // When set, /ai/* routes become available and proxy STT/translation/cleanup
  // calls to the configured provider using a server-side key, so end users
  // never need to bring their own.
  AI_PROXY_ENABLED: z.coerce.boolean().default(false),
  AI_STT_PROVIDER: z.enum(['openai', 'groq']).default('groq'),
  AI_LLM_PROVIDER: z.enum(['openai', 'groq']).default('groq'),
  OPENAI_API_KEY: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
  // Max audio bytes accepted by /ai/stt. Default ~20 MB.
  AI_STT_MAX_BYTES: z.coerce.number().default(20 * 1024 * 1024),

  // OAuth (optional). Comma-separated client IDs to accept as `aud`.
  // When unset, signature + issuer are still verified but `aud` is not enforced.
  GOOGLE_CLIENT_IDS: z.string().optional(),
  APPLE_CLIENT_IDS: z.string().optional(),
});

export const env = schema.parse(process.env);
export type Env = typeof env;
