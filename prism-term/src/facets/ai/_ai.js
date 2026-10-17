// Shared bits for the AI gallery: token-ish streaming, paragraph wrapping,
// the "thinking" glyph cycle and a shimmer color sweep.
export * from '../callouts/_kit.js';
import { uni, mix } from '../callouts/_kit.js';
import { wrap } from '../../width.js';

/** Split text into LLM-ish tokens: words with their leading space, punctuation on its own. */
export function tokenize(text) {
  return String(text).match(/\s*[A-Za-z]{1,6}|\s*\d{1,3}|\s*[^\sA-Za-z\d]|\s+/g) || [];
}

/** Reveal `text` token by token at `tps` tokens/second from `start`. */
export function reveal(text, t, start = 0, tps = 30) {
  const toks = tokenize(text);
  const n = Math.max(0, Math.min(toks.length, Math.floor((t - start) * tps)));
  return { text: toks.slice(0, n).join(''), n, total: toks.length, done: n >= toks.length, last: n ? toks[n - 1] : '' };
}

/** Word-wrap keeping paragraph breaks ('\n'). */
export const wrapLines = (text, w) => wrap(text, Math.max(1, w));

const SPIN_U = ['·', '✢', '✳', '✶', '✻', '✽', '✻', '✶', '✳', '✢'];
const SPIN_A = ['.', '+', '*', 'x', '*', '+'];
/** The breathing asterisk used for "thinking" (· ✢ ✳ ✶ ✻ ✽ …). */
export const thinkGlyph = (ctx, t) => {
  const s = uni(ctx) ? SPIN_U : SPIN_A;
  return s[Math.floor(t * 8) % s.length];
};

/** Color for character i of an n-char label under a shimmer band sweeping every `period` seconds. */
export function shimmer(base, hi, i, n, t, period = 1.8, width = 4) {
  const head = ((t % period) / period) * (n + width * 2) - width;
  const d = Math.abs(i - head);
  return d < width ? mix(base, hi, 1 - d / width) : base;
}
