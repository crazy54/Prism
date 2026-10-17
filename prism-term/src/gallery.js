// Gallery — the interactive catalog browser (`prism-term` with no arguments).
//
//    ──◢◣━━━ Prism  434 FACETS · 17 GALLERIES · TRUECOLOR        kind: all · Prism Night · auto
//   ╭─ 01 / GALLERIES · 17 ──┬─ 01 / FX STORE · 24 ━━━━━━──┬─ PLASMA ───────────────────────╮
//   │ ▌ FX Store     24 λ430 │ FIELDS                    6 │  (the facet, running, at its    │
//   │▸▌ Animated Ob… 18 λ445 │ ▸ Plasma              scene │   preferred size, centered)     │
//   │ ▌ …                    │   Tunnel              scene ├─────────────────────────────────┤
//   ╰────────────────────────┴─────────────────────────────┴─────────────────────────────────╯
//    ↑↓ move  ←→/⇥ pane  ⏎ play  s showcase  / search  …  ? help  q quit
//
// Drawn in the Refraction grammar (src/refraction.js, docs/refraction-terminal.md):
// one hairline glass frame with shared dividers, lit top/left edges, the
// focused pane's top edge lit as the beam with a glint in the gallery's hue,
// and a spectral index of galleries with wavelength labels.
//
// Three panes on wide terminals, two below ~110 columns (galleries become a
// ◀ ▶ switcher above the list), one below ~64 (no preview). Previews are set
// up lazily — only the highlighted facet runs, and only once the selection has
// settled — so browsing hundreds of facets stays instant. Enter plays the
// current list fullscreen on the same Screen; q comes back here.
//
// Keys: ↑↓/jk move · ←→/hl or Tab switch pane · Enter play · s showcase ·
// / search · g gallery picker · f kind filter · t theme · d Day/Night · m mode · ? help · q quit.

import { Screen } from './screen.js';
import { createContext } from './context.js';
import { createPlayer, resolveCaps, stageRect, growFor, cropMarks, facetPlace, asciify, holdTitle, dayNight } from './player.js';
import { THEME_IDS, getTheme } from './palettes.js';
import { MODE_NAMES } from './canvas.js';
import { ATTR } from './buffer.js';
import { mix } from './color.js';
import { truncate, wrap, stringWidth } from './width.js';
import { GALLERIES } from './facets/galleries.js';
import { KINDS } from './facets/schema.js';
import { chrome, glyphs, beam, mark, instrument, coord, lambdaLabel, galleryHue, rampHue, firstLight, FIRST_LIGHT, sweep, SWEEP_S } from './refraction.js';

const MODE_CYCLE = [null, ...MODE_NAMES];
const KIND_CYCLE = [null, ...KINDS];
const SETTLE_S = 0.09; // selection must rest this long before a preview spins up

/** UI glyphs, with 7-bit fallbacks for ASCII-only terminals (TERM=linux, LANG=C). */
export const glyphsFor = glyphs;

/** Pane geometry for a W×H screen. */
export function layoutFor(W, H) {
  const body = { y: 1, h: Math.max(0, H - 2) };
  if (W < 30 || H < 8) return { kind: 'tiny', W, H, body };
  if (W >= 110 && H >= 20) {
    // The spectral index wants every gallery title whole beside its λ label (34+),
    // and its facet count too (38) once the preview has room to spare.
    const gw = W >= 170 ? 38 : W >= 140 ? 34 : W >= 125 ? 28 : 25, lw = Math.max(W >= 140 ? 32 : 30, Math.min(40, Math.floor(W * 0.22)));
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
  return GALLERIES.map((g, gi) => {
    const all = facets.filter((f) => f.gallery === g.id);
    const list = kind ? all.filter((f) => f.kind === kind) : all;
    const rows = [];
    for (const cat of g.categories) {
      const inCat = list.filter((f) => f.category === cat);
      if (!inCat.length) continue;
      rows.push({ header: cat, count: inCat.length });
      for (const f of inCat) rows.push({ facet: f });
    }
    return { id: g.id, title: g.title, icon: g.icon, n: gi + 1, total: all.length, facets: list, rows };
  }).filter((g) => g.total > 0);
}

/**
 * Selection styling, per the grammar: a glass lift (panel2) with the hue on the
 * marker when the pane has focus; inverse video at 16 colors and in mono (a hue
 * bar behind the label can't reach 4.5:1 in a 16-color scheme).
 */
function selStyle(P, on, focused, hue) {
  if (!on) return null;
  if (P.mono || P.low) return { fg: undefined, bg: undefined, attr: focused ? ATTR.BOLD | ATTR.INVERSE : ATTR.BOLD, mark: undefined, sub: undefined };
  // Focused: glass faintly tinted with the gallery's hue, the title lit in it
  // (5% in Day keeps the hue-colored title at ≥ 4.5:1 on the tint).
  return focused ? { fg: hue, bg: mix(P.glass, hue, P.dark ? 0.12 : 0.05), attr: ATTR.BOLD, mark: hue, sub: P.muted } : { fg: P.ink, bg: P.glass, attr: 0, mark: P.dim, sub: P.dim };
}

/**
 * The glass frame: one hairline border around the body with shared dividers.
 * panes: [{ x, w, title, focus, glint }] left to right; the last runs to W-1;
 * glint is the hue (degrees) of the spectral glint on a focused pane's beam.
 * Top and left edges are the lit edges; a focused pane's top edge is the beam,
 * ending in a glint of its gallery's hue just past the title.
 */
function drawFrame(b, P, G, U, y0, h, panes, W) {
  const y1 = y0 + h - 1;
  if (h < 2) return;
  panes.forEach((p, i) => {
    const last = i === panes.length - 1;
    const right = last ? W - 1 : p.x + p.w;
    // Verticals: x = 0 is lit, dividers and the right edge are plain hairlines.
    for (let y = y0 + 1; y < y1; y++) b.set(p.x, y, G.v, i === 0 ? P.edge : P.line);
    if (last) for (let y = y0 + 1; y < y1; y++) b.set(right, y, G.v, P.line);
    const run = right - p.x - 1;
    const tw = p.title ? Math.min(stringWidth(p.title), Math.max(0, run - 4)) : 0;
    if (p.focus && !P.mono) beam(b, p.x + 1, y0, run, P, { from: 0, reach: Math.max(8, run * 0.5), unicode: U, glint: p.glint !== undefined && U ? { at: Math.min(run - 4, tw + 6), hue: p.glint, n: 5, spread: 14 } : null });
    else for (let x = p.x + 1; x < right; x++) b.set(x, y0, G.h, P.edge);
    b.set(p.x, y0, i === 0 ? G.tl : G.tj, P.edge);
    if (last) b.set(right, y0, G.tr, P.edge);
    for (let x = p.x + 1; x < right; x++) b.set(x, y1, G.h, P.line);
    b.set(p.x, y1, i === 0 ? G.bl : G.bj, P.line);
    if (last) b.set(right, y1, G.br, P.line);
    if (p.title && run > 6) {
      const t = ` ${truncate(p.title, run - 4, G.ell)} `;
      b.text(p.x + 2, y0, t, p.focus ? P.ink : P.muted, undefined, p.focus ? ATTR.BOLD | (P.mono ? ATTR.INVERSE : 0) : 0);
    }
  });
}

/** A floating glass panel (help, picker): panel fill, lit frame, beam on top. */
function drawPanel(b, P, G, U, x, y, w, h, title) {
  b.fill(x, y, w, h, ' ', P.ink, P.panel, 0);
  drawFrame(b, P, G, U, y, h, [{ x, w, title, focus: true, glint: rampHue(0) }], x + w);
  // drawFrame paints the right edge at x + w - 1 via `W - 1`.
}

/**
 * Open the gallery. Resolves when the user quits.
 * @param {object[]} facets  every facet (allFacets())
 * @param {object} opts      theme, mode, fps, params, seed, transparent, gallery (start there),
 *                           intro ('full' | 'echo' | false — First Light; the CLI decides, never on
 *                           mono / 7-bit), output/input streams + capability overrides,
 *                           title (window title; none by default)
 */
export async function gallery(facets, opts = {}) {
  const caps = resolveCaps(opts);
  const U = caps.unicode !== false;
  const G = glyphs(U);
  const T = U ? (s) => s : asciify; // catalog text (titles, descriptions, categories) on ASCII-only terminals
  const screen = new Screen({ output: opts.output, input: opts.input, caps, depth: caps.depth, title: opts.title || undefined });
  const fps = opts.fps || 30;

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

  // ── motion: First Light, relight sweeps ───────────────────────────────────
  let now = 0;
  // First Light never runs without color or Unicode (the caller also checks motion prefs).
  const introKind = opts.intro && caps.depth !== 'mono' && U ? (opts.intro === 'echo' ? 'echo' : 'full') : null;
  let intro = introKind ? { dur: FIRST_LIGHT[introKind], echo: introKind === 'echo', t0: null } : null;
  let relight = null; // { old: CellBuffer, t0 }
  const relightTheme = (id) => {
    if (id === st.themeId) return;
    relight = opts.reducedMotion || caps.depth === 'mono' ? null : { old: screen.buffer.clone(), t0: now };
    st.themeId = id;
  };

  // ── preview ─────────────────────────────────────────────────────────────
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

  const drawPreview = (b, P, area) => {
    const f = current();
    ensurePreview(f, area);
    if (!f) { area.view.text(2, 1, st.search ? 'No facets match.' : 'Nothing here.', P.muted); return; }
    if (!pv.ready) {
      const msg = T(`${f.title}${G.ell}`);
      area.view.text(Math.max(0, Math.floor((area.w - stringWidth(msg)) / 2)), Math.floor(area.h / 2), truncate(msg, area.w, G.ell), P.dim);
      return;
    }
    if (pv.frame) {
      try {
        // Same view objects as setup, but positions are re-derived each frame in case the area moved.
        pv.view.clear(pv.ctx.bg);
        pv.frame(f.animated ? now - pv.t0 : 0, f.animated ? 1 / fps : 0);
      } catch (err) { pv.error = err; pv.frame = null; }
    }
    if (!pv.stage.fill) cropMarks(area.view, pv.stage, P.edge, U);
    if (pv.error) area.view.text(1, 0, truncate(T(`preview failed: ${pv.error.message}`), area.w - 2, G.ell), P.th.neg);
    else if (pv.stage.tooSmall) area.view.text(1, 0, truncate(T(`needs ≥ ${f.minSize.w}×${f.minSize.h} (shown clipped)`), area.w - 2, G.ell), P.th.warn);
  };

  // ── drawing ─────────────────────────────────────────────────────────────

  const titleOf = (g, L) => {
    // Three panes: an instrument label; two: the ◀ ▶ switcher. The count is never truncated.
    if (L.kind === 'three') {
      const count = ` ${G.dot} ${g.facets.length}`;
      const name = T(g.title).toUpperCase(), withCoord = `${coord(g.n)} / ${name}`;
      // The coordinate goes first when the pane is too narrow for both.
      return { name: stringWidth(withCoord + count) <= L.list.w - 6 ? withCoord : name, count };
    }
    return { name: T(`${G.left} ${g.title}`), count: ` ${G.dot} ${g.facets.length} ${G.right}` };
  };

  const drawHeader = (b, P, L) => {
    let x = mark(b, 1, 0, P, { beamW: 2, raysW: 3, unicode: U }) + 1;
    x = b.text(x, 0, 'Prism', P.ink, undefined, ATTR.BOLD) + 2;
    const s = ` ${G.dot} `;
    const glyphsName = caps.unicode ? (caps.sextant ? 'braille+sextant' : 'braille') : 'ascii';
    const wide = L.W >= 110;
    const summary = instrument(wide ? [`${facets.length} facets`, `${st.model.length} galleries`, caps.depth, glyphsName] : [`${facets.length} facets`, `${st.model.length} galleries`], s);
    const th = getTheme(st.themeId);
    const right = T(wide ? `kind: ${st.kind || 'all'}${s}${th.name}${s}${st.mode || 'auto'} ` : `${st.kind || 'all'}${s}${st.mode || 'auto'} `);
    const room = L.W - x - stringWidth(right) - 1;
    b.text(x, 0, truncate(summary, Math.max(0, room), G.ell), P.dim);
    if (room > 8) b.text(L.W - stringWidth(right), 0, right, P.muted);
  };

  const drawKeys = (b, P, L) => {
    const y = L.H - 1;
    const keys = st.search
      ? [['type', 'to search'], [G.ud, 'move'], [G.enter, 'go'], ['Esc', 'cancel']]
      : L.kind === 'three'
        ? [[G.ud, 'move'], [`${G.lr}/${G.tab}`, 'pane'], [G.enter, 'play'], ['s', 'showcase'], ['/', 'search'], ['g', 'gallery'], ['f', 'kind'], ['t', 'theme'], ['d', 'day/night'], ['m', 'mode'], ['?', 'help'], ['q', 'quit']]
        : L.W >= 96
          ? [[G.ud, 'move'], [G.lr, 'gallery'], [G.enter, 'play'], ['/', 'search'], ['g', 'pick'], ['f', 'kind'], ['t', 'theme'], ['m', 'mode'], ['?', 'help'], ['q', 'quit']]
          : L.W >= 72
            ? [[G.ud, 'move'], [G.lr, 'gallery'], [G.enter, 'play'], ['/', 'search'], ['g', 'pick'], ['f', 'kind'], ['?', 'help'], ['q', 'quit']]
            : [[G.ud, 'move'], [G.lr, 'gallery'], [G.enter, 'play'], ['/', 'search'], ['?', 'help'], ['q', 'quit']];
    let x = 1;
    for (const [k, label] of keys) {
      const need = stringWidth(k) + 1 + stringWidth(label);
      if (x + need > L.W - 1) break;
      x = b.text(x, y, k, P.ink, undefined, ATTR.BOLD);
      x = b.text(x, y, ` ${label}`, P.dim) + 2;
    }
  };

  const drawGalleries = (b, P, L) => {
    const { x, w } = L.gal, y = L.body.y, h = L.body.h;
    const focused = st.focus === 'galleries' && !st.search;
    const rows = h - 2, iw = w - 1;
    if (st.gi < st.galScroll) st.galScroll = st.gi;
    if (st.gi >= st.galScroll + rows) st.galScroll = st.gi - rows + 1;
    // Row: ▸▌ Title ……… [count] λ430 — the count only when everything fits.
    const showCount = iw >= 37;
    for (let r = 0; r < rows; r++) {
      const g = st.model[st.galScroll + r];
      if (!g) break;
      const yy = y + 1 + r, on = st.galScroll + r === st.gi;
      const hue = P.hue(g.id);
      const S = selStyle(P, on, focused, hue);
      if (S) b.fill(x + 1, yy, iw, 1, ' ', S.fg, S.bg, S.attr);
      const count = showCount ? String(g.facets.length) : '';
      const lam = lambdaLabel(g.id, U);
      b.set(x + 1, yy, on ? G.sel : ' ', S ? S.mark : undefined, S?.bg, S?.attr);
      b.set(x + 2, yy, G.swatch, P.mono ? undefined : P.vivid(g.id), S?.bg, S?.attr ?? 0);
      const lx = x + iw - stringWidth(lam);
      const cx = lx - (count ? count.length + 1 : 0);
      const fg = S ? S.fg : g.facets.length ? P.ink : P.dim;
      b.text(x + 4, yy, truncate(T(g.title), Math.max(1, cx - x - 5), G.ell), fg, S?.bg, S ? S.attr : 0);
      if (count) b.text(cx, yy, count, S ? S.sub : P.dim, S?.bg, S ? S.attr & ~ATTR.BOLD : 0);
      b.text(lx, yy, lam, P.mono ? undefined : S && P.low ? S.sub : hue, S?.bg, S ? S.attr & ~ATTR.BOLD : 0);
    }
  };

  const drawList = (b, P, L, x = L.list.x, w = L.list.w) => {
    const y = L.body.y, h = L.body.h;
    const focused = st.focus === 'list' || L.kind !== 'three' || !!st.search;
    const g = gal();
    if (st.search) return drawSearch(b, P, x, y, w, h);
    const rows = h - 2, iw = w - 1;
    if (!g.rows.length) { b.text(x + 2, y + 1, truncate(T(`No ${st.kind} facets in ${g.title}.`), iw - 3, G.ell), P.dim); return; }
    const hue = P.hue(g.id);
    const sel = selRow(g);
    let top = st.scroll.get(g.id) ?? 0;
    if (sel < top + 1) top = Math.max(0, sel - 1);
    if (sel >= top + rows) top = sel - rows + 1;
    st.scroll.set(g.id, top);
    const showKind = iw > 33;
    for (let r = 0; r < rows; r++) {
      const row = g.rows[top + r];
      if (!row) break;
      const yy = y + 1 + r;
      if (row.header) {
        b.text(x + 2, yy, truncate(T(row.header.toUpperCase()), iw - 7, G.ell), P.dim);
        const c = String(row.count);
        b.text(x + iw - c.length - 1, yy, c, P.dim);
        continue;
      }
      const on = top + r === sel;
      const S = selStyle(P, on, focused, hue);
      const kind = row.facet.kind;
      const room = iw - 5 - (showKind ? kind.length + 1 : 0);
      if (S) b.fill(x + 1, yy, iw, 1, ' ', S.fg, S.bg, S.attr);
      b.set(x + 2, yy, on ? G.sel : ' ', S ? S.mark : undefined, S?.bg, S?.attr);
      b.text(x + 4, yy, truncate(T(row.facet.title), Math.max(1, room), G.ell), S ? S.fg : P.ink, S?.bg, S ? S.attr : 0);
      if (showKind) b.text(x + iw - kind.length - 1, yy, kind, S ? S.sub : P.dim, S?.bg, S ? S.attr & ~ATTR.BOLD : 0);
    }
    if (g.rows.length > rows) {
      // Scroll position: a short bright run on the pane's right divider.
      const pct = top / Math.max(1, g.rows.length - rows);
      b.set(x + w, y + 1 + Math.round(pct * (rows - 1)), G.bar, P.mono ? undefined : focused ? hue : P.edge);
    }
  };

  const drawSearch = (b, P, x, y, w, h) => {
    const s = st.search;
    const iw = w - 1;
    const q = T(`/ ${s.query}`);
    b.text(x + 2, y + 1, truncate(q, iw - 4, G.ell), P.ink, undefined, ATTR.BOLD);
    if (Math.floor(now * 2) % 2 === 0) b.text(x + 2 + Math.min(stringWidth(q), iw - 4), y + 1, G.caret, P.accent);
    b.text(x + 2, y + 2, truncate(instrument([`${s.results.length} match${s.results.length === 1 ? '' : 'es'}`, st.kind ? `kind ${st.kind}` : null]).toLowerCase(), iw - 3, G.ell), P.dim);
    const rows = h - 5;
    if (s.sel < s.scroll) s.scroll = s.sel;
    if (s.sel >= s.scroll + rows) s.scroll = s.sel - rows + 1;
    for (let r = 0; r < rows; r++) {
      const f = s.results[s.scroll + r];
      if (!f) break;
      const yy = y + 3 + r, on = s.scroll + r === s.sel;
      const hue = P.hue(f.gallery);
      const S = selStyle(P, on, true, hue);
      const where = T(getGalleryTitle(f.gallery));
      const showWhere = iw > 35;
      const room = iw - 5 - (showWhere ? stringWidth(where) + 3 : 0);
      if (S) b.fill(x + 1, yy, iw, 1, ' ', S.fg, S.bg, S.attr);
      b.set(x + 2, yy, on ? G.sel : ' ', S ? S.mark : undefined, S?.bg, S?.attr);
      b.text(x + 4, yy, truncate(T(f.title), Math.max(1, room), G.ell), S ? S.fg : P.ink, S?.bg, S ? S.attr : 0);
      if (showWhere) {
        const wx = x + iw - stringWidth(where) - 1;
        b.set(wx - 2, yy, G.swatch, P.mono ? undefined : S && P.low ? S.fg : P.vivid(f.gallery), S?.bg, S?.attr ?? 0);
        b.text(wx, yy, where, S ? S.sub : P.dim, S?.bg, S ? S.attr & ~ATTR.BOLD : 0);
      }
    }
  };

  const lambdaRange = () => {
    const nm = st.model.map((g) => parseInt(lambdaLabel(g.id, true).replace(/^λ\s*/, ''), 10)).filter(Number.isFinite);
    return `λ ${Math.min(...nm)}–${Math.max(...nm)}`;
  };

  const getGalleryTitle = (id) => GALLERIES.find((g) => g.id === id)?.title || id;

  const previewTitle = (f) => (f ? T(f.title).toUpperCase() : 'PREVIEW');

  const drawPreviewPane = (b, P, L) => {
    const { x, w } = L.prev, y = L.body.y, h = L.body.h;
    const iw = w - 2; // last pane: borders on both sides
    const f = current();
    const infoH = f ? (h >= 24 ? 5 : h >= 16 ? 4 : 3) : 0;
    const ph = h - 2 - (infoH ? infoH + 1 : 0); // preview rows inside the frame
    const area = { w: iw, h: ph };
    area.view = b.view(x + 1, y + 1, area.w, area.h);
    if (area.w > 0 && area.h > 0) drawPreview(b, P, area);
    if (!f || !infoH) return;
    // A hairline divides the stage from the info strip: ├────┤
    const dy = y + 1 + ph;
    b.set(x, dy, G.lj, P.line);
    for (let xx = x + 1; xx < x + w - 1; xx++) b.set(xx, dy, G.h, P.line);
    b.set(x + w - 1, dy, G.rj, P.line);
    const s = ` ${G.dot} `;
    const iy = dy + 1;
    const hue = P.hue(f.gallery);
    const lam = lambdaLabel(f.gallery, U);
    let cx = b.text(x + 2, iy, lam, P.mono ? undefined : hue);
    const place = instrument([T(facetPlace(f, ' / ')), f.kind, `${f.size.w}×${f.size.h}`, `${f.glyphs} + ${f.color}`, f.animated ? null : 'still'], s);
    b.text(cx + 1, iy, truncate(T(place), Math.max(1, iw - 2 - stringWidth(lam)), G.ell), P.muted);
    const desc = wrap(T(f.description || ''), iw - 2).slice(0, infoH - 2);
    desc.forEach((line, i) => b.text(x + 2, iy + 1 + i, line, P.ink));
    const params = T(Object.entries(f.params || {}).map(([k, p]) => `--set ${k}=${p.default ?? ''}`).slice(0, 2).join(' '));
    const cmd = `$ prism-term play ${f.id}`;
    const ly = iy + infoH - 1;
    const end = b.text(x + 2, ly, truncate(cmd, iw - 2, G.ell), P.accent, undefined, ATTR.BOLD);
    b.set(x + 2, ly, '$', P.dim, undefined, 0);
    if (params && end + 2 + stringWidth(params) <= x + w - 2) b.text(end + 2, ly, params, P.dim);
  };

  const drawOnePane = (b, P, L) => {
    const body = { y: 1, h: L.H - 3 };
    const g = gal();
    const t = st.search ? { name: 'SEARCH', count: '' } : titleOf(g, L);
    drawFrame(b, P, G, U, body.y, body.h, [{ x: 0, w: L.W, title: truncate(t.name, Math.max(1, L.W - 6 - stringWidth(t.count)), G.ell) + t.count, focus: true, glint: st.search ? undefined : galleryHue(g.id) }], L.W);
    drawList(b, P, { ...L, body, kind: 'one' }, 0, L.W - 1);
    const f = current();
    if (f) {
      const y = L.H - 2;
      const lam = lambdaLabel(f.gallery, U);
      const x = b.text(1, y, lam, P.mono ? undefined : P.hue(f.gallery));
      b.text(x + 1, y, truncate(T(`${f.kind} ${G.dot} ${f.size.w}×${f.size.h} ${G.dot} prism-term play ${f.id}`), L.W - x - 2, G.ell), P.accent);
    }
  };

  const drawHelp = (b, P, L) => {
    const lines = [
      ['Move', `${G.up} ${G.down}  j k  PgUp PgDn  Home End`],
      ['Switch pane', L.kind === 'three' ? `${G.lr}  h l  ${G.tab}` : `${G.lr} h l (change gallery)`],
      ['Play fullscreen', `${G.enter}  (q returns here)`],
      ['Showcase gallery', 's  (auto-advances)'],
      ['Search everything', '/  then type, Esc to cancel'],
      ['Jump to gallery', 'g'],
      ['Filter by kind', `f next / F previous  (${KINDS.length} kinds)`],
      ['Theme / Day-Night', 't  /  d'],
      ['Canvas mode', 'm'],
      ['Quit', 'q'],
    ];
    const w = Math.min(L.W - 4, 64), h = Math.min(L.H - 2, lines.length + 4);
    const x = Math.floor((L.W - w) / 2), y = Math.floor((L.H - h) / 2);
    drawPanel(b, P, G, U, x, y, w, h, 'KEYS');
    lines.slice(0, h - 4).forEach(([k, v], i) => {
      b.text(x + 2, y + 2 + i, truncate(k, 18, G.ell), P.muted, P.panel);
      b.text(x + 21, y + 2 + i, truncate(v, w - 23, G.ell), P.ink, P.panel);
    });
    b.text(x + 2, y + h - 1, truncate(' any key to close ', w - 4, G.ell), P.dim, P.panel);
  };

  const drawPicker = (b, P, L) => {
    const w = Math.min(L.W - 4, 46), h = Math.min(L.H - 2, st.model.length + 2);
    const x = Math.floor((L.W - w) / 2), y = Math.floor((L.H - h) / 2);
    drawPanel(b, P, G, U, x, y, w, h, 'GO TO GALLERY');
    const rows = h - 2;
    const top = Math.max(0, Math.min(st.picker - Math.floor(rows / 2), st.model.length - rows));
    for (let r = 0; r < rows; r++) {
      const g = st.model[top + r];
      if (!g) break;
      const on = top + r === st.picker, yy = y + 1 + r;
      const hue = P.hue(g.id);
      const S = selStyle(P, on, true, hue);
      b.fill(x + 1, yy, w - 2, 1, ' ', S?.fg ?? P.ink, S?.bg ?? P.panel, S?.attr ?? 0);
      b.set(x + 2, yy, on ? G.sel : ' ', S ? S.mark : undefined, S?.bg ?? P.panel, S?.attr);
      b.set(x + 3, yy, G.swatch, P.mono ? undefined : S && P.low ? S.fg : P.vivid(g.id), S?.bg ?? P.panel, S?.attr ?? 0);
      const lam = U && w >= 40 ? ` ${lambdaLabel(g.id, U)}` : '';
      const c = String(g.facets.length);
      b.text(x + 5, yy, truncate(T(g.title), w - 9 - c.length - stringWidth(lam), G.ell), S ? S.fg : P.ink, S?.bg ?? P.panel, S?.attr ?? 0);
      const cx = x + w - 2 - c.length - stringWidth(lam);
      b.text(cx, yy, c, S ? S.sub : P.dim, S?.bg ?? P.panel, S?.attr);
      if (lam) b.text(cx + c.length, yy, lam, S ? (P.low ? S.sub : hue) : P.mono ? undefined : hue, S?.bg ?? P.panel, S ? S.attr & ~ATTR.BOLD : 0);
    }
  };

  const draw = () => {
    const b = screen.buffer;
    const L = layoutFor(screen.width, screen.height);
    const th = getTheme(st.themeId);
    const P = chrome(th, caps.depth);
    b.clear(th.bg, th.ink);
    if (L.kind === 'tiny') {
      b.text(0, 0, truncate(L.W >= 30 ? 'prism-term: terminal too small' : 'too small', L.W, G.ell), th.warn);
      b.text(0, 1, truncate('try: prism-term list', L.W, G.ell), th.muted);
      return;
    }
    drawHeader(b, P, L);
    if (L.kind === 'one') drawOnePane(b, P, L);
    else {
      const g = gal();
      const f = current();
      const lt = st.search ? { name: 'SEARCH', count: '' } : titleOf(g, L);
      const listFocus = st.focus === 'list' || L.kind !== 'three' || !!st.search;
      const lw = L.list.w;
      const panes = [];
      if (L.kind === 'three') panes.push({ x: L.gal.x, w: L.gal.w, title: U ? `${st.model.length} GALLERIES ${G.dot} ${lambdaRange()}` : `${st.model.length} GALLERIES`, focus: !listFocus, glint: galleryHue(g.id) });
      panes.push({ x: L.list.x, w: lw, title: truncate(lt.name, Math.max(1, lw - 6 - stringWidth(lt.count)), G.ell) + lt.count, focus: listFocus, glint: st.search ? undefined : galleryHue(g.id) });
      panes.push({ x: L.prev.x, w: L.prev.w, title: previewTitle(f), focus: false });
      drawFrame(b, P, G, U, L.body.y, L.body.h, panes, L.W);
      if (L.kind === 'three') drawGalleries(b, P, L);
      drawList(b, P, L);
      drawPreviewPane(b, P, L);
    }
    drawKeys(b, P, L);
    if (st.overlay === 'help') drawHelp(b, P, L);
    if (st.overlay === 'picker') drawPicker(b, P, L);
    if (relight) {
      const p = (now - relight.t0) / SWEEP_S;
      if (p >= 1) relight = null;
      else sweep(b, relight.old, p, P);
    }
    if (intro) {
      if (intro.t0 === null) intro.t0 = now;
      const p = (now - intro.t0) / intro.dur;
      if (p >= 1) intro = null;
      else firstLight(b, p, P, { echo: intro.echo, cy: Math.floor(L.H / 2) });
    }
  };

  // ── keys ────────────────────────────────────────────────────────────────

  const printable = (k) => {
    const s = k.sequence;
    return typeof s === 'string' && [...s].length === 1 && s >= ' ' && s !== '\x7f' && !k.ctrl && !k.meta ? s : null;
  };

  const onKeyBrowse = (k, finish) => {
    const n = k.name;
    if (intro) { intro = null; return; } // any key skips First Light (and only that)
    relight = null; // any input ends a relight sweep
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
    if (n === 't') { relightTheme(THEME_IDS[(THEME_IDS.indexOf(getTheme(st.themeId).id) + 1) % THEME_IDS.length]); return; }
    if (n === 'd') { relightTheme(dayNight(st.themeId)); return; }
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
      relight = null;
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

export { galleryHue };
