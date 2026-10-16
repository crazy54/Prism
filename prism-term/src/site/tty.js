// The curl-able terminal site — static pages you read with `curl -sL`.
//
// Every page is composed as an 80-column CellBuffer, then serialized three ways:
//   <path>        256-color SGR (the default: survives tmux, screen, Terminal.app, conhost, SSH)
//   <path>.24     truecolor SGR
//   <path>.txt    plain 7-bit ASCII, zero escapes (less, grep, NO_COLOR, screen readers, LANG=C)
// Pages contain only SGR and text — no cursor motion, bell, title or charset
// escapes — end with a reset and a newline, and never exceed 80 printable
// columns. Facet snapshots are stills rendered by the same engine as the live
// player; "live" means the npx player.
//
// Drawn in the Refraction grammar (src/refraction.js, docs/refraction-terminal.md):
// the mark and an instrument-label header, a full-width beam that strikes the
// prism and leaves as spectrum, a spectral gallery index with wavelength labels,
// hue-colored section labels. The page can't see the reader's background, so
// chrome uses mid-tones (TOKENS.site, the spectrum's `site` tier) that read on
// dark and light terminals; text that matters is the terminal's own foreground.

import { CellBuffer, ATTR } from '../buffer.js';
import { NONE, mix } from '../color.js';
import { renderScene } from '../render.js';
import { stringWidth, truncate, wrap } from '../width.js';
import { getTheme } from '../palettes.js';
import { TOKENS, spectral, siteTone, galleryHue, lambdaLabel, rampHue } from '../refraction.js';
import { FORMATS, themeFileName } from '../theme-export.js';

export const WIDTH = 80;
const SNAP_MAX_H = 20;

// Facet stills are rendered in Prism Night: dark glass tiles that read on any terminal.
const theme = getTheme('prism-dark');
const C = {
  accent: siteTone(TOKENS.site.accent.h, TOKENS.site.accent.C),
  cmd: siteTone(TOKENS.site.cmd.h, TOKENS.site.cmd.C),
  beam: TOKENS.site.beam,
  line: TOKENS.site.line,
  muted: NONE, // default fg + DIM
};
const HUES = new Map();
const hueOf = (id) => { let c = HUES.get(id); if (c === undefined) HUES.set(id, (c = siteTone(galleryHue(id)))); return c; };

// ASCII stand-ins for the decorative glyphs the colored pages use.
const PLAIN = { '◆': '*', '›': '>', '‹': '<', '·': '-', '…': '...', '─': '-', '│': '|', '━': '=', '▸': '>', '→': '->', '←': '<-', '—': '--', '–': '-', '×': 'x', '≤': '<=', '◢': '/', '◣': '\\', '▌': '|', 'λ': '' };

/** Text helper that swaps decorative glyphs for ASCII when building the .txt variant. */
function txt(s, plain) {
  if (!plain) return s;
  let out = '';
  for (const ch of String(s)) out += PLAIN[ch] ?? (ch.codePointAt(0) < 128 ? ch : asciiGlyph(ch));
  return out;
}

/** Closest printable ASCII for a glyph a facet drew (box drawing, blocks, braille, symbols…). */
export function asciiGlyph(ch) {
  const cp = ch.codePointAt(0);
  if (cp < 0x80) return cp < 0x20 ? ' ' : ch;
  const base = ch.normalize('NFD')[0];
  if (base.codePointAt(0) < 0x80 && base !== ch) return base; // é → e
  if (PLAIN[ch]) return PLAIN[ch].length === 1 ? PLAIN[ch] : PLAIN[ch][0] || ' ';
  if (cp >= 0x2500 && cp <= 0x257f) {
    if ('─━┄┅┈┉═╌╍╴╶╸╺╼╾'.includes(ch)) return '-';
    if ('│┃┆┇┊┋║╎╏╵╷╹╻╽╿'.includes(ch)) return '|';
    if ('╱'.includes(ch)) return '/';
    if ('╲'.includes(ch)) return '\\';
    if ('╳'.includes(ch)) return 'X';
    return '+';
  }
  if (cp >= 0x2580 && cp <= 0x259f) {
    if (ch === '░') return '.';
    if (ch === '▒') return ':';
    if (ch === '▓') return '%';
    if ('▁▂▃'.includes(ch)) return '_';
    if ('▄▅▆▇'.includes(ch)) return '=';
    if ('▏▎▍'.includes(ch)) return '|';
    return '#';
  }
  if (cp >= 0x2800 && cp <= 0x28ff) {
    let dots = 0;
    for (let m = cp - 0x2800; m; m >>= 1) dots += m & 1;
    return dots === 0 ? ' ' : dots <= 2 ? '.' : dots <= 4 ? ':' : dots <= 6 ? '+' : '#';
  }
  if (cp >= 0x1fb00 && cp <= 0x1fbff) return '#';
  if (cp >= 0x2190 && cp <= 0x21ff) return '←↖⇐'.includes(ch) ? '<' : '↑↥⇑'.includes(ch) ? '^' : '↓↧⇓'.includes(ch) ? 'v' : '>';
  if ('●•◉◎○◌◯'.includes(ch)) return ch === '○' || ch === '◌' || ch === '◯' ? 'o' : '*';
  if ('■□▪▫◼◻◾◽'.includes(ch)) return '#';
  if ('▲△▴▵'.includes(ch)) return '^';
  if ('▼▽▾▿'.includes(ch)) return 'v';
  if ('◀◁◂◃'.includes(ch)) return '<';
  if ('▶▷▸▹❯❱'.includes(ch)) return '>';
  if ('◆◇❖⬥⬦'.includes(ch)) return '*';
  if ('✓✔☑'.includes(ch)) return 'v';
  if ('✗✘✕✖☒'.includes(ch)) return 'x';
  if ('★☆✦✧✶✷✸✹✺✳'.includes(ch)) return '*';
  if ('“”„'.includes(ch)) return '"';
  if ('‘’‚'.includes(ch)) return "'";
  if ('°º'.includes(ch)) return 'o';
  if (cp >= 0xff61 && cp <= 0xff9f) return String.fromCharCode(0x21 + ((cp * 7) % 0x5d)); // halfwidth katakana (digital rain)
  return '*';
}

// ── page model ──────────────────────────────────────────────────────────────

/**
 * A page is a list of rows. A row is either an array of segments
 * ({ text, fg, attr }) or a snapshot { buffer, x }.
 */
class Page {
  constructor(plain) {
    this.plain = plain;
    this.rows = [];
    this.overflow = []; // lines that didn't fit 80 columns outside a { clip: true } segment
  }

  /**
   * One line of styled segments, never wrapped. A segment marked { clip: true }
   * (list descriptions) is cut to fit with an ellipsis; anything else past 80
   * columns is cut too, but recorded in this.overflow so the tests catch it.
   */
  line(...segments) {
    const segs = segments.flat().filter(Boolean).map((s) => (typeof s === 'string' ? { text: s } : s));
    let used = 0;
    const out = [];
    for (const s of segs) {
      let text = txt(s.text, this.plain);
      const room = WIDTH - used;
      if (stringWidth(text) > room) {
        if (!s.clip) this.overflow.push(segs.map((x) => txt(x.text, this.plain)).join(''));
        if (room <= 0) break;
        text = truncate(text, room, this.plain ? '...' : '…');
      }
      used += stringWidth(text);
      out.push({ ...s, text });
    }
    this.rows.push(out);
    return this;
  }

  blank() { this.rows.push([]); return this; }

  /** Wrap a paragraph to `width` with an indent. */
  para(text, { indent = 2, fg, attr, width = WIDTH } = {}) {
    for (const l of wrap(txt(text, this.plain), width - indent)) this.line({ text: ' '.repeat(indent) + l, fg, attr });
    return this;
  }

  /** Place a rendered buffer (snapshot) at column x. */
  snapshot(buffer, x = 0) {
    for (let y = 0; y < buffer.height; y++) this.rows.push({ buffer, y, x });
    return this;
  }

  /** Several snapshots side by side (each { buffer, caption }). */
  tiles(items, gap = 2) {
    const h = Math.max(...items.map((i) => i.buffer.height));
    let x = 0;
    const placed = items.map((i) => { const p = { ...i, x }; x += i.buffer.width + gap; return p; });
    for (let y = 0; y < h; y++) this.rows.push({ multi: placed, y });
    return this;
  }

  /** Render the page into an 80-column CellBuffer. */
  buffer() {
    const b = new CellBuffer(WIDTH, this.rows.length);
    this.rows.forEach((row, y) => {
      if (Array.isArray(row)) {
        let x = 0;
        for (const s of row) x = b.text(x, y, s.text, this.plain ? NONE : s.fg ?? NONE, NONE, this.plain ? 0 : s.attr ?? 0);
      } else if (row.multi) {
        for (const p of row.multi) if (row.y < p.buffer.height) blitRow(b, y, p.buffer, row.y, p.x, this.plain);
      } else blitRow(b, y, row.buffer, row.y, row.x, this.plain);
    });
    return b;
  }
}

function blitRow(dst, dy, src, sy, ox, plain) {
  for (let x = 0; x < src.width && ox + x < WIDTH; x++) {
    const c = src.get(x, sy);
    if (!c || c.ch === '') continue;
    if (plain) dst.set(ox + x, dy, asciiGlyph(c.ch), NONE, NONE, 0);
    else dst.set(ox + x, dy, c.ch, c.fg, c.bg, c.attr);
  }
}

/** Serialize a page buffer: ANSI (256 / truecolor) or plain. */
export function serialize(b, variant) {
  if (variant === 'txt') return b.toString().split('\n').map((l) => l.replace(/\s+$/, '')).join('\n').replace(/\n+$/, '') + '\n';
  const body = b.toAnsi(variant === '24' ? 'truecolor' : '256').split('\n').map((l) => l.replace(/[ ]+$/, '')).join('\n').replace(/\n+$/, '');
  return body + '\x1b[0m\n';
}

// ── snapshots ───────────────────────────────────────────────────────────────

/** Time to freeze an animated facet at: mid-cycle, clear of start-up. */
const stillAt = (f) => (f.animated ? Math.min(6, Math.max(1.2, f.loop * 0.5)) : 0);

/** Render a facet still for a page, ≤ 80 columns and ≤ SNAP_MAX_H rows. */
export function snapshot(f, { w = f.size.w, h = f.size.h, plain = false } = {}) {
  const width = Math.max(f.minSize.w, Math.min(WIDTH, w));
  const height = Math.max(f.minSize.h, Math.min(SNAP_MAX_H, h));
  const caps = plain ? { unicode: false, braille: false, sextant: false, depth: '16' } : { sextant: false, depth: '256' };
  return renderScene(f, { width, height, t: stillAt(f), fps: 15, mode: plain ? 'ascii' : null, caps, theme });
}

// ── Refraction parts ────────────────────────────────────────────────────────

const host = (site) => site.replace(/^https?:\/\//, '');
const cmd = (t) => ({ text: t, fg: C.cmd });
const dim = (t) => ({ text: t, attr: ATTR.DIM });
const label = (t, fg = C.accent) => ({ text: t.toUpperCase(), fg, attr: ATTR.BOLD });

/** The mark, as segments: ──◢◣━━━  (beam in, the prism, the spectrum out). */
function markSegs() {
  return [
    { text: '─', fg: mix(C.line, C.beam, 0.4) }, { text: '─', fg: C.beam },
    { text: '◢', fg: 0xffffff, attr: ATTR.BOLD }, { text: '◣', fg: C.accent, attr: ATTR.BOLD },
    ...[0, 0.5, 1].map((u) => ({ text: '━', fg: spectral(rampHue(u), 'site') })),
  ];
}

/**
 * The page beam — 80 columns: a hairline brightening toward the prism (◢◣ at
 * `at`), then the spectrum leaving it. With `hue`, only that band of the
 * spectrum leaves (a gallery page is one color of the light).
 */
function beamRule(p, { at = 54, hue = null } = {}) {
  const segs = [];
  for (let x = 0; x < at; x++) {
    const k = Math.pow(x / Math.max(1, at - 1), 2.2);
    segs.push({ text: '─', fg: mix(C.line, C.beam, k) });
  }
  segs.push({ text: '◢', fg: 0xffffff, attr: ATTR.BOLD }, { text: '◣', fg: C.accent, attr: ATTR.BOLD });
  const n = WIDTH - at - 2;
  for (let i = 0; i < n; i++) {
    const u = i / Math.max(1, n - 1);
    const h = hue === null ? rampHue(u) : hue + (u - 0.5) * 36;
    // The spectrum fades as it travels: brightest just out of the prism.
    segs.push({ text: '━', fg: mix(spectral(h, 'site'), C.line, Math.pow(u, 1.6) * 0.55) });
  }
  return p.line(...segs);
}

/** A plain hairline (footers, section rules). */
const rule = (p, w = WIDTH) => p.line({ text: '─'.repeat(w), fg: C.line });

/** Header: the mark, PRISM TERMINAL › crumbs, and a right-aligned instrument label. */
function header(p, crumbs, right = '', { hue } = {}) {
  const left = [...markSegs(), { text: ' ' }, { text: 'PRISM TERMINAL', attr: ATTR.BOLD }];
  for (const c of crumbs) left.push({ text: ' › ', attr: ATTR.DIM }, { text: c.toUpperCase(), attr: ATTR.BOLD, fg: hue ?? undefined });
  const used = left.reduce((n, s) => n + stringWidth(txt(s.text, p.plain)), 0);
  const r = txt(right, p.plain);
  if (r && used + 2 + stringWidth(r) <= WIDTH) left.push({ text: ' '.repeat(WIDTH - used - stringWidth(r)) }, { text: right, fg: hue ?? undefined, attr: hue ? 0 : ATTR.DIM });
  p.line(...left);
  return p;
}

/**
 * The npx live-player command, pinned to this release's tarball (prism-term-<version>.tgz,
 * checked by /dl/SHA256SUMS): one line when it fits 80 columns, else split with a shell
 * continuation. The home page keeps the shorter latest-release alias, /dl/prism-term.tgz.
 */
function npxLines(p, site, args = '', indent = 2, version = '') {
  const pad = ' '.repeat(indent);
  const run = `prism-term${args ? ' ' + args : ''}`;
  const tgz = `${site}/dl/prism-term${version ? `-${version}` : ''}.tgz`;
  const one = `${pad}npx -y --package=${tgz} ${run}`;
  if (stringWidth(one) <= WIDTH) return p.line({ text: one, fg: C.cmd });
  p.line({ text: `${pad}npx -y --package=${tgz} \\`, fg: C.cmd });
  p.line({ text: `${pad}  ${run}`, fg: C.cmd });
  return p;
}

/** "tags: a, b, c" wrapped at comma boundaries, continuation lines indented under the first tag. */
function tagLines(p, tags) {
  const lead = 'tags: ';
  let row = lead;
  tags.forEach((t, i) => {
    const piece = i < tags.length - 1 ? `${t},` : t;
    if (row.length > lead.length && stringWidth(txt(row + piece, p.plain)) > WIDTH) {
      p.line(dim(row.trimEnd()));
      row = ' '.repeat(lead.length);
    }
    row += `${piece} `;
  });
  p.line(dim(row.trimEnd()));
  return p;
}

/** Section label: an instrument eyebrow, then a hairline to the edge. */
function section(p, text, fg = C.accent, count = '') {
  const t = `${text}${count ? ` · ${count}` : ''}`.toUpperCase();
  const w = stringWidth(txt(t, p.plain));
  p.line({ text: t, fg, attr: ATTR.BOLD }, { text: ' ' }, { text: '─'.repeat(Math.max(0, Math.min(WIDTH - w - 1, 48 - w))), fg: C.line });
}

/** Footer: a hairline, then one labeled, copy-pasteable command per line. */
function footer(p, site, items) {
  p.blank();
  rule(p);
  for (const [l, command] of items) p.line(dim(l.padEnd(10)), cmd(command));
  return p;
}

// ── content ─────────────────────────────────────────────────────────────────

function homePage(ctx, plain) {
  const { site, galleries, facets, version } = ctx;
  const p = new Page(plain);
  // 1 · the mark and the instrument line; 2 · the beam striking the prism.
  header(p, [], `${facets.length} FACETS · ${galleries.length} GALLERIES · ${version}`);
  beamRule(p);
  p.line({ text: 'Terminal art, widgets and TUI parts.' }, dim('  help '), cmd('/t/help'), dim(' · plain '), cmd('.txt'), dim(' · web '), cmd('/terminal/'));
  p.blank();
  // The spectral index: swatch, gallery, count, the command, its wavelength.
  const base = `curl -sL ${host(site)}/t/`;
  const cw = base.length + Math.max(...galleries.map((g) => g.id.length)) + 2;
  for (const g of galleries) {
    const hue = hueOf(g.id);
    p.line(
      { text: '  ' },
      { text: '▌', fg: hue },
      { text: ' ' },
      { text: g.title.padEnd(23) },
      dim(String(g.count).padStart(3)),
      { text: ' ' },
      { text: `${base}${g.id}`.padEnd(cw), fg: C.cmd },
      { text: lambdaLabel(g.id, !plain), fg: hue },
    );
  }
  // Breathing room before the live player, only while the page still fits
  // 23 rows — on an 80×24 terminal the prompt takes the 24th.
  if (p.rows.length + 3 <= 23) p.blank();
  p.line(label('The live player'), dim(' · animated in your terminal · Node 18+'));
  p.line({ text: '  ' }, cmd(`npx -y --package=${site}/dl/prism-term.tgz prism-term`));
  return p;
}

function helpPage(ctx, plain) {
  const { site, galleries, facets, version } = ctx;
  const h = host(site);
  const p = header(new Page(plain), ['help'], `PRISM-TERM ${version}`);
  beamRule(p);
  p.blank();
  const sect = (t) => { p.blank(); section(p, t); };
  p.para(`This is Prism's terminal site: ${facets.length} animated and static terminal facets — scenes, spinners, progress meters, charts, text art, TUI controls, diagrams and ops views — in ${galleries.length} galleries, drawn by prism-term ${version}, a zero-dependency Node engine.`);
  sect('Browse with curl');
  const rows = [
    [`curl -sL ${h}/tty`, 'the terminal site\'s home'],
    [`curl -sL ${h}/t/<gallery>`, 'one gallery, by category'],
    [`curl -sL ${h}/f/<facet>`, 'one facet: still and commands'],
    [`curl -sL ${h}/t/all`, 'every facet on one line each'],
    [`curl -sL ${h}/t/themes`, 'color schemes for your terminal'],
    [`curl -sL ${h}/t/help`, 'this page'],
  ];
  const cw = Math.max(...rows.map((r) => r[0].length)) + 2;
  for (const [c, d] of rows) p.line({ text: '  ' }, cmd(c.padEnd(cw)), dim(d));
  p.blank();
  p.para('Pages are stills that fit 80 columns. Long pages: pipe to less -R. Every page also comes as:');
  p.line({ text: '  ' }, cmd('<page>.txt'.padEnd(12)), dim('plain ASCII, no escape codes — for grep, NO_COLOR, screen readers'));
  p.line({ text: '  ' }, cmd('<page>.24'.padEnd(12)), dim('truecolor instead of the default 256 colors'));
  p.line({ text: '  ' }, dim('Search:   '), cmd(`curl -sL ${h}/t/all.txt | grep -i spinner`));
  p.line({ text: '  ' }, dim('Paging:   '), cmd(`curl -sL ${h}/t/ops | less -R`));
  p.line({ text: '  ' }, dim('Windows PowerShell 5: type '), cmd('curl.exe'), dim(' (plain "curl" is an alias there).'));
  p.line({ text: '  ' }, dim("PowerShell and cmd don't continue lines with \\: join a command that ends"));
  p.line({ text: '  ' }, dim('in \\ with the next line (drop the \\) before you run it.'));
  sect('The live player');
  p.para('The live player renders facets in real time and detects your terminal (truecolor, 256, 16, mono; braille and block glyphs, or plain ASCII; Prism Night or Prism Day for dark and light backgrounds). It needs Node 18+ and no network after the download.');
  npxLines(p, site, '', 2, version);
  p.line(dim('  …then add a command:'));
  const cli = [
    ['(none)', 'browse the catalog: arrows move, / searches, Enter plays'],
    ['play <facet>', 'one facet fullscreen (--size 80x24, --depth 256, --ascii)'],
    ['list', 'every facet, grouped by gallery'],
    ['snapshot <facet>', 'print one still frame to stdout'],
    ['theme <format>', 'Prism Night / Day colors for your terminal emulator'],
  ];
  for (const [c, d] of cli) p.line({ text: '    ' }, cmd(c.padEnd(18)), dim(d));
  p.line(dim('  Day or Night: --day, --night, or PRISM_TERM_THEME=day|night; --no-intro skips'));
  p.line(dim('  the opening beam, and NO_COLOR / PRISM_REDUCED_MOTION=1 are honored.'));
  p.line(dim('  Prefer a permanent install? Run this once, then just type prism-term:'));
  p.line({ text: '  ' }, cmd(`npm i -g ${site}/dl/prism-term-${version}.tgz`));
  p.line(dim('  /dl/prism-term.tgz is an alias for the newest release. To pin one and verify'));
  p.line(dim('  it, download it and check it against SHA256SUMS first:'));
  p.line({ text: '  ' }, cmd(`curl -sLO ${site}/dl/prism-term-${version}.tgz`));
  p.line({ text: '  ' }, cmd(`curl -sL ${h}/dl/SHA256SUMS | sha256sum -c --ignore-missing`));
  p.line({ text: '  ' }, cmd(`npx -y --package=./prism-term-${version}.tgz prism-term`));
  sect('Galleries');
  const ids = galleries.map((g) => g.id);
  for (let i = 0; i < ids.length; i += 6) {
    const segs = [{ text: '  ' }];
    for (const id of ids.slice(i, i + 6)) segs.push({ text: '▌', fg: hueOf(id) }, cmd(id.padEnd(10)));
    p.line(...segs);
  }
  sect('For agents and tools');
  p.para(`Machine-readable: the JSON island <script id="prism-terminal-catalog"> in the web catalog, ${h}/Prism.html, and the same catalog at ${h}/terminal/engine/catalog/terminal-catalog.json. Each facet record has id, gallery, category, tags, size, glyphs, color depth, params, a plain-text preview and its module path; the module's code, and the "_" helpers it imports, are in the catalog's top-level "sources".`);
  footer(p, site, [
    ['home', `curl -sL ${h}/tty`],
    ['catalog', `${site}/terminal/`],
    ['source', 'https://github.com/crazy54/Prism (prism-term/, MIT)'],
  ]);
  return p;
}

/** Color schemes: the OSC one-liner, then every format's Night / Day file URL. */
function themesPage(ctx, plain) {
  const { site } = ctx;
  const h = host(site);
  const p = header(new Page(plain), ['themes'], `${Object.keys(FORMATS).length} FORMATS`);
  beamRule(p);
  p.blank();
  p.para('Prism Night and Prism Day as color schemes for your terminal. Each file is plain text with its install notes at the top: read it, then install it yourself. Nothing here changes your settings.');
  p.blank();
  section(p, 'Any terminal, this session · also over SSH');
  p.line({ text: '  ' }, cmd(`curl -sL ${h}/themes/osc/prism-night.sh | sh`));
  p.line({ text: '  ' }, cmd(`curl -sL ${h}/themes/osc/prism-day.sh | sh`));
  p.para('One printf of OSC 4 / 10 / 11 codes: on a remote host the codes travel back to your own terminal. It lasts until the terminal closes.', { attr: ATTR.DIM });
  p.blank();
  section(p, 'Files');
  for (const [id, f] of Object.entries(FORMATS)) {
    if (id === 'osc') continue;
    p.line({ text: '▌', fg: C.accent }, { text: ` ${f.name}`, attr: ATTR.BOLD });
    for (const t of ['prism-dark', 'prism-light']) p.line({ text: '   ' }, cmd(`curl -sLO ${h}/themes/${f.dir}/${themeFileName(id, t)}`));
    p.para(f.install, { indent: 3, attr: ATTR.DIM });
  }
  p.blank();
  p.para('With the live player installed the same files come from prism-term theme <format> [--day] [-o file]; any other Prism theme works too (--theme primer).', { attr: ATTR.DIM });
  footer(p, site, [
    ['home', `curl -sL ${h}/tty`],
    ['help', `curl -sL ${h}/t/help`],
  ]);
  return p;
}

function allPage(ctx, plain) {
  const { site, facets } = ctx;
  const h = host(site);
  const p = header(new Page(plain), ['all facets'], `${facets.length} FACETS`);
  beamRule(p);
  p.line(dim('id  ·  gallery / category  ·  what it is'));
  p.blank();
  const idW = Math.min(26, Math.max(...facets.map((f) => f.id.length)) + 1);
  const gcW = 30;
  for (const f of facets) {
    const gc = `${f.gallery}/${f.category}`;
    p.line(
      { text: f.id.padEnd(idW), fg: C.cmd },
      { text: '▌', fg: hueOf(f.gallery) },
      dim(truncate(` ${gc}`, gcW - 2, plain ? '...' : '…').padEnd(gcW - 1)),
      { text: f.description, clip: true },
    );
  }
  footer(p, site, [
    ['one facet', `curl -sL ${h}/f/<id>`],
    ['search', `curl -sL ${h}/t/all.txt | grep -i <word>`],
    ['home', `curl -sL ${h}/tty`],
  ]);
  return p;
}

function galleryPage(ctx, g, plain) {
  const { site, galleries } = ctx;
  const h = host(site);
  const hue = hueOf(g.id);
  const n = galleries.findIndex((x) => x.id === g.id) + 1;
  const p = header(new Page(plain), [g.title], `${lambdaLabel(g.id, !plain)} · ${String(n).padStart(2, '0')} / ${galleries.length}`, { hue });
  beamRule(p, { hue: galleryHue(g.id) });
  p.para(g.blurb, { indent: 0 });
  // Featured stills: the first facet of the leading categories that reads at tile size.
  const TILE_W = 39, TILE_H = 8;
  const fits = (f) => f.minSize.w <= TILE_W && f.minSize.h <= TILE_H;
  let featured = g.categories.map((c) => c.facets.find(fits)).filter(Boolean).slice(0, 2);
  if (!featured.length) featured = g.categories.map((c) => c.facets.find((f) => f.minSize.w <= 78 && f.minSize.h <= TILE_H)).filter(Boolean).slice(0, 1);
  if (featured.length) {
    p.blank();
    const tileW = featured.length === 1 ? 78 : TILE_W;
    const tiles = featured.map((f) => ({ buffer: snapshot(f, { w: Math.min(tileW, f.size.w), h: Math.min(TILE_H, f.size.h), plain }) }));
    p.tiles(tiles, 2);
    let caption = '';
    tiles.forEach((t, i) => { caption = caption.padEnd(i === 0 ? 0 : tiles[0].buffer.width + 2) + truncate(featured[i].id, t.buffer.width, plain ? '...' : '…'); });
    p.line(dim(caption));
  }
  const idW = Math.min(26, Math.max(...g.categories.flatMap((c) => c.facets.map((f) => f.id.length))) + 2);
  g.categories.forEach((c, i) => {
    p.blank();
    section(p, `${String(i + 1).padStart(2, '0')} / ${c.name}`, hue, `${c.facets.length}`);
    for (const f of c.facets) p.line({ text: '  ' }, { text: f.id.padEnd(idW), fg: C.cmd }, { text: f.description, clip: true });
  });
  const first = g.categories[0]?.facets[0]?.id || '<id>';
  footer(p, site, [
    ['one facet', `curl -sL ${h}/f/${first}`],
    ['paged', `curl -sL ${h}/t/${g.id} | less -R`],
    ['galleries', `curl -sL ${h}/tty`],
  ]);
  return p;
}

function facetPage(ctx, f, plain) {
  const { site, galleries } = ctx;
  const h = host(site);
  const g = galleries.find((x) => x.id === f.gallery);
  const hue = hueOf(g.id);
  const siblings = g.categories.flatMap((c) => c.facets);
  const i = siblings.findIndex((x) => x.id === f.id);
  const prev = siblings[(i - 1 + siblings.length) % siblings.length], next = siblings[(i + 1) % siblings.length];
  const p = header(new Page(plain), [g.title, f.category], `${lambdaLabel(g.id, !plain)} · ${i + 1} / ${siblings.length}`, { hue });
  beamRule(p, { hue: galleryHue(g.id) });
  p.line({ text: f.title, attr: ATTR.BOLD }, dim(`  ${f.id}`));
  p.para(f.description, { indent: 0 });
  const meta = [f.kind, `${f.size.w}×${f.size.h} (min ${f.minSize.w}×${f.minSize.h})`, f.animated ? `${f.loop} s loop` : 'still', f.glyphs, f.color === 'truecolor' ? 'truecolor' : `${f.color} colors`];
  p.line(dim(meta.join(' · ')));
  if (f.tags.length) tagLines(p, f.tags);
  p.blank();
  const snap = snapshot(f, { plain });
  const x = Math.max(0, Math.floor((WIDTH - snap.width) / 2));
  p.snapshot(snap, x);
  if (snap.width < f.size.w || snap.height < f.size.h) p.line(dim(`  still at ${snap.width}×${snap.height}${f.animated ? ` · t=${stillAt(f)}s` : ''} — run it live for full size and motion`));
  else if (f.animated) p.line(dim(`  still at t=${stillAt(f)}s — run it live to see it move`));
  const params = Object.entries(f.params || {});
  if (params.length) {
    p.blank();
    section(p, 'Params', hue, '--set key=value');
    for (const [k, spec] of params) {
      const range = spec.options ? spec.options.join('|') : spec.min !== undefined ? `${spec.min}–${spec.max}` : '';
      // Long defaults (scroller text) go after the label, where they may be cut.
      const set = `${k}=${spec.default}`, long = set.length > 21;
      p.line(
        { text: '  ' },
        cmd((long ? `${k}=<${typeof spec.default === 'string' ? 'text' : 'value'}>` : set).padEnd(22)),
        dim(`${spec.label || k}${range ? `  (${range})` : ''}`),
        long && { ...dim(`  default: ${spec.default}`), clip: true },
      );
    }
  }
  p.blank();
  section(p, 'Run it live', hue, 'Node 18+, no install');
  npxLines(p, site, `play ${f.id}`, 2, ctx.version);
  p.line(label('Snapshot', hue), dim('  '), cmd(`prism-term snapshot ${f.id} --size ${f.size.w}x${f.size.h}`));
  p.line(label('In code', hue));
  p.line({ text: '  ' }, cmd("import { play, findFacet } from 'prism-term';"));
  p.line({ text: '  ' }, cmd(`await play(findFacet('${f.id}'));`));
  footer(p, site, [
    ['‹ prev', `curl -sL ${h}/f/${prev.id}`],
    ['next ›', `curl -sL ${h}/f/${next.id}`],
    ['gallery', `curl -sL ${h}/t/${g.id}`],
    ['home', `curl -sL ${h}/tty`],
  ]);
  return p;
}

// ── site ────────────────────────────────────────────────────────────────────

/**
 * Build every page. Returns Map(path → { '256', '24', 'txt', buffer, overflow })
 * where path is site-relative without a leading slash ('tty', 't/fx', 'f/plasma',
 * …) and overflow lists lines that had to be cut to 80 columns (should be empty).
 * @param {object} ctx { site, version, galleries: catalogTree(), facets: allFacets() }
 */
export function buildTtyPages(ctx) {
  const pages = new Map();
  const add = (path, build) => {
    const color = build(false), plain = build(true);
    const buffer = color.buffer();
    pages.set(path, { '256': serialize(buffer, '256'), '24': serialize(buffer, '24'), txt: serialize(plain.buffer(), 'txt'), buffer, overflow: [...color.overflow, ...plain.overflow] });
  };
  add('tty', (plain) => homePage(ctx, plain));
  add('t/help', (plain) => helpPage(ctx, plain));
  add('t/all', (plain) => allPage(ctx, plain));
  add('t/themes', (plain) => themesPage(ctx, plain));
  for (const g of ctx.galleries) add(`t/${g.id}`, (plain) => galleryPage(ctx, g, plain));
  for (const f of ctx.facets) add(`f/${f.id}`, (plain) => facetPage(ctx, f, plain));
  return pages;
}

export { theme as TTY_THEME };
