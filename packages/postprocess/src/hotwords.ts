/**
 * Hotword biasing for proper nouns / jargon. Generates an initial-prompt
 * string fed to Whisper to nudge tokenization toward known terms.
 */

export interface Hotword {
  term: string;
  weight?: number;
}

export function buildInitialPrompt(hotwords: Hotword[]): string {
  if (!hotwords.length) return '';
  const sorted = [...hotwords].sort((a, b) => (b.weight ?? 1) - (a.weight ?? 1));
  return sorted.map((h) => h.term).join(', ');
}
