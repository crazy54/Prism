// Day / Night auto-detection — pick Prism Day on light-background terminals.
//
// Order (first answer wins):
//   1. an explicit theme (--theme) — the caller passes it and never asks us
//   2. PRISM_TERM_THEME=<theme id> | day | light | night | dark | auto
//   3. COLORFGBG (rxvt, Konsole, iTerm2, …): "fg;bg" or "fg;default;bg" ANSI indexes
//   4. an OSC 11 background-color query (async, opt-in via detectTheme())
//   5. Prism Night (the default)
//
// Signals 3–4 describe the terminal we draw on, so they are used only when stdout
// is a TTY and not in CI: pipes, `> file`, curl-site and catalog builds stay
// deterministic. The OSC 11 query additionally needs stdin to be a TTY in cooked
// mode; it is bounded by a short timeout, pairs the query with a DA1 request (which
// every terminal answers, in order) so terminals that ignore OSC 11 end the wait
// at once, swallows the replies so nothing reaches the shell, and hands any keys
// typed meanwhile back to stdin.
//
// Browser-safe: no node:* imports; `process` is read through globalThis.

import { toOklab } from './color.js';

/** OKLab lightness above which a background counts as light (tokens: L(bg) > 0.6 → Day). */
export const LIGHT_L = 0.6;

const ALIASES = { day: 'light', light: 'light', night: 'dark', dark: 'dark' };
const proc = () => globalThis.process;

/** 'light' | 'dark' for a packed background color. */
export function modeOfColor(c) {
  return toOklab(c & 0xffffff)[0] > LIGHT_L ? 'light' : 'dark';
}

/**
 * Parse COLORFGBG. The last field is the background ANSI index: 7 and 9–15 are
 * light backgrounds, 0–6 and 8 dark (the vim / rxvt reading). 'default' or junk → null.
 */
export function parseColorFgBg(v) {
  if (typeof v !== 'string' || !v.trim()) return null;
  const last = v.trim().split(';').pop().trim();
  if (!/^\d{1,3}$/.test(last)) return null;
  const n = Number(last);
  if (n > 15) return null;
  return n === 7 || n >= 9 ? 'light' : 'dark';
}

/**
 * Parse an OSC 10/11 color reply (or just its payload) into a packed color:
 * `ESC ] 11 ; rgb:RRRR/GGGG/BBBB (BEL | ESC \)`, also rgba:…, #rgb, #rrggbb, #rrrrggggbbbb.
 * Each component may have 1–4 hex digits (scaled to 8 bits). Returns null if unparseable.
 */
export function parseOscColor(reply) {
  if (typeof reply !== 'string') return null;
  const m = reply.match(/(?:\x1b\]1[01];)?(rgba?:[0-9a-f/]+|#[0-9a-f]+)/i);
  if (!m) return null;
  const spec = m[1];
  let parts;
  if (spec[0] === '#') {
    const h = spec.slice(1);
    if (h.length % 3 || h.length < 3 || h.length > 12) return null;
    const n = h.length / 3;
    parts = [h.slice(0, n), h.slice(n, 2 * n), h.slice(2 * n)];
  } else {
    parts = spec.slice(spec.indexOf(':') + 1).split('/').slice(0, 3);
  }
  if (parts.length !== 3 || !parts.every((p) => /^[0-9a-f]{1,4}$/i.test(p))) return null;
  const [r, g, b] = parts.map((p) => Math.round((parseInt(p, 16) / (16 ** p.length - 1)) * 255));
  return (r << 16) | (g << 8) | b;
}

/** The theme id for a mode within a design-system family (default: Prism). */
export function themeForMode(mode, family = 'prism') {
  return `${family}-${mode === 'light' ? 'light' : 'dark'}`;
}

const isCI = (env) => !!(env.CI || env.CONTINUOUS_INTEGRATION || env.BUILD_NUMBER || env.GITHUB_ACTIONS || env.TF_BUILD);

/**
 * Synchronous detection from the environment (steps 2–3).
 * @returns {{ id?: string, mode: 'light'|'dark', source: string } | null}
 *          id is set only for an explicit PRISM_TERM_THEME theme id.
 */
export function detectThemeSync({ env = proc()?.env || {}, stdout = proc()?.stdout } = {}) {
  const want = String(env.PRISM_TERM_THEME || '').trim().toLowerCase();
  if (want && want !== 'auto') {
    if (ALIASES[want]) return { mode: ALIASES[want], source: 'PRISM_TERM_THEME' };
    return { id: want, mode: /-light$/.test(want) ? 'light' : 'dark', source: 'PRISM_TERM_THEME' };
  }
  if (!stdout || !stdout.isTTY || isCI(env)) return null;
  const mode = parseColorFgBg(env.COLORFGBG);
  return mode ? { mode, source: 'COLORFGBG' } : null;
}

/** Can we ask this terminal for its background (step 4)? */
export function canQueryBackground({ env = proc()?.env || {}, stdin = proc()?.stdin, stdout = proc()?.stdout } = {}) {
  if (!stdin || !stdout || !stdin.isTTY || !stdout.isTTY) return false;
  if (typeof stdin.setRawMode !== 'function' || stdin.isRaw) return false; // someone else owns stdin
  if (isCI(env) || /^(1|true|yes)$/i.test(env.PRISM_TERM_NO_QUERY || '')) return false;
  const term = env.TERM || '';
  if (term === 'dumb' || term === 'linux' || /^(vt[0-9]|cons)/.test(term)) return false; // consoles that never answer
  return true;
}

const OSC11_REPLY = /\x1b\]11;([^\x07\x1b]*)(?:\x07|\x1b\\)/;
const DA1_REPLY = /\x1b\[\?[0-9;]*c/;

/**
 * Ask the terminal for its background color (OSC 11). Resolves to a packed color,
 * or null on timeout / no answer / not a TTY. Never rejects, never leaves stdin raw.
 * @param {object} o { stdin, stdout, env, platform, timeout (ms, default 100 or PRISM_TERM_QUERY_MS) }
 */
export function queryBackground({ stdin = proc()?.stdin, stdout = proc()?.stdout, env = proc()?.env || {}, platform = proc()?.platform || '', timeout } = {}) {
  if (!canQueryBackground({ env, stdin, stdout })) return Promise.resolve(null);
  const ms = Math.max(10, Math.min(1000, Number(timeout ?? env.PRISM_TERM_QUERY_MS ?? 100) || 100));
  // Windows' ConPTY answers DA1 itself, possibly before the terminal answers OSC 11,
  // so there only the OSC reply (or the timeout) ends the wait.
  const sentinel = platform !== 'win32';
  return new Promise((resolve) => {
    let buf = '', done = false, timer = null;
    const finish = (color) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      stdin.removeListener('data', onData);
      try { stdin.setRawMode(false); } catch { /* stream closed */ }
      stdin.pause();
      // Keys typed during the query go back to whoever reads stdin next.
      const rest = buf.replace(OSC11_REPLY, '').replace(DA1_REPLY, '');
      if (rest && typeof stdin.unshift === 'function' && globalThis.Buffer) { try { stdin.unshift(globalThis.Buffer.from(rest, 'latin1')); } catch { /* ignore */ } }
      resolve(color);
    };
    const onData = (chunk) => {
      buf += typeof chunk === 'string' ? chunk : chunk.toString('latin1');
      const osc = buf.match(OSC11_REPLY);
      if (osc && (!sentinel || DA1_REPLY.test(buf.slice(osc.index + osc[0].length)))) return finish(parseOscColor(osc[1]));
      if (!osc && sentinel && DA1_REPLY.test(buf)) return finish(null); // answered DA1 only: no OSC 11 support
    };
    try {
      stdin.setRawMode(true);
      stdin.on('data', onData);
      stdin.resume();
      timer = setTimeout(() => finish(buf.match(OSC11_REPLY) ? parseOscColor(buf.match(OSC11_REPLY)[1]) : null), ms);
      stdout.write(sentinel ? '\x1b]11;?\x1b\\\x1b[c' : '\x1b]11;?\x1b\\');
    } catch {
      finish(null);
    }
  });
}

// ── cached result, consumed by palettes.getTheme() for its default ───────────
let detected; // undefined = not computed; null = nothing found

/**
 * Full detection (steps 2–4), cached for getTheme()'s default. Call once at
 * startup (before rendering) from a CLI; skips the query for pipes / CI.
 * @returns {Promise<{ id: string, mode: 'light'|'dark', source: string }>}
 */
export async function detectTheme(o = {}) {
  const sync = detectThemeSync(o);
  if (sync) return (detected = { id: sync.id || themeForMode(sync.mode, o.family), mode: sync.mode, source: sync.source });
  const bg = await queryBackground(o);
  if (bg != null) {
    const mode = modeOfColor(bg);
    return (detected = { id: themeForMode(mode, o.family), mode, source: 'OSC 11', background: bg });
  }
  detected = null;
  return { id: themeForMode('dark', o.family), mode: 'dark', source: 'default' };
}

/** The detected { id, mode, source } (sync detection if detectTheme() hasn't run), or null. */
export function detectedTheme() {
  if (detected === undefined) {
    const sync = detectThemeSync();
    detected = sync ? { id: sync.id || themeForMode(sync.mode), mode: sync.mode, source: sync.source } : null;
  }
  return detected;
}

/** Forget the cached result (tests, or after the terminal changes). Pass a value to set it. */
export function resetThemeDetection(value) { detected = value; }
