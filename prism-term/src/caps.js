// Terminal capability detection.
//
// Answers three questions the renderer cares about:
//   depth    — 'truecolor' | '256' | '16' | 'mono'
//   unicode  — can we draw braille / block elements / box drawing?
//   sextant  — does the font have the Unicode 13 "Symbols for Legacy Computing"
//              2×3 block glyphs (U+1FB00…)? Only assumed for terminals known to
//              ship or synthesize them; everything else falls back to quadrants.
//
// Environment overrides (handy in CI, tmux, or exotic terminals):
//   NO_COLOR=1                    → mono
//   FORCE_COLOR=0|1|2|3           → mono | 16 | 256 | truecolor
//   PRISM_TERM_DEPTH=truecolor|256|16|mono
//   PRISM_TERM_UNICODE=0|1, PRISM_TERM_SEXTANT=0|1

import { normalizeDepth } from './color.js';

// node:os is only needed for the Windows build check; loading it lazily keeps
// this module importable in browsers (the web catalog runs the same engine).
const os = globalThis.process?.versions?.node ? (await import('node:os')).default : null;

const TRUECOLOR_PROGRAMS = new Set(['iTerm.app', 'WezTerm', 'vscode', 'ghostty', 'Hyper', 'Tabby', 'rio', 'WarpTerminal', 'Orca']);
const TRUECOLOR_TERMS = /^(xterm-kitty|xterm-ghostty|alacritty|foot|wezterm|contour|rio)/;
// Terminals that render sextants (bundled font coverage or built-in box/legacy-glyph rasterizers).
const SEXTANT_PROGRAMS = new Set(['WezTerm', 'vscode', 'ghostty', 'rio']);
const SEXTANT_TERMS = /^(xterm-kitty|xterm-ghostty|foot|wezterm|contour)/;

function windowsBuild() {
  if (!os) return 0;
  const parts = os.release().split('.');
  return Number(parts[2]) || 0;
}

function flag(v) {
  if (v === undefined || v === '') return undefined;
  return !/^(0|false|no|off)$/i.test(v);
}

/**
 * Detect capabilities of an output stream.
 * @param {object} opts { stream, env, platform }
 */
export function detect({ stream = process.stdout, env = process.env, platform = process.platform } = {}) {
  const isTTY = !!(stream && stream.isTTY);
  const program = env.TERM_PROGRAM || (env.WT_SESSION ? 'WindowsTerminal' : '') || '';
  const term = env.TERM || '';

  let depth;
  if (env.PRISM_TERM_DEPTH) depth = normalizeDepth(env.PRISM_TERM_DEPTH);
  else if (env.FORCE_COLOR !== undefined && env.FORCE_COLOR !== '') {
    const f = env.FORCE_COLOR === 'true' ? '1' : env.FORCE_COLOR;
    depth = ['mono', '16', '256', 'truecolor'][Math.min(3, Math.max(0, parseInt(f, 10) || 0))];
  } else if (env.NO_COLOR) depth = 'mono';
  else if (!isTTY) depth = 'mono';
  else if (term === 'dumb') depth = 'mono';
  else if (/^(truecolor|24bit)$/i.test(env.COLORTERM || '')) depth = 'truecolor';
  else if (env.WT_SESSION || TRUECOLOR_PROGRAMS.has(program) || TRUECOLOR_TERMS.test(term) || env.KONSOLE_VERSION) depth = 'truecolor';
  else if (platform === 'win32' && windowsBuild() >= 14931) depth = 'truecolor';
  else if (/256/.test(term)) depth = '256';
  else if (typeof stream?.getColorDepth === 'function') depth = normalizeDepth(stream.getColorDepth(env));
  else depth = '16';

  let unicode = flag(env.PRISM_TERM_UNICODE);
  if (unicode === undefined) {
    if (term === 'linux' || term === 'dumb') unicode = false;
    else if (platform === 'win32') {
      // Windows Terminal / VS Code / ConEmu render braille & blocks fine; so does
      // Windows 11's default console host (build 22000+ hands off to Terminal).
      unicode = !!(env.WT_SESSION || env.TERM_PROGRAM || env.ConEmuANSI || windowsBuild() >= 22000);
    } else {
      // POSIX precedence: the first non-empty of LC_ALL, LC_CTYPE, LANG decides
      // (LC_ALL=C means 7-bit even when LANG says UTF-8); none set → assume UTF-8.
      const lang = env.LC_ALL || env.LC_CTYPE || env.LANG || '';
      unicode = !lang || /utf-?8/i.test(lang);
    }
  }

  let sextant = flag(env.PRISM_TERM_SEXTANT);
  if (sextant === undefined) {
    // Windows Terminal ships Cascadia (which has Legacy Computing glyphs) and has
    // rasterized block elements itself since 1.16.
    sextant = unicode && !!(env.WT_SESSION || SEXTANT_PROGRAMS.has(program) || SEXTANT_TERMS.test(term));
  }

  return {
    isTTY,
    depth,
    unicode,
    braille: unicode,
    sextant,
    width: (stream && stream.columns) || Number(env.COLUMNS) || 80,
    height: (stream && stream.rows) || Number(env.LINES) || 24,
    program: program || term || 'unknown',
    platform,
  };
}

/** Merge explicit overrides (e.g. CLI flags) onto detected caps. */
export function withOverrides(caps, { depth, unicode, sextant, ascii } = {}) {
  const c = { ...caps };
  if (depth) c.depth = normalizeDepth(depth);
  if (unicode !== undefined) c.unicode = c.braille = !!unicode;
  if (sextant !== undefined) c.sextant = !!sextant;
  if (ascii) { c.unicode = c.braille = c.sextant = false; }
  if (!c.unicode) c.sextant = false;
  return c;
}
