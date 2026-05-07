import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { env } from '../env.js';

/**
 * AI proxy routes.
 *
 * The mobile app can either:
 *   1. call OpenAI / Groq directly with a user-supplied API key, or
 *   2. call these routes, which forward to the same providers using a
 *      server-side key, so the user never has to bring their own.
 *
 * All routes require a valid VoiceFlow JWT and are gated behind
 * AI_PROXY_ENABLED so the feature can be disabled in self-hosted setups.
 */

type SttProvider = 'openai' | 'groq';
type LlmProvider = 'openai' | 'groq';

const STT_CONFIG: Record<SttProvider, { base: string; model: string }> = {
  openai: { base: 'https://api.openai.com/v1', model: 'whisper-1' },
  groq: { base: 'https://api.groq.com/openai/v1', model: 'whisper-large-v3-turbo' },
};

const LLM_CONFIG: Record<LlmProvider, { base: string; model: string }> = {
  openai: { base: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  groq: { base: 'https://api.groq.com/openai/v1', model: 'llama-3.1-8b-instant' },
};

function sttKey(): string | undefined {
  return env.AI_STT_PROVIDER === 'openai' ? env.OPENAI_API_KEY : env.GROQ_API_KEY;
}
function llmKey(): string | undefined {
  return env.AI_LLM_PROVIDER === 'openai' ? env.OPENAI_API_KEY : env.GROQ_API_KEY;
}

async function requireUser(req: FastifyRequest): Promise<string> {
  const decoded = await req.jwtVerify<{ sub: string }>();
  return decoded.sub;
}

const translateBody = z.object({
  text: z.string().min(1).max(20_000),
  targetLanguage: z.string().min(2).max(40),
  tone: z.string().max(40).optional(),
});

const cleanupBody = z.object({
  text: z.string().min(1).max(20_000),
  tone: z.string().max(40).optional(),
});

export const aiRoutes: FastifyPluginAsync = async (app) => {
  if (!env.AI_PROXY_ENABLED) {
    app.log.info('[ai] AI_PROXY_ENABLED=false — /ai routes disabled');
    app.all('/*', async (_req, reply) =>
      reply.code(503).send({ error: 'ai_proxy_disabled' }),
    );
    return;
  }

  // Tighter rate-limit on AI routes than the global default.
  await app.register(import('@fastify/rate-limit'), {
    max: 30,
    timeWindow: '1 minute',
    keyGenerator: (req) => {
      // Prefer user id from JWT; fall back to IP.
      const auth = req.headers.authorization;
      if (auth?.startsWith('Bearer ')) return auth.slice(7, 64);
      return req.ip;
    },
  });

  /**
   * POST /ai/stt
   * Multipart: file (audio), language?, prompt?, translate? ("true"|"false")
   * Returns: { text, provider, model, translated }
   */
  app.post('/stt', async (req, reply) => {
    let userId: string;
    try {
      userId = await requireUser(req);
    } catch {
      return reply.code(401).send({ error: 'unauthorized' });
    }

    const key = sttKey();
    if (!key) {
      return reply.code(500).send({ error: 'stt_provider_not_configured' });
    }

    const parts = req.parts();
    let audioBuf: Buffer | null = null;
    let audioMime = 'audio/wav';
    let audioName = 'audio.wav';
    let language: string | undefined;
    let prompt: string | undefined;
    let translate = false;

    try {
      for await (const part of parts) {
        if (part.type === 'file' && part.fieldname === 'file') {
          audioMime = part.mimetype || audioMime;
          audioName = part.filename || audioName;
          audioBuf = await part.toBuffer();
          if (audioBuf.byteLength > env.AI_STT_MAX_BYTES) {
            return reply.code(413).send({ error: 'audio_too_large' });
          }
        } else if (part.type === 'field') {
          const value = String(part.value ?? '');
          if (part.fieldname === 'language') language = value || undefined;
          else if (part.fieldname === 'prompt') prompt = value || undefined;
          else if (part.fieldname === 'translate') translate = value === 'true';
        }
      }
    } catch (err) {
      req.log.warn({ err }, '[ai/stt] multipart parse failed');
      return reply.code(400).send({ error: 'invalid_multipart' });
    }

    if (!audioBuf || audioBuf.byteLength === 0) {
      return reply.code(400).send({ error: 'audio_required' });
    }

    const provider = env.AI_STT_PROVIDER;
    const cfg = STT_CONFIG[provider];
    const endpoint = translate ? '/audio/translations' : '/audio/transcriptions';

    // Re-build a multipart body for the upstream provider.
    const upstream = new FormData();
    upstream.append(
      'file',
      new Blob([audioBuf], { type: audioMime }),
      audioName,
    );
    upstream.append('model', cfg.model);
    if (language && !translate) upstream.append('language', language);
    if (prompt) upstream.append('prompt', prompt);
    upstream.append('response_format', 'json');

    const t0 = Date.now();
    const resp = await fetch(`${cfg.base}${endpoint}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: upstream,
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      req.log.warn(
        { status: resp.status, provider, userId, body: text.slice(0, 500) },
        '[ai/stt] upstream error',
      );
      return reply.code(502).send({ error: 'upstream_error', status: resp.status });
    }

    const data = (await resp.json()) as { text?: string };
    return {
      text: data.text ?? '',
      provider,
      model: cfg.model,
      translated: translate,
      latencyMs: Date.now() - t0,
    };
  });

  /**
   * POST /ai/translate
   * Body: { text, targetLanguage, tone? }
   */
  app.post('/translate', async (req, reply) => {
    try {
      await requireUser(req);
    } catch {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    const parsed = translateBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_body', details: parsed.error.issues });
    }
    const key = llmKey();
    if (!key) return reply.code(500).send({ error: 'llm_provider_not_configured' });

    const { text, targetLanguage, tone } = parsed.data;
    const provider = env.AI_LLM_PROVIDER;
    const cfg = LLM_CONFIG[provider];

    const system =
      `You are a professional translator. Translate the user's transcript ` +
      `into ${targetLanguage}. Preserve meaning, names, numbers and formatting. ` +
      (tone ? `Match a ${tone} tone. ` : '') +
      `Reply with the translation only — no preamble, no quotes.`;

    const result = await chatComplete(cfg, key, system, text);
    if ('error' in result) {
      req.log.warn({ ...result }, '[ai/translate] upstream error');
      return reply.code(502).send({ error: 'upstream_error', status: result.status });
    }
    return { text: result.text, provider, model: cfg.model };
  });

  /**
   * POST /ai/cleanup
   * Body: { text, tone? }
   * Adds punctuation, fixes grammar, lightly polishes the transcript.
   */
  app.post('/cleanup', async (req, reply) => {
    try {
      await requireUser(req);
    } catch {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    const parsed = cleanupBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_body', details: parsed.error.issues });
    }
    const key = llmKey();
    if (!key) return reply.code(500).send({ error: 'llm_provider_not_configured' });

    const { text, tone } = parsed.data;
    const provider = env.AI_LLM_PROVIDER;
    const cfg = LLM_CONFIG[provider];

    const system =
      `You clean up raw speech-to-text transcripts. Add correct punctuation ` +
      `and capitalisation, fix obvious grammar, remove filler words ` +
      `("um", "uh", repeated words), but keep the speaker's voice and meaning. ` +
      (tone ? `Match a ${tone} tone. ` : '') +
      `Reply with the cleaned text only — no preamble, no quotes.`;

    const result = await chatComplete(cfg, key, system, text);
    if ('error' in result) {
      req.log.warn({ ...result }, '[ai/cleanup] upstream error');
      return reply.code(502).send({ error: 'upstream_error', status: result.status });
    }
    return { text: result.text, provider, model: cfg.model };
  });
};

interface ChatOk {
  text: string;
}
interface ChatErr {
  error: 'upstream_error';
  status: number;
  body: string;
}

async function chatComplete(
  cfg: { base: string; model: string },
  apiKey: string,
  system: string,
  user: string,
): Promise<ChatOk | ChatErr> {
  const resp = await fetch(`${cfg.base}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: cfg.model,
      temperature: 0.2,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    return { error: 'upstream_error', status: resp.status, body: body.slice(0, 500) };
  }
  const data = (await resp.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return { text: data.choices?.[0]?.message?.content?.trim() ?? '' };
}
