// Gallery — the interactive catalog browser (`prism-term` with no arguments).
//
//   ┌ galleries ─┐┌ facets ──────┐┌ live preview ───────────────────┐
//   │ FX Store 18││ FIELDS       ││  (the facet, running, at its     │
//   │ Objects  12││ ▸ Plasma     ││   preferred size, centered)      │
//   │ …          ││   Tunnel     │└──────────────────────────────────┘
//   └────────────┘└──────────────┘ FX Store · Fields · scene · 80×24 …
//                                  $ prism-term play plasma
//
// Three panes on wide terminals, two below ~110 columns (galleries become a
// ◀ ▶ switcher above the list), one below ~64 (no preview). Previews are set
// up lazily — only the highlighted facet runs, and only once the selection has
// settled — so browsing hundreds of facets stays instant. Enter plays the
// current list fullscreen on the same Screen; q comes back here.
//
// Keys: ↑↓/jk move · ←→/hl or Tab switch pane · Enter play · s showcase ·
// / search · g gallery picker · f kind filter · t theme · m mode · ? help · q quit.

import { Screen } from './screen.js';
import { createContext } from './context.js';
import { createPlayer, resolveCaps, stageRect, growFor, cropMarks, facetPlace, asciify, holdTitle } from './player.js';
import { THEME_IDS, getTheme, palette as makePalette } from './palettes.js';
import { MODE_NAMES } from './canvas.js';
import { ATTR } from './buffer.js';
import { truncate, wrap, stringWidth } from './width.js';
import { GALLERIES } from './facets/galleries.js';
import { KINDS } from './facets/schema.js';

const MODE_CYCLE = [null, ...MODE_NAMES];
const KIND_CYCLE = [null, ...KINDS];
const SETTLE_S = 0.09; // selection must rest this long before a preview spins up

/** UI glyphs, with 7-bit fallbacks for ASCII-only terminals (TERM=linux, LANG=C). */
export function glyphsFor(unicode) {
  return unicode
    ? { tl: '╭', tr: '╮', bl: '╰', br: '╯', h: '─', v: '│', sel: '▸', dot: '·', mark: '◆', left: '◀', right: '▶', ell: '…', caret: '▏', up: '↑', down: '↓', enter: '⏎', tab: '⇥', lr: '←→', ud: '↑↓' }
    : { tl: '+', tr: '+', bl: '+', br: '+', h: '-', v: '|', sel: '>', dot: '-', mark: '*', left: '<', right: '>', ell: '~', caret: '_', up: '^', down: 'v', enter: 'Enter', tab: 'Tab', lr: '<>', ud: 'jk' };
}

/** Pane geometry for a W×H screen. */
export function layoutFor(W, H) {
  const body = { y: 1, h: Math.max(0, H - 2) };
  if (W < 30 || H < 8) return { kind: 'tiny', W, H, body };
  if (W >= 110 && H >= 20) {
    const gw = W >= 160 ? 31 : W >= 130 ? 28 : 25, lw = Math.max(30, Math.min(40, Math.floor(W * 0.22)));
    return { kind: 'three', W, H, body, gal: { x: 0, w: gw }, list: { x: gw, w: lw }, prev: { x: gw + lw, w: W - gw - lw } };
  }
  if (W >= 64 && H >= 14) {
    const lw = Math.max(28, Math.min(38, Math.floor(W * 0.4)));
    return { kind: 'two', W, H, body, list: { x: 0, w: lw }, prev: { x: lw, w: W - lw } };
  }
  return { kind: 'one', W, H, body, list: { x: 0, w: W } };
}

/**
 * The browsable model: galleries in taxonomy order, each with its facets (after
 * the kind filter) and display rows — category headers interleaved with facets.
 */
export function buildModel(facets, kind = null) {
  return GALLERIES.map((g) => {
    const all = facets.filter((f) => f.gallery === g.id);
    const list = kind ? all.filter((f) => f.kind === kind) : all;
    const rows = [];
    for (const cat of g.categories) {
      const inCat = list.filter((f) => f.category === cat);
      if (!inCat.length) continue;
      rows.push({ header: cat });
      for (const f of inCat) rows.push({ facet: f });
    }
    return { id: g.id, title: g.title, icon: g.icon, total: all.length, facets: list, rows };
  }).filter((g) => g.total > 0);
}

function box(b, x, y, w, h, color, title, G, titleColor, attr = ATTR.BOLD) {
  if (w < 2 || h < 2) return;
  b.text(x, y, G.tl + G.h.repeat(w - 2) + G.tr, color);
  for (let yy = y + 1; yy < y + h - 1; yy++) { b.set(x, yy, G.v, color); b.set(x + w - 1, yy, G.v, color); }
  b.text(x, y + h - 1, G.bl + G.h.repeat(w - 2) + G.br, color);
  if (title && w > 6) b.text(x + 2, y, ` ${truncate(title, w - 6, G.ell)} `, titleColor ?? color, undefined, attr);
}

/**
 * Open the gallery. Resolves when the user quits.
 * @param {object[]} facets  every facet (allFacets())
 * @param {object} opts      theme, mode, fps, params, seed, transparent, gallery (start there),
 *                           output/input streams + capability overrides, title (window title; none by default)
 */
export async function gallery(facets, opts = {}) {
  const caps = resolveCaps(opts);
  const U = caps.unicode !== false;
  const G = glyphsFor(U);
  const T = U ? (s) => s : asciify; // catalog text (titles, descriptions, categories) on ASCII-only terminals
  const mono = caps.depth === 'mono';
  const screen = new Screen({ output: opts.output, input: opts.input, caps, depth: caps.depth, title: opts.title || undefined });
  const fps = opts.fps || 30;
  const spectrum = makePalette('prism');

  const st = {
    kind: null,
    model: buildModel(facets, null),
    gi: 0,
    sel: new Map(),        // gallery id → selected row index
    scroll: new Map(),     // gallery id → first visible row
    focus: 'list',         // 'galleries' | 'list'
    galScroll: 0,
    themeId: opts.theme,
    mode: opts.mode || null,
    overlay: null,         // null | 'help' | 'picker'
    picker: 0,
    search: null,          // { query, sel, scroll, results }
  };
  if (opts.gallery) {
    const i = st.model.findIndex((g) => g.id === opts.gallery || g.title.toLowerCase() === String(opts.gallery).toLowerCase());
    if (i >= 0) st.gi = i;
  }

  const gal = () => st.model[st.gi];
  const firstFacetRow = (rows) => rows.findIndex((r) => r.facet);
  const selRow = (g = gal()) => {
    if (!st.sel.has(g.id)) st.sel.set(g.id, Math.max(0, firstFacetRow(g.rows)));
    return st.sel.get(g.id);
  };
  const current = () => {
    if (st.search) return st.search.results[st.search.sel] || null;
    const g = gal();
    return g?.rows[selRow(g)]?.facet || null;
  };

  const moveSel = (delta) => {
    if (st.search) {
      const n = st.search.results.length;
      if (n) st.search.sel = Math.max(0, Math.min(n - 1, st.search.sel + delta));
      return;
    }
    if (st.focus === 'galleries') {
      st.gi = Math.max(0, Math.min(st.model.length - 1, st.gi + delta));
      return;
    }
    const g = gal();
    let i = selRow(g);
    const step = Math.sign(delta);
    for (let k = 0; k < Math.abs(delta); k++) {
      let j = i + step;
      while (j >= 0 && j < g.rows.length && !g.rows[j].facet) j += step;
      if (j < 0 || j >= g.rows.length) break;
      i = j;
    }
    st.sel.set(g.id, i);
  };

  // Skips galleries the kind filter has emptied (unless every gallery is empty).
  const switchGallery = (delta) => {
    const n = st.model.length;
    for (let k = 1; k <= n; k++) {
      const i = (st.gi + delta * k + n * k) % n;
      if (st.model[i].facets.length || k === n) { st.gi = i; return; }
    }
  };

  const jumpTo = (f) => {
    const gi = st.model.findIndex((g) => g.id === f.gallery);
    if (gi < 0) return;
    st.gi = gi;
    const ri = st.model[gi].rows.findIndex((r) => r.facet === f);
    if (ri >= 0) st.sel.set(st.model[gi].id, ri);
    st.focus = 'list';
  };

  const setKind = (kind) => {
    const keep = current();
    st.kind = kind;
    st.model = buildModel(facets, kind);
    st.sel.clear();
    st.scroll.clear();
    st.gi = Math.min(st.gi, st.model.length - 1);
    if (keep && (!kind || keep.kind === kind)) jumpTo(keep);
    else if (!gal().facets.length) {
      const i = st.model.findIndex((g) => g.facets.length);
      if (i >= 0) st.gi = i;
    }
    if (st.search) runSearch();
  };

  // Every term must match somewhere; results rank by where the terms hit
  // (title word start, then title, tags, gallery/category/kind, description).
  const runSearch = () => {
    const terms = st.search.query.toLowerCase().split(/\s+/).filter(Boolean);
    const pool = st.kind ? facets.filter((f) => f.kind === st.kind) : facets;
    const scored = [];
    for (const f of pool) {
      const title = `${f.id} ${f.title}`.toLowerCase();
      const words = title.split(/[^a-z0-9]+/);
      const tags = (f.tags || []).join(' ').toLowerCase();
      const place = `${f.gallery} ${f.category} ${f.kind}`.toLowerCase();
      const desc = (f.description || '').toLowerCase();
      let score = 0;
      for (const t of terms) {
        const s = words.some((w) => w.startsWith(t)) ? 0 : title.includes(t) ? 1
          : tags.includes(t) ? 2 : place.includes(t) ? 3 : desc.includes(t) ? 4 : -1;
        if (s < 0) { score = -1; break; }
        score += s;
      }
      if (score >= 0) scored.push({ f, score });
    }
    st.search.results = scored.sort((a, b) => a.score - b.score).map((x) => x.f);
    st.search.sel = Math.min(st.search.sel, Math.max(0, st.search.results.length - 1));
  };

  // ── preview ─────────────────────────────────────────────────────────────
  let now = 0;
  const pv = { key: '', facet: null, since: 0, ready: false, ctx: null, frame: null, view: null, stage: null, error: null, t0: 0 };

  const ensurePreview = (f, area) => {
    const key = `${f?.id}|${st.themeId}|${st.mode}|${area.w}x${area.h}`;
    if (key !== pv.key) {
      Object.assign(pv, { key, facet: f, since: now, ready: false, ctx: null, frame: null, error: null });
      return;
    }
    if (pv.ready || !f || now - pv.since < SETTLE_S) return;
    pv.ready = true;
    try {
      pv.stage = stageRect(f, area.w, area.h, { grow: growFor(f) });
      pv.areaView = area.view;
      pv.view = area.view.view(pv.stage.x, pv.stage.y, pv.stage.w, pv.stage.h);
      pv.ctx = createContext({ scene: f, buffer: pv.view, caps, theme: st.themeId, mode: st.mode, params: opts.params || {}, seed: opts.seed ?? 7, transparent: opts.transparent });
      pv.frame = f.setup(pv.ctx);
      pv.t0 = now;
    } catch (err) {
      pv.error = err;
      pv.frame = null;
    }
  };

  const drawPreview = (b, th, area) => {
    const f = current();
    ensurePreview(f, area);
    if (!f) { area.view.text(2, 1, st.search ? 'No facets match.' : 'Nothing here.', th.muted); return; }
    if (!pv.ready) {
      const msg = T(`${f.title}${G.ell}`);
      area.view.text(Math.max(0, Math.floor((area.w - stringWidth(msg)) / 2)), Math.floor(area.h / 2), truncate(msg, area.w, G.ell), th.dim);
      return;
    }
    if (pv.frame) {
      try {
        // Same view objects as setup, but positions are re-derived each frame in case the area moved.
        pv.view.clear(pv.ctx.bg);
        pv.frame(f.animated ? now - pv.t0 : 0, f.animated ? 1 / fps : 0);
      } catch (err) { pv.error = err; pv.frame = null; }
    }
    if (!pv.stage.fill) cropMarks(area.view, pv.stage, th.line, U);
    if (pv.error) area.view.text(1, 0, truncate(T(`preview failed: ${pv.error.message}`), area.w - 2, G.ell), th.neg);
    else if (pv.stage.tooSmall) area.view.text(1, 0, truncate(T(`needs ≥ ${f.minSize.w}×${f.minSize.h} (shown clipped)`), area.w - 2, G.ell), th.warn);
  };

  // ── drawing ─────────────────────────────────────────────────────────────

  const hiAttr = (on) => (on ? ATTR.BOLD | (mono ? ATTR.INVERSE : 0) : 0);

  const drawHeader = (b, th, L) => {
    const name = ` ${G.mark} prism-term `;
    if (mono || !U) b.text(0, 0, name, th.bg, th.accent, ATTR.BOLD | ATTR.INVERSE);
    else for (let i = 0; i < name.length; i++) b.set(i, 0, name[i], th.bg, spectrum(i / name.length * 0.5 + now * 0.06), ATTR.BOLD);
    const s = ` ${G.dot} `;
    const x = stringWidth(name) + 1;
    const glyphs = caps.unicode ? (caps.sextant ? 'braille+sextant' : 'braille') : 'ascii';
    const wide = L.W >= 110;
    const summary = wide ? `${facets.length} facets${s}${st.model.length} galleries${s}${caps.depth}${s}${glyphs}` : `${facets.length} facets${s}${st.model.length} galleries`;
    const right = T(wide ? `kind: ${st.kind || 'all'}${s}${getTheme(st.themeId).name}${s}${st.mode || 'auto'} ` : `${st.kind || 'all'}${s}${st.mode || 'auto'} `);
    const room = L.W - x - stringWidth(right) - 1;
    b.text(x, 0, truncate(summary, Math.max(0, room), G.ell), th.muted);
    if (room > 8) b.text(L.W - stringWidth(right), 0, right, th.dim);
  };

  const drawKeys = (b, th, L) => {
    const y = L.H - 1;
    b.fill(0, y, L.W, 1, ' ', th.muted, th.panel, mono ? ATTR.INVERSE : 0);
    const keys = st.search
      ? `type to search  ${G.ud} move  ${G.enter} go  Esc cancel`
      : L.kind === 'three'
        ? `${G.ud} move  ${G.lr}/${G.tab} pane  ${G.enter} play  s showcase  / search  g gallery  f kind  t theme  m mode  ? help  q quit`
        : L.W >= 96
          ? `${G.ud} move  ${G.lr} gallery  ${G.enter} play  / search  g pick  f kind  t theme  m mode  ? help  q quit`
          : L.W >= 72
            ? `${G.ud} move  ${G.lr} gallery  ${G.enter} play  / search  g pick  f kind  ? help  q quit`
            : `${G.ud} move  ${G.lr} gallery  ${G.enter} play  / search  ? help  q quit`;
    b.text(1, y, truncate(keys, L.W - 2, G.ell), th.muted, th.panel, mono ? ATTR.INVERSE : 0);
  };

  const drawGalleries = (b, th, L) => {
    const { x, w } = L.gal, y = L.body.y, h = L.body.h;
    const focused = st.focus === 'galleries' && !st.search;
    box(b, x, y, w, h, focused ? th.accent : th.line, 'GALLERIES', G, focused ? th.accent : th.muted);
    const rows = h - 2;
    if (st.gi < st.galScroll) st.galScroll = st.gi;
    if (st.gi >= st.galScroll + rows) st.galScroll = st.gi - rows + 1;
    for (let r = 0; r < rows; r++) {
      const g = st.model[st.galScroll + r];
      if (!g) break;
      const yy = y + 1 + r, on = st.galScroll + r === st.gi;
      const count = String(g.facets.length);
      const label = U ? `${(g.icon + '   ').slice(0, 3)} ${g.title}` : T(g.title);
      const iw = w - 5 - count.length;
      const fg = g.facets.length ? th.ink : th.dim;
      if (on) b.fill(x + 1, yy, w - 2, 1, ' ', th.bg, focused ? th.accent : th.panel2, hiAttr(true));
      b.text(x + 1, yy, `${on ? G.sel : ' '}${truncate(label, Math.max(1, iw), G.ell)}`, on ? (focused ? th.bg : th.ink) : fg, on ? (focused ? th.accent : th.panel2) : undefined, hiAttr(on));
      b.text(x + w - 2 - count.length, yy, count, on ? (focused ? th.bg : th.muted) : th.dim, on ? (focused ? th.accent : th.panel2) : undefined, hiAttr(on));
    }
  };

  const drawList = (b, th, L) => {
    const { x, w } = L.list, y = L.body.y, h = L.body.h;
    const focused = st.focus === 'list' || L.kind !== 'three' || !!st.search;
    const g = gal();
    if (st.search) return drawSearch(b, th, x, y, w, h);
    // Truncate the gallery name, never the count.
    const count = ` ${G.dot} ${g.facets.length}${L.kind === 'three' ? '' : ` ${G.right}`}`;
    const name = T(L.kind === 'three' ? g.title.toUpperCase() : `${G.left} ${g.title}`);
    const title = truncate(name, Math.max(1, w - 6 - stringWidth(count)), G.ell) + count;
    box(b, x, y, w, h, focused ? th.accent : th.line, title, G, focused ? th.accent : th.muted);
    const rows = h - 2;
    if (!g.rows.length) { b.text(x + 2, y + 1, truncate(T(`No ${st.kind} facets in ${g.title}.`), w - 4, G.ell), th.dim); return; }
    const sel = selRow(g);
    let top = st.scroll.get(g.id) ?? 0;
    if (sel < top + 1) top = Math.max(0, sel - 1);
    if (sel >= top + rows) top = sel - rows + 1;
    st.scroll.set(g.id, top);
    for (let r = 0; r < rows; r++) {
      const row = g.rows[top + r];
      if (!row) break;
      const yy = y + 1 + r;
      if (row.header) { b.text(x + 2, yy, truncate(T(row.header.toUpperCase()), w - 4, G.ell), th.dim, undefined, ATTR.BOLD); continue; }
      const on = top + r === sel;
      const kind = row.facet.kind;
      const room = w - 6 - (w > 34 ? kind.length + 1 : 0);
      if (on) b.fill(x + 1, yy, w - 2, 1, ' ', th.bg, th.accent, hiAttr(true));
      b.text(x + 2, yy, `${on ? G.sel : ' '} ${truncate(T(row.facet.title), Math.max(1, room), G.ell)}`, on ? th.bg : th.ink, on ? th.accent : undefined, hiAttr(on));
      if (w > 34) b.text(x + w - 2 - kind.length, yy, kind, on ? th.bg : th.dim, on ? th.accent : undefined, hiAttr(on));
    }
    if (g.rows.length > rows) {
      const pct = top / Math.max(1, g.rows.length - rows);
      b.set(x + w - 1, y + 1 + Math.round(pct * (rows - 1)), U ? '┃' : '#', th.accent);
    }
  };

  const drawSearch = (b, th, x, y, w, h) => {
    box(b, x, y, w, h, th.accent, 'SEARCH', G, th.accent);
    const s = st.search;
    const q = T(`/ ${s.query}`);
    b.text(x + 2, y + 1, truncate(q, w - 5, G.ell), th.ink, undefined, ATTR.BOLD);
    if (Math.floor(now * 2) % 2 === 0) b.text(x + 2 + Math.min(stringWidth(q), w - 5), y + 1, G.caret, th.accent);
    b.text(x + 2, y + 2, truncate(`${s.results.length} match${s.results.length === 1 ? '' : 'es'}`, w - 4, G.ell), th.dim);
    const rows = h - 5;
    if (s.sel < s.scroll) s.scroll = s.sel;
    if (s.sel >= s.scroll + rows) s.scroll = s.sel - rows + 1;
    for (let r = 0; r < rows; r++) {
      const f = s.results[s.scroll + r];
      if (!f) break;
      const yy = y + 3 + r, on = s.scroll + r === s.sel;
      const where = T(getGalleryTitle(f.gallery));
      const room = w - 6 - (w > 36 ? stringWidth(where) + 1 : 0);
      if (on) b.fill(x + 1, yy, w - 2, 1, ' ', th.bg, th.accent, hiAttr(true));
      b.text(x + 2, yy, `${on ? G.sel : ' '} ${truncate(T(f.title), Math.max(1, room), G.ell)}`, on ? th.bg : th.ink, on ? th.accent : undefined, hiAttr(on));
      if (w > 36) b.text(x + w - 2 - stringWidth(where), yy, where, on ? th.bg : th.dim, on ? th.accent : undefined, hiAttr(on));
    }
  };

  const getGalleryTitle = (id) => GALLERIES.find((g) => g.id === id)?.title || id;

  const drawPreviewPane = (b, th, L) => {
    const { x, w } = L.prev, y = L.body.y, h = L.body.h;
    const f = current();
    const infoH = h >= 22 ? 5 : h >= 16 ? 4 : 3;
    const ph = h - infoH;
    box(b, x, y, w, ph, th.line, f ? T(f.title) : 'Preview', G, th.ink);
    const area = { w: w - 2, h: ph - 2 };
    area.view = b.view(x + 1, y + 1, area.w, area.h);
    if (area.w > 0 && area.h > 0) drawPreview(b, th, area);
    if (!f) return;
    // Info strip.
    const s = ` ${G.dot} `;
    const iy = y + ph, iw = w - 2;
    const place = T(`${facetPlace(f, s)}${s}${f.kind}${s}${f.size.w}×${f.size.h}${s}needs ${f.glyphs} + ${f.color}${f.animated ? '' : `${s}still`}`);
    b.text(x + 1, iy, truncate(place, iw, G.ell), th.muted);
    const desc = wrap(T(f.description || ''), iw).slice(0, infoH - 2);
    desc.forEach((line, i) => b.text(x + 1, iy + 1 + i, line, th.ink));
    const params = T(Object.entries(f.params || {}).map(([k, p]) => `--set ${k}=${p.default ?? ''}`).slice(0, 2).join(' '));
    const cmd = `$ prism-term play ${f.id}`;
    const end = b.text(x + 1, iy + infoH - 1, truncate(cmd, iw, G.ell), th.accent, undefined, ATTR.BOLD);
    if (params && end + 2 + stringWidth(params) <= x + w - 1) b.text(end + 2, iy + infoH - 1, params, th.dim);
  };

  const drawOnePane = (b, th, L) => {
    drawList(b, th, { ...L, list: { x: 0, w: L.W }, body: { y: 1, h: L.H - 3 } });
    const f = current();
    if (f) b.text(1, L.H - 2, truncate(T(`${f.kind} ${G.dot} ${f.size.w}×${f.size.h} ${G.dot} prism-term play ${f.id}`), L.W - 2, G.ell), th.accent);
  };

  const drawHelp = (b, th, L) => {
    const lines = [
      ['Move', `${G.up} ${G.down}  j k  PgUp PgDn  Home End`],
      ['Switch pane', L.kind === 'three' ? `${G.lr}  h l  ${G.tab}` : `${G.lr} h l (change gallery)`],
      ['Play fullscreen', `${G.enter}  (q returns here)`],
      ['Showcase gallery', 's  (auto-advances)'],
      ['Search everything', '/  then type, Esc to cancel'],
      ['Jump to gallery', 'g'],
      ['Filter by kind', `f next / F previous  (${KINDS.length} kinds)`],
      ['Theme / mode', 't  /  m'],
      ['Quit', 'q'],
    ];
    const w = Math.min(L.W - 4, 64), h = Math.min(L.H - 2, lines.length + 4);
    const x = Math.floor((L.W - w) / 2), y = Math.floor((L.H - h) / 2);
    b.fill(x, y, w, h, ' ', th.ink, th.panel);
    box(b, x, y, w, h, th.accent, 'KEYS', G, th.accent);
    lines.slice(0, h - 4).forEach(([k, v], i) => {
      b.text(x + 2, y + 2 + i, truncate(k, 18, G.ell), th.muted, th.panel);
      b.text(x + 21, y + 2 + i, truncate(v, w - 23, G.ell), th.ink, th.panel);
    });
    b.text(x + 2, y + h - 1, truncate(' any key to close ', w - 4, G.ell), th.dim, th.panel);
  };

  const drawPicker = (b, th, L) => {
    const w = Math.min(L.W - 4, 44), h = Math.min(L.H - 2, st.model.length + 2);
    const x = Math.floor((L.W - w) / 2), y = Math.floor((L.H - h) / 2);
    b.fill(x, y, w, h, ' ', th.ink, th.panel);
    box(b, x, y, w, h, th.accent, 'GO TO GALLERY', G, th.accent);
    const rows = h - 2;
    const top = Math.max(0, Math.min(st.picker - Math.floor(rows / 2), st.model.length - rows));
    for (let r = 0; r < rows; r++) {
      const g = st.model[top + r];
      if (!g) break;
      const on = top + r === st.picker, yy = y + 1 + r;
      if (on) b.fill(x + 1, yy, w - 2, 1, ' ', th.bg, th.accent, hiAttr(true));
      b.text(x + 2, yy, truncate(T(`${on ? G.sel : ' '} ${g.title}`), w - 9, G.ell), on ? th.bg : th.ink, on ? th.accent : th.panel, hiAttr(on));
      const c = String(g.facets.length);
      b.text(x + w - 2 - c.length, yy, c, on ? th.bg : th.dim, on ? th.accent : th.panel, hiAttr(on));
    }
  };

  const draw = () => {
    const b = screen.buffer;
    const L = layoutFor(screen.width, screen.height);
    const th = getTheme(st.themeId);
    b.clear(th.bg, th.ink);
    if (L.kind === 'tiny') {
      b.text(0, 0, truncate(L.W >= 30 ? 'prism-term: terminal too small' : 'too small', L.W, G.ell), th.warn);
      b.text(0, 1, truncate('try: prism-term list', L.W, G.ell), th.muted);
      return;
    }
    drawHeader(b, th, L);
    if (L.kind === 'one') drawOnePane(b, th, L);
    else {
      if (L.kind === 'three') drawGalleries(b, th, L);
      drawList(b, th, L);
      drawPreviewPane(b, th, L);
    }
    drawKeys(b, th, L);
    if (st.overlay === 'help') drawHelp(b, th, L);
    if (st.overlay === 'picker') drawPicker(b, th, L);
  };

  // ── keys ────────────────────────────────────────────────────────────────

  const printable = (k) => {
    const s = k.sequence;
    return typeof s === 'string' && [...s].length === 1 && s >= ' ' && s !== '\x7f' && !k.ctrl && !k.meta ? s : null;
  };

  const onKeyBrowse = (k, finish) => {
    const n = k.name;
    if (st.overlay === 'help') { st.overlay = null; return; }
    if (st.overlay === 'picker') {
      if (n === 'escape' || n === 'g' || n === 'q') st.overlay = null;
      else if (n === 'down' || n === 'j') st.picker = Math.min(st.model.length - 1, st.picker + 1);
      else if (n === 'up' || n === 'k') st.picker = Math.max(0, st.picker - 1);
      else if (n === 'return' || n === 'enter') { st.gi = st.picker; st.focus = 'list'; st.overlay = null; }
      else {
        const ch = printable(k)?.toLowerCase();
        if (ch) {
          const i = st.model.findIndex((g, idx) => idx > st.picker && g.title.toLowerCase().startsWith(ch));
          const j = i >= 0 ? i : st.model.findIndex((g) => g.title.toLowerCase().startsWith(ch));
          if (j >= 0) st.picker = j;
        }
      }
      return;
    }
    if (st.search) {
      if (n === 'escape') { st.search = null; return; }
      if (n === 'return' || n === 'enter') {
        const f = current();
        st.search = null;
        if (f) jumpTo(f);
        return;
      }
      if (n === 'down') return moveSel(1);
      if (n === 'up') return moveSel(-1);
      if (n === 'pagedown') return moveSel(10);
      if (n === 'pageup') return moveSel(-10);
      if (n === 'backspace') { st.search.query = st.search.query.slice(0, -1); runSearch(); return; }
      const ch = printable(k);
      if (ch) { st.search.query += ch; st.search.sel = 0; st.search.scroll = 0; runSearch(); }
      return;
    }
    const L = layoutFor(screen.width, screen.height);
    if (n === 'q' || n === 'escape') return finish({ type: 'quit' });
    if (n === 'return' || n === 'enter') {
      if (st.focus === 'galleries' && L.kind === 'three') { st.focus = 'list'; return; }
      return current() && finish({ type: 'play' });
    }
    if (n === 's') return gal().facets.length && finish({ type: 'showcase' });
    if (n === 'down' || n === 'j') return moveSel(1);
    if (n === 'up' || n === 'k') return moveSel(-1);
    if (n === 'pagedown') return moveSel(10);
    if (n === 'pageup') return moveSel(-10);
    if (n === 'home') return moveSel(-1e6);
    if (n === 'end') return moveSel(1e6);
    if (L.kind === 'three') {
      if (n === 'tab') { st.focus = st.focus === 'list' ? 'galleries' : 'list'; return; }
      if (n === 'left' || n === 'h') { st.focus = 'galleries'; return; }
      if (n === 'right' || n === 'l') { st.focus = 'list'; return; }
    } else {
      if (n === 'left' || n === 'h' || (n === 'tab' && k.shift)) return switchGallery(-1);
      if (n === 'right' || n === 'l' || n === 'tab') return switchGallery(1);
    }
    const ch = printable(k);
    if (ch === '/') { st.search = { query: '', sel: 0, scroll: 0, results: [] }; runSearch(); return; }
    if (ch === '?') { st.overlay = 'help'; return; }
    if (n === 'g') { st.overlay = 'picker'; st.picker = st.gi; return; }
    if (n === 'f') { setKind(KIND_CYCLE[(KIND_CYCLE.indexOf(st.kind) + (k.shift ? KIND_CYCLE.length - 1 : 1)) % KIND_CYCLE.length]); return; }
    if (n === 't') { st.themeId = THEME_IDS[(THEME_IDS.indexOf(getTheme(st.themeId).id) + 1) % THEME_IDS.length]; return; }
    if (n === 'm') { st.mode = MODE_CYCLE[(MODE_CYCLE.indexOf(st.mode) + 1) % MODE_CYCLE.length]; }
  };

  const restoreTitle = holdTitle(opts.output, opts.title);
  screen.start();
  try {
    for (;;) {
      const action = await new Promise((resolve) => {
        let handle = null;
        const finish = (v) => {
          screen.off('key', onKey);
          handle.stop();
          resolve(v);
        };
        const onKey = (k) => onKeyBrowse(k, finish);
        screen.on('key', onKey);
        screen.invalidate();
        pv.key = '';
        handle = screen.animate((t) => { now = t; draw(); }, { fps });
      });
      if (action.type === 'quit') break;
      const list = gal().facets;
      const f = current();
      const start = Math.max(0, list.indexOf(f));
      const player = createPlayer(screen, list.length ? list : [f], {
        ...opts, theme: st.themeId, mode: st.mode, duration: action.type === 'showcase' ? (opts.duration || 'auto') : 0,
      });
      screen.invalidate();
      await player.run(start);
      const back = (list.length ? list : [f])[player.index];
      if (back) jumpTo(back);
      st.themeId = player.theme;
      st.mode = player.mode;
    }
  } finally {
    screen.stop();
    restoreTitle();
  }
}
