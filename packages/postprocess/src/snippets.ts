/**
 * Text snippet expansion. Triggers like "myaddr" expand to stored full text.
 */

export interface SnippetMap {
  [trigger: string]: string;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Replaces each trigger in `text` with its expansion. Triggers are matched
 * with surrounding non-word boundaries (so `;gm` matches but the literal
 * substring inside `;gmail` does not). Iterates triggers longest-first to
 * avoid prefix collisions between e.g. `;g` and `;gm`.
 */
export function expandSnippets(text: string, snippets: SnippetMap): string {
  const triggers = Object.keys(snippets).sort((a, b) => b.length - a.length);
  if (triggers.length === 0) return text;
  let out = text;
  for (const t of triggers) {
    const re = new RegExp(`(^|\\W)${escapeRegex(t)}(?=$|\\W)`, 'g');
    out = out.replace(re, (_m, pre: string) => `${pre}${snippets[t]}`);
  }
  return out;
}
