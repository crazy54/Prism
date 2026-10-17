// Unread-count parsing from tab titles (browser.md §3.2).
// Returns a count (>= 1), -1 for "activity without a count" (shown as a dot), or null.

const PATTERNS = [
  /^\((\d{1,4})\+?\)\s/,      // "(3) Inbox"
  /^\[(\d{1,4})\+?\]\s/,      // "[12] Chat"
  /\((\d{1,4})\+?\)\s*$/,     // "Inbox (3)"
  /^(\d{1,4})\+?\s[|·•-]\s/,  // "3 | Messages"
];
const DOT = /^[*!•●]\s/;

/**
 * Site rules run first (keyed by registrable domain). Each returns a number, -1, null (no unread),
 * or undefined (fall through to the generic patterns). Fictional examples only; real-site rules
 * are added as they are verified.
 */
const SITE_RULES = {
  'mail.example': (t) => {
    const m = /\((\d{1,5})\)/.exec(t);
    return m ? Number(m[1]) : null;
  },
};

export function parseUnread(title, domain) {
  if (typeof title !== 'string' || title.length === 0) return null;
  const rule = domain && SITE_RULES[domain];
  if (rule) {
    const r = rule(title);
    if (r !== undefined) return r === 0 ? null : r;
  }
  for (const re of PATTERNS) {
    const m = re.exec(title);
    if (m) {
      const n = Number(m[1]);
      return n > 0 ? n : null;
    }
  }
  if (DOT.test(title)) return -1;
  return null;
}
