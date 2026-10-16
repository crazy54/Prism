// Refraction generator — the design system's build, run from the repo.
//
//   node design/tools/gen.mjs              author tokens.json from the spec in this file (spectrum and gallery
//                                          positions computed in OKLCH), then emit prism.css, themes.js,
//                                          specimen.html and the README tables
//   node design/tools/gen.mjs --emit       keep tokens.json as it is (after a hand edit) and emit the rest
//   node design/tools/gen.mjs --check      write nothing; exit 1 if any output (incl. tokens.json) is stale
//   node design/tools/gen.mjs --emit --check   same, but only the outputs derived from tokens.json
//
// Inputs: tools/src/primitives.css (hand-authored .rf-* layer), tools/src/specimen.src.html (specimen
// template), design/fonts/inter-*-latin.woff2, prism-term/src/facets/galleries.js (terminal nav order),
// README.md (prose; tables between <!-- gen:x --> markers are regenerated).
// After any token change: run this, run contrast.mjs (must stay all-pass), log old → new in CHANGELOG.md.
// Zero dependencies. Owner: Lead Designer.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as c from './color.mjs';
import { audit } from './contrast.mjs';
import { fillReadme } from './readme.mjs';

const TOOLS = dirname(fileURLToPath(import.meta.url));
const DESIGN = resolve(TOOLS, '..');
const REPO = resolve(DESIGN, '..');
const argv = process.argv.slice(2);
const EMIT_ONLY = argv.includes('--emit');
const CHECK = argv.includes('--check');

// Terminal nav order comes from the terminal catalog itself; the fallback keeps the
// generator usable in a checkout without prism-term.
const TERM_FALLBACK = [['fx', 'FX Store'], ['objects', 'Animated Objects'], ['sim', 'Particles & Simulations'], ['retro', 'Retro & Demoscene'],
  ['text', 'Text Effects'], ['loaders', 'Spinners & Loaders'], ['progress', 'Progress & Counters'], ['charts', 'Charts & Metrics'],
  ['ai', 'AI Working'], ['status', 'Notifications & Status'], ['ops', 'Linux & Ops'], ['diagrams', 'Architecture Diagrams'],
  ['callouts', 'Callouts & Layout'], ['input', 'Input & Menus'], ['maps', 'Maps & Geo'], ['lab', 'Animation Lab'], ['ascii', 'Pure ASCII']];
let TERM = TERM_FALLBACK;
const termSrc = resolve(REPO, 'prism-term/src/facets/galleries.js');
if (existsSync(termSrc)) {
  const { GALLERIES } = await import(pathToFileURL(termSrc).href);
  TERM = GALLERIES.map((g) => [g.id, g.title]);
} else console.warn('gen: prism-term/src/facets/galleries.js not found — using the built-in terminal order');

const outputs = new Map(); // absolute path → content
const out = (p, content) => outputs.set(resolve(DESIGN, p), content);

let T;
if (EMIT_ONLY) T = JSON.parse(readFileSync(resolve(DESIGN, 'tokens.json'), 'utf8'));
else { T = author(TERM); out('tokens.json', JSON.stringify(T, null, 2) + '\n'); }
emit(T);
finish();

function finish() {
  const norm = (s) => s.replace(/\r\n/g, '\n');
  if (CHECK) {
    const stale = [...outputs].filter(([p, s]) => !existsSync(p) || norm(readFileSync(p, 'utf8')) !== norm(s)).map(([p]) => relative(REPO, p));
    if (stale.length) { console.log('gen --check: STALE\n  ' + stale.join('\n  ') + '\n  → run node design/tools/gen.mjs' + (EMIT_ONLY ? ' --emit' : '')); process.exitCode = 1; }
    else console.log(`gen --check: ${outputs.size} outputs up to date (v${T.version})`);
    return;
  }
  for (const [p, s] of outputs) writeFileSync(p, s);
  console.log(`gen: wrote ${[...outputs.keys()].map((p) => relative(DESIGN, p)).join(', ')} (v${T.version})`);
}

// ════════════════════════════════════════════════════════════════════════════
function author(TERM) {
  const VERSION = '1.3.0';
  const ok = (hex) => { const o = c.hexToOklch(hex); return `oklch(${o.L.toFixed(3)} ${o.C.toFixed(3)} ${o.h.toFixed(1)})`; };
  const col = (hex, note) => (note ? { hex, oklch: ok(hex), note } : { hex, oklch: ok(hex) });
  const rgba = (hex, a) => `rgba(${c.rgbTriplet(hex)},${a})`;

  // ── Neutrals + semantics ────────────────────────────────────────────────
  // Night = deep ink-navy glass lit from inside (website values kept verbatim
  // where they exist). Day = pearl paper with an iridescent sheen — its own art
  // direction: warm-cool pearl, reflected (not emitted) light, tinted soft shade.
  const night = {
    bg: '#0a0c12', 'bg-deep': '#06070b', panel: '#10131c', panel2: '#171a25', card: '#12151f',
    line: '#252834', 'line-soft': '#1b1e29', 'line-strong': '#343849', 'line-control': '#6b6f84',
    ink: '#f0f0f5', muted: '#a2a4b4', dim: '#8a8c9d', faint: '#565a6c',
    accent: '#b8a2f2', 'accent-hi': '#cbb9f7', 'accent-lo': '#a38be8', 'accent-ink': '#151021', accent2: '#a8b9fc',
    info: '#86bdf9', pos: '#8bd8ba', warn: '#eec36f', neg: '#f5877f', crit: '#f07fb3',
  };
  const day = {
    bg: '#f6f5f9', 'bg-deep': '#ecebf3', panel: '#ffffff', panel2: '#f0eff6', card: '#fdfcff',
    line: '#dedce9', 'line-soft': '#e9e7f1', 'line-strong': '#c9c6d8', 'line-control': '#8a879d',
    ink: '#20202e', muted: '#55556a', dim: '#68687c', faint: '#a9a8b8',
    accent: '#7353bb', 'accent-hi': '#6142aa', 'accent-lo': '#8b70cf', 'accent-ink': '#ffffff', accent2: '#4a62c6',
    info: '#2461bf', pos: '#1f6b4f', warn: '#8a5a00', neg: '#bf3434', crit: '#b0256f',
  };

  // ── Spectrum ─────────────────────────────────────────────────────────────
  // One continuous ramp, violet → rose, walking OKLCH hue downward from the
  // website accent (h≈296) through periwinkle and mint (the website gradient)
  // to amber, coral and rose. Hue steps are even (OKLCH hue is perceptual);
  // lightness is held in a narrow band (Night) or solved for constant WCAG
  // contrast (Day), chroma is constant wherever sRGB allows.
  const H0 = 296, H1 = 8;
  const hueAt = (t) => H0 - (H0 - H1) * t;
  const ang = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
  const bump = (h, mu, s) => Math.exp(-(ang(h, mu) ** 2) / (2 * s * s));
  const tiers = {
    night: {
      ink: (h) => c.oklch(0.795 + 0.05 * bump(h, 100, 50), 0.105, h),          // text-safe on all Night surfaces
      vivid: (h) => c.oklch(0.715 + 0.12 * bump(h, 105, 48), 0.13, h),        // beams, glows, fills, data marks
    },
    day: {
      ink: (h) => c.oklch(c.solveL(0.15, h, day.panel2, 4.9, 'darker'), 0.15, h), // ≥4.5 on every Day surface
      vivid: (h) => c.oklch(c.solveL(0.16, h, day.bg, 3.2, 'darker'), 0.16, h),   // UI marks ≥3:1 on pearl
      wash: (h) => c.oklch(0.935, 0.042, h),                                      // iridescent pearl tint
      sheen: (h) => c.oklch(0.74 + 0.07 * bump(h, 100, 50), 0.13, h),             // decorative gradients (ruler, band, caustic) — not for text or marks
    },
  };
  const STOP_NAMES = ['violet', 'periwinkle', 'azure', 'cerulean', 'cyan', 'mint', 'jade', 'lime', 'citrine', 'amber', 'coral', 'rose'];
  const lambdaOf = (h) => c.dominantWavelength(tiers.night.vivid(h)).label;
  const stops = STOP_NAMES.map((name, i) => {
    const t = i / (STOP_NAMES.length - 1), h = +hueAt(t).toFixed(1);
    const nInk = tiers.night.ink(h), nViv = tiers.night.vivid(h);
    const dInk = tiers.day.ink(h), dViv = tiers.day.vivid(h), dWash = tiers.day.wash(h), dSheen = tiers.day.sheen(h);
    return {
      name, t: +t.toFixed(4), h, lambda: lambdaOf(h),
      night: { ink: col(nInk), vivid: col(nViv), wash: rgba(nViv, 0.14) },
      day: { ink: col(dInk), vivid: col(dViv), wash: col(dWash), sheen: col(dSheen) },
    };
  });
  const adj = (mode, tier) => stops.slice(1).map((s, i) => c.deltaE(stops[i][mode][tier].hex, s[mode][tier].hex));
  const stat = (a) => ({ min: +Math.min(...a).toFixed(4), max: +Math.max(...a).toFixed(4), mean: +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(4) });

  // ── Positions: galleries, app pages, surfaces ───────────────────────────
  // Galleries take even steps along the ramp in navigation order, so the
  // sidebar reads as one continuous spectrum top to bottom. App pages are
  // "white light" (unrefracted) and wear CIE illuminant codes instead of a
  // wavelength. Surfaces sit far apart: Web violet, Terminal mint (phosphor),
  // Stream Deck amber (a lit key).
  const WEB = [
    ['charts', 'Charts & Metrics'], ['fx', 'FX Store'], ['lab', 'Animation Lab'], ['ai', 'AI Working'],
    ['objects', 'Animated Objects'], ['input', 'Input Methods'], ['text', 'Text Effects'], ['shapes', 'Text Shapes'],
    ['maps', 'Maps & Geo'], ['notify', 'Notifications & Status'], ['arch', 'Architecture Diagrams'],
    ['callouts', 'Callouts & Annotations'], ['obsidian', 'Obsidian Facets'], ['menus', 'Menus & Actions'],
    ['spectrums', 'Spectrums'], ['idea', 'Idea Gallery'], ['mobile', 'Mobile Gallery'], ['desktop', 'Desktop Gallery'],
  ];
  const pos = (id, label, kind, order, h, extra = {}) => ({
    id, label, kind, order, h: +h.toFixed(1), t: +((H0 - h) / (H0 - H1)).toFixed(4), lambda: lambdaOf(h),
    night: { ink: tiers.night.ink(h), vivid: tiers.night.vivid(h), rgb: c.rgbTriplet(tiers.night.vivid(h)) },
    day: { ink: tiers.day.ink(h), vivid: tiers.day.vivid(h), wash: tiers.day.wash(h), rgb: c.rgbTriplet(tiers.day.vivid(h)) },
    ...extra,
  });
  const web = WEB.map(([id, label], i) => pos(id, label, 'gallery', i + 1, hueAt(i / (WEB.length - 1)),
    id === 'spectrums' ? { index: 'full-spectrum' } : { index: 'hue' }));
  const APP = [
    ['facets', 'New Facets', 'D65'], ['search', 'Search', 'D50'], ['variants', 'Variant Matrix', 'D55'],
    ['showcase', 'Live Demo', 'D75'], ['collections', 'Collections', 'D93'],
  ];
  const app = APP.map(([id, label, ill], i) => ({
    id, label, kind: 'app', order: i + 1, h: null, t: null, lambda: ill, index: 'white-light',
    note: 'White light — unrefracted. Index is drawn with --rf-white; color needs fall back to the accent.',
    night: { ink: night.ink, vivid: night.accent, rgb: c.rgbTriplet(night.accent) },
    day: { ink: day.ink, vivid: day.accent, rgb: c.rgbTriplet(day.accent) },
  }));
  const surfaces = [
    pos('web', 'Web', 'surface', 1, 296, { index: 'hue', note: 'Prism.html web facets — the home violet.' }),
    pos('terminal', 'Terminal', 'surface', 2, 163, { index: 'hue', note: 'prism-term — phosphor mint.' }),
    pos('deck', 'Stream Deck', 'surface', 3, 66, { index: 'hue', note: 'prism-deck — the warm amber of a lit key.' }),
  ];
  // Terminal-catalog galleries (prism-term/src/facets/galleries.js, in its nav order): one gallery,
  // one λ on every surface (1.3.0). A terminal gallery with a web counterpart (same id, or TERM_WEB)
  // takes that gallery's exact hue, so Charts is λ 436 in Prism.html, on /terminal/ and in /tty.
  // Terminal-only galleries take half-steps of the web ramp, t = (k + ½)/17, spread evenly in
  // terminal nav order — stops no web gallery sits on — so every λ label names exactly one gallery.
  const TERM_WEB = { status: 'notify', diagrams: 'arch' };
  const STEPS = WEB.length - 1;
  const webOf = (id) => web.find((g) => g.id === (TERM_WEB[id] || id)) || null;
  const termOnly = TERM.filter(([id]) => !webOf(id)).map(([id]) => id);
  const halfStep = (j) => (Math.floor((j + 0.5) * STEPS / termOnly.length) + 0.5) / STEPS;
  const terminalGalleries = TERM.map(([id, label], i) => {
    const w = webOf(id);
    const h = w ? hueAt((w.order - 1) / STEPS) : hueAt(halfStep(termOnly.indexOf(id)));
    const p = pos(id, label, 'gallery', i + 1, h, { index: 'hue' });
    return { ...p, web: w ? w.id : null, webH: w ? w.h : null };
  });
  // every λ label belongs to one gallery identity (a web gallery and its terminal counterpart share it)
  const lamOwner = new Map();
  [...web.map((g) => [g.lambda, g.id]), ...terminalGalleries.map((g) => [g.lambda, g.web || 'term:' + g.id])].forEach(([l, who]) => {
    if (lamOwner.has(l) && lamOwner.get(l) !== who) throw new Error('gen: λ collision — ' + l + ' is both ' + lamOwner.get(l) + ' and ' + who);
    lamOwner.set(l, who);
  });

  // ── Status/semantic notes ────────────────────────────────────────────────
  const semantic = (m) => ({
    bg: col(m.bg, 'App canvas'), 'bg-deep': col(m['bg-deep'], night === m ? 'Behind hero/First Light, deck keys, terminal well' : 'Recessed wells, code gutters'),
    panel: col(m.panel, 'Rails, bars, panels'), panel2: col(m.panel2, night === m ? 'Secondary fill — raised at Night: hover rows, wells, segmented tracks' : 'Secondary fill — recessed by Day: wells, input fills, segmented tracks'),
    card: col(m.card, 'Card / tile body surface'),
    line: col(m.line, 'Hairline borders (decorative, not a 3:1 boundary)'), 'line-soft': col(m['line-soft'], 'Internal dividers'),
    'line-strong': col(m['line-strong'], 'Hover borders, emphasized dividers'),
    'line-control': col(m['line-control'], 'Control boundaries that must meet 3:1 (input baseline, checkbox, switch track)'),
    ink: col(m.ink, 'Primary text'), muted: col(m.muted, 'Secondary text'), dim: col(m.dim, 'Tertiary text, captions, counts'),
    faint: col(m.faint, 'Disabled text and decorative marks only (exempt; never for meaning)'),
    accent: col(m.accent, 'Brand violet: primary actions, links, selected states'),
    'accent-hi': col(m['accent-hi'], 'Accent hover'), 'accent-lo': col(m['accent-lo'], 'Accent pressed'),
    'accent-ink': col(m['accent-ink'], 'Text/icons on an accent fill'), accent2: col(m.accent2, 'Periwinkle partner for two-stop gradients'),
    info: col(m.info), pos: col(m.pos), warn: col(m.warn), neg: col(m.neg), crit: col(m.crit, 'Critical — the non-spectral magenta beyond red'),
  });

  // ── Refraction extension layer (per mode) ────────────────────────────────
  const rfNight = {
    'raised': night.panel2, 'rail': 'transparent',
    'glass': 'rgba(14,17,26,.72)', 'glass-strong': 'rgba(16,19,28,.9)', 'glass-blur': '18px', 'glass-sat': '140%', 'glass-line': 'rgba(255,255,255,.08)',
    'edge': 'rgba(255,255,255,.055)', 'edge-hi': 'rgba(255,255,255,.1)', 'edge-lo': 'rgba(0,0,0,.35)',
    'white': '#f6f3ff', 'beam-core': '#ffffff',
    'beam': 'linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,.92) 50%,rgba(255,255,255,0))',
    'beam-v': 'linear-gradient(180deg,rgba(255,255,255,0),rgba(255,255,255,.95) 30%,rgba(255,255,255,.95) 70%,rgba(255,255,255,0))',
    'beam-glow': '0 0 10px rgba(205,190,255,.55),0 0 2px rgba(255,255,255,.9)',
    'fringe': 'linear-gradient(90deg,rgba(255,110,140,.0),rgba(255,110,140,.55),rgba(255,214,120,.5),rgba(120,230,190,.5),rgba(110,170,255,.55),rgba(184,140,255,.0))',
    'halo': 'rgba(145,119,242,.16)', 'iris': 'linear-gradient(115deg,rgba(184,162,242,.10),rgba(134,189,249,.06) 40%,rgba(139,216,186,.06) 70%,rgba(238,195,111,.05))',
    'iris-edge': 'linear-gradient(115deg,rgba(203,185,247,.75),rgba(134,189,249,.55) 35%,rgba(139,216,186,.5) 65%,rgba(238,195,111,.45))',
    'grid-line': 'rgba(255,255,255,.035)', 'split-a': 'rgba(255,92,130,.6)', 'split-b': 'rgba(92,170,255,.6)', 'focus': '#d9ccff', 'focus-halo': 'rgba(184,162,242,.22)',
    'selection': 'rgba(184,162,242,.32)', 'scrim': 'rgba(3,4,8,.66)', 'hover': 'rgba(255,255,255,.045)', 'press': 'rgba(255,255,255,.07)',
    'accent-wash': 'rgba(184,162,242,.12)', 'accent-line': 'rgba(184,162,242,.38)',
    'code-bg': '#0c0e16', 'code-ink': '#d8d1f6',
    'syn-keyword': stops[0].night.ink.hex, 'syn-string': stops[5].night.ink.hex, 'syn-number': stops[8].night.ink.hex,
    'syn-tag': stops[2].night.ink.hex, 'syn-attr': stops[10].night.ink.hex, 'syn-comment': night.dim, 'syn-punct': night.muted,
    'shadow-1': '0 1px 2px rgba(0,0,0,.35)', 'shadow-2': '0 18px 40px -18px rgba(0,0,0,.75),0 2px 6px rgba(0,0,0,.3)',
    'shadow-3': '0 32px 80px -24px rgba(0,0,0,.85),0 8px 20px -8px rgba(0,0,0,.5)',
  };
  const rfDay = {
    'raised': '#ffffff', 'rail': '#fcfbfe',
    'glass': 'rgba(255,255,255,.72)', 'glass-strong': 'rgba(255,255,255,.9)', 'glass-blur': '18px', 'glass-sat': '160%', 'glass-line': 'rgba(32,24,72,.09)',
    'edge': 'rgba(255,255,255,.95)', 'edge-hi': '#ffffff', 'edge-lo': 'rgba(32,24,72,.07)',
    'white': 'conic-gradient(from 200deg,#de8fb8,#a993ec,#7fb0ea,#79cdb0,#dcbc6c,#de8fb8)', 'beam-core': day.accent,
    'beam': `linear-gradient(90deg,rgba(115,83,187,0),${day.accent} 22%,${stops[2].day.ink.hex} 52%,${stops[5].day.ink.hex} 80%,rgba(31,107,79,0))`,
    'beam-v': `linear-gradient(180deg,rgba(115,83,187,0),${day.accent} 25%,${stops[2].day.ink.hex} 60%,rgba(36,97,191,0))`,
    'beam-glow': '0 0 8px rgba(115,83,187,.28)',
    'fringe': 'linear-gradient(90deg,rgba(214,66,110,0),rgba(214,66,110,.45),rgba(196,140,20,.4),rgba(31,150,110,.4),rgba(46,110,214,.45),rgba(115,83,187,0))',
    'halo': 'rgba(176,150,240,.22)', 'iris': `linear-gradient(115deg,${stops[11].day.wash.hex} 0%,${stops[0].day.wash.hex} 26%,${stops[3].day.wash.hex} 52%,${stops[5].day.wash.hex} 76%,${stops[8].day.wash.hex} 100%)`,
    'iris-edge': 'linear-gradient(115deg,#e7a6c8,#b49ff0 30%,#8fb8f2 55%,#86d7bb 78%,#e6c98a)',
    'grid-line': 'rgba(24,18,42,.045)', 'split-a': 'rgba(214,52,104,.45)', 'split-b': 'rgba(36,104,222,.45)', 'focus': '#5b3ea8', 'focus-halo': 'rgba(115,83,187,.2)',
    'selection': 'rgba(115,83,187,.18)', 'scrim': 'rgba(28,22,56,.3)', 'hover': 'rgba(32,24,72,.04)', 'press': 'rgba(32,24,72,.07)',
    'accent-wash': 'rgba(115,83,187,.09)', 'accent-line': 'rgba(115,83,187,.4)',
    'code-bg': '#f3f1f9', 'code-ink': '#3b2f6b',
    'syn-keyword': stops[0].day.ink.hex, 'syn-string': stops[5].day.ink.hex, 'syn-number': stops[9].day.ink.hex,
    'syn-tag': stops[2].day.ink.hex, 'syn-attr': stops[10].day.ink.hex, 'syn-comment': day.dim, 'syn-punct': day.muted,
    'shadow-1': '0 1px 2px rgba(32,24,72,.05)', 'shadow-2': '0 1px 2px rgba(32,24,72,.05),0 14px 32px -16px rgba(64,40,150,.2)',
    'shadow-3': '0 28px 70px -24px rgba(48,32,120,.3),0 6px 16px -6px rgba(48,32,120,.12)',
  };

  // ── Type ─────────────────────────────────────────────────────────────────
  const type = {
    family: {
      sans: 'Inter, "Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif',
      mono: 'ui-monospace, "SF Mono", SFMono-Regular, "Cascadia Mono", "Segoe UI Mono", "JetBrains Mono", Menlo, Consolas, "Liberation Mono", monospace',
      files: ['design/fonts/inter-400-latin.woff2', 'design/fonts/inter-600-latin.woff2', 'design/fonts/inter-700-latin.woff2'],
      note: 'Inter is bundled at 400, 600 and 700 (Latin subsets in design/fonts/) — in Prism.html, self-hosted on the website, inlined in the specimen. font-synthesis stays off. No web fonts from CDNs.',
    },
    weight: { regular: 400, strong: 600, heading: 600, display: 700, note: 'Use only the three real faces: 400, 600, 700. In-between values snap to a face (500 → 400, 650 → 700) — never use them.' },
    scale: {
      display: { size: 66, line: 1.06, tracking: '-0.058em', weight: 700, use: 'Hero / First Light title (website h1: 66px / -3.8px)' },
      hero: { size: 112, min: 46, fluid: 'clamp(46px, 5vw + 16px, 112px)', line: 1.02, tracking: '-0.058em', weight: 700, use: 'Fluid landing display — the website hero h1 on large screens (~88px at 1440, 112px from 1920)' },
      h1: { size: 44, line: 1.1, tracking: '-0.042em', weight: 700, use: 'Gallery page title' },
      section: { size: 48, min: 40, fluid: 'clamp(40px, 1.25vw + 24px, 48px)', line: 1.08, tracking: '-0.045em', weight: 700, use: 'Section headings on large screens — website h2s, library page headers (fluid 40 → 48px; 48 from 1920px)' },
      h2: { size: 32, line: 1.2, tracking: '-0.039em', weight: 600, use: 'Section title (website h2: 32px / -1.25px)' },
      h3: { size: 22, line: 1.3, tracking: '-0.025em', weight: 600, use: 'Panel / dialog title' },
      h4: { size: 17, line: 1.35, tracking: '-0.018em', weight: 600, use: 'Card title, group header' },
      lead: { size: 16, line: 1.75, tracking: '-0.006em', weight: 400, use: 'Intro paragraphs' },
      body: { size: 14, line: 1.6, tracking: '-0.004em', weight: 400, use: 'Default text' },
      ui: { size: 13, line: 1.4, tracking: '0em', weight: 400, use: 'Nav items, buttons, inputs' },
      small: { size: 12, line: 1.5, tracking: '0em', weight: 400, use: 'Tile meta, help text' },
      caption: { size: 11, line: 1.45, tracking: '0.005em', weight: 400, use: 'Footnotes, timestamps' },
      eyebrow: { size: 10, line: 1.2, tracking: '0.15em', weight: 600, family: 'mono', transform: 'uppercase', use: 'Instrument labels: 01 / CHARTS · 209 FACETS · λ 436' },
      code: { size: 12, line: 1.7, tracking: '0em', weight: 400, family: 'mono', use: 'Code, class refs, terminal' },
      count: { size: 11, line: 1.2, tracking: '0.02em', weight: 400, family: 'mono', use: 'Counts and λ in nav, chips' },
    },
  };

  const radius = { xs: 4, sm: 6, md: 8, lg: 12, xl: 16, '2xl': 24, pill: 999, note: 'Website radii are 8 / 12 / 16. Buttons + inputs md, tiles lg, panels/dialogs xl.' };
  const space = { unit: 4, scale: { '0': 0, '0.5': 2, '1': 4, '1.5': 6, '2': 8, '3': 12, '4': 16, '5': 20, '6': 24, '8': 32, '10': 40, '12': 48, '16': 64, '22': 88, '30': 120 },
    density: { comfortable: 1, compact: 0.85, note: 'Contract --dens multiplies vertical padding in chrome.' },
    layout: { 'topbar-h': 56, 'rail-w': 264, 'content-max': 1480, 'tile-min': 296, gutter: 16, 'grid-cell': 34 } };
  const motion = {
    duration: { instant: 80, fast: 140, base: 240, slow: 400, deliberate: 600, sweep: 600, firstLight: 1600, note: 'firstLight is a ceiling owned by design/first-light/.' },
    easing: {
      'out-expo': 'cubic-bezier(.16,1,.3,1)', out: 'cubic-bezier(.22,1,.36,1)', 'in-out': 'cubic-bezier(.65,0,.35,1)',
      in: 'cubic-bezier(.7,0,.84,0)', linear: 'linear',
      note: 'Arrivals use out-expo; exits use in at ~60% of the arrival duration; continuous loops use linear or in-out.',
    },
    stagger: { step: 28, max: 12, note: 'Cascade at most 12 items (336ms); everything after arrives with the 12th.' },
    patterns: {
      'refract-in': 'Converge: opacity 0→1, translateY 6px→0, blur 6px→0, a ±3px red/blue chromatic split resolving to 0. 600ms out-expo. Headers and hero type.',
      rise: 'Tiles: opacity 0→1, translateY 10px→0, scale .985→1. 400ms out-expo, staggered 28ms. The tile top edge carries a 1px fringe glint that fades.',
      'beam-sweep': 'A 1px beam travels the long axis once (600ms in-out). Theme switch relight, progress, copy confirmation.',
      glint: 'A diagonal spectral glint crosses a lit edge once on hover (600ms out).',
      'theme-relight': 'Day <-> Night: View Transition; the new theme is revealed behind a vertical beam that travels away from the toggle that was pressed (origin right of centre → right-to-left; no origin → left-to-right). 600ms in-out, a ceiling. Any input (pointerdown, keydown, wheel, touchstart) ends it at once. Fallback: 240ms cross-fade. Implemented by PrismFirstLight.relight(applyFn, originEl) in design/first-light/.',
      reduced: 'prefers-reduced-motion: every pattern becomes a 120ms opacity fade or no animation; no translation, blur, sweep or loop. First Light is skipped entirely.',
    },
  };
  const elevation = {
    note: 'Depth from light, not shadow: each level adds light to the top edge and a little lift to the fill. Only overlays (level 3) cast a real shadow.',
    night: {
      0: { name: 'canvas', fill: night.bg, edge: 'none', shadow: 'none' },
      1: { name: 'resting', fill: night.card, border: night.line, edge: 'inset 0 1px 0 rgba(255,255,255,.055)', shadow: rfNight['shadow-1'] },
      2: { name: 'raised', fill: night.panel2, border: night['line-strong'], edge: 'inset 0 1px 0 rgba(255,255,255,.1)', shadow: rfNight['shadow-2'] },
      3: { name: 'overlay', fill: rfNight.glass, blur: '18px', border: 'rgba(255,255,255,.08)', edge: 'inset 0 1px 0 rgba(255,255,255,.12)', shadow: rfNight['shadow-3'] },
    },
    day: {
      0: { name: 'canvas', fill: day.bg, edge: 'none', shadow: 'none' },
      1: { name: 'resting', fill: day.card, border: day.line, edge: 'inset 0 1px 0 #ffffff', shadow: rfDay['shadow-1'] },
      2: { name: 'raised', fill: day.panel, border: day['line-strong'], edge: 'inset 0 1px 0 #ffffff', shadow: rfDay['shadow-2'], sheen: 'iris-edge border on hover' },
      3: { name: 'overlay', fill: rfDay.glass, blur: '18px', border: 'rgba(32,24,72,.08)', edge: 'inset 0 1px 0 #ffffff', shadow: rfDay['shadow-3'] },
    },
  };

  // ── Terminal ────────────────────────────────────────────────────────────
  const termNight = {
    background: '#0a0c12', foreground: '#e6e6ef', cursor: night.accent, cursorText: '#0a0c12', selectionBackground: '#2e2748', selectionForeground: '#f0f0f5',
    ansi: [
      ['black', '#1d202b'], ['red', c.oklch(0.74, 0.13, 22)], ['green', c.oklch(0.8, 0.12, 155)], ['yellow', c.oklch(0.85, 0.11, 88)],
      ['blue', c.oklch(0.74, 0.12, 262)], ['magenta', night.accent], ['cyan', c.oklch(0.8, 0.1, 212)], ['white', '#c6c7d3'],
      ['brightBlack', '#76798e'], ['brightRed', c.oklch(0.82, 0.1, 22)], ['brightGreen', c.oklch(0.88, 0.09, 158)], ['brightYellow', c.oklch(0.92, 0.09, 95)],
      ['brightBlue', c.oklch(0.83, 0.09, 262)], ['brightMagenta', c.oklch(0.86, 0.08, 300)], ['brightCyan', c.oklch(0.89, 0.075, 205)], ['brightWhite', '#f6f6fb'],
    ],
  };
  const termDayBg = '#f8f7fb';
  // Day: 7 (white) and 15 (bright white) are LIGHT, as in Solarized / Tango light, because
  // TUIs paint them as fills (status bars, selections) and put them as text on colored fills
  // (htop, mc, tmux: white on red / blue). Prism's own 16-color output never draws 7 / 15 text
  // on the default background (src/color.js fgParam), and the Day roles keep text off them.
  const dsolve = (C, h, t) => c.oklch(c.solveL(C, h, termDayBg, t, 'darker'), C, h);
  const termDay = {
    background: termDayBg, foreground: '#23222f', cursor: day.accent, cursorText: '#ffffff', selectionBackground: '#ddd5f3', selectionForeground: '#20202e',
    ansi: [
      ['black', '#23222f'], ['red', dsolve(0.17, 25, 5.6)], ['green', dsolve(0.13, 155, 5.6)], ['yellow', dsolve(0.13, 80, 5.6)],
      ['blue', dsolve(0.17, 262, 5.6)], ['magenta', day.accent], ['cyan', dsolve(0.11, 212, 5.6)], ['white', '#e6e5ee'],
      ['brightBlack', '#55546a'], ['brightRed', dsolve(0.19, 18, 4.6)], ['brightGreen', dsolve(0.15, 150, 4.6)], ['brightYellow', dsolve(0.15, 88, 4.6)],
      ['brightBlue', dsolve(0.19, 255, 4.6)], ['brightMagenta', dsolve(0.19, 315, 4.6)], ['brightCyan', dsolve(0.12, 205, 4.6)], ['brightWhite', '#ffffff'],
    ],
  };
  // xterm-256: surfaces take the plain nearest index (OKLab). Text and marks take a *designed*
  // index (c.pick256): the nearest if it clears 4.5:1 (marks 3:1) on every 256-color surface,
  // else the hue-faithful nearest that does. The surfaces are the terminal's own background
  // (cells with no fill) and each theme surface as it quantizes (Day bg → 255 #eeeeee).
  const nearest = (hex) => c.nearest256(hex);
  const SURFACE_KEYS = ['bg', 'panel', 'panel2', 'card', 'line'];
  const TEXT_KEYS = ['ink', 'muted', 'dim', 'accent', 'accent2', 'info', 'pos', 'warn', 'neg', 'crit'];
  // ANSI-16 slot each token is drawn with at 16 colors, [text, fill]; -1 = the terminal's default color.
  const ROLES = {
    night: { bg: [0, -1], panel: [0, 0], panel2: [0, 0], card: [0, 0], line: [8, 0], ink: [-1, 15], muted: [7, 7], dim: [8, 8], accent: [5, 5], accent2: [12, 12], info: [4, 4], pos: [2, 2], warn: [3, 3], neg: [1, 1], crit: [13, 13] },
    day: { bg: [15, -1], panel: [15, -1], panel2: [15, -1], card: [15, -1], line: [8, 7], ink: [-1, 0], muted: [8, 8], dim: [8, 8], accent: [5, 5], accent2: [4, 4], info: [4, 4], pos: [2, 2], warn: [3, 3], neg: [1, 1], crit: [13, 13] },
  };
  const termTheme = (t, mode) => {
    const M = mode === 'night' ? night : day;
    const surfaces256 = [...new Set([t.background, ...['bg', 'panel', 'panel2', 'card'].map((k) => nearest(M[k]).hex)])];
    const pick = (hex, need = 4.5) => c.pick256(hex, surfaces256, need);
    // Background-role slots take the plain nearest index: 0 at Night, 7 / 15 by Day (light fills).
    const slot256 = (hex, i) => ((mode === 'night' && i === 0) || (mode === 'day' && (i === 7 || i === 15)) ? nearest(hex).index : pick(hex, 4.5).index);
    return {
      ...Object.fromEntries(Object.entries(t).filter(([k]) => k !== 'ansi')),
      ansi16: t.ansi.map(([name, hex], i) => ({ index: i, name, hex, contrast: +c.contrast(hex, t.background).toFixed(2), xterm256: slot256(hex, i) })),
      roles: ROLES[mode],
      surfaces256,
      spectrum256: stops.map((s) => ({ name: s.name, ...pick(s[mode].ink.hex) })),
      tokens256: Object.fromEntries([...SURFACE_KEYS.map((k) => [k, nearest(M[k]).index]), ...TEXT_KEYS.map((k) => [k, pick(M[k]).index])]),
      galleries256: Object.fromEntries(terminalGalleries.map((g) => [g.id, { ink: pick(g[mode].ink).index, vivid: pick(g[mode].vivid, 3).index }])),
    };
  };
  const terminal = {
    note: 'ANSI-16 schemes for Night/Day terminals with the 16-color slot of each token (roles: [text, fill], -1 = the terminal default); designed xterm-256 indexes (tokens256, spectrum256 = spectrum ink, galleries256 = galleries.terminal ink/vivid, ansi16[].xterm256); truecolor = the hex values. surfaces256 = the backgrounds 256-color text sits on.',
    night: termTheme(termNight, 'night'),
    day: termTheme(termDay, 'day'),
    hueToAnsi16: { violet: 5, periwinkle: 4, azure: 4, cerulean: 6, cyan: 6, mint: 2, jade: 2, lime: 10, citrine: 3, amber: 3, coral: 1, rose: 13 },
    guidance: {
      depth: 'Detect in order: NO_COLOR → none; COLORTERM=truecolor|24bit → truecolor; TERM=*256color* → 256; else 16. Never guess truecolor from TERM alone.',
      mode: 'Night is the default. Query OSC 11 (background color) with a 100ms timeout; else parse COLORFGBG; L(bg) > 0.6 → Day palette.',
      truecolor: 'Use the hex tokens and the spectrum tiers directly (night.ink / night.vivid; day.ink / day.vivid). Gradients interpolate in OKLCH, not RGB.',
      x256: 'Surfaces map to the nearest 16–255 index by OKLab distance. Text (ink tiers, text tokens) uses the designed index: the nearest if it clears 4.5:1 on every surfaces256 entry, else the hue-faithful nearest that does; marks (vivid ticks) the same at 3:1. Art and gradients stay plain nearest. Do not use 0–15 for brand hues — users remap them.',
      x16: 'Only semantic slots: 5 magenta = Prism violet (accent), 2 green = pos, 3 yellow = warn, 1 red = neg, 4 blue = info, 8 bright black = dim text. Gallery hue → hueToAnsi16.',
      dim: 'Use SGR 2 (faint) only on top of color 7/15; many terminals ignore it — prefer explicit dim color (8 / tokens256.dim).',
      shipping: 'Ship as Windows Terminal, iTerm2, Alacritty, kitty, WezTerm, Ghostty and Xresources files named "Prism Night" / "Prism Day".',
    },
  };

  // ── Stream Deck key grammar ─────────────────────────────────────────────
  const deck = {
    note: 'Author every key at 144×144 (@2x); the 72×72 render is a straight downsample. Units below are @144 with the @72 value in parentheses.',
    canvas: { key: { '1x': 72, '2x': 144 }, plusKey: 120, xlKey: 96, dialSegment: { w: 200, h: 100 }, touchStrip: { w: 800, h: 100, segments: 4 } },
    grid: { unit: 8, columns: 18, note: '8px grid @144 (4px @72).' },
    safe: { bleed: 8, content: 12, text: 16, note: 'Bezel may crop the outer 8px (4). Nothing essential outside 12px (6); text inside 16px (8).' },
    type: {
      value: { size: 44, sizeAt72: 22, weight: 600, tracking: '-0.02em', family: 'sans', maxChars: 5 },
      label: { size: 22, sizeAt72: 11, weight: 600, tracking: '0em', family: 'sans', maxLines: 2, maxCharsPerLine: 9 },
      micro: { size: 16, sizeAt72: 8, weight: 600, tracking: '0.08em', family: 'mono', transform: 'uppercase', note: 'Non-essential only (λ, coordinates). Never the only label.' },
      dialValue: { size: 34, weight: 600, family: 'sans', note: 'On a 200×100 dial segment' },
      dialLabel: { size: 14, weight: 600, family: 'mono', transform: 'uppercase', tracking: '0.1em' },
      minimum: 'Nothing below 16px @144 (8 @72). Arm\'s-length legibility: labels 22px+ @144, values 40px+ @144.',
    },
    material: {
      night: { fill: 'radial-gradient(120% 90% at 50% 0%, #161a27 0%, #0b0d14 62%, #06070b 100%)', edge: 'inset 0 2px 0 rgba(255,255,255,.08)', ink: night.ink, muted: night.muted },
      day: { fill: 'radial-gradient(120% 90% at 50% 0%, #ffffff 0%, #f4f3f8 60%, #e9e7f1 100%)', edge: 'inset 0 2px 0 #ffffff', ink: day.ink, muted: day.muted },
      default: 'night', note: 'Hardware LCD keys default to Night (no glare in a dark room); Day is offered as a profile option.',
    },
    hue: 'Each key carries its gallery hue as the spectral index: a 4px (2) bar, 32px (16) wide, centered 12px (6) above the bottom edge. Active state lights the whole edge in the hue.',
    states: {
      off: { index: 'hue at 45% opacity', edge: 'lit edge only', glyph: 'muted', glow: 'none' },
      on: { index: 'hue at 100% + 6px glow', edge: '3px (1.5) inner ring in the hue', glyph: 'hue ink', glow: 'radial hue wash 22% from the bottom' },
      alert: { index: 'warn or neg', edge: '4px (2) inner ring in warn/neg', glyph: 'ink', glow: 'breathes 1 Hz (opacity .55↔1), max 10 s, then holds', shape: 'corner notch (24px triangle, top-right) — never color alone' },
      busy: { index: 'hidden', edge: 'a white beam segment travels the perimeter, 1.2 s per lap, 10 fps', glyph: 'muted', glow: 'none' },
      disabled: { index: 'none', edge: 'none', glyph: 'faint', glow: 'none' },
    },
    frameRate: 'Animate at ≤10 fps with precomputed frames; static keys between interactions. Reduced motion (plugin setting): no loops; busy = static three-dot glyph.',
  };

  return {
    $schema: 'prism-refraction-tokens/1', name: 'Prism · Refraction', version: VERSION,
    description: 'White light in. Every color out. The design language for Prism web, terminal and Stream Deck surfaces.',
    themes: { 'prism-dark': { name: 'Prism Night', mode: 'dark', ds: 'prism' }, 'prism-light': { name: 'Prism Day', mode: 'light', ds: 'prism' } },
    color: { night: semantic(night), day: semantic(day) },
    rf: { night: rfNight, day: rfDay },
    spectrum: {
      definition: { space: 'oklch', hueStart: H0, hueEnd: H1, direction: 'decreasing hue (violet → rose)', stops: STOP_NAMES.length,
        night: { ink: 'L = 0.795 + 0.05·bump(h,100°,50°), C = 0.105', vivid: 'L = 0.715 + 0.12·bump(h,105°,48°), C = 0.13 (gamut-clamped)', wash: 'vivid @ 14% alpha' },
        day: { ink: 'C = 0.15, L solved for 4.9:1 on --panel2 (so ≥4.5 on every Day surface)', vivid: 'C = 0.16, L solved for 3.2:1 on --bg', wash: 'L = 0.935, C = 0.042 (pearl iridescence)', sheen: 'L = 0.74 + 0.07·bump(h,100°,50°), C = 0.13 — decorative gradients only (--rf-spectrum in Day)' },
        lambda: 'λ = dominant wavelength (CIE 1931, D65) of the Night vivid color; purples show the complementary wavelength with a "c" suffix.' },
      uniformity: { night: { ink: stat(adj('night', 'ink')), vivid: stat(adj('night', 'vivid')) }, day: { ink: stat(adj('day', 'ink')), vivid: stat(adj('day', 'vivid')) }, metric: 'ΔE OKLab between adjacent stops' },
      stops,
    },
    galleries: { web, app, surfaces, terminal: terminalGalleries, rule: 'One λ per gallery across surfaces. Web: gallery hue = even steps along the spectrum in web navigation order, t = (order-1)/17 over PAGES. Terminal (prism-term galleries.js): a gallery with a web counterpart (same id, or status → notify, diagrams → arch) takes the hue and λ of that web gallery; terminal-only galleries take half-steps t = (k+½)/17 that no web gallery uses, spread evenly in terminal nav order. Every λ label names one gallery. If a nav order changes, regenerate.' },
    type, radius, space, motion, elevation, terminal, deck,
  };
}

// ════════════════════════════════════════════════════════════════════════════
function emit(T) {
  const themeString = (m) => {
    const C = T.color[m], R = T.rf[m], d = [];
    const v = (k, val) => d.push(`--${k}:${val}`);
    const hx = (k) => C[k].hex;
    d.push(`color-scheme:${m === 'night' ? 'dark' : 'light'}`);
    // contract (order mirrors the existing registry strings)
    ['bg', 'panel', 'panel2', 'card', 'line', 'ink', 'muted', 'dim'].forEach((k) => v(k, hx(k)));
    v('accent', hx('accent')); v('accent-rgb', c.rgbTriplet(hx('accent'))); v('accent2', hx('accent2'));
    ['info', 'pos', 'warn', 'neg', 'crit'].forEach((k) => { v(k, hx(k)); v(`${k}-rgb`, c.rgbTriplet(hx(k))); });
    const a = c.rgbTriplet(hx('accent'));
    v('cardgrad', m === 'night' ? `linear-gradient(157deg,rgba(${a},.07),rgba(${a},0) 55%)` : `linear-gradient(157deg,rgba(${a},.045),rgba(${a},0) 55%)`);
    v('font', T.type.family.sans);
    v('r-sm', T.radius.sm + 'px'); v('r-md', T.radius.md + 'px'); v('r-lg', T.radius.lg + 'px'); v('r-xl', T.radius.xl + 'px');
    const E = T.elevation[m];
    v('elev-1', `${E[1].edge},${E[1].shadow}`); v('elev-2', `${E[2].edge},${E[2].shadow}`);
    v('dur', T.motion.duration.base / 1000 + 's'); v('ease', T.motion.easing['out-expo']);
    v('bd', '1px'); v('head-w', T.type.weight.heading); v('dens', T.space.density.comfortable);
    if (m === 'night') { v('cs-topnav-bg', 'rgba(10,12,18,.78)'); v('cs-topnav-line', '#1d202b'); v('cs-topnav-ink', hx('ink')); v('cs-topnav-dim', hx('muted')); v('cs-topnav-hover', 'rgba(255,255,255,.06)'); v('cs-topnav-elev', 'inset 0 -1px 0 rgba(255,255,255,.03)'); }
    else { v('cs-topnav-bg', 'rgba(246,245,249,.8)'); v('cs-topnav-line', '#e3e1ec'); v('cs-topnav-ink', hx('ink')); v('cs-topnav-dim', hx('muted')); v('cs-topnav-hover', 'rgba(32,24,72,.05)'); v('cs-topnav-elev', 'inset 0 -1px 0 rgba(255,255,255,.9)'); }
    // ── Refraction extension layer ──
    v('rf-mode', m);
    ['bg-deep', 'line-soft', 'line-strong', 'line-control', 'faint', 'accent-hi', 'accent-lo', 'accent-ink'].forEach((k) => v('rf-' + k, hx(k)));
    Object.entries(R).forEach(([k, val]) => v('rf-' + k, val));
    v('rf-mono', T.type.family.mono);
    // spectrum stops
    T.spectrum.stops.forEach((s) => { v(`rf-s-${s.name}`, s[m].ink.hex); v(`rf-s-${s.name}-v`, s[m].vivid.hex); v(`rf-s-${s.name}-rgb`, c.rgbTriplet(s[m].vivid.hex)); });
    const deco = (s) => (m === 'day' && s.day.sheen ? s.day.sheen.hex : s[m].vivid.hex);
    v('rf-spectrum', `linear-gradient(90deg,${T.spectrum.stops.map(deco).join(',')})`);
    v('rf-spectrum-v', `linear-gradient(180deg,${T.spectrum.stops.map(deco).join(',')})`);
    v('rf-spectrum-ink', `linear-gradient(90deg,${T.spectrum.stops.map((s) => s[m].ink.hex).join(',')})`);
    v('rf-spectrum-text', m === 'night' ? 'linear-gradient(100deg,#c1a8f8 10%,#a8b9fc 55%,#a0decf 100%)' : `linear-gradient(100deg,${T.color.day.accent.hex} 10%,${T.spectrum.stops[2].day.ink.hex} 55%,${T.spectrum.stops[5].day.ink.hex} 100%)`);
    // positions (galleries / app pages / surfaces)
    [...T.galleries.web, ...T.galleries.app, ...T.galleries.surfaces].forEach((g) => {
      const p = g.kind === 'surface' ? 'rf-surf-' : 'rf-g-';
      v(p + g.id, g[m].ink); v(p + g.id + '-v', g[m].vivid); v(p + g.id + '-rgb', g[m].rgb);
    });
    // current hue (default = accent); set per subtree with [data-rf-gallery]
    v('rf-hue', hx('accent')); v('rf-hue-v', hx('accent')); v('rf-hue-rgb', c.rgbTriplet(hx('accent')));
    // type / radius / motion / space
    Object.entries(T.type.scale).forEach(([k, s]) => { v(`rf-fs-${k}`, s.fluid || s.size + 'px'); v(`rf-lh-${k}`, s.line); v(`rf-ls-${k}`, s.tracking); });
    v('rf-fw-regular', T.type.weight.regular); v('rf-fw-strong', T.type.weight.strong); v('rf-fw-display', T.type.weight.display);
    v('rf-r-xs', T.radius.xs + 'px'); v('rf-r-2xl', T.radius['2xl'] + 'px'); v('rf-r-pill', T.radius.pill + 'px');
    Object.entries(T.motion.duration).filter(([k]) => k !== 'note').forEach(([k, ms]) => v(`rf-dur-${k.replace(/[A-Z]/g, (x) => '-' + x.toLowerCase())}`, ms + 'ms'));
    Object.entries(T.motion.easing).filter(([k]) => k !== 'note').forEach(([k, e]) => v(`rf-ease-${k}`, e));
    v('rf-stagger', T.motion.stagger.step + 'ms');
    Object.entries(T.space.scale).forEach(([k, px]) => v(`rf-sp-${k.replace('.', '_')}`, px + 'px'));
    Object.entries(T.space.layout).forEach(([k, px]) => v(`rf-${k}`, px + 'px'));
    const s = `:root{${d.join(';')}}`;
    if (/[{}]/.test(s.slice(6, -1))) throw new Error('theme string contains braces');
    return s;
  };
  const DARK = themeString('night'), LIGHT = themeString('day');

  // themes.js
  out('themes.js',
    `// Prism · Refraction ${T.version} — GENERATED from design/tokens.json by design/tools/gen.mjs. Do not hand-edit.\n` +
    `// Registry entries:\n//   {id:'prism-dark',  ds:'prism', name:'Prism Night', mode:'dark',  accent:'${T.color.night.accent.hex}', builtin:true, css:PRISM_DARK_CSS},\n` +
    `//   {id:'prism-light', ds:'prism', name:'Prism Day',   mode:'light', accent:'${T.color.day.accent.hex}', builtin:true, css:PRISM_LIGHT_CSS},\n` +
    `// Each string is ONE :root{} block, no braces/semicolons inside values (themeMatrix() parses it).\n` +
    `export const PRISM_VERSION = ${JSON.stringify(T.version)};\n` +
    `export const PRISM_DARK_CSS = ${JSON.stringify(DARK)};\n` +
    `export const PRISM_LIGHT_CSS = ${JSON.stringify(LIGHT)};\n`);

  // prism.css = header + two theme blocks + hue setters + primitives
  const prim = readFileSync(resolve(TOOLS, 'src/primitives.css'), 'utf8').replace(/\r\n/g, '\n');
  const ids = [...T.galleries.web, ...T.galleries.app].map((g) => g.id);
  const hueSetters = ids.map((id) => `[data-rf-gallery="${id}"]{--rf-hue:var(--rf-g-${id});--rf-hue-v:var(--rf-g-${id}-v);--rf-hue-rgb:var(--rf-g-${id}-rgb)}`).join('\n') + '\n' +
    T.galleries.surfaces.map((g) => `[data-rf-surface="${g.id}"]{--rf-hue:var(--rf-surf-${g.id});--rf-hue-v:var(--rf-surf-${g.id}-v);--rf-hue-rgb:var(--rf-surf-${g.id}-rgb)}`).join('\n');
  const pretty = (s) => s.replace(/^:root\{/, '').replace(/\}$/, '').split(';').map((x) => '  ' + x + ';').join('\n');
  const css = `/* ══════════════════════════════════════════════════════════════════════════
   Prism · Refraction ${T.version} — "White light in. Every color out."
   GENERATED by design/tools/gen.mjs from design/tokens.json (theme blocks + hue
   setters) and design/tools/src/primitives.css (the hand-authored reference
   layer). Edit those, not this file. See design/README.md.

   1. Prism Night  (theme id prism-dark)  — :root, or [data-theme="prism-dark"]
   2. Prism Day    (theme id prism-light) — [data-theme="prism-light"]
   3. Hue setters  — [data-rf-gallery=<id>] / [data-rf-surface=<id>] set --rf-hue*
   4. Primitives   — .rf-* reference components (namespaced; never .panel/.card)
   In Prism.html the shell injects the theme strings from design/themes.js; use
   this file standalone (site, specimen, deck/terminal web previews).
   ══════════════════════════════════════════════════════════════════════════ */

/* 1 ── Prism Night ───────────────────────────────────────────────────────── */
:root,:root[data-theme="prism-dark"]{
${pretty(DARK)}
}

/* 2 ── Prism Day ─────────────────────────────────────────────────────────── */
:root[data-theme="prism-light"]{
${pretty(LIGHT)}
}

/* 3 ── Hue setters ───────────────────────────────────────────────────────── */
${hueSetters}

${prim}`;
  out('prism.css', css);

  // contrast audit (feeds the specimen stat and the README tables)
  const A = audit(T);
  if (A.fails) console.warn(`gen: WARNING — ${A.fails} contrast checks fail; run node design/tools/contrast.mjs`);

  // specimen: inline prism.css + the three Inter faces + tokens into the template
  const faces = [400, 600, 700].map((w) => {
    const f = resolve(DESIGN, `fonts/inter-${w}-latin.woff2`);
    return existsSync(f) ? `@font-face{font-family:'Inter';font-style:normal;font-weight:${w};font-display:swap;src:url(data:font/woff2;base64,${readFileSync(f).toString('base64')}) format('woff2')}` : '';
  }).join('\n');
  const slim = {
    version: T.version,
    color: T.color, rf: T.rf, spectrum: { stops: T.spectrum.stops, uniformity: T.spectrum.uniformity },
    galleries: { web: T.galleries.web, app: T.galleries.app, surfaces: T.galleries.surfaces },
    type: T.type, motion: T.motion, terminal: { night: T.terminal.night, day: T.terminal.day }, deck: T.deck,
  };
  let html = readFileSync(resolve(TOOLS, 'src/specimen.src.html'), 'utf8').replace(/\r\n/g, '\n');
  html = html.replace('/*@@FONTS@@*/', () => faces).replace('/*@@PRISM_CSS@@*/', () => css)
    .replace('/*@@TOKENS@@*/', () => JSON.stringify(slim).replace(/</g, '\\u003c')).replace(/@@VERSION@@/g, T.version)
    .replace(/@@AUDIT@@/g, `${A.total - A.fails}<span>/${A.total}</span>`);
  out('specimen.html', html);

  // README tables
  out('README.md', fillReadme(readFileSync(resolve(DESIGN, 'README.md'), 'utf8'), T, A.md));
}
