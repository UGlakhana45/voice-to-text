import type { ToneMode } from 'voiceflow-shared-types';

/**
 * Prompt templates for on-device LLM cleanup. Kept minimal so they fit easily
 * inside small-context models (Gemma-2B, Phi-3-mini). The native module passes
 * `buildPrompt(raw, tone)` straight to llama.cpp's `llama_decode`.
 *
 * Conventions:
 * - Each template ends with the literal token "OUTPUT:" so the runtime can
 *   stop generation at the next "\n\n" or EOS.
 * - Instructions explicitly forbid adding content the user did not say. This
 *   curbs the most common failure mode of small models (hallucinated detail).
 */

const SHARED_RULES = [
  'Rewrite the transcript below.',
  'Fix punctuation, capitalization, and obvious filler words ("um", "uh", "like").',
  'Do NOT add facts, opinions, names, dates, or details that are not in the input.',
  'Preserve the speaker\'s meaning and length; do not summarize.',
  'Output only the rewritten text — no preface, no quotes, no explanation.',
].join(' ');

const TONE_GUIDANCE: Record<ToneMode, string> = {
  neutral: 'Use a clear, neutral tone.',
  casual: 'Use a relaxed, conversational tone with contractions.',
  formal: 'Use a polished, formal tone. Avoid contractions and slang.',
  email:
    'Format as a short professional email body. Keep paragraphs tight; no greeting or sign-off unless the speaker said one.',
  slack:
    'Format for Slack: brief, direct, casual. Use line breaks for separate thoughts. No emoji unless the speaker mentioned them.',
  notes:
    'Format as concise bullet points capturing the key items. Each bullet starts with "- ".',
};

export function buildCleanupPrompt(rawText: string, tone: ToneMode): string {
  const tg = TONE_GUIDANCE[tone] ?? TONE_GUIDANCE.neutral;
  return [
    `${SHARED_RULES} ${tg}`,
    '',
    'INPUT:',
    rawText.trim(),
    '',
    'OUTPUT:',
  ].join('\n');
}

/**
 * Lightweight JS fallback used when the on-device LLM is unavailable
 * (simulator, tests, or before model download). Only does deterministic
 * cleanups — does NOT attempt tone rewriting.
 */
export function fallbackCleanup(rawText: string): string {
  return rawText
    .replace(/\b(um+|uh+|er+|ah+)\b[,]?\s*/gi, '')
    .replace(/\b(like|you know|i mean)\b[,]?\s*/gi, (m, p) => (p === 'like' ? m : ''))
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export const TONES: ToneMode[] = ['neutral', 'casual', 'formal', 'email', 'slack', 'notes'];
