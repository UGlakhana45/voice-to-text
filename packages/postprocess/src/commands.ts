/**
 * Voice command parser. Detects literal commands embedded in transcript and
 * returns a list of edit ops to apply to the working buffer.
 */

export type CommandOp =
  | { type: 'newline' }
  | { type: 'paragraph' }
  | { type: 'period' }
  | { type: 'comma' }
  | { type: 'question' }
  | { type: 'capsOn' }
  | { type: 'capsOff' }
  | { type: 'deleteWord' }
  | { type: 'deleteSentence' }
  | { type: 'send' }
  | { type: 'literal'; text: string };

const PATTERNS: Array<[RegExp, CommandOp]> = [
  [/\bnew line\b/i, { type: 'newline' }],
  [/\bnew paragraph\b/i, { type: 'paragraph' }],
  [/\bperiod\b/i, { type: 'period' }],
  [/\bcomma\b/i, { type: 'comma' }],
  [/\bquestion mark\b/i, { type: 'question' }],
  [/\bcaps on\b/i, { type: 'capsOn' }],
  [/\bcaps off\b/i, { type: 'capsOff' }],
  [/\bdelete (?:that|word)\b/i, { type: 'deleteWord' }],
  [/\bdelete (?:sentence|line)\b/i, { type: 'deleteSentence' }],
  [/\bsend (?:it|message)\b/i, { type: 'send' }],
];

export interface ApplyResult {
  /** Final formatted text after applying ops. */
  text: string;
  /** Side-effect requests the UI must handle (e.g. dispatch send). */
  sideEffects: Array<'send'>;
}

/**
 * Reduce a list of ops into a finalized text string + side-effect signals.
 * Handles formatting ops (newline, period, …) and edit ops (deleteWord,
 * deleteSentence). Caps state is local to the reducer.
 */
export function applyCommandOps(ops: CommandOp[]): ApplyResult {
  let buf = '';
  let caps = false;
  const side: ApplyResult['sideEffects'] = [];

  const append = (s: string) => {
    if (!s) return;
    const needsSpace = buf.length > 0 && !/\s$/.test(buf) && !/^[.,?!]/.test(s);
    buf += (needsSpace ? ' ' : '') + s;
  };

  for (const op of ops) {
    switch (op.type) {
      case 'literal':
        append(caps ? op.text.toUpperCase() : op.text);
        break;
      case 'newline':
        buf = buf.replace(/\s+$/, '') + '\n';
        break;
      case 'paragraph':
        buf = buf.replace(/\s+$/, '') + '\n\n';
        break;
      case 'period':
        buf = buf.replace(/\s+$/, '') + '.';
        break;
      case 'comma':
        buf = buf.replace(/\s+$/, '') + ',';
        break;
      case 'question':
        buf = buf.replace(/\s+$/, '') + '?';
        break;
      case 'capsOn':
        caps = true;
        break;
      case 'capsOff':
        caps = false;
        break;
      case 'deleteWord':
        buf = buf.replace(/\s*\S+\s*$/, '');
        break;
      case 'deleteSentence':
        buf = buf.replace(/[^.!?\n]*[.!?\n]?\s*$/, '');
        break;
      case 'send':
        side.push('send');
        break;
    }
  }

  return { text: buf.trim(), sideEffects: side };
}

export function parseCommands(text: string): CommandOp[] {
  let remaining = text;
  const ops: CommandOp[] = [];

  while (remaining.length > 0) {
    let bestIdx = -1;
    let bestOp: CommandOp | null = null;
    let bestLen = 0;

    for (const [re, op] of PATTERNS) {
      const m = remaining.match(re);
      if (m && m.index !== undefined && (bestIdx === -1 || m.index < bestIdx)) {
        bestIdx = m.index;
        bestOp = op;
        bestLen = m[0].length;
      }
    }

    if (bestOp === null) {
      const lit = remaining.trim();
      if (lit) ops.push({ type: 'literal', text: lit });
      break;
    }

    const before = remaining.slice(0, bestIdx).trim();
    if (before) ops.push({ type: 'literal', text: before });
    ops.push(bestOp);
    remaining = remaining.slice(bestIdx + bestLen);
  }

  return ops;
}
