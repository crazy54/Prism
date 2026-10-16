// Refraction contrast audit — WCAG 2.2 (SC 1.4.3 text 4.5:1, SC 1.4.11 non-text 3:1).
//
//   node design/tools/contrast.mjs            run every check against design/tokens.json; exit 1 on any failure
//   node design/tools/contrast.mjs --check    same, and also exit 1 if README.md's contrast tables are stale
//   node design/tools/contrast.mjs --quiet    summary line only
//
// Also exported: audit(tokens) → { rows, total, fails, md } (used by gen.mjs / readme.mjs).
// Zero dependencies.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as c from './color.mjs';

const DESIGN = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const X256 = c.xterm256();

export function audit(T) {
  const rows = [];
  let fails = 0, total = 0;
  const check = (mode, group, fgName, fg, bgName, bg, need) => {
    const r = c.contrast(fg, bg); const pass = r >= need - 1e-9; total++; if (!pass) fails++;
    rows.push({ mode, group, fgName, fg, bgName, bg, r, need, pass });
  };
  for (const mode of ['night', 'day']) {
    const C = Object.fromEntries(Object.entries(T.color[mode]).map(([k, v]) => [k, v.hex]));
    const R = T.rf[mode];
    for (const s of ['bg', 'panel', 'panel2', 'card']) for (const t of ['ink', 'muted', 'dim']) check(mode, 'Text', `--${t}`, C[t], `--${s}`, C[s], 4.5);
    for (const s of ['bg', 'panel', 'card']) check(mode, 'Accent', '--accent (link/text)', C.accent, `--${s}`, C[s], 4.5);
    check(mode, 'Accent', '--accent-ink on --accent', C['accent-ink'], '--accent', C.accent, 4.5);
    check(mode, 'Accent', '--accent-ink on --accent-hi', C['accent-ink'], '--accent-hi', C['accent-hi'], 4.5);
    check(mode, 'Accent', '--accent2', C.accent2, '--bg', C.bg, 4.5);
    const wash = c.over(R['accent-wash'], C.panel);
    check(mode, 'Accent', '--accent on accent-wash (selected chip)', C.accent, 'wash/panel', wash, 4.5);
    check(mode, 'Accent', '--ink on accent-wash', C.ink, 'wash/panel', wash, 4.5);
    for (const k of ['info', 'pos', 'warn', 'neg', 'crit']) {
      for (const s of ['bg', 'panel', 'card']) check(mode, 'Status', `--${k}`, C[k], `--${s}`, C[s], 4.5);
      const sw = c.over(`rgba(${c.rgbTriplet(C[k])},.12)`, C.panel);
      check(mode, 'Status', `--${k} on its 12% wash`, C[k], 'wash/panel', sw, 4.5);
    }
    for (const s of ['bg', 'panel', 'panel2', 'card']) check(mode, 'Non-text', '--rf-line-control (control boundary)', C['line-control'], `--${s}`, C[s], 3);
    for (const s of ['bg', 'panel', 'card']) check(mode, 'Non-text', '--rf-focus (focus ring)', R.focus, `--${s}`, C[s], 3);
    check(mode, 'Non-text', '--accent (fill vs bg)', C.accent, '--bg', C.bg, 3);
    check(mode, 'Text', '--dim placeholder on input fill (--panel2)', C.dim, '--panel2', C.panel2, 4.5);
    check(mode, 'Code', '--rf-code-ink', R['code-ink'], '--rf-code-bg', R['code-bg'], 4.5);
    for (const k of ['syn-keyword', 'syn-string', 'syn-number', 'syn-tag', 'syn-attr', 'syn-comment']) check(mode, 'Code', `--rf-${k}`, R[k], '--rf-code-bg', R['code-bg'], 4.5);
    for (const s of T.spectrum.stops) {
      for (const b of ['bg', 'panel', 'panel2', 'card']) check(mode, 'Spectrum ink', `${s.name} ink`, s[mode].ink.hex, `--${b}`, C[b], 4.5);
      check(mode, 'Spectrum vivid', `${s.name} vivid`, s[mode].vivid.hex, '--bg', C.bg, 3);
    }
    for (const g of [...T.galleries.web, ...T.galleries.surfaces]) {
      const ink = g[mode].ink;
      check(mode, 'Gallery hue', `${g.id} ink`, ink, '--bg', C.bg, 4.5);
      check(mode, 'Gallery hue', `${g.id} ink`, ink, '--panel', C.panel, 4.5);
      const gw = mode === 'night' ? c.over(`rgba(${g.night.rgb},.12)`, C.bg) : g.day.wash;
      check(mode, 'Gallery wash', `${g.id} ink on own wash`, ink, 'hue wash', gw, 4.5);
      check(mode, 'Gallery wash', `--ink on ${g.id} wash`, C.ink, 'hue wash', gw, 4.5);
      check(mode, 'Gallery tick', `${g.id} vivid index tick`, g[mode].vivid, '--bg', C.bg, 3);
    }
    const term = T.terminal[mode];
    // Background-role slots — 0 at Night, 7 / 15 (white, bright white) by Day — are fills, not text:
    // they are checked below as status-bar backgrounds instead of as text on the terminal background.
    const fillSlot = (i) => (mode === 'night' ? i === 0 : i === 7 || i === 15);
    term.ansi16.forEach((a) => {
      if (fillSlot(a.index)) return;
      check(mode, 'Terminal', `ANSI ${a.index} ${a.name}`, a.hex, 'term bg', term.background, 4.5);
    });
    // Status bars as TUIs paint them (tmux, htop, mc, less prompts): the light slots as text on the
    // colored fills 1–6 (Day: bright white on the brights too), and the dark text slots on the light
    // fills. (Black on a *colored* fill can't reach 4.5:1 on a light scheme without dropping the same
    // slot below 4.5:1 as text on the background, so it isn't promised.)
    if (mode === 'day') {
      const A = (i) => term.ansi16[i];
      for (const i of [1, 2, 3, 4, 5, 6]) for (const t of [7, 15]) check(mode, 'Terminal status bar', `ANSI ${t} ${A(t).name} on ${i} ${A(i).name}`, A(t).hex, `ANSI ${i} fill`, A(i).hex, 4.5);
      for (const i of [9, 10, 11, 12, 13, 14]) check(mode, 'Terminal status bar', `ANSI 15 ${A(15).name} on ${i} ${A(i).name}`, A(15).hex, `ANSI ${i} fill`, A(i).hex, 4.5);
      for (const f of [7, 15]) for (const t of [0, 8]) check(mode, 'Terminal status bar', `ANSI ${t} ${A(t).name} on ${f} ${A(f).name}`, A(t).hex, `ANSI ${f} fill`, A(f).hex, 4.5);
      for (const f of [7, 15]) check(mode, 'Terminal status bar', `foreground on ${f} ${A(f).name}`, term.foreground, `ANSI ${f} fill`, A(f).hex, 4.5);
    } else {
      const A = (i) => term.ansi16[i];
      for (const t of [7, 15]) check(mode, 'Terminal status bar', `ANSI ${t} ${A(t).name} on 0 black`, A(t).hex, 'ANSI 0 fill', A(0).hex, 4.5);
    }
    check(mode, 'Terminal', 'foreground', term.foreground, 'term bg', term.background, 4.5);
    // 256 colors: each text color through its designed xterm-256 index, on every 256-color
    // surface (surfaces256 = the terminal background + each theme surface as it quantizes).
    const S256 = term.surfaces256 || [term.background];
    const on256 = (group, name, idx, need) => S256.forEach((s) =>
      check(mode, group, `${name} → ${idx}`, X256[idx], s === term.background ? 'term bg' : `256 surface ${X256.indexOf(s)}`, s, need));
    const TEXT = ['ink', 'muted', 'dim', 'accent', 'accent2', 'info', 'pos', 'warn', 'neg', 'crit'];
    for (const k of TEXT) on256('Terminal 256', `--${k}`, term.tokens256[k], 4.5);
    for (const s of term.spectrum256) on256('Terminal 256', `${s.name} ink`, s.index, 4.5);
    for (const [id, g] of Object.entries(term.galleries256 || {})) { on256('Terminal 256', `${id} ink`, g.ink, 4.5); on256('Terminal 256 tick', `${id} vivid`, g.vivid, 3); }
    term.ansi16.forEach((a) => {
      if (fillSlot(a.index)) return;
      on256('Terminal 256', `ANSI ${a.index} ${a.name}`, a.xterm256, 4.5);
    });
    // 16 colors: text tokens through their designed slot (roles[k][0]; -1 = the scheme foreground)
    // and the spectrum hues through hueToAnsi16, as the Prism scheme shows them.
    const slotHex = (n) => (n < 0 ? term.foreground : term.ansi16[n].hex);
    if (term.roles) for (const k of TEXT) check(mode, 'Terminal 16', `--${k} → slot ${term.roles[k][0]}`, slotHex(term.roles[k][0]), 'term bg', term.background, 4.5);
    for (const [name, n] of Object.entries(T.terminal.hueToAnsi16 || {})) check(mode, 'Terminal 16', `${name} → slot ${n}`, slotHex(n), 'term bg', term.background, 4.5);
    check(mode, 'Terminal', 'selection fg on selection bg', term.selectionForeground, 'selection', term.selectionBackground, 4.5);
    const keyBg = mode === 'night' ? '#0b0d14' : '#f4f3f8';
    check(mode, 'Deck', 'key label --ink', C.ink, 'key fill', keyBg, 4.5);
    check(mode, 'Deck', 'key label --muted', C.muted, 'key fill', keyBg, 4.5);
    for (const g of T.galleries.web) check(mode, 'Deck', `on-state glyph ${g.id}`, g[mode].ink, 'key fill', keyBg, 4.5);
  }
  return { rows, total, fails, md: markdown(T, rows, total, fails) };
}

function markdown(T, rows, total, fails) {
  const fmt = (r) => r.toFixed(2);
  const minBy = (arr) => arr.reduce((a, b) => (b.r < a.r ? b : a));
  const SUMMARY = [
    ['`--ink` on bg / panel / panel2 / card', (r) => r.group === 'Text' && r.fgName === '--ink'],
    ['`--muted` on bg / panel / panel2 / card', (r) => r.fgName === '--muted'],
    ['`--dim` on bg / panel / panel2 / card', (r) => r.fgName === '--dim'],
    ['`--accent` as text on bg / panel / card', (r) => r.fgName === '--accent (link/text)'],
    ['`--accent-ink` on `--accent` / `--accent-hi`', (r) => r.fgName.startsWith('--accent-ink')],
    ['`--accent` on accent wash (selected chip)', (r) => r.fgName.startsWith('--accent on accent-wash')],
    ['`--accent2` on bg', (r) => r.fgName === '--accent2'],
    ['Status info/pos/warn/neg/crit on bg / panel / card', (r) => r.group === 'Status' && !r.fgName.includes('wash')],
    ['Status on its own 12% wash (badges)', (r) => r.group === 'Status' && r.fgName.includes('wash')],
    ['Control boundary `--rf-line-control`', (r) => r.fgName.startsWith('--rf-line-control')],
    ['Focus ring `--rf-focus`', (r) => r.fgName.startsWith('--rf-focus')],
    ['Code ink + syntax colors on code bg', (r) => r.group === 'Code'],
    ['Spectrum ink — 12 stops on every surface', (r) => r.group === 'Spectrum ink'],
    ['Spectrum vivid — 12 stops on bg', (r) => r.group === 'Spectrum vivid'],
    ['Gallery/surface hue ink on bg / panel', (r) => r.group === 'Gallery hue'],
    ['Hue ink + `--ink` on the gallery wash (active nav)', (r) => r.group === 'Gallery wash'],
    ['Gallery vivid index tick on bg', (r) => r.group === 'Gallery tick'],
    ['Terminal ANSI text colors + fg on terminal bg', (r) => r.group === 'Terminal' && r.need === 4.5],
    ['Terminal 256 — text tokens, spectrum + gallery ink, ANSI text slots on every 256-color surface', (r) => r.group === 'Terminal 256' && r.need === 4.5],
    ['Terminal 256 — gallery vivid ticks on every 256-color surface', (r) => r.group === 'Terminal 256 tick'],
    ['Terminal 16 — text tokens + spectrum hues in their ANSI slot (Prism scheme)', (r) => r.group === 'Terminal 16'],
    ['Terminal status bars — light slots on colored fills, dark slots on light fills', (r) => r.group === 'Terminal status bar'],
    ['Stream Deck key text + on-state glyphs', (r) => r.group === 'Deck'],
  ];
  let md = `Computed by \`design/tools/contrast.mjs\` from tokens.json v${T.version} (WCAG 2.2 relative-luminance contrast; rgba washes are composited over the surface they sit on). **${total - fails} / ${total} checks pass.** Text targets 4.5:1 (SC 1.4.3); control boundaries, focus rings, index ticks and vivid marks target 3:1 (SC 1.4.11).\n\n`;
  md += '| Check (worst case shown) | Night | Day | Target |\n|---|---|---|---|\n';
  for (const [label, f] of SUMMARY) {
    const n = rows.filter((r) => r.mode === 'night' && f(r)), d = rows.filter((r) => r.mode === 'day' && f(r));
    const cell = (a) => { if (!a.length) return '—'; const w = minBy(a); return `${w.pass ? '' : '**FAIL** '}${fmt(w.r)}:1`; };
    md += `| ${label} | ${cell(n)} | ${cell(d)} | ${(n[0] || d[0]).need}:1 |\n`;
  }
  md += `\n<details><summary>All ${total} pairs</summary>\n\n| Mode | Group | Foreground | Background | Ratio | Target |\n|---|---|---|---|---|---|\n`;
  rows.forEach((r) => { md += `| ${r.mode} | ${r.group} | ${r.fgName} \`${r.fg}\` | ${r.bgName} \`${r.bg}\` | ${r.pass ? '' : '**FAIL** '}${fmt(r.r)} | ${r.need} |\n`; });
  md += '\n</details>\n';
  return md;
}

// ── CLI ────────────────────────────────────────────────────────────────────
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const argv = process.argv.slice(2);
  const T = JSON.parse(readFileSync(resolve(DESIGN, 'tokens.json'), 'utf8'));
  const res = audit(T);
  console.log(`contrast: ${res.total - res.fails}/${res.total} pass (tokens v${T.version})`);
  if (!argv.includes('--quiet')) res.rows.filter((r) => !r.pass).forEach((r) => console.log('  FAIL', r.mode, r.group, r.fgName, r.fg, 'on', r.bgName, r.bg, r.r.toFixed(2), '<', r.need));
  let stale = false;
  if (argv.includes('--check')) {
    const { readmeBlock } = await import('./readme.mjs');
    const cur = readmeBlock(readFileSync(resolve(DESIGN, 'README.md'), 'utf8'), 'contrast');
    stale = cur == null || cur.replace(/\r\n/g, '\n').trim() !== res.md.trim();
    if (stale) console.log('  STALE: README.md contrast tables differ from a fresh audit — run node design/tools/gen.mjs --emit');
  }
  process.exitCode = res.fails || stale ? 1 : 0;
}
