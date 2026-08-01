// CSS helpers: split into rules, dedupe, merge, and lightly validate.
//
// The composition goal (per JFH-6): "automatically deduplicates tokens, merges CSS,
// validates output" and the composed bundle should be measurably smaller than a naive
// concatenation with zero duplicate rules.

/**
 * Split a CSS string into top-level rule blocks, preserving @-rules (which can nest
 * braces, e.g. @keyframes / @media). Comments are stripped. Returns an array of
 * { key, text } where key is a normalized signature used for dedup.
 */
export function splitRules(css) {
  if (!css) return [];
  const src = stripComments(css);
  const rules = [];
  let depth = 0;
  let buf = '';
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    buf += ch;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        const text = buf.trim();
        if (text) rules.push({ key: signature(text), text });
        buf = '';
      }
    }
  }
  // Trailing content without braces (rare / malformed) — keep it so nothing is silently lost.
  const tail = buf.trim();
  if (tail) rules.push({ key: signature(tail), text: tail });
  return rules;
}

export function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Normalize whitespace so semantically identical rules dedupe even if formatted differently. */
export function signature(rule) {
  return rule
    .replace(/\s+/g, ' ')
    .replace(/\s*([{}:;,])\s*/g, '$1')
    .replace(/;}/g, '}')
    .trim();
}

/**
 * Dedupe + merge multiple CSS sources into one bundle, preserving first-seen order.
 * Returns { css, rulesIn, rulesOut, duplicatesRemoved }.
 */
export function dedupeCss(sources) {
  const seen = new Set();
  const out = [];
  let rulesIn = 0;
  for (const src of sources) {
    for (const rule of splitRules(src)) {
      rulesIn++;
      if (seen.has(rule.key)) continue;
      seen.add(rule.key);
      out.push(rule.text);
    }
  }
  return {
    css: out.join('\n'),
    rulesIn,
    rulesOut: out.length,
    duplicatesRemoved: rulesIn - out.length,
  };
}

/**
 * Merge :root token declarations. Multiple :root blocks are collapsed into one, with
 * later declarations winning on conflict. Non-:root rules pass through untouched.
 * Returns { css, tokensMerged }.
 */
export function mergeRootTokens(css) {
  const rules = splitRules(css);
  const rootDecls = new Map(); // property -> value (last wins)
  const passthrough = [];
  let rootCount = 0;
  for (const { text } of rules) {
    const m = /^:root\s*\{([\s\S]*)\}$/.exec(text.replace(/\s+/g, ' ').trim());
    if (m) {
      rootCount++;
      for (const decl of m[1].split(';')) {
        const idx = decl.indexOf(':');
        if (idx === -1) continue;
        const prop = decl.slice(0, idx).trim();
        const val = decl.slice(idx + 1).trim();
        if (prop) rootDecls.set(prop, val);
      }
    } else {
      passthrough.push(text);
    }
  }
  const parts = [];
  if (rootDecls.size) {
    const body = Array.from(rootDecls.entries()).map(([p, v]) => `${p}:${v}`).join(';');
    parts.push(`:root{${body}}`);
  }
  parts.push(...passthrough);
  return {
    css: parts.join('\n'),
    tokensMerged: rootDecls.size,
    rootBlocksCollapsed: rootCount,
  };
}

/**
 * Lightweight structural validation of a CSS string. This is not a full parser; it
 * catches the mistakes that actually break embedded facets: unbalanced braces,
 * stray closing braces, and unterminated rules.
 */
export function validateCss(css) {
  const errors = [];
  const warnings = [];
  const src = stripComments(css || '');
  let depth = 0;
  for (let i = 0; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth < 0) { errors.push('Unbalanced CSS: stray closing brace "}"'); depth = 0; }
    }
  }
  if (depth > 0) errors.push(`Unbalanced CSS: ${depth} unclosed "{" block(s)`);
  // Content after the last "}" that contains a "{" implies an unterminated rule.
  const lastClose = src.lastIndexOf('}');
  const tail = (lastClose === -1 ? src : src.slice(lastClose + 1)).trim();
  if (tail && tail.includes('{')) warnings.push('Trailing content after last rule looks unterminated');
  return { valid: errors.length === 0, errors, warnings };
}

/** Collect the set of CSS custom properties (--x) referenced via var(). */
export function referencedTokens(css) {
  const set = new Set();
  const re = /var\(\s*(--[a-zA-Z0-9_-]+)/g;
  let m;
  while ((m = re.exec(css || '')) !== null) set.add(m[1]);
  return set;
}

/** Collect the set of CSS custom properties (--x) that are DEFINED (declared). */
export function definedTokens(css) {
  const set = new Set();
  const re = /(--[a-zA-Z0-9_-]+)\s*:/g;
  let m;
  while ((m = re.exec(css || '')) !== null) set.add(m[1]);
  return set;
}
