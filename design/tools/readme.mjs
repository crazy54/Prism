// Fills the generated tables in design/README.md between <!-- gen:x --> … <!-- /gen:x --> markers.
// Prose outside the markers is hand-written and never touched.
//
//   node design/tools/readme.mjs           refill README.md from tokens.json (gen.mjs also does this)
//   node design/tools/readme.mjs --check   exit 1 if README.md's generated tables are stale
//
// Exported: fillReadme(md, tokens, auditMd) → md, readmeBlock(md, key) → string | null.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DESIGN = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const code = (s) => '`' + String(s).replace(/\|/g, '\\|') + '`';
const ok = (o) => o.oklch.replace('oklch', '');
const CONTRACT = new Set(['bg', 'panel', 'panel2', 'card', 'line', 'ink', 'muted', 'dim', 'accent', 'accent2', 'info', 'pos', 'warn', 'neg', 'crit']);
const ROLE = { info: 'Information', pos: 'Positive / success', warn: 'Warning', neg: 'Negative / error' };

const tables = (T, auditMd) => ({
  version: () => T.version,
  neutrals: () => {
    let s = '| Token | Night | Day | Role |\n|---|---|---|---|\n';
    for (const k of Object.keys(T.color.night)) {
      const n = T.color.night[k], d = T.color.day[k];
      s += `| ${code(CONTRACT.has(k) ? `--${k}` : `--rf-${k}`)} | ${code(n.hex)} <sub>${ok(n)}</sub> | ${code(d.hex)} <sub>${ok(d)}</sub> | ${n.note || ROLE[k] || ''} |\n`;
    }
    return s + `\nAlso in the strings: every status has an \`-rgb\` triplet (\`--accent-rgb\`, \`--info-rgb\` …), \`--cardgrad\` (a 157° accent light at 7 % / 4.5 %), \`--font\`, \`--r-sm/md/lg/xl\` 6/8/12/16, \`--elev-1/2\`, \`--dur\` .24s, \`--ease\` out-expo, \`--bd\` 1px, \`--head-w\` ${T.type.weight.heading}, \`--dens\` 1 and the shell's \`--cs-topnav-*\` (glass top bar).\n`;
  },
  rf: () => {
    const groups = [
      ['Surfaces & glass', ['raised', 'rail', 'glass', 'glass-strong', 'glass-blur', 'glass-sat', 'glass-line', 'edge', 'edge-hi', 'edge-lo']],
      ['Light', ['white', 'beam-core', 'beam', 'beam-v', 'beam-glow', 'fringe', 'halo', 'iris', 'iris-edge', 'grid-line', 'split-a', 'split-b']],
      ['Interaction', ['focus', 'focus-halo', 'selection', 'scrim', 'hover', 'press', 'accent-wash', 'accent-line']],
      ['Code', ['code-bg', 'code-ink', 'syn-keyword', 'syn-string', 'syn-number', 'syn-tag', 'syn-attr', 'syn-comment', 'syn-punct']],
      ['Shadow (overlays only)', ['shadow-1', 'shadow-2', 'shadow-3']],
    ];
    let s = '';
    for (const [title, keys] of groups) {
      s += `\n**${title}**\n\n| Token | Night | Day |\n|---|---|---|\n`;
      for (const k of keys) s += `| ${code('--rf-' + k)} | ${code(T.rf.night[k])} | ${code(T.rf.day[k])} |\n`;
    }
    return s + `\nType, radius, motion, space and layout tokens are in the strings too: \`--rf-fs-*\` / \`--rf-lh-*\` / \`--rf-ls-*\`, \`--rf-fw-*\`, \`--rf-mono\`, \`--rf-r-xs/2xl/pill\`, \`--rf-dur-*\`, \`--rf-ease-*\`, \`--rf-stagger\`, \`--rf-sp-*\`, \`--rf-topbar-h\`, \`--rf-rail-w\`, \`--rf-content-max\`, \`--rf-tile-min\`, \`--rf-gutter\`, \`--rf-grid-cell\`, and \`--rf-mode\` (\`night\` / \`day\`).\n`;
  },
  spectrum: () => {
    let s = '| # | Stop | h° | λ | Night ink | Night vivid | Day ink | Day vivid | Day wash | Day sheen |\n|---|---|---|---|---|---|---|---|---|---|\n';
    T.spectrum.stops.forEach((st, i) => {
      s += `| ${i + 1} | **${st.name}** | ${st.h} | ${st.lambda} | ${code(st.night.ink.hex)} | ${code(st.night.vivid.hex)} | ${code(st.day.ink.hex)} | ${code(st.day.vivid.hex)} | ${code(st.day.wash.hex)} | ${code(st.day.sheen.hex)} |\n`;
    });
    const u = T.spectrum.uniformity;
    return s + `\nPerceptual evenness (ΔE OKLab between neighbors): Night ink ${u.night.ink.min}–${u.night.ink.max}, Night vivid ${u.night.vivid.min}–${u.night.vivid.max}; Day ink ${u.day.ink.min}–${u.day.ink.max}, Day vivid ${u.day.vivid.min}–${u.day.vivid.max}. Day is less even only where sRGB runs out of chroma at text-safe lightness (cyan, lime).\n`;
  },
  galleries: () => {
    let s = '**Galleries** (web)\n\n| # | id | Gallery | h° | λ | Night ink | Night vivid | Day ink | Day vivid | Index |\n|---|---|---|---|---|---|---|---|---|---|\n';
    for (const g of T.galleries.web) s += `| ${String(g.order).padStart(2, '0')} | ${code(g.id)} | ${g.label} | ${g.h} | ${g.lambda} | ${code(g.night.ink)} | ${code(g.night.vivid)} | ${code(g.day.ink)} | ${code(g.day.vivid)} | ${g.index === 'full-spectrum' ? 'full ramp' : 'hue tick'} |\n`;
    s += '\n**App pages** (white light)\n\n| id | Page | Label | Index | Color fallback |\n|---|---|---|---|---|\n';
    for (const a of T.galleries.app) s += `| ${code(a.id)} | ${a.label} | ${a.lambda} | \`--rf-white\` tick | accent |\n`;
    s += '\n**Surfaces**\n\n| id | Surface | h° | λ | Night ink | Night vivid | Day ink | Day vivid | Note |\n|---|---|---|---|---|---|---|---|---|\n';
    for (const g of T.galleries.surfaces) s += `| ${code(g.id)} | ${g.label} | ${g.h} | ${g.lambda} | ${code(g.night.ink)} | ${code(g.night.vivid)} | ${code(g.day.ink)} | ${code(g.day.vivid)} | ${g.note} |\n`;
    return s;
  },
  'terminal-galleries': () => {
    let s = '| # | id | Terminal gallery | h° | λ | Night ink | Night vivid | Day ink | Day vivid | Web counterpart |\n|---|---|---|---|---|---|---|---|---|---|\n';
    for (const g of T.galleries.terminal) s += `| ${String(g.order).padStart(2, '0')} | ${code(g.id)} | ${g.label} | ${g.h} | ${g.lambda} | ${code(g.night.ink)} | ${code(g.night.vivid)} | ${code(g.day.ink)} | ${code(g.day.vivid)} | ${g.web ? code(g.web) + ' (web h ' + g.webH + '°)' : '—'} |\n`;
    return s;
  },
  type: () => {
    let s = '| Token | Size / line | Tracking | Weight | Family | Use |\n|---|---|---|---|---|---|\n';
    for (const [k, t] of Object.entries(T.type.scale)) s += `| ${code('--rf-fs-' + k)} | ${t.size} / ${t.line} | ${t.tracking} | ${t.weight} | ${t.family || 'sans'}${t.transform ? ' · caps' : ''} | ${t.use} |\n`;
    return s;
  },
  ansi: () => {
    const N = T.terminal.night, D = T.terminal.day;
    let s = '| Slot | Night | ratio | 256 | Day | ratio | 256 |\n|---|---|---|---|---|---|---|\n';
    N.ansi16.forEach((a, i) => { const d = D.ansi16[i]; s += `| ${a.index} ${a.name} | ${code(a.hex)} | ${a.contrast} | ${a.xterm256} | ${code(d.hex)} | ${d.contrast} | ${d.xterm256} |\n`; });
    for (const k of ['background', 'foreground', 'cursor', 'cursorText', 'selectionBackground', 'selectionForeground']) s += `| ${k} | ${code(N[k])} |  |  | ${code(D[k])} |  |  |\n`;
    return s + `\nRatios are against each terminal's own background (Night ${code(N.background)}, Day ${code(D.background)}). Slot 0 (Night) and slots 7 and 15 (Day: light white and bright white, as in Solarized and Tango light) are background-role colors: fills and text on colored status bars, never text on the background.\n`;
  },
  contrast: () => auditMd,
});

const markerRe = (k) => new RegExp(`(<!-- gen:${k} -->)([\\s\\S]*?)(<!-- /gen:${k} -->)`);
export function readmeBlock(md, key) { const m = markerRe(key).exec(md); return m ? m[2] : null; }
export function fillReadme(md, T, auditMd) {
  md = md.replace(/\r\n/g, '\n');
  for (const [k, fn] of Object.entries(tables(T, auditMd))) {
    const re = markerRe(k);
    if (!re.test(md)) throw new Error(`README.md is missing the <!-- gen:${k} --> marker`);
    const body = fn();
    md = md.replace(re, (_, a, __, b) => (k === 'version' ? a + body + b : `${a}\n${body}\n${b}`));
  }
  return md;
}

// ── CLI ────────────────────────────────────────────────────────────────────
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const { audit } = await import('./contrast.mjs');
  const T = JSON.parse(readFileSync(resolve(DESIGN, 'tokens.json'), 'utf8'));
  const path = resolve(DESIGN, 'README.md');
  const cur = readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
  const next = fillReadme(cur, T, audit(T).md);
  if (process.argv.includes('--check')) {
    if (cur !== next) { console.log('readme: STALE — run node design/tools/gen.mjs --emit'); process.exitCode = 1; }
    else console.log('readme: up to date');
  } else { writeFileSync(path, next); console.log('readme: tables filled'); }
}
