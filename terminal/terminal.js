// Prism terminal catalog — every terminal facet, live in the browser.
//
// Contract with the site build (website/build.mjs):
//   <meta name="prism-engine" content="../../prism-term/">   engine base; the build rewrites it to "./engine/"
//   <script type="application/json" id="prism-terminal-catalog">   the terminal catalog island; when it is
//       empty (local dev) the page fetches <engine>/catalog/terminal-catalog.json instead
// Facet modules are imported on demand from <engine>/<record.module minus "prism-term/">, the first time a
// tile scrolls near the viewport, and run by the engine's browser player (src/web/).

import { esc, notify, initChrome, engineUrl, mode, onMode, pageTheme, copyButton, curlHtml, shellToggle, applyShell } from './site.js';
import { TERMINAL as POSITIONS } from '../assets/rf/positions.mjs';

const root = document.documentElement;
const byId = (id) => document.getElementById(id);
const moduleUrl = (module) => engineUrl(String(module).replace(/^prism-term\//, ''));
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

const KIND_LABEL = { scene: 'Scenes', widget: 'Widgets', spinner: 'Spinners', progress: 'Progress', text: 'Text', chart: 'Charts', tui: 'TUI views', diagram: 'Diagrams', art: 'Art' };
const KIND_ONE = { scene: 'Scene', widget: 'Widget', spinner: 'Spinner', progress: 'Progress', text: 'Text', chart: 'Chart', tui: 'TUI view', diagram: 'Diagram', art: 'Art' };
const GLYPH_RANK = { ascii: 0, unicode: 1, braille: 2, sextant: 3 };
const COLOR_RANK = { mono: 0, 16: 1, 256: 2, truecolor: 3 };
const GLYPH_LABEL = { ascii: '7-bit ASCII', unicode: 'Unicode', braille: 'Braille', sextant: 'Sextants' };
const COLOR_LABEL = { mono: 'Mono', 16: '16 colors', 256: '256 colors', truecolor: 'Truecolor' };
const MODES = ['braille', 'sextant', 'quad', 'half', 'ascii'];
const DEPTHS = ['truecolor', '256', '16', 'mono'];
const SIZE_PRESETS = [[60, 20], [80, 24], [100, 30], [120, 36]];
const FEATURED = ['refraction', 'donut', 'cracktro', 'globe', 'ops-htop', 'charts-noc-wallboard', 'synthwave', 'fire'];
const TILE_FPS = 15;
const MAX_MOUNTED = 48;

initChrome();

// ── load the catalog and the engine ──────────────────────────────────────────

async function loadCatalog() {
  const text = byId('prism-terminal-catalog')?.textContent.trim();
  if (text) return JSON.parse(text);
  const res = await fetch(engineUrl('catalog/terminal-catalog.json'));
  if (!res.ok) throw new Error(`terminal-catalog.json: HTTP ${res.status}`);
  return res.json();
}

let catalog, web, palettes;
try {
  [catalog, web, palettes] = await Promise.all([loadCatalog(), import(engineUrl('src/web/index.js')), import(engineUrl('src/palettes.js'))]);
} catch (err) {
  console.error('[prism-terminal]', err);
  byId('result-status').textContent = 'The terminal catalog could not be loaded. Browse it from your terminal instead: curl -sL https://prism.jeremyfhall.com/tty';
  throw err;
}

const facets = catalog.facets;
const byIdMap = new Map(facets.map((f, i) => [f.id, Object.assign(f, { _i: i })]));
const galleries = catalog.galleries.filter((g) => g.count > 0);
const galleryById = new Map(galleries.map((g) => [g.id, g]));
const themes = palettes.listThemes();
const hex = (c) => '#' + (c & 0xffffff).toString(16).padStart(6, '0');
// Terminal screens follow the page: prism-dark at Night, prism-light by Day (when the engine has them).
let tileTheme = pageTheme(themes);
let defaultTheme = palettes.getTheme(tileTheme);
const paintTermBg = () => root.style.setProperty('--term-bg', hex(defaultTheme.bg));
paintTermBg();
// Same id → same hue as the web gallery it shares; terminal-only galleries take their proposed hue.
const hueId = (g) => POSITIONS[g]?.sameAs || g;
const lambdaOf = (g) => POSITIONS[g]?.lambda || '';
const ICONS = new Set(['fx', 'objects', 'sim', 'retro', 'text', 'loaders', 'progress', 'charts', 'ai', 'status', 'ops', 'diagrams', 'callouts', 'input', 'maps', 'lab', 'ascii']);
const iconOf = (g) => (ICONS.has(g) ? g : 'terminal');
const icon = (g, cls = '') => `<svg class="ic${cls}" aria-hidden="true"><use href="#i-${iconOf(g)}"/></svg>`;

const fmt = (n) => Number(n).toLocaleString('en-US');
document.querySelectorAll('[data-terminal-stat="facets"]').forEach((el) => { el.textContent = fmt(facets.length); });
document.querySelectorAll('[data-terminal-stat="galleries"]').forEach((el) => { el.textContent = fmt(galleries.length); });
byId('stat-themes').textContent = themes.length;
byId('catalog-json').href = engineUrl('catalog/terminal-catalog.json');

// Facet modules: one import per file (a file may export several facets).
const modules = new Map();
function loadFacet(rec) {
  let p = modules.get(rec.module);
  if (!p) { p = import(moduleUrl(rec.module)); modules.set(rec.module, p); }
  return p.then((mod) => {
    const exported = mod.default ?? mod.facets;
    const list = Array.isArray(exported) ? exported : exported ? [exported] : [];
    const raw = list.find((f) => f.id === rec.id) || (list.length === 1 ? list[0] : null);
    if (!raw || typeof raw.setup !== 'function') throw new Error(`${rec.module} does not export facet "${rec.id}"`);
    // Catalog metadata is already normalized (defaults filled); the module adds setup().
    return { ...raw, ...rec };
  });
}

// ── motion ───────────────────────────────────────────────────────────────────

let motionPaused = reducedMotion.matches;
function renderMotion() {
  root.dataset.motion = motionPaused ? 'paused' : 'playing';
  const button = byId('motion-toggle');
  button.innerHTML = motionPaused ? '<svg class="ic" aria-hidden="true"><use href="#i-play"/></svg><span>Resume motion</span>' : '<svg class="ic" aria-hidden="true"><use href="#i-pause"/></svg><span>Pause motion</span>';
  document.querySelectorAll('.live-dot').forEach((badge) => { badge.textContent = motionPaused ? 'PAUSED' : 'LIVE'; });
}
byId('motion-toggle').addEventListener('click', () => {
  motionPaused = !motionPaused;
  web.setGlobalMotion(motionPaused);
  renderMotion();
  if (detail.player) syncPlayButton();
});
renderMotion();

// ── filters + URL state ──────────────────────────────────────────────────────

const params = new URLSearchParams(location.search);
const state = {
  gallery: galleryById.has(params.get('g')) ? params.get('g') : '',
  category: params.get('c') || '',
  q: params.get('q') || '',
  kind: params.get('kind') || '',
  glyphs: params.get('glyphs') || '',
  color: params.get('color') || '',
};

function writeUrl() {
  const p = new URLSearchParams();
  if (state.gallery) p.set('g', state.gallery);
  if (state.category) p.set('c', state.category);
  if (state.q) p.set('q', state.q);
  for (const k of ['kind', 'glyphs', 'color']) if (state[k]) p.set(k, state[k]);
  const qs = p.toString();
  history.replaceState(history.state, '', `${location.pathname}${qs ? `?${qs}` : ''}${location.hash}`);
}

const kindSelect = byId('filter-kind');
const kindCounts = {};
for (const f of facets) kindCounts[f.kind] = (kindCounts[f.kind] || 0) + 1;
for (const k of Object.keys(KIND_LABEL)) if (kindCounts[k]) kindSelect.add(new Option(`${KIND_LABEL[k]} (${kindCounts[k]})`, k));
const search = byId('facet-search');
search.value = state.q;
kindSelect.value = state.kind;
byId('filter-glyphs').value = state.glyphs;
byId('filter-color').value = state.color;

function haystack(f) {
  return f._hay ||= [f.id, f.title, f.description, f.category, f.galleryTitle, f.kind, KIND_LABEL[f.kind], ...(f.tags || [])].join(' ').toLowerCase();
}

/** Relevance of `f` for the query tokens (0 = no match). */
function score(f, tokens) {
  let total = 0;
  const title = f.title.toLowerCase(), tags = f.tags || [];
  for (const t of tokens) {
    if (!haystack(f).includes(t)) return 0;
    total += title.startsWith(t) ? 9 : title.includes(t) ? 6 : tags.includes(t) ? 5 : f.id.includes(t) ? 4 : (f.category + f.galleryTitle).toLowerCase().includes(t) ? 3 : 1;
  }
  return total;
}

function filtered() {
  const tokens = state.q.toLowerCase().split(/\s+/).filter(Boolean);
  const gRank = state.glyphs ? GLYPH_RANK[state.glyphs] : 9, cRank = state.color ? COLOR_RANK[state.color] : 9;
  const out = [];
  for (const f of facets) {
    if (state.gallery && f.gallery !== state.gallery) continue;
    if (state.category && f.category !== state.category) continue;
    if (state.kind && f.kind !== state.kind) continue;
    if ((GLYPH_RANK[f.glyphs] ?? 1) > gRank || (COLOR_RANK[f.color] ?? 3) > cRank) continue;
    const s = tokens.length ? score(f, tokens) : 1;
    if (s) out.push([s, f]);
  }
  if (tokens.length) out.sort((a, b) => b[0] - a[0] || a[1]._i - b[1]._i);
  return out.map(([, f]) => f);
}

const isOverview = () => !state.gallery && !state.q && !state.kind && !state.glyphs && !state.color;

// ── sidebar + category chips ─────────────────────────────────────────────────

const galleryList = byId('gallery-list');
galleryList.innerHTML = [
  `<button type="button" class="t-gal is-all" data-g=""><i class="rf-index"></i>${icon('all')}<span class="t-gal-name">All facets</span><span class="t-gal-count">${fmt(facets.length)}</span></button>`,
  ...galleries.map((g) => `<button type="button" class="t-gal" data-g="${esc(g.id)}" data-rf-gallery="${esc(hueId(g.id))}" data-fl="index"><i class="rf-index"></i>${icon(g.id)}<span class="t-gal-name">${esc(g.title)}</span><span class="lambda">${esc(lambdaOf(g.id))}</span><span class="t-gal-count">${fmt(g.count)}</span></button>`),
].join('');
galleryList.addEventListener('click', (e) => {
  const b = e.target.closest('[data-g]');
  if (!b) return;
  state.gallery = b.dataset.g;
  state.category = '';
  update({ scroll: true });
});

const chips = byId('category-chips');
chips.addEventListener('click', (e) => {
  const b = e.target.closest('[data-c]');
  if (!b) return;
  state.category = state.category === b.dataset.c ? '' : b.dataset.c;
  update();
});

function renderNav() {
  for (const b of galleryList.children) b.setAttribute('aria-pressed', String(b.dataset.g === state.gallery));
  const g = galleryById.get(state.gallery);
  chips.hidden = !g;
  if (g) {
    chips.innerHTML = `<button type="button" class="chip" data-c="" aria-pressed="${!state.category}">All ${esc(g.title)} <small>${g.count}</small></button>`
      + g.categories.filter((c) => c.count).map((c) => `<button type="button" class="chip" data-c="${esc(c.name)}" aria-pressed="${state.category === c.name}">${esc(c.name)} <small>${c.count}</small></button>`).join('');
  }
}

for (const [id, key] of [['filter-kind', 'kind'], ['filter-glyphs', 'glyphs'], ['filter-color', 'color']]) {
  byId(id).addEventListener('change', (e) => { state[key] = e.target.value; update(); });
}
let searchTimer;
search.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { state.q = search.value.trim(); update(); }, 120);
});
byId('clear-filters').addEventListener('click', () => {
  Object.assign(state, { gallery: '', category: '', q: '', kind: '', glyphs: '', color: '' });
  search.value = ''; kindSelect.value = ''; byId('filter-glyphs').value = ''; byId('filter-color').value = '';
  update();
});
document.addEventListener('keydown', (e) => {
  if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || byId('detail').open) return;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable) return;
  e.preventDefault();
  search.focus();
});

// ── tiles ────────────────────────────────────────────────────────────────────

const grid = byId('facet-grid');
const tiles = new Map();   // id → <article>
const mounted = new Map(); // id → { player, seen }
const near = new Set();    // ids whose tile is near the viewport

function tileFor(f) {
  let el = tiles.get(f.id);
  if (el) return el;
  el = document.createElement('article');
  el.className = 't-tile';
  el.dataset.id = f.id;
  el.dataset.rfGallery = hueId(f.gallery);
  el.setAttribute('data-fl', 'tile');
  const reqs = [f.glyphs === 'ascii' ? '<span class="badge green" title="Runs on 7-bit ASCII terminals">ASCII</span>' : '', f.animated ? '' : '<span class="badge">still</span>'].join('');
  el.innerHTML = `<a class="t-tile-link" href="#${esc(f.id)}" aria-label="${esc(f.title)} — ${esc(f.galleryTitle)}, ${esc(f.category)}. ${esc(f.description)}">
    <div class="t-tile-top"><span>${esc(f.galleryTitle.toUpperCase())} · ${esc(f.category.toUpperCase())}</span><span class="badge">${esc(f.kind)}</span></div>
    <div class="t-tile-screen"><span class="ph" aria-hidden="true">${icon(f.gallery)}</span></div>
    <div class="t-tile-bottom"><h3>${esc(f.title)}</h3><span class="t-tile-badges">${reqs}<span class="badge">${f.size.w}×${f.size.h}</span></span></div>
    <p class="t-tile-desc">${esc(f.description)}</p></a>`;
  tiles.set(f.id, el);
  return el;
}

// Starting a facet runs its setup and a short warm-up; spread a screenful of
// starts over several frames instead of one long task.
const jobs = [];
let jobFrame = 0;
function schedule(job) {
  jobs.push(job);
  jobFrame ||= requestAnimationFrame(runJobs);
}
function runJobs() {
  jobFrame = 0;
  const start = performance.now();
  while (jobs.length && performance.now() - start < 8) jobs.shift()();
  if (jobs.length) jobFrame = requestAnimationFrame(runJobs);
}

function tileFit(screen) {
  return { width: Math.max(80, screen.clientWidth - 20), height: Math.max(40, screen.clientHeight - 18) };
}

function mountTile(id) {
  if (mounted.has(id)) { mounted.get(id).seen = performance.now(); return; }
  const rec = byIdMap.get(id), el = tiles.get(id);
  const screen = el.querySelector('.t-tile-screen');
  const entry = { player: null, seen: performance.now() };
  mounted.set(id, entry);
  loadFacet(rec).then((facet) => schedule(() => {
    if (mounted.get(id) !== entry) return; // unmounted while loading
    screen.querySelector('.ph')?.remove();
    entry.player = web.mountFacet(screen, facet, { fit: tileFit(screen), fps: TILE_FPS, theme: tileTheme, label: `${rec.title} — live terminal render` });
    entry.player.canvas.setAttribute('aria-hidden', 'true');
    if (detail.open) entry.player.pause();
  })).catch((err) => {
    console.error(`[prism-terminal] ${id}:`, err);
    const ph = screen.querySelector('.ph');
    if (ph) ph.textContent = 'could not load';
  });
  trimMounted();
}

function unmountTile(id) {
  const entry = mounted.get(id);
  if (!entry) return;
  mounted.delete(id);
  if (entry.player) {
    entry.player.destroy();
    entry.player.canvas.remove();
    const screen = tiles.get(id)?.querySelector('.t-tile-screen');
    if (screen && !screen.querySelector('.ph')) screen.insertAdjacentHTML('beforeend', `<span class="ph" aria-hidden="true">${icon(byIdMap.get(id).gallery)}</span>`);
  }
}

/** Keep memory flat on a 350-facet page: drop the least recently seen off-screen tiles. */
function trimMounted() {
  if (mounted.size <= MAX_MOUNTED) return;
  const far = [...mounted].filter(([id]) => !near.has(id)).sort((a, b) => a[1].seen - b[1].seen);
  for (const [id] of far.slice(0, mounted.size - MAX_MOUNTED)) unmountTile(id);
}

const tileObserver = new IntersectionObserver((entries) => {
  for (const e of entries) {
    const id = e.target.dataset.id;
    if (e.isIntersecting) { near.add(id); mountTile(id); }
    else { near.delete(id); const m = mounted.get(id); if (m) m.seen = performance.now(); }
  }
  trimMounted();
}, { rootMargin: '300px 0px' });

let gridCols = 0;
function columns() {
  return getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length || 1;
}

/** Round-robin across categories, so a gallery's highlights show its range. */
function highlights(list, n) {
  const byCat = new Map();
  for (const f of list) { if (!byCat.has(f.category)) byCat.set(f.category, []); byCat.get(f.category).push(f); }
  const lanes = [...byCat.values()], out = [];
  for (let i = 0; out.length < n && lanes.some((l) => l.length > i); i++) for (const l of lanes) if (l[i] && out.length < n) out.push(l[i]);
  return out;
}

let shown = [];
function renderGrid() {
  const list = filtered();
  const frag = document.createDocumentFragment();
  const heading = (cls, html, hue) => { const h = document.createElement('div'); h.className = cls; if (hue) h.dataset.rfGallery = hue; h.innerHTML = html; frag.append(h); };
  shown = [];
  gridCols = columns();
  if (isOverview()) {
    const per = Math.min(8, Math.max(4, gridCols * 2));
    for (const g of galleries) {
      const items = highlights(list.filter((f) => f.gallery === g.id), per);
      if (!items.length) continue;
      heading('t-group', `<span class="t-gal-icon" aria-hidden="true">${icon(g.id, ' s18 is-spectral')}</span><div><h3>${esc(g.title)}</h3><p>${esc(g.blurb)}</p></div><span class="lambda">${esc(lambdaOf(g.id))}</span><button type="button" class="ctl-btn" data-open-gallery="${esc(g.id)}">All ${fmt(g.count)} <svg class="ic" aria-hidden="true"><use href="#i-arrow-right"/></svg></button>`, hueId(g.id));
      for (const f of items) { frag.append(tileFor(f)); shown.push(f); }
    }
  } else if (state.gallery && !state.category && !state.q) {
    let cat = null;
    for (const f of list) {
      if (f.category !== cat) { cat = f.category; heading('t-cat-head', `<h3>${esc(cat)}</h3><span>${list.filter((x) => x.category === cat).length}</span>`); }
      frag.append(tileFor(f)); shown.push(f);
    }
  } else {
    for (const f of list) { frag.append(tileFor(f)); shown.push(f); }
  }
  tileObserver.disconnect();
  near.clear();
  grid.replaceChildren(frag);
  for (const f of shown) tileObserver.observe(tiles.get(f.id));
  for (const id of [...mounted.keys()]) if (!tiles.get(id).isConnected) unmountTile(id);

  const g = galleryById.get(state.gallery);
  const filters = state.q || state.kind || state.glyphs || state.color || state.category;
  let msg;
  if (isOverview()) msg = `${fmt(facets.length)} facets in ${galleries.length} galleries — highlights from each. Pick a gallery to see them all.`;
  else if (state.q) msg = `${fmt(list.length)} ${list.length === 1 ? 'facet matches' : 'facets match'} “${state.q}”${g ? ` in ${g.title}` : ''}`;
  else msg = `${fmt(list.length)} ${list.length === 1 ? 'facet' : 'facets'}${g ? ` in ${g.title}${state.category ? ` · ${state.category}` : ''}` : ''}${filters ? ' (filtered)' : ''}`;
  byId('result-status').textContent = msg;
  byId('empty-state').hidden = list.length > 0;
  byId('clear-filters').hidden = isOverview();
}
grid.addEventListener('click', (e) => {
  const b = e.target.closest('[data-open-gallery]');
  if (!b) return;
  state.gallery = b.dataset.openGallery;
  state.category = '';
  update({ scroll: true });
});

function update({ scroll = false } = {}) {
  writeUrl();
  renderNav();
  renderGrid();
  if (scroll) {
    const top = byId('catalog').getBoundingClientRect().top;
    if (top < 0 || top > innerHeight * 0.5) byId('catalog').scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth', block: 'start' });
  }
}

let resizeTimer;
new ResizeObserver(() => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (isOverview() && columns() !== gridCols) renderGrid();
    for (const [id, m] of mounted) if (m.player) m.player.set({ fit: tileFit(tiles.get(id).querySelector('.t-tile-screen')) });
  }, 150);
}).observe(grid);

// ── hero ─────────────────────────────────────────────────────────────────────

const featured = FEATURED.filter((id) => byIdMap.has(id));
for (const f of facets) if (featured.length < 5 && f.kind === 'scene' && f.animated && !featured.includes(f.id)) featured.push(f.id);
const heroScreen = byId('hero-screen'), heroDots = byId('hero-dots');
let hero = { i: 0, player: null, timer: 0, hold: false };
heroDots.innerHTML = featured.map((id, i) => `<button type="button" aria-label="Show ${esc(byIdMap.get(id).title)}" data-i="${i}"></button>`).join('');
heroDots.addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (b) showHero(Number(b.dataset.i), true); });

function heroFit() {
  return { width: Math.max(160, heroScreen.clientWidth - 36), height: Math.max(120, Math.min(440, innerHeight * 0.55)) };
}

async function showHero(i, user = false) {
  hero.i = (i + featured.length) % featured.length;
  const rec = byIdMap.get(featured[hero.i]);
  for (const b of heroDots.children) b.setAttribute('aria-current', String(Number(b.dataset.i) === hero.i));
  byId('hero-cmd').innerHTML = `$ prism-term play <b>${esc(rec.id)}</b><span class="caret" aria-hidden="true"></span>`;
  try {
    const facet = await loadFacet(rec);
    if (featured[hero.i] !== rec.id) return;
    hero.player?.destroy();
    heroScreen.replaceChildren();
    // On a phone the prism's instrument labels would be ~5px type: show the art alone.
    const params = rec.id === 'refraction' && heroScreen.clientWidth < 440 ? { labels: 'off' } : undefined;
    hero.player = web.mountFacet(heroScreen, facet, { fit: heroFit(), fps: 30, theme: tileTheme, params, label: `${rec.title} — live terminal render` });
    heroWindow.dataset.rfGallery = hueId(rec.gallery);
    if (detail.open) hero.player.pause();
  } catch (err) { console.error('[prism-terminal] hero:', err); }
  clearTimeout(hero.timer);
  if (!user) hero.timer = setTimeout(nextHero, 11000);
}
function nextHero() {
  if (hero.hold || motionPaused || detail.open || document.hidden) { hero.timer = setTimeout(nextHero, 3000); return; }
  showHero(hero.i + 1);
}
const heroWindow = document.querySelector('.hero-window');
heroWindow.addEventListener('pointerenter', () => { hero.hold = true; });
heroWindow.addEventListener('pointerleave', () => { hero.hold = false; });
heroWindow.addEventListener('focusin', () => { hero.hold = true; });
heroWindow.addEventListener('focusout', () => { hero.hold = false; });
new ResizeObserver(() => hero.player?.set({ fit: heroFit() })).observe(heroScreen);

// ── detail view ──────────────────────────────────────────────────────────────

const dialog = byId('detail');
const detail = { open: false, rec: null, player: null, opts: null, fromPage: false, perfTimer: 0, token: 0 };
new ResizeObserver(() => detail.player?.set({ fit: detailFit() })).observe(byId('d-screen'));

function defaults(rec) {
  const p = {};
  for (const [k, spec] of Object.entries(rec.params || {})) p[k] = spec.default;
  return p;
}

function shellArg(v) {
  const s = String(v);
  return /^[\w@%+=:,./-]+$/.test(s) ? s : `'${s.replace(/'/g, "'\\''")}'`;
}

/** The CLI flags that reproduce the detail view's current settings. */
function flags() {
  const { rec, opts } = detail, out = [];
  if (opts.theme) out.push('--theme', opts.theme);
  if (opts.mode) out.push('--mode', opts.mode);
  if (opts.palette) out.push('--palette', opts.palette);
  const d = defaults(rec);
  for (const [k, v] of Object.entries(opts.params)) if (String(v) !== String(d[k])) out.push('--set', shellArg(`${k}=${v}`));
  if (opts.cols !== rec.size.w || opts.rows !== rec.size.h) out.push('--size', `${opts.cols}x${opts.rows}`);
  if (opts.depth !== 'truecolor') out.push('--depth', opts.depth);
  if (opts.ascii) out.push('--ascii');
  if (opts.seed !== 7) out.push('--seed', String(opts.seed));
  return out.join(' ');
}

function playerOpts() {
  const { opts } = detail;
  const params = { ...opts.params };
  if (opts.palette) params.palette = opts.palette;
  return { cols: opts.cols, rows: opts.rows, theme: opts.theme || tileTheme, mode: opts.mode || null, params, depth: opts.depth, ascii: opts.ascii, seed: opts.seed, speed: opts.speed };
}

function detailFit() {
  const s = byId('d-screen');
  return { width: Math.max(160, s.clientWidth - 28), height: Math.max(120, s.clientHeight - 28) };
}

function seg(name, label, values, current, { disabled = false, fmtv = (v) => v, note = '' } = {}) {
  return `<div class="field full"><span>${label}${note ? ` <em class="field-note">${note}</em>` : ''}</span><div class="seg" role="group" aria-label="${esc(label)}" data-seg="${name}">${values.map((v) => `<button type="button" data-v="${esc(v)}" aria-pressed="${String(v) === String(current)}"${disabled ? ' disabled' : ''}>${esc(fmtv(v))}</button>`).join('')}</div></div>`;
}

function renderForm() {
  const { rec, opts } = detail;
  const themeOpts = ['<option value="">Page · ' + esc(defaultTheme.name) + '</option>',
    ...['dark', 'light'].map((m) => `<optgroup label="${m === 'dark' ? 'Dark' : 'Light'}">${themes.filter((t) => t.mode === m).map((t) => `<option value="${esc(t.id)}"${t.id === opts.theme ? ' selected' : ''}>${esc(t.name)}</option>`).join('')}</optgroup>`)].join('');
  const sizes = [[rec.size.w, rec.size.h, 'Native'], [rec.minSize.w, rec.minSize.h, 'Minimum'], ...SIZE_PRESETS.map(([w, h]) => [w, h, ''])];
  const seen = new Set();
  const sizeOpts = sizes.filter(([w, h]) => { const k = `${w}x${h}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .map(([w, h, l]) => `<option value="${w}x${h}"${w === opts.cols && h === opts.rows ? ' selected' : ''}>${w}×${h}${l ? ` · ${l}` : ''}</option>`).join('');
  let html = `<label class="field"><span>Prism theme</span><select class="select" data-opt="theme">${themeOpts}</select></label>`
    + `<label class="field"><span>Size in cells</span><select class="select" data-opt="size">${sizeOpts}</select></label>`;
  if (rec.palette) html += `<label class="field"><span>Palette</span><select class="select" data-opt="palette"><option value="">Default · ${esc(rec.palette)}</option>${palettes.PALETTE_NAMES.map((p) => `<option${p === opts.palette ? ' selected' : ''}>${esc(p)}</option>`).join('')}</select></label>`;
  html += `<div class="field"><span>Seed <output>${opts.seed}</output></span><button type="button" class="ctl-btn" data-reseed>⟳ New seed</button></div>`;
  html += seg('mode', 'Canvas mode', ['', ...MODES], opts.mode, { disabled: !rec.canvas, fmtv: (v) => v || 'auto', note: rec.canvas ? '' : '— draws cells directly' });
  html += seg('depth', 'Color depth', DEPTHS, opts.depth, { fmtv: (v) => (v === 'truecolor' ? 'truecolor' : v === 'mono' ? 'mono' : `${v} colors`) });
  html += seg('ascii', 'Glyphs', ['unicode', 'ascii'], opts.ascii ? 'ascii' : 'unicode', { fmtv: (v) => (v === 'ascii' ? '7-bit ASCII' : 'Unicode') });
  for (const [k, spec] of Object.entries(rec.params || {})) {
    const v = opts.params[k] ?? spec.default, label = esc(spec.label || k);
    if (Array.isArray(spec.options)) html += `<label class="field"><span>${label}</span><select class="select" data-param="${esc(k)}">${spec.options.map((o) => `<option${String(o) === String(v) ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select></label>`;
    else if (typeof spec.default === 'number') {
      const step = Number.isInteger(spec.default) && Number.isInteger(spec.min ?? 0) && Number.isInteger(spec.max ?? 0) ? 1 : 0.05;
      html += `<label class="field"><span>${label} <output>${v}</output></span><input type="range" data-param="${esc(k)}" min="${spec.min ?? 0}" max="${spec.max ?? Math.max(1, spec.default * 4)}" step="${step}" value="${v}"></label>`;
    } else html += `<label class="field full"><span>${label}</span><input class="text-input" type="text" data-param="${esc(k)}" value="${esc(v)}" maxlength="400" spellcheck="false"></label>`;
  }
  byId('d-form').innerHTML = html;
}

function renderUsage() {
  const { rec } = detail, f = flags(), u = rec.usage || {};
  const withFlags = (cmd) => (f ? `${cmd} ${f}` : cmd);
  const rows = [
    ['Play it', withFlags(u.cli || `prism-term play ${rec.id}`), ''],
    ['Without installing · Node 18+', withFlags(u.npx || ''), ''],
    ['Read it with curl', u.curl || '', 'shell'],
    ['In code', u.code || '', ''],
  ].filter(([, cmd]) => cmd);
  byId('d-usage').innerHTML = rows.map(([label, cmd, note]) => note === 'shell'
    ? `<div class="cmd"><div class="cmd-head"><span>${esc(label)}</span><span class="cmd-actions">${shellToggle}${copyButton(cmd, `Copy: ${label}`)}</span></div><pre><span class="c">$ </span>${curlHtml(cmd)}</pre><p class="cmd-note">Add <code>.txt</code> for 7-bit terminals.</p><p class="cmd-note" data-shell-note></p></div>`
    : `<div class="cmd"><div class="cmd-head"><span>${esc(label)}</span>${copyButton(cmd, `Copy: ${label}`)}</div><pre>${label === 'In code' ? '' : '<span class="c">$ </span>'}${esc(cmd)}</pre>${note ? `<p class="cmd-note">${note}</p>` : ''}</div>`).join('');
  applyShell(byId('d-usage'));
  byId('d-cmd').innerHTML = `$ prism-term play <b>${esc(rec.id)}</b>${f ? ` ${esc(f)}` : ''}`;
  byId('d-cmd').title = `prism-term play ${rec.id}${f ? ` ${f}` : ''}`;
}

function syncPlayButton() {
  const p = detail.player, b = byId('d-play');
  const playing = !!p && p.playing && !motionPaused && !p.still;
  b.innerHTML = playing ? '<svg class="ic" aria-hidden="true"><use href="#i-pause"/></svg><span>Pause</span>' : '<svg class="ic" aria-hidden="true"><use href="#i-play"/></svg><span>Play</span>';
  b.disabled = !p || !p.animated;
  byId('d-live').textContent = !p?.animated ? 'STILL' : playing ? 'LIVE' : 'PAUSED';
}

function applyPlayer(rebuildForm = false) {
  if (detail.player) detail.player.set(playerOpts());
  if (rebuildForm) renderForm();
  renderUsage();
  // Letterbox in the color the emulated terminal gives the facet's background.
  const theme = palettes.getTheme(detail.opts.theme || tileTheme), q = detail.player?.tc.quant;
  const bg = q ? q(theme.bg) : theme.bg;
  byId('d-screen').style.background = hex(bg < 0 ? theme.bg : bg);
}

async function openDetail(id) {
  const rec = byIdMap.get(id);
  if (!rec) return;
  const token = ++detail.token;
  detail.rec = rec;
  detail.opts = { theme: '', mode: '', palette: '', params: defaults(rec), cols: rec.size.w, rows: rec.size.h, depth: 'truecolor', ascii: false, seed: 7, speed: 1 };
  const g = galleryById.get(rec.gallery);
  byId('d-crumb').innerHTML = `<a href="?g=${esc(rec.gallery)}" data-crumb-gallery="${esc(rec.gallery)}">${esc(g?.title || rec.galleryTitle)}</a> / ${esc(rec.category)} / <span>${esc(rec.id)}</span>`;
  byId('d-eyebrow').innerHTML = `${esc(rec.galleryTitle.toUpperCase())}<span class="rf-sep">·</span>${esc(rec.category.toUpperCase())}<span class="rf-sep">·</span><span class="rf-lambda">${esc(lambdaOf(rec.gallery))}</span>`;
  dialog.dataset.rfGallery = hueId(rec.gallery);
  byId('d-title').textContent = rec.title;
  // CLI hints in descriptions ("--set style=solid") stay on one line.
  byId('d-desc').innerHTML = esc(rec.description).replace(/--set\s+[\w.-]+=[\w.-]+|--[a-z][\w-]*/g, (m) => `<code>${m}</code>`);
  byId('d-tags').innerHTML = (rec.tags || []).map((t) => `<button type="button" class="chip" data-tag="${esc(t)}">#${esc(t)}</button>`).join('');
  const meta = [
    ['Kind', KIND_ONE[rec.kind] || rec.kind],
    ['Size', `${rec.size.w}×${rec.size.h}`],
    ['Min size', `${rec.minSize.w}×${rec.minSize.h}`],
    ['Loop', rec.animated ? `${rec.loop} s` : 'still'],
    ['Glyphs', GLYPH_LABEL[rec.glyphs] || rec.glyphs],
    ['Color', COLOR_LABEL[rec.color] || rec.color],
    ['Canvas', rec.canvas || 'cells'],
    ['Since', rec.since || '—'],
    ['Module', rec.module.replace(/^prism-term\/src\/facets\//, '')],
  ];
  if (rec.credits) meta.push(['Credits', rec.credits]);
  byId('d-meta').innerHTML = meta.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd title="${esc(v)}">${esc(v)}</dd></div>`).join('');
  const i = shown.indexOf(rec);
  const order = i >= 0 ? shown : facets;
  const at = order.indexOf(rec);
  detail.prev = order[(at - 1 + order.length) % order.length];
  detail.next = order[(at + 1) % order.length];
  byId('d-prev').setAttribute('aria-label', `Previous: ${detail.prev.title}`);
  byId('d-next').setAttribute('aria-label', `Next: ${detail.next.title}`);
  for (const b of byId('d-speed').children) b.setAttribute('aria-pressed', String(b.dataset.v === '1'));
  const src = byId('d-source');
  src.open = false;
  byId('d-source-code').textContent = 'Loading…';
  byId('d-source-meta').textContent = rec.module.replace(/^prism-term\//, '');
  renderForm();
  renderUsage();
  byId('d-screen').style.background = hex(defaultTheme.bg);

  if (!dialog.open) {
    dialog.showModal();
    detail.open = true;
    pauseBackground(true);
  }
  detail.player?.destroy();
  detail.player = null;
  byId('d-screen').replaceChildren();
  syncPlayButton();
  try {
    const facet = await loadFacet(rec);
    if (token !== detail.token || !detail.open) return;
    detail.player = web.mountFacet(byId('d-screen'), facet, { ...playerOpts(), fit: detailFit(), fps: 30, autoPause: false, label: `${rec.title} — live terminal render, ${rec.size.w}×${rec.size.h} cells` });
    syncPlayButton();
  } catch (err) {
    console.error(`[prism-terminal] ${id}:`, err);
    byId('d-screen').innerHTML = `<p class="ph">This facet could not be loaded.</p>`;
  }
  clearInterval(detail.perfTimer);
  let lastFrames = 0, lastT = performance.now();
  detail.perfTimer = setInterval(() => {
    const p = detail.player;
    if (!p) return;
    const now = performance.now(), frames = p.stats.frames;
    const fps = ((frames - lastFrames) * 1000) / (now - lastT);
    lastFrames = frames; lastT = now;
    byId('d-perf').textContent = `${p.buffer.width}×${p.buffer.height} · ${p.tc.depth} · ${fps > 0.5 ? `${fps.toFixed(0)} fps · ${p.avgFrameMs.toFixed(2)} ms/frame` : 'idle'}`;
  }, 1000);
}

function pauseBackground(paused) {
  for (const m of mounted.values()) if (m.player) (paused ? m.player.pause() : m.player.play());
  if (hero.player) (paused ? hero.player.pause() : hero.player.play());
}

function closeDetail() {
  if (dialog.open) dialog.close();
}

dialog.addEventListener('close', () => {
  detail.open = false;
  detail.token++;
  clearInterval(detail.perfTimer);
  detail.player?.destroy();
  detail.player = null;
  byId('d-screen').replaceChildren();
  pauseBackground(false);
  if (byIdMap.has(decodeURIComponent(location.hash.slice(1)))) {
    if (detail.fromPage) history.back();
    else history.replaceState(history.state, '', `${location.pathname}${location.search}`);
  }
  detail.fromPage = false;
});
dialog.addEventListener('click', (e) => { if (e.target === dialog) closeDetail(); });
byId('d-close').addEventListener('click', closeDetail);
const step = (dir) => {
  const next = dir < 0 ? detail.prev : detail.next;
  history.replaceState(history.state, '', `#${next.id}`);
  openDetail(next.id);
};
byId('d-prev').addEventListener('click', () => step(-1));
byId('d-next').addEventListener('click', () => step(1));
dialog.addEventListener('keydown', (e) => {
  const t = e.target;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
  if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
  else if (e.key === ' ' && (t === dialog || t.closest('.d-stage') && t.tagName !== 'BUTTON')) { e.preventDefault(); byId('d-play').click(); }
});

byId('d-play').addEventListener('click', () => {
  const p = detail.player;
  if (!p) return;
  if (motionPaused) { motionPaused = false; web.setGlobalMotion(false); renderMotion(); p.play(); }
  else p.toggle();
  syncPlayButton();
});
byId('d-restart').addEventListener('click', () => { detail.player?.restart(); syncPlayButton(); });
byId('d-speed').addEventListener('click', (e) => {
  const b = e.target.closest('[data-v]');
  if (!b) return;
  detail.opts.speed = Number(b.dataset.v);
  for (const x of byId('d-speed').children) x.setAttribute('aria-pressed', String(x === b));
  detail.player?.set({ speed: detail.opts.speed });
});

const form = byId('d-form');
form.addEventListener('change', (e) => {
  const t = e.target, o = detail.opts;
  if (t.dataset.opt === 'theme') o.theme = t.value;
  else if (t.dataset.opt === 'palette') o.palette = t.value;
  else if (t.dataset.opt === 'size') { const [w, h] = t.value.split('x').map(Number); o.cols = w; o.rows = h; }
  else if (t.dataset.param && t.type !== 'range' && t.type !== 'text') o.params[t.dataset.param] = t.value;
  else return;
  applyPlayer();
});
let paramTimer;
form.addEventListener('input', (e) => {
  const t = e.target;
  if (!t.dataset.param || (t.type !== 'range' && t.type !== 'text')) return;
  const v = t.type === 'range' ? Number(t.value) : t.value;
  if (t.type === 'range') t.previousElementSibling.querySelector('output').textContent = v;
  detail.opts.params[t.dataset.param] = v;
  clearTimeout(paramTimer);
  paramTimer = setTimeout(() => applyPlayer(), t.type === 'range' ? 60 : 300);
});
form.addEventListener('click', (e) => {
  if (e.target.closest('[data-reseed]')) {
    detail.opts.seed = 1 + Math.floor(Math.random() * 9999);
    form.querySelector('[data-reseed]').previousElementSibling.querySelector('output').textContent = detail.opts.seed;
    applyPlayer();
    return;
  }
  const b = e.target.closest('[data-seg] [data-v]');
  if (!b || b.disabled) return;
  const name = b.parentElement.dataset.seg, v = b.dataset.v;
  if (name === 'mode') detail.opts.mode = v;
  else if (name === 'depth') detail.opts.depth = v;
  else if (name === 'ascii') detail.opts.ascii = v === 'ascii';
  for (const x of b.parentElement.children) x.setAttribute('aria-pressed', String(x === b));
  applyPlayer();
});

byId('d-tags').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tag]');
  if (!b) return;
  Object.assign(state, { gallery: '', category: '', q: b.dataset.tag });
  search.value = state.q;
  closeDetail();
  update({ scroll: true });
});
byId('d-crumb').addEventListener('click', (e) => {
  const a = e.target.closest('[data-crumb-gallery]');
  if (!a) return;
  e.preventDefault();
  Object.assign(state, { gallery: a.dataset.crumbGallery, category: '', q: '' });
  search.value = '';
  closeDetail();
  update({ scroll: true });
});

function download(name, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
document.querySelector('.d-downloads').addEventListener('click', (e) => {
  const b = e.target.closest('[data-dl]');
  const p = detail.player;
  if (!b || !p) return;
  const id = detail.rec.id, snap = p.snapshot();
  if (b.dataset.dl === 'ans') download(`${id}.ans`, new Blob([snap.toAnsi(detail.opts.depth) + '\n'], { type: 'text/plain;charset=utf-8' }));
  else if (b.dataset.dl === 'txt') download(`${id}.txt`, new Blob([snap.toString() + '\n'], { type: 'text/plain;charset=utf-8' }));
  else p.canvas.toBlob((blob) => blob && download(`${id}.png`, blob), 'image/png');
  notify(`Saved ${id}.${b.dataset.dl}`);
});

byId('d-source').addEventListener('toggle', async (e) => {
  if (!e.target.open) return;
  const rec = detail.rec, code = byId('d-source-code');
  if (code.dataset.for === rec.id) return;
  code.dataset.for = rec.id;
  try {
    const text = rec.source || await fetch(moduleUrl(rec.module)).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text(); });
    if (detail.rec === rec) code.textContent = text;
  } catch (err) { code.textContent = `Could not load ${rec.module}: ${err.message}`; }
});

// ── routing: #<facet-id> opens the detail view ───────────────────────────────

function route() {
  const id = decodeURIComponent(location.hash.slice(1));
  if (byIdMap.has(id)) {
    if (!dialog.open) detail.fromPage = routedOnce;
    if (detail.rec?.id !== id || !dialog.open) openDetail(id);
  } else {
    if (dialog.open) { detail.fromPage = false; closeDetail(); }
    if (routedOnce) writeUrl(); // history.back() from a facet may restore an older query string
  }
  routedOnce = true;
}
let routedOnce = false;
addEventListener('hashchange', route);

update();
showHero(0);
route();
// First Light: the first tiles on screen join the load sequence.
window.PrismSite?.tilesReady?.([...grid.querySelectorAll('.t-tile')].slice(0, 12));

// Night ↔ Day: every live terminal re-themes to the matching Prism palette.
onMode(() => {
  tileTheme = pageTheme(themes);
  defaultTheme = palettes.getTheme(tileTheme);
  paintTermBg();
  for (const m of mounted.values()) m.player?.set({ theme: tileTheme });
  hero.player?.set({ theme: tileTheme });
  if (detail.player && !detail.opts.theme) applyPlayer(true);
});

// Exposed for performance checks: prismTerminal.stats()
globalThis.prismTerminal = {
  stats: () => ({ ...web.playerStats(), mounted: mounted.size, tiles: shown.length }),
  slowest: (n = 8) => [...mounted].filter(([, m]) => m.player).map(([id, m]) => [id, +m.player.avgFrameMs.toFixed(2)]).sort((a, b) => b[1] - a[1]).slice(0, n),
};
