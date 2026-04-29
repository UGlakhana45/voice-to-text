/**
 * Lightweight punctuation + casing fixups for raw Whisper output.
 * The big LLM cleanup pass handles grammar; this layer is the fast path.
 */

const ABBREVIATIONS = new Set(['mr', 'mrs', 'ms', 'dr', 'st', 'vs', 'etc', 'eg', 'ie']);

export function basicPunctuate(text: string): string {
  let t = text.trim();
  if (!t) return t;

  // Capitalize first letter of each sentence
  t = t.replace(/(^|[.!?]\s+)([a-z])/g, (_m, p1: string, p2: string) => p1 + p2.toUpperCase());

  // Standalone "i" -> "I"
  t = t.replace(/\bi\b/g, 'I');

  // Ensure terminal punctuation
  if (!/[.!?]$/.test(t)) t += '.';

  // Collapse double spaces
  t = t.replace(/\s{2,}/g, ' ');

  return t;
}

export function isAbbreviation(token: string): boolean {
  return ABBREVIATIONS.has(token.replace(/\.$/, '').toLowerCase());
}
