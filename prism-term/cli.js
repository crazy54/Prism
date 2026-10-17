#!/usr/bin/env node
// prism-term CLI.
//
//   prism-term                         interactive catalog browser (galleries → facets → live preview)
//   prism-term play <id…>              play facets fullscreen in the live player (playlist if several)
//   prism-term play --gallery fx       play a whole gallery (or --category "Fields")
//   prism-term showcase [--gallery g]  auto-advancing tour
//   prism-term list [--gallery g]      facets grouped by gallery and category (--json for scripts)
//   prism-term galleries               the galleries with counts
//   prism-term info <id>               everything about one facet (--json)
//   prism-term banner <text…>          big text into scrollback
//   prism-term spin -- <command…>      run a command under a spinner
//   prism-term spinners                preview every spinner
//   prism-term dashboard               PROTEUS-style live metrics + AI triage demo (needs 100×34)
//   prism-term demo                    tour of the inline helpers (spinner, progress, tasks, thinking)
//   prism-term snapshot <id>           render a frame (ANSI to stdout, or -o file.html/.txt)
//   prism-term caps                    detected capabilities + test patterns
//   prism-term themes | palettes       list Prism themes / gradient palettes
//   prism-term theme [<format>]        a terminal color scheme (Prism Night / Day) for your emulator
//
// Every command takes --theme <id> | --day | --night (default: Prism Night, or
// Prism Day when the terminal has a light background — see src/theme-detect.js).
//
// Run `prism-term help` for options.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(fs.readFileSync(path.join(HERE, 'package.json'), 'utf8'));

// Options that take a value (`--key value` or `--key=value`); BOOLEAN lists the flags.
const VALUE_OPTS = new Set(['theme', 'mode', 'palette', 'set', 'fps', 'duration', 'size', 'seed', 'depth', 'gallery', 'category', 'kind', 'out', 'at', 'frames', 'font', 'fill', 'color', 'text', 'style']);
const BOOLEAN = new Set(['json', 'transparent', 'ascii', 'no-hud', 'hud', 'loop', 'no-loop', 'help', 'version', 'sextant', 'no-sextant', 'unicode', 'no-unicode', 'shadow', 'quiet', 'day', 'night', 'intro', 'no-intro', 'reduced-motion', 'passthrough', 'no-passthrough', 'ids']);

export function parseArgs(argv) {
  const args = { _: [], set: {}, rest: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') { args.rest = argv.slice(i + 1); break; }
    if (a === '-h') { args.help = true; continue; }
    if (a === '-v') { args.version = true; continue; }
    if (a === '-o') { args.out = argv[++i]; continue; }
    if (a.startsWith('-o=')) { args.out = a.slice(3); continue; }
    if (/^-[^-]/.test(a) && a !== '-') { (args.unknown ||= []).push(a); continue; }
    if (a.startsWith('--')) {
      let key = a.slice(2), val;
      const eq = key.indexOf('=');
      if (eq >= 0) { val = key.slice(eq + 1); key = key.slice(0, eq); }
      if (val === undefined && !BOOLEAN.has(key)) {
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith('--')) { val = next; i++; }
      }
      if (!BOOLEAN.has(key) && !VALUE_OPTS.has(key)) { (args.unknown ||= []).push(`--${key}`); continue; }
      if (key === 'set') {
        const s = String(val ?? '');
        const [k, ...v] = s.split('=');
        if (!k || !v.length) (args.badSet ||= []).push(s);
        else args.set[k] = v.join('=');
      } else if (key.startsWith('no-')) args[key.slice(3)] = false;
      else args[key] = val ?? true;
    } else args._.push(a);
  }
  if (args.palette) args.set.palette = args.palette;
  if (args.text && !args.set.text) args.set.text = args.text;
  return args;
}

/**
 * Git Bash's mintty (without ConPTY) hands programs pipes instead of a Windows
 * console, so Node sees no TTY there. Returns a hint sentence, or ''.
 */
export function minttyHint(env = process.env, platform = process.platform) {
  if (platform !== 'win32') return '';
  const mintty = /mintty/i.test(env.TERM_PROGRAM || '') || (!!env.MSYSTEM && !env.WT_SESSION && !env.TERM_PROGRAM);
  return mintty ? ' Git Bash (mintty) gives programs pipes, not a console: run it as `winpty prism-term …`, or use Windows Terminal (its Git Bash profile works as is).' : '';
}

/** A command-line mistake: prism-term exits 2 for these (runtime failures exit 1). */
export class UsageError extends Error {
  constructor(message) { super(message); this.name = 'UsageError'; this.exitCode = 2; }
}

/** Largest --size the renderer accepts (a frame is W×H cells; bigger only hangs). */
export const MAX_SIZE = Object.freeze({ width: 1000, height: 500 });

function parseSize(s) {
  if (!s) return {};
  const m = String(s).match(/^(\d+)\s*[x×,]\s*(\d+)$/i);
  if (!m) throw new UsageError(`--size expects WxH (e.g. 100x30), got "${s}"`);
  const width = +m[1], height = +m[2];
  if (width < 1 || height < 1 || width > MAX_SIZE.width || height > MAX_SIZE.height) {
    throw new UsageError(`--size ${width}x${height} is out of range (1x1 … ${MAX_SIZE.width}x${MAX_SIZE.height})`);
  }
  return { width, height };
}

// Numeric options: [min, max] (inclusive).
const NUMERIC = { fps: [1, 240], duration: [0, 86400], at: [0, 600], frames: [1, 3600], seed: [-2147483648, 2147483647] };
const DEPTH_RE = /^(truecolor|24bit|24|256|8|16|4|mono|none|0|1|2|3)$/i;
const CANVAS_MODES = ['braille', 'sextant', 'quad', 'half', 'ascii', 'auto'];
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|tiff?|svg|avif)$/i;

/** Closest name in `names` within edit distance 2, for "did you mean". */
function closest(word, names) {
  let best = null, bd = 3;
  for (const n of names) { const d = editDistance(word, n); if (d < bd) { bd = d; best = n; } }
  return best;
}

/**
 * Reject what a command can't do — unknown flags, malformed or out-of-range values,
 * unknown palettes / depths / modes / kinds / --set keys, image outputs — with a
 * UsageError (exit 2) and a message that says what would work.
 */
export async function validateArgs(cmd, args) {
  const opts = [...VALUE_OPTS, ...BOOLEAN].map((o) => `--${o}`);
  for (const u of args.unknown || []) {
    const near = u.startsWith('--') ? closest(u, opts) : null;
    throw new UsageError(`unknown option ${u}${near ? ` (did you mean ${near}?)` : ''}. See: prism-term help`);
  }
  for (const s of args.badSet || []) throw new UsageError(`--set expects key=value, got "${s}" (e.g. --set speed=2)`);
  for (const k of VALUE_OPTS) {
    if (args[k] === true) throw new UsageError(`--${k} needs a value${k === 'size' ? ' (WxH)' : ''}`);
  }
  for (const [k, [lo, hi]] of Object.entries(NUMERIC)) {
    if (args[k] === undefined || (k === 'duration' && args[k] === 'auto')) continue;
    const v = Number(args[k]);
    if (!Number.isFinite(v) || v < lo || v > hi || (k === 'seed' && !Number.isInteger(v))) throw new UsageError(`--${k} expects a number from ${lo} to ${hi}, got "${args[k]}"`);
  }
  parseSize(args.size);
  if (args.depth !== undefined && !DEPTH_RE.test(String(args.depth))) throw new UsageError(`unknown --depth "${args.depth}" (truecolor | 256 | 16 | mono)`);
  const modes = cmd === 'banner' ? [...CANVAS_MODES, 'block'] : CANVAS_MODES;
  if (args.mode !== undefined && !modes.includes(String(args.mode))) throw new UsageError(`unknown --mode "${args.mode}" (${modes.join(' | ')})`);
  if (args.mode === 'auto') delete args.mode; // auto = the best mode per facet (the default)
  if (args.palette !== undefined || args.set.palette !== undefined) {
    const { PALETTE_NAMES } = await import('./src/palettes.js');
    const p = String(args.set.palette ?? args.palette);
    if (!PALETTE_NAMES.includes(p)) { const near = closest(p, PALETTE_NAMES); throw new UsageError(`unknown palette "${p}"${near ? ` (did you mean ${near}?)` : ''}. Palettes: ${PALETTE_NAMES.join(', ')}`); }
  }
  if (args.kind !== undefined) {
    const { allFacets } = await registry();
    const kinds = [...new Set(allFacets().map((f) => f.kind))];
    if (!kinds.includes(String(args.kind).toLowerCase())) throw new UsageError(`unknown --kind "${args.kind}". Kinds: ${kinds.join(', ')}`);
  }
  if (args.out !== undefined) {
    if (args.out === true || args.out === '') throw new UsageError('-o needs a file name');
    if (IMAGE_EXT.test(String(args.out))) throw new UsageError(`-o ${args.out}: prism-term writes text, not images. Use -o frame.html (open it in a browser to screenshot it), -o frame.txt, -o frame.ans or plain stdout`);
  }
  const keys = Object.keys(args.set).filter((k) => k !== 'palette');
  if (keys.length) await validateParams(cmd, args, keys);
}

let PARAM_NAMES = null;
/** Every --set key some facet reads: declared params plus ctx.param('…') reads in the facet sources. */
async function knownParams() {
  if (PARAM_NAMES) return PARAM_NAMES;
  const { allFacets } = await registry();
  const names = new Set(['palette', 'text']);
  for (const f of allFacets()) for (const k of Object.keys(f.params || {})) names.add(k);
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.js')) for (const m of fs.readFileSync(p, 'utf8').matchAll(/\bparam\(\s*['"]([A-Za-z0-9_-]+)['"]/g)) names.add(m[1]);
    }
  };
  for (const d of ['src/facets', 'src/scenes', 'examples']) { try { walk(path.join(HERE, d)); } catch { /* not shipped */ } }
  return (PARAM_NAMES = names);
}

async function validateParams(cmd, args, keys) {
  const known = await knownParams();
  const { allFacets } = await registry();
  // A key any facet declares with a numeric default is numeric everywhere (speed, rate, …).
  const numeric = new Set(allFacets().flatMap((f) => Object.entries(f.params || {}).filter(([, p]) => typeof p.default === 'number' || p.min !== undefined).map(([k]) => k)));
  for (const k of keys) if (numeric.has(k) && !Number.isFinite(Number(args.set[k]))) throw new UsageError(`--set ${k}=${args.set[k]}: ${k} is a number`);
  for (const k of keys) {
    if (!known.has(k)) { const near = closest(k, [...known]); throw new UsageError(`unknown parameter "${k}" for --set${near ? ` (did you mean ${near}?)` : ''}. A facet's parameters: prism-term info <id>`); }
  }
  // Declared ranges / options of the named facets.
  const { findFacet } = await registry();
  for (const id of args._) {
    const f = findFacet(id);
    if (!f?.params) continue;
    for (const k of keys) {
      const p = f.params[k], v = args.set[k];
      if (!p) continue;
      if (p.options && !p.options.map(String).includes(String(v))) throw new UsageError(`--set ${k}=${v}: ${f.id} takes ${p.options.join(' | ')}`);
      if (typeof p.default === 'number' || p.min !== undefined) {
        const n = Number(v);
        if (!Number.isFinite(n) || (p.min !== undefined && n < p.min) || (p.max !== undefined && n > p.max)) throw new UsageError(`--set ${k}=${v}: ${f.id} takes a number${p.min !== undefined ? ` from ${p.min} to ${p.max}` : ''}`);
      }
    }
  }
}

const truthy = (v) => v !== undefined && v !== '' && !/^(0|false|no|off)$/i.test(String(v));

/** Motion is reduced by --reduced-motion, PRISM_REDUCED_MOTION=1 or PRISM_TERM_REDUCED_MOTION=1. */
export const reducedMotion = (args = {}, env = process.env) => !!args['reduced-motion'] || truthy(env.PRISM_REDUCED_MOTION) || truthy(env.PRISM_TERM_REDUCED_MOTION);

/**
 * The theme for a command, consistently for every command: --theme <id> (a
 * theme id, a family such as "primer", or day / night / auto) and --day /
 * --night (the Day or Night member of that family, Prism's by default).
 * Without either, an interactive run asks the terminal (src/theme-detect.js:
 * PRISM_TERM_THEME, COLORFGBG, then an OSC 11 query — TTYs only); anything
 * else leaves it to getTheme()'s default. Returns a theme id or undefined.
 */
export async function resolveTheme(args, { interactive = false } = {}) {
  if (args.day && args.night) throw new UsageError('--day and --night are mutually exclusive');
  const want = args.day ? 'day' : args.night ? 'night' : null;
  const { THEME_IDS } = await import('./src/palettes.js');
  let id = typeof args.theme === 'string' && args.theme !== '' ? args.theme : undefined;
  if (id) {
    const known = THEME_IDS.includes(id) || THEME_IDS.some((t) => t.startsWith(`${id}-`)) || /^(auto|day|night|light|dark)$/i.test(id);
    if (!known) throw new UsageError(`unknown theme "${id}". Themes: ${THEME_IDS.join(', ')} (see: prism-term themes)`);
  }
  if (want) {
    const { dayNight } = await import('./src/player.js');
    return dayNight(id && !/^(auto|day|night|light|dark)$/i.test(id) ? id : 'prism-dark', want);
  }
  if (id && id !== 'auto') return id;
  if (interactive) {
    const detect = await import('./src/theme-detect.js').catch(() => null);
    if (detect?.detectTheme) {
      const r = await detect.detectTheme();
      if (r?.id && THEME_IDS.includes(r.id)) return r.id;
    }
  }
  return undefined;
}

/**
 * First Light for an interactive catalog browser launch: 'full' once per
 * terminal session, a short 'echo' after that, false when it must not run —
 * not a TTY (pipes, files, CI), NO_COLOR, reduced motion, --no-intro or
 * PRISM_TERM_INTRO=0. PRISM_TERM_INTRO=full always plays the full version.
 * The session is remembered by an empty marker file in the OS temp directory.
 */
export function introFor(args = {}, { env = process.env, stdout = process.stdout, stdin = process.stdin, tmp = os.tmpdir(), ppid = process.ppid } = {}) {
  if (args.intro === false || !stdout?.isTTY || !stdin?.isTTY) return false;
  if (env.NO_COLOR || env.CI || env.TERM === 'dumb' || reducedMotion(args, env)) return false;
  const pref = String(env.PRISM_TERM_INTRO ?? '').toLowerCase();
  if (pref && !truthy(pref)) return false;
  if (pref === 'full' || pref === 'always') return 'full';
  const session = env.WT_SESSION || env.TERM_SESSION_ID || env.ITERM_SESSION_ID || (env.TMUX_PANE && `${env.TMUX}${env.TMUX_PANE}`) || env.KITTY_WINDOW_ID || env.WEZTERM_PANE || env.STY || `ppid-${ppid}`;
  const marker = path.join(tmp, `prism-term-first-light-${createHash('sha1').update(String(session)).digest('hex').slice(0, 16)}`);
  try {
    const st = fs.statSync(marker);
    if (Date.now() - st.mtimeMs < 12 * 3600e3) return 'echo';
  } catch { /* not seen yet */ }
  try { fs.writeFileSync(marker, ''); } catch { /* read-only tmp: always the full version */ }
  return 'full';
}

/** Options shared by every animated command. */
function runOpts(args) {
  return {
    theme: args.theme,
    reducedMotion: reducedMotion(args) || undefined,
    mode: args.mode,
    fps: args.fps ? Number(args.fps) : undefined,
    duration: args.duration ? Number(args.duration) : undefined,
    loop: args.loop !== false,
    hud: args.hud !== false,
    transparent: !!args.transparent,
    params: args.set,
    seed: args.seed !== undefined ? Number(args.seed) : undefined,
    depth: args.depth,
    ascii: !!args.ascii,
    sextant: args.sextant,
    unicode: args.unicode,
    ...parseSize(args.size),
  };
}

const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

export const SITE = 'https://prism.jeremyfhall.com';

/** "1 facet", "6 facets", "1 gallery", "2 galleries". */
export const countOf = (n, word) => `${n} ${n === 1 ? word : word.endsWith('y') ? `${word.slice(0, -1)}ies` : `${word}s`}`;

async function registry() {
  return import('./src/facets/index.js');
}

function editDistance(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

/** Up to six facet ids that look like what the user meant. */
function suggestFacets(q, facets, searchFacets) {
  const s = String(q).toLowerCase();
  const hits = new Set(searchFacets(s).map((f) => f.id));
  const words = s.split(/[^a-z0-9]+/).filter((w) => w.length >= 3);
  const score = (f) => {
    const d = editDistance(s, f.id);
    const vocab = `${f.title} ${(f.tags || []).join(' ')}`.toLowerCase().split(/[^a-z0-9]+/);
    const word = words.some((w) => f.id.includes(w) || vocab.some((v) => v.includes(w) || (w.length >= 4 && editDistance(w, v) <= 1)));
    return hits.has(f.id) ? -1 : word ? d / 4 : d <= Math.max(2, s.length / 3) ? d : Infinity;
  };
  return facets.map((f) => [f, score(f)]).filter(([, d]) => d < Infinity).sort((a, b) => a[1] - b[1]).slice(0, 6).map(([f]) => f.id);
}

/** Resolve facet ids (or every facet when none are given); unknown ids fail with suggestions. */
async function scenesOrDie(ids) {
  const { allFacets, findFacet, searchFacets } = await registry();
  if (!ids.length) return allFacets();
  const out = [];
  for (const id of ids) {
    const f = findFacet(id);
    if (!f) {
      const near = suggestFacets(id, allFacets(), searchFacets);
      throw new UsageError(`unknown facet "${id}".${near.length ? ` Did you mean: ${near.join(', ')}?` : ''} See: prism-term list`);
    }
    out.push(f);
  }
  return out;
}

/** Facets selected by ids, --gallery, --category and --kind (in catalog order). */
export async function selectFacets(args) {
  const { allFacets, GALLERIES } = await registry();
  let list = args._.length ? await scenesOrDie(args._) : allFacets();
  if (args.gallery !== undefined) {
    const q = String(args.gallery).toLowerCase();
    const g = GALLERIES.find((x) => x.id === q || x.title.toLowerCase() === q);
    if (!g) throw new UsageError(`unknown gallery "${args.gallery}". Galleries: ${GALLERIES.map((x) => x.id).join(', ')}`);
    list = list.filter((f) => f.gallery === g.id);
  }
  if (args.category !== undefined) {
    const q = String(args.category).toLowerCase();
    list = list.filter((f) => f.category.toLowerCase() === q);
    if (!list.length) throw new UsageError(`no facets in category "${args.category}"${args.gallery ? ` of ${args.gallery}` : ''} — see: prism-term galleries`);
  }
  if (args.kind !== undefined) list = list.filter((f) => f.kind === String(args.kind).toLowerCase());
  return list;
}

/** A facet as plain data (no functions) for --json output. */
export function facetRecord(f) {
  const { setup, ...rest } = f;
  return {
    ...rest,
    usage: {
      cli: `prism-term play ${f.id}`,
      snapshot: `prism-term snapshot ${f.id} --size ${f.size.w}x${f.size.h}`,
      npx: `npx -y --package=${SITE}/dl/prism-term-${pkg.version}.tgz prism-term play ${f.id}`,
      curl: `curl -sL ${SITE}/f/${f.id}`,
    },
  };
}

const COMMANDS = {
  async gallery(args) {
    const facets = await scenesOrDie([]);
    if (!process.stdout.isTTY) {
      const hint = !process.stdin.isTTY ? minttyHint() : '';
      if (hint) process.stderr.write(`prism-term: the catalog browser needs an interactive terminal, so here is the list.${hint}\n`);
      return COMMANDS.list(args);
    }
    const { gallery } = await import('./src/gallery.js');
    await gallery(facets, clean({ ...runOpts(args), gallery: args.gallery, intro: introFor(args) }));
  },

  async play(args) {
    if (!args._.length && args.gallery === undefined && args.category === undefined && args.kind === undefined) {
      throw new UsageError('usage: prism-term play <id…> | --gallery <g> | --category "<name>"   (see: prism-term list)');
    }
    const facets = await selectFacets(args);
    if (!facets.length) throw new Error('nothing matched — see: prism-term list');
    if (!process.stdout.isTTY) throw new Error(`play needs an interactive terminal — try: prism-term snapshot ${facets[0].id}.${minttyHint()}`);
    const { play } = await import('./src/player.js');
    const o = clean(runOpts(args));
    if (facets.length > 1 && o.duration === undefined) o.duration = 'auto';
    await play(facets, o);
  },

  async showcase(args) {
    const facets = await selectFacets(args);
    if (!facets.length) throw new Error('nothing matched — see: prism-term list');
    if (!process.stdout.isTTY) throw new Error(`showcase needs an interactive terminal.${minttyHint()}`);
    const { play } = await import('./src/player.js');
    await play(facets, clean({ duration: 'auto', ...runOpts(args) }));
  },

  async list(args) {
    const facets = await selectFacets(args);
    if (args.ids) { process.stdout.write(facets.map((f) => f.id).join('\n') + '\n'); return; } // shell completion
    if (args.json) {
      process.stdout.write(JSON.stringify(facets.map(facetRecord), null, 2) + '\n');
      return;
    }
    const { GALLERIES } = await registry();
    const tty = !!process.stdout.isTTY;
    const cols = tty ? process.stdout.columns || 100 : Infinity;
    const { gradientText } = await importText();
    const { truncate } = await import('./src/width.js');
    const fit = (line) => (Number.isFinite(cols) ? truncate(line, cols - 1) : line);
    const idW = Math.min(28, Math.max(12, ...facets.map((f) => f.id.length)) + 2);
    const out = [];
    for (const g of GALLERIES) {
      const inG = facets.filter((f) => f.gallery === g.id);
      if (!inG.length) continue;
      const head = `${g.title.toUpperCase()} · ${inG.length}`;
      const blurb = fit(`${head}  ${g.blurb}`).slice(head.length);
      out.push('', `${tty && gradientText ? gradientText(head, 'prism') : head}${blurb}`);
      for (const cat of g.categories) {
        const inC = inG.filter((f) => f.category === cat);
        if (!inC.length) continue;
        out.push(`  ${cat} (${inC.length})`);
        for (const f of inC) out.push(fit(`    ${f.id.padEnd(idW)}${f.title} — ${f.description}`));
      }
    }
    const galleries = new Set(facets.map((f) => f.gallery)).size;
    out.push('', `${countOf(facets.length, 'facet')} in ${countOf(galleries, 'gallery')} · prism-term info <id> · prism-term play <id> · prism-term (catalog browser)`);
    process.stdout.write(out.join('\n') + '\n');
  },

  async galleries(args) {
    const { catalogTree, allFacets } = await registry();
    const tree = catalogTree();
    if (args.ids) { process.stdout.write(tree.map((g) => g.id).join('\n') + '\n'); return; }
    if (args.json) {
      process.stdout.write(JSON.stringify(tree.map((g) => ({ id: g.id, title: g.title, icon: g.icon, blurb: g.blurb, count: g.count, categories: g.categories.map((c) => ({ name: c.name, count: c.facets.length })) })), null, 2) + '\n');
      return;
    }
    const out = [];
    for (const g of tree) {
      out.push(`${g.id.padEnd(10)} ${g.title.padEnd(26)} ${String(g.count).padStart(4)}  ${g.blurb}`);
      out.push(`${' '.repeat(11)}${g.categories.map((c) => `${c.name} ${c.facets.length}`).join(' · ')}`);
    }
    out.push('', `${countOf(allFacets().length, 'facet')} in ${countOf(tree.length, 'gallery')} · prism-term list --gallery <id>`);
    process.stdout.write(out.join('\n') + '\n');
  },

  async info(args) {
    const [id] = args._;
    if (!id) throw new UsageError('usage: prism-term info <id> [--json]');
    const [f] = await scenesOrDie([id]);
    const r = facetRecord(f);
    if (args.json) { process.stdout.write(JSON.stringify(r, null, 2) + '\n'); return; }
    const { getGallery } = await registry();
    const params = Object.entries(f.params || {}).map(([k, p]) => `${k} = ${p.default ?? '—'}${p.min !== undefined ? ` (${p.min}–${p.max})` : p.options ? ` (${p.options.join(' | ')})` : ''}`);
    const lines = [
      `${f.title}  (${f.id})`,
      `${getGallery(f.gallery)?.title || f.gallery} · ${f.category} · ${f.kind}`,
      f.description,
      '',
      `  size      ${f.size.w}×${f.size.h} (min ${f.minSize.w}×${f.minSize.h})`,
      `  motion    ${f.animated ? `animated · ${f.loop} s loop` : 'still'}`,
      `  needs     ${f.glyphs} glyphs · ${f.color === 'truecolor' || f.color === 'mono' ? f.color : `${f.color} colors`}`,
      f.tags?.length ? `  tags      ${f.tags.join(', ')}` : null,
      params.length ? `  params    ${params.join(' · ')}   (--set key=value)` : null,
      `  file      prism-term/src/facets/${f.file}`,
      '',
      `  play      ${r.usage.cli}`,
      `  snapshot  ${r.usage.snapshot}`,
      `  npx       ${r.usage.npx}`,
      `  curl      ${r.usage.curl}`,
    ].filter((l) => l !== null);
    process.stdout.write(lines.join('\n') + '\n');
  },

  async snapshot(args) {
    const [id] = args._;
    if (!id) throw new UsageError('usage: prism-term snapshot <scene> [--at 2.5] [--size 100x30] [-o out.html|out.txt|out.ans] [--frames 60]');
    const [scene] = await scenesOrDie([id]);
    const { renderScene, renderFrames } = await import('./src/render.js');
    const { detect, withOverrides } = await import('./src/caps.js');
    const o = runOpts(args);
    const caps = withOverrides(detect(), o);
    const size = parseSize(args.size);
    const width = size.width || (args.out ? 100 : Math.min(process.stdout.columns || 100, 160));
    const height = size.height || (args.out ? 30 : Math.max(8, Math.min((process.stdout.rows || 32) - 2, 50)));
    const out = args.out;
    // Render at the depth the frame is written in, so mono output (NO_COLOR, .txt) gets the
    // luminance ramp instead of color pictures with the color stripped. A plain pipe without
    // NO_COLOR still writes truecolor (`snapshot x > x.ans` keeps its color).
    const depth = out && /\.(html?|ans)$/i.test(out) ? o.depth || 'truecolor'
      : out ? 'mono'
      : o.depth || (caps.depth === 'mono' && !process.env.NO_COLOR ? 'truecolor' : caps.depth);
    const common = clean({ width, height, theme: o.theme, mode: o.mode, params: o.params, seed: o.seed, transparent: o.transparent, caps: { unicode: caps.unicode, sextant: caps.sextant, depth } });
    if (out && /\.html?$/i.test(out) && args.frames) {
      const { toAnimatedHtml } = await import('./src/export.js');
      const fps = Number(args.fps) || 20;
      const frames = renderFrames(scene, { ...common, frames: Number(args.frames), fps, start: Number(args.at || 0) });
      fs.writeFileSync(out, toAnimatedHtml(frames, { title: scene.title, fps, theme: o.theme }));
    } else {
      const buf = renderScene(scene, { ...common, t: Number(args.at ?? 2.5) });
      if (out && /\.html?$/i.test(out)) {
        const { toHtml } = await import('./src/export.js');
        fs.writeFileSync(out, toHtml(buf, { title: scene.title, theme: o.theme }));
      } else if (out && /\.ans$/i.test(out)) fs.writeFileSync(out, buf.toAnsi(depth) + '\n');
      else if (out) fs.writeFileSync(out, buf.toString() + '\n');
      else {
        process.stdout.write(buf.toAnsi(depth) + '\n');
        return;
      }
    }
    process.stderr.write(`wrote ${out}\n`);
  },

  async banner(args) {
    const text = args._.join(' ') || 'PRISM';
    const t = await importText();
    if (!t.banner) throw new Error('text module not available');
    process.stdout.write(t.banner(text, clean({ font: args.font, mode: args.mode, fill: args.palette || args.fill || args.color, shadow: args.shadow, theme: args.theme, depth: args.depth })) + '\n');
  },

  async spinners(args) {
    const { SPINNERS } = await import('./src/spinners.js');
    const { Screen } = await import('./src/screen.js');
    const { getTheme, palette } = await import('./src/palettes.js');
    const names = Object.keys(SPINNERS);
    if (!process.stdout.isTTY) {
      for (const n of names) process.stdout.write(`${n.padEnd(14)} ${SPINNERS[n].frames.join(' ')}\n`);
      return;
    }
    const th = getTheme(args.theme);
    const pal = palette('prism');
    const cols = Math.max(1, Math.floor((process.stdout.columns || 80) / 26));
    const rowsN = Math.ceil(names.length / cols);
    const screen = new Screen({ mode: 'inline', height: rowsN + 1, keys: true, exitOnCtrlC: true });
    const duration = Number(args.duration || 6);
    screen.on('key', (k) => { if (k.name === 'q' || k.name === 'escape' || k.name === 'return') screen.stop(); });
    await screen.run((t) => {
      const b = screen.buffer;
      b.clear();
      names.forEach((n, i) => {
        const x = (i % cols) * 26, y = Math.floor(i / cols);
        const sp = SPINNERS[n];
        const f = sp.frames[Math.floor((t * 1000) / sp.interval) % sp.frames.length];
        const c = pal(i / names.length);
        const end = b.text(x, y, f, c);
        b.text(end + 1, y, n, th.muted);
      });
      b.text(0, rowsN, `${names.length} spinners · q to stop`, th.dim);
    }, { fps: 30, duration });
  },

  async spin(args) {
    const cmd = args.rest.length ? args.rest : args._;
    if (!cmd.length) throw new UsageError('usage: prism-term spin [--text "Building"] [--style dots] -- <command…>');
    const { spinner } = await import('./src/inline.js');
    const label = args.text || cmd.join(' ');
    const sp = spinner(label, clean({ style: args.style, theme: args.theme }));
    const t0 = Date.now();
    const chunks = [], outChunks = [];
    // The command's stdout is passed through (--no-passthrough swallows it): streamed as it
    // comes when stdout is a pipe or file (the spinner lives on stderr), else kept and printed
    // under the finished spinner line so the two never interleave on one screen.
    const passthrough = args.passthrough !== false;
    const stream = passthrough && !process.stdout.isTTY;
    const child = spawnCommand(cmd);
    const onData = (d, isOut) => {
      chunks.push(d);
      if (isOut && passthrough) { if (stream) process.stdout.write(d); else outChunks.push(d); }
      const last = d.toString().split(/\r?\n/).map((s) => s.trim()).filter(Boolean).pop();
      if (last && !args.quiet) sp.update(`${label}  ${last.slice(0, 80)}`);
    };
    child.stdout.on('data', (d) => onData(d, true));
    child.stderr.on('data', (d) => onData(d, false));
    const code = await new Promise((r) => { child.on('close', r); child.on('error', (e) => { chunks.push(Buffer.from(String(e.message))); r(127); }); });
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    if (code === 0) {
      sp.succeed(`${label} (${secs}s)`);
      if (outChunks.length) process.stdout.write(Buffer.concat(outChunks));
    } else {
      sp.fail(`${label} — exit ${code} (${secs}s)`);
      process.stderr.write(Buffer.concat(chunks).toString());
    }
    process.exitCode = code ?? 1;
  },

  async dashboard(args) {
    if (!process.stdout.isTTY) throw new Error(`dashboard needs an interactive terminal.${minttyHint()}`);
    const { runDashboard } = await import('./examples/proteus-dashboard.js');
    await runDashboard(clean(runOpts(args)));
  },

  async demo(args) {
    const { runDemo } = await import('./examples/inline-demo.js');
    await runDemo(clean(runOpts(args)));
  },

  async caps(args) {
    const { detect, withOverrides } = await import('./src/caps.js');
    const { CellBuffer } = await import('./src/buffer.js');
    const { Canvas } = await import('./src/canvas.js');
    const { palette, getTheme } = await import('./src/palettes.js');
    const caps = withOverrides(detect(), runOpts(args));
    if (args.json) { process.stdout.write(JSON.stringify(caps, null, 2) + '\n'); return; }
    const th = getTheme(args.theme);
    const depth = caps.depth; // mono (NO_COLOR, pipes) prints the glyph rows without color
    const W = Math.min(process.stdout.columns || 80, 100) - 2;
    const out = (s) => process.stdout.write(s + '\n');
    out(`prism-term ${pkg.version} · ${caps.program} · ${caps.platform}`);
    out(`  color depth  ${caps.depth}${caps.isTTY ? '' : '  (not a TTY)'}`);
    out(`  unicode      ${caps.unicode ? 'yes' : 'no'}   braille ${caps.braille ? 'yes' : 'no'}   sextant ${caps.sextant ? 'yes' : 'no (override: --sextant)'}`);
    out(`  size         ${caps.width}×${caps.height}\n`);

    const b = new CellBuffer(W, 9);
    const spec = palette('prism'), heat = palette('magma');
    const half = new Canvas(W, 2, { mode: 'half' });
    half.shade((x, y) => (y < 2 ? spec(x / W) : heat(x / W)));
    half.paint(b, 0, 0);
    b.text(0, 3, 'braille ', th.muted);
    const br = new Canvas(W - 9, 1, { mode: 'braille' });
    for (let x = 0; x < br.width; x++) br.set(x, Math.round(1.5 + Math.sin(x / 3) * 1.5), spec(x / br.width));
    br.paint(b, 9, 3);
    b.text(0, 4, 'sextant ', th.muted);
    b.text(9, 4, '🬀🬁🬂🬃🬄🬅🬆🬇🬈🬉🬊🬋🬌🬍🬎🬏🬐🬑🬒🬓🬔🬕🬖🬗🬘🬙🬚🬛🬜🬝🬞🬟', th.accent);
    b.text(0, 5, 'quadrant', th.muted);
    b.text(9, 5, '▘▝▀▖▌▞▛▗▚▐▜▄▙▟█  eighths ▏▎▍▌▋▊▉█ ▁▂▃▄▅▆▇█', th.info);
    b.text(0, 6, 'box     ', th.muted);
    b.text(9, 6, '╭─┬─╮ ┏━┳━┓ ╔═╦═╗ ┌┄┐  ●○◆◇▲▼◀▶ ✔✖⚠ℹ', th.pos);
    b.text(0, 7, 'wide    ', th.muted);
    b.text(9, 7, '漢字 カナ ｱｲｳ 🚀  ← should align: |', th.warn);
    b.text(0, 8, '256/16  ', th.muted);
    out(b.toAnsi(depth));
    let line = '         ';
    if (depth !== 'mono') for (let i = 0; i < 16; i++) line += `\x1b[48;5;${i}m  `;
    out(depth === 'mono' ? `${line}(no color: ${process.env.NO_COLOR ? 'NO_COLOR is set' : 'not a TTY'})\n` : line + '\x1b[0m\n');
    out('If the sextant row shows boxes or "?", your font lacks Legacy Computing glyphs — prism-term falls back to quadrants automatically.');
  },

  async themes(args) {
    const { listThemes, getTheme } = await import('./src/palettes.js');
    const { parse } = await import('./src/color.js');
    const current = getTheme(args.theme).id;
    if (args.ids) { process.stdout.write(listThemes().map((t) => t.id).join('\n') + '\n'); return; }
    for (const t of listThemes()) {
      const c = parse(t.accent);
      const sw = process.stdout.isTTY && !process.env.NO_COLOR ? `\x1b[48;2;${(c >> 16) & 255};${(c >> 8) & 255};${c & 255}m   \x1b[0m ` : '';
      process.stdout.write(`${sw}${t.id.padEnd(24)} ${t.name.padEnd(26)} ${(t.mode === 'light' ? 'Day' : 'Night').padEnd(5)}${t.id === current ? '  (current)' : ''}`.trimEnd() + '\n');
    }
  },

  // Terminal emulator color schemes, from src/theme-export.js (Terminal Palette).
  // Prints to stdout only — never touches the user's emulator config.
  async theme(args) {
    let mod = null;
    try { mod = await import('./src/theme-export.js'); } catch (err) { if (err.code !== 'ERR_MODULE_NOT_FOUND') throw err; }
    if (!mod?.exportTheme) throw new Error('theme export is not available in this build of prism-term');
    const { getTheme } = await import('./src/palettes.js');
    const formats = formatList(mod.FORMATS);
    const [format] = args._;
    const th = getTheme(args.theme || 'prism-dark');
    const fileFor = (f) => { try { return mod.themeFileName ? mod.themeFileName(f, th.id) : ''; } catch { return ''; } };
    if (args.ids) { process.stdout.write(formats.map((f) => f.id).join('\n') + '\n'); return; }
    if (!format) {
      const other = th.mode === 'light' ? '--night' : '--day';
      const w = Math.max(8, ...formats.map((f) => f.id.length)) + 2;
      const nw = Math.max(...formats.map((f) => f.name.length)) + 2;
      const fw = Math.max(...formats.map((f) => fileFor(f.id).length)) + 2;
      const out = [`Terminal color schemes · ${th.name} (${th.id}) · ${other} for the other one`, ''];
      for (const f of formats) out.push(`  ${f.id.padEnd(w)}${f.name.padEnd(nw)}${fileFor(f.id).padEnd(fw)}${f.install}`.trimEnd());
      out.push('', `  prism-term theme <format> [--day | --night] [-o <file>]    e.g. prism-term theme kitty -o ${fileFor('kitty') || 'prism.conf'}`);
      out.push('  Printed to stdout (or the -o file you name): nothing is installed and no config is touched.');
      process.stdout.write(out.join('\n') + '\n');
      return;
    }
    const id = mod.formatId ? mod.formatId(format) : formats.some((f) => f.id === format) ? format : null;
    if (!id) throw new UsageError(`unknown format "${format}". Formats: ${formats.map((f) => f.id).join(', ')}`);
    const text = String(await mod.exportTheme(id, th.id));
    // -o <file> writes the file you name (never your emulator's own config); otherwise stdout.
    if (args.out) {
      fs.writeFileSync(args.out, text);
      process.stderr.write(`wrote ${args.out} — ${mod.FORMATS?.[id]?.install || 'import it in your terminal'}\n`);
    } else process.stdout.write(text.endsWith('\n') ? text : `${text}\n`);
  },

  async palettes(args) {
    const { PALETTE_NAMES, palette } = await import('./src/palettes.js');
    if (args?.ids) { process.stdout.write(PALETTE_NAMES.join('\n') + '\n'); return; }
    for (const n of PALETTE_NAMES) {
      const p = palette(n);
      let bar = '';
      if (process.stdout.isTTY) for (let i = 0; i < 32; i++) { const c = p(i / 31); bar += `\x1b[48;2;${(c >> 16) & 255};${(c >> 8) & 255};${c & 255}m `; }
      process.stdout.write(`${n.padEnd(12)} ${bar}${bar ? '\x1b[0m' : ''}\n`);
    }
  },

  help() {
    process.stdout.write(`prism-term ${pkg.version} — Prism's terminal catalog: animated facets for any terminal

Browse
  prism-term                        catalog browser: galleries → facets → live preview
  prism-term --gallery <g>          open the catalog browser at a gallery
  prism-term galleries              the galleries with counts and categories
  prism-term list [--gallery g] [--category c] [--kind k] [--json]
  prism-term info <id> [--json]     size, needs, params and the commands for one facet

Play
  prism-term play <id…>             play facets fullscreen in the live player (several = playlist)
  prism-term play --gallery <g>     play a gallery (or --category "<name>", --kind <k>)
  prism-term showcase [--gallery g] auto-advancing tour (--duration secs per facet)
  prism-term <id>                   shorthand for play <id>

Make things
  prism-term snapshot <id>          still frame → stdout (ANSI), -o x.html|x.txt, --frames N for animated html
  prism-term banner <text…>         big text (--font standard|tiny|bold --palette prism --mode half|braille|… --shadow)
  prism-term spin -- <command…>     run a command under a spinner (--text, --style)
  prism-term spinners               preview every spinner
  prism-term dashboard              PROTEUS-style live metrics + AI triage demo (needs 100×34)
  prism-term demo                   inline helpers tour
  prism-term caps [--json]          capabilities + glyph test patterns
  prism-term themes | palettes      list themes / palettes
  prism-term theme [<format>]       Prism Night / Day color scheme for your terminal emulator,
                                    printed to stdout or -o <file> (no format: list them; --day / --night)

Options
  --theme <id>        theme: prism-dark (Prism Night), prism-light (Prism Day), primer, cloudscape-dark, …
                      default: Night, or Day on a light terminal (PRISM_TERM_THEME=day|night|<id> to pin)
  --day | --night     the Day or Night member of the theme's family (Prism's by default)
  --mode <m>          braille | sextant | quad | half | ascii   (default: best for the facet)
  --palette <name>    gradient palette for facets that use one (prism, fire, ocean, aurora, …)
  --set key=value     facet parameter (repeatable), e.g. --set text=PROTEUS --set speed=2
  --fps <n>           target frame rate (default 30)
  --duration <s>      seconds per facet in playlists / showcase (default: each facet's loop)
  --size <WxH>        fixed size in cells
  --seed <n>          deterministic seed
  --transparent       keep the terminal's own background
  --no-hud            hide the status bar
  --depth <d>         force color depth: truecolor | 256 | 16 | mono
  --ascii             no Unicode at all;  --sextant / --no-sextant to force sextant glyphs
  --no-intro          skip First Light, the catalog browser's opening beam (also PRISM_TERM_INTRO=0)
  --reduced-motion    no intro, wipes or sweeps (also PRISM_REDUCED_MOTION=1); NO_COLOR is honored

Keys in the catalog browser
  ↑↓ jk move · ←→ hl / Tab pane · Enter play · s showcase · / search · g gallery · f kind · t theme · d day/night · m mode · ? help · q quit
  (under 110 columns: ←→ hl / Tab change gallery, g opens a gallery picker)
Keys in the live player
  ←/→ facet · space pause · m mode · t theme · d day/night · r restart · h HUD · q back

Live player without installing:  npx -y --package=${SITE}/dl/prism-term-${pkg.version}.tgz prism-term [play <id>]
                                  (/dl/prism-term.tgz is the latest-release alias; checksums: ${SITE}/dl/SHA256SUMS)
Browse with curl:                 curl -sL ${SITE.replace('https://', '')}/tty
`);
  },
};

// cmd.exe quoting for an argv (the cross-spawn rules): each argument is quoted for
// the program's own parser (MSVCRT: backslashes before a quote doubled, quotes
// escaped), then every cmd.exe metacharacter — the quotes included, so cmd never
// enters a quoted span — gets a caret. That makes %VAR% and !VAR! literal: cmd
// expands nothing the user didn't write as a shell line. A .cmd / .bat target
// (npm, npx) re-parses its arguments once more, so they are escaped twice.
const CMD_META = /([()\][%!^"`<>&|;, *?])/g;
export function winQuote(a, batch = false) {
  let s = String(a).replace(/(\\*)"/g, '$1$1\\"').replace(/(\\*)$/, '$1$1');
  s = `"${s}"`.replace(CMD_META, '^$1');
  return batch ? s.replace(CMD_META, '^$1') : s;
}

/**
 * Resolve a bare program name on PATH (PATHEXT order), Windows only → its full path, or
 * the name itself. A batch file must be started by its full path: quoted by bare name,
 * its %~dp0 points at the current directory instead of the script's own (npm.cmd breaks).
 */
function resolveWin(cmd, env = process.env) {
  if (/[\\/]/.test(cmd)) return cmd;
  const exts = /\.[a-z0-9]+$/i.test(cmd) ? [''] : (env.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean);
  for (const dir of ['.', ...(env.PATH || env.Path || '').split(';').filter(Boolean)]) {
    for (const ext of exts) {
      const p = path.resolve(dir, cmd + ext);
      try { if (fs.statSync(p).isFile()) return p; } catch { /* next */ }
    }
  }
  return cmd;
}

/**
 * Spawn `prism-term spin` targets. A single argument is a shell command line (the
 * user's own shell syntax, expanded as written); several arguments are an argv and
 * reach the program verbatim. Windows needs a shell to resolve .cmd shims (npm,
 * npx), so the argv is escaped into one cmd.exe line there (winQuote).
 */
function spawnCommand(cmd) {
  const stdio = ['inherit', 'pipe', 'pipe'];
  if (cmd.length === 1) return spawn(cmd[0], { stdio, shell: true });
  if (process.platform === 'win32') {
    const prog = resolveWin(cmd[0]);
    const batch = /\.(cmd|bat)$/i.test(prog);
    // the program, by full path, is quoted once (a path with spaces stays one argv[0]);
    // its arguments are escaped twice for a batch file, which re-parses them
    const line = [winQuote(prog), ...cmd.slice(1).map((a) => winQuote(a, batch))].join(' ');
    return spawn(line, { stdio, shell: true, windowsVerbatimArguments: true });
  }
  return spawn(cmd[0], cmd.slice(1), { stdio });
}

/** FORMATS as [{ id, name, install }] — from a { id: { name, install, … } } map, a Map, or a list. */
export function formatList(F) {
  if (!F) return [];
  const one = (id, v) => ({ id: String(id), name: typeof v === 'string' ? v : String(v?.name || v?.label || id), install: typeof v?.install === 'string' ? v.install : typeof v?.description === 'string' ? v.description : '' });
  if (Array.isArray(F)) return F.map((f) => (typeof f === 'string' ? one(f, f) : one(f.id ?? f.format ?? f.name, f)));
  if (F instanceof Map) return [...F].map(([id, v]) => one(id, v));
  return Object.entries(F).map(([id, v]) => one(id, v));
}

async function importText() {
  try { return await import('./src/text/index.js'); } catch { return {}; }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.version) { process.stdout.write(pkg.version + '\n'); return; }
  const cmd = args._.length ? args._.shift() : 'gallery';
  if (args.help || cmd === 'help') return COMMANDS.help();
  const fn = COMMANDS[cmd];
  await validateArgs(cmd, args);
  // Interactive commands may ask the terminal for its background (Day / Night), and so
  // does --transparent (its text has to suit the background that shows through);
  // pipes, files and the non-interactive commands never send it a query.
  const interactive = !!(process.stdout.isTTY && process.stdin.isTTY) && (!fn || INTERACTIVE.has(cmd) || !!args.transparent);
  args.theme = await resolveTheme(args, { interactive });
  if (!fn) {
    // `prism-term plasma` is shorthand for `prism-term play plasma`.
    args._.unshift(cmd);
    return COMMANDS.play(args);
  }
  await fn(args);
}

const INTERACTIVE = new Set(['gallery', 'play', 'showcase', 'dashboard', 'demo', 'spinners']);

function isMain() {
  try { return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
}
if (isMain()) {
  // Pipe-safe: `prism-term list | head` closes stdout early; that's a normal exit, not a crash.
  process.stdout.on('error', (err) => { if (err.code === 'EPIPE') process.exit(0); throw err; });
  main().catch((err) => {
    if (err.code === 'EPIPE') process.exit(0);
    process.stderr.write(`prism-term: ${err.message}\n`);
    if (process.env.PRISM_TERM_DEBUG) process.stderr.write(err.stack + '\n');
    process.exit(err.exitCode || 1); // 2: usage error, 1: runtime failure
  });
}
