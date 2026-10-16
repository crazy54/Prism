// Prism for Stream Deck — every deck facet, live in the browser.
//
// Contract with website/build.mjs (the same as /terminal/):
//   <meta name="prism-engine" content="../../prism-deck/">   engine base; the build rewrites it to "./engine/"
//   <script type="application/json" id="prism-deck-catalog"> the lean deck catalog; when it's empty (in the
//       repository) the adapter imports <engine>/catalog/deck-catalog.json instead
// Rendering is prism-deck's own browser runtime (src/web): the same frames the plugin sends to hardware.
import { loadDeck } from '../assets/deck/adapter.js';
import { hueColors, lambdaFor } from '../assets/deck/hue.js';

const root = document.documentElement;
const byId = (id) => document.getElementById(id);
const site = window.PrismSite;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmt = (n) => Number(n).toLocaleString('en-US');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const mode = () => (site?.mode() === 'day' ? 'day' : 'night');
const ICON = { layers: 'layers', grid: 'grid', pulse: 'loaders', waveform: 'lab', sliders: 'settings', monitor: 'desktop', cpu: 'progress' };
const SURFACE = { key: 'Keys', span: 'Spans', strip: 'Strips', screen: 'Screens', deck: 'Whole deck' };
const FAMILY = ['galleon', 'plus', 'mk2', 'xl', 'plusxl', 'neo', 'mini', 'studio'];
const SHORT = { galleon: 'Galleon 100 SD', plus: 'Stream Deck +', plusxl: '+ XL', mk2: 'MK.2', xl: 'XL', neo: 'Neo', mini: 'Mini', studio: 'Studio' };
const shortName = (id) => SHORT[id] || deck.devices[id]?.name || id;
const NOTES = { galleon: '12 keys · 2 dials · dashboard screen', plus: '8 keys · 4 dials · touch strip', mk2: '15 keys', xl: '32 keys', plusxl: '36 keys · 6 dials · touch strip', neo: '8 keys · info bar', mini: '6 keys', studio: '32 keys · 2 dials' };

// ── load ─────────────────────────────────────────────────────────────────────
const engine = document.querySelector('meta[name="prism-engine"]')?.content || './engine/';
const islandText = byId('prism-deck-catalog')?.textContent.trim();
const deck = await loadDeck({ engine, catalog: islandText ? JSON.parse(islandText) : null });
const engineAt = (rel) => new URL(rel, new URL(engine, location.href)).href;
// λ labels come from design/tokens.json positions (assets/deck/hue.js), like every other page.
let layoutOf = null;
const lambdaOf = lambdaFor;
if (deck.source === 'prism-deck') {
  try {
    const dv = await import(engineAt('src/devices.js'));
    layoutOf = (id) => dv.deviceLayout(id);
  } catch { /* fall back to the site's approximations */ }
}
if (!layoutOf) { const dv = await import('../assets/deck/devices.js'); layoutOf = (id) => dv.deviceLayout(id); }

const facets = deck.facets.map((f, i) => ({ ...f, _i: i, surface: f.surface || 'key' }));
const recById = new Map(facets.map((f) => [f.id, f]));
const has = (id) => recById.has(id) && !!deck.findFacet(id);
const galleries = deck.galleries.filter((g) => facets.some((f) => f.gallery === g.id));
const galleryById = new Map(galleries.map((g) => [g.id, g]));

// stats the build fills from the catalog (data-deck-stat) — and when the page runs from the repo, here
document.querySelectorAll('[data-deck-stat="facets"]').forEach((el) => { el.textContent = fmt(facets.length); });
document.querySelectorAll('[data-deck-stat="galleries"]').forEach((el) => { el.textContent = fmt(galleries.length); });
// Devices: every model prism-deck knows (the same count as Prism.html's Stream Deck page); the
// wall below plays the main families live.
const deviceCount = Object.keys(deck.devices).length;
byId('stat-devices').textContent = fmt(deviceCount);
byId('device-count').textContent = fmt(deviceCount);
byId('stat-themes').textContent = fmt(deck.themes.length || 1);
byId('gallery-total').textContent = galleries.length;

// ── one key theme and one device for the whole page, remembered on this browser ──────────
// localStorage 'prism-deck-theme' (a deck theme id) and 'prism-deck-device' (a model id, or 'pair').
const THEME_KEY = 'prism-deck-theme', DEVICE_KEY = 'prism-deck-device';
const recall = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const remember = (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage is optional */ } };
const themeList = (deck.themes.length ? deck.themes : [{ id: 'prism', title: 'Prism' }]).slice().sort((a, b) => (a.id === 'prism' ? -1 : b.id === 'prism' ? 1 : a.title.localeCompare(b.title)));
const themeIds = new Set(themeList.map((t) => t.id));
let keyTheme = themeIds.has(recall(THEME_KEY)) ? recall(THEME_KEY) : 'prism';
let swatchOf = () => null;
if (deck.source === 'prism-deck' && themeList.length > 1) {
  try {
    const reg = await import(engineAt('src/themes/_registry.js'));
    swatchOf = (id) => { try { const c = reg.useTheme(id, mode() === 'day' ? 'light' : 'dark').colors; return c && { bg: c.bg, accent: c.accent }; } catch { return null; } };
  } catch { /* no swatches */ }
}

// gallery hues → --rf-hue / --rf-hue-v / --rf-hue-rgb on any element
function paintHue(el, h) {
  const c = hueColors(h, mode());
  el.style.setProperty('--rf-hue', c.ink); el.style.setProperty('--rf-hue-v', c.vivid); el.style.setProperty('--rf-hue-rgb', c.rgb);
}
const repaint = () => document.querySelectorAll('[data-hue]').forEach((el) => paintHue(el, Number(el.dataset.hue)));

// ── device layouts (what each model plays in the hero, the wall and the detail view) ─────
const KEYS = ['icon-mic', 'icon-volume', 'icon-play-pause', 'icon-broadcast', 'icon-cpu', 'icon-clock', 'icon-bulb', 'icon-power', 'idle-heartbeat', 'app-cpu-ring', 'app-focus-timer', 'press-ripple'];
const pick = (n) => { const ids = KEYS.filter(has); return Array.from({ length: n }, (_, i) => ids[i % ids.length]).filter(Boolean); };
// Quiet keys for whatever a span or a game leaves uncovered (no dead black keys): slow idle loops, one glyph each.
const AMBIENT = [['idle-breathe', { glyph: 'power', label: 'Standby' }], ['idle-shimmer', { glyph: 'play-pause', label: 'Ready' }], ['idle-breathe', { glyph: 'mic', label: 'Mic' }], ['idle-shimmer', { glyph: 'clock', label: 'Clock' }], ['idle-breathe', { glyph: 'bulb', label: 'Light' }], ['idle-shimmer', { glyph: 'home', label: 'Home' }]];
const ambient = (n) => { const ok = AMBIENT.filter(([id]) => has(id)); return ok.length ? Array.from({ length: n }, (_, i) => ({ facet: ok[i % ok.length][0], params: ok[i % ok.length][1] })) : pick(n); };
const dialsOf = (m) => { const d = deck.devices[m]; return typeof d?.dials === 'number' ? d.dials : d?.dials?.count || 0; };
function layoutFor(model, focus) {
  const L = {
    galleon: { keys: pick(12), screen: has('screen-galleon-dashboard') ? 'screen-galleon-dashboard' : null },
    plus: { keys: pick(8), strip: has('strip-refraction') ? 'strip-refraction' : null },
    mk2: { keys: pick(15) },
    xl: has('span-first-light') ? { facet: 'span-first-light', keys: pick(32) } : { keys: pick(32) },
    // the waveform runs along the top row; the other 27 keys carry a working deck (the player skips covered keys)
    plusxl: has('span-waveform') ? { facet: 'span-waveform', keys: pick(36), strip: has('strip-refraction') ? 'strip-refraction' : null } : { keys: pick(36) },
    neo: { keys: pick(8), screen: has('screen-neo-clock') ? 'screen-neo-clock' : null },
    mini: { keys: pick(6) },
    studio: has('theme-prism') ? { facet: 'theme-prism' } : { keys: pick(32) },
  }[model] || { keys: pick(15) };
  if (!focus) return (['xl', 'plusxl', 'studio'].includes(model) ? null : deck.showcase?.(model)) || L;
  // detail view: put the focused facet where it belongs on this model
  const f = recById.get(focus), d = deck.devices[model], n = (d?.cols || 5) * (d?.rows || 3);
  const keys = L.keys?.length === n ? [...L.keys] : pick(n);
  // a game's Galleon screen is its scoreboard (screen-galleon-game), never the dashboard
  if (f.game && L.screen) L.screen = has('screen-galleon-game') ? 'screen-galleon-game' : null;
  if (f.surface === 'key') return { ...L, facet: null, keys: [focus, ...keys.slice(1)] };
  // a span (a 3 × 3 game, a one-row waveform) covers part of the grid: quiet ambient keys fill the rest
  if (f.surface === 'span') return { facet: focus, keys: ambient(n), strip: L.strip, screen: L.screen };
  if (f.surface === 'deck') return { facet: focus };
  if (f.surface === 'strip') return f.segments === 1 ? { keys, dials: Array(6).fill(focus), screen: L.screen } : { keys, strip: focus, screen: L.screen };
  if (f.surface === 'screen') return { keys, screen: focus };
  return L;
}
function fitWidth(model, box, maxW, maxH) {
  const L = layoutOf(model);
  return Math.max(120, Math.floor(Math.min(maxW, maxH * (L.w / L.h))));
}

// ── motion ───────────────────────────────────────────────────────────────────
let paused = reducedMotion.matches;
function renderMotion() {
  root.dataset.motion = paused ? 'paused' : 'playing';
  const b = byId('motion-toggle');
  b.innerHTML = paused ? '<svg class="ic" aria-hidden="true"><use href="#i-play"/></svg><span>Resume motion</span>' : '<svg class="ic" aria-hidden="true"><use href="#i-pause"/></svg><span>Pause motion</span>';
}
byId('motion-toggle').addEventListener('click', () => { paused = !paused; deck.setGlobalMotion(paused); renderMotion(); });
renderMotion();

// ── hero: the Galleon 100 SD and the Stream Deck + side by side, or any one model ──────────
const heroBox = byId('hero-device');
const heroModels = byId('hero-models');
const heroOrder = ['galleon', 'plus', 'mk2', 'xl', 'plusxl', 'neo', 'mini'].filter((id) => deck.devices[id]);
const PAIR = ['galleon', 'plus'].filter((id) => deck.devices[id]);
const heroKeys = (PAIR.length === 2 ? ['pair'] : []).concat(heroOrder);
const hero = { key: heroKeys.includes(recall(DEVICE_KEY)) ? recall(DEVICE_KEY) : PAIR.length === 2 ? 'pair' : heroOrder[0], views: [] };
heroModels.innerHTML = (PAIR.length === 2 ? [['pair', 'Galleon + Stream Deck +']] : []).concat(heroOrder.map((id) => [id, shortName(id)]))
  .map(([k, label]) => `<button type="button" data-model="${k}" aria-pressed="${k === hero.key}">${esc(label)}</button>`).join('');
heroModels.addEventListener('click', (e) => { const b = e.target.closest('[data-model]'); if (!b) return; remember(DEVICE_KEY, b.dataset.model); showHero(b.dataset.model); });
function showHero(key) {
  hero.key = key;
  const models = key === 'pair' ? PAIR : [key];
  for (const b of heroModels.children) b.setAttribute('aria-pressed', String(b.dataset.model === key));
  byId('hero-model').textContent = models.length > 1 ? models.map(shortName).join(' · ') : deck.devices[key]?.name || key;
  byId('hero-meta').textContent = models.length > 1 ? 'the default pair' : NOTES[key] || '';
  // only models with dials get "turn the dials" (the Neo, MK.2, XL and Mini have none)
  const hint = document.querySelector('.d-stage-hint');
  if (hint) hint.textContent = models.some((m) => dialsOf(m) > 0) ? 'Press the keys · turn the dials' : 'Press the keys';
  for (const v of hero.views) deck.unmount(v);
  heroBox.replaceChildren();
  const gap = 28, H = heroBox.clientHeight - 8;
  // share the width by aspect so both stand the same height
  const ratios = models.map((m) => { const L = layoutOf(m); return L.w / L.h; });
  const h = Math.min(H, (heroBox.clientWidth - 8 - gap * (models.length - 1)) / ratios.reduce((a, r) => a + r, 0));
  // the pair shares one link bus: mute the + and the Galleon's screen turns red too
  const bus = models.length > 1 ? deck.linkBus?.() : null;
  hero.views = models.map((model, i) => {
    const slot = document.createElement('div');
    slot.className = 'd-stage-slot';
    heroBox.append(slot);
    return deck.mountDevice(slot, { model, width: Math.max(140, Math.floor(h * ratios[i])), interactive: true, theme: keyTheme, ...(bus ? { bus } : {}), label: `${deck.devices[model]?.name || model}, virtual`, ...layoutFor(model) });
  });
}
showHero(hero.key);
let heroResize, heroSize = `${heroBox.clientWidth}x${heroBox.clientHeight}`;
new ResizeObserver(() => {
  const size = `${heroBox.clientWidth}x${heroBox.clientHeight}`;
  if (size === heroSize) return;
  heroSize = size; clearTimeout(heroResize); heroResize = setTimeout(() => showHero(hero.key), 160);
}).observe(heroBox);

// ── catalog ─────────────────────────────────────────────────────────────────
const params = new URLSearchParams(location.search);
const state = { gallery: galleryById.has(params.get('g')) ? params.get('g') : '', surface: SURFACE[params.get('s')] ? params.get('s') : '', q: params.get('q') || '' };
const list = byId('gallery-list');
list.innerHTML = [`<button type="button" class="d-gal is-all" data-g=""><i class="rf-index"></i><svg class="ic" aria-hidden="true"><use href="#i-deck"/></svg><span class="d-gal-name">All facets</span><span class="d-gal-count">${facets.length}</span></button>`,
  ...galleries.map((g) => `<button type="button" class="d-gal" data-g="${esc(g.id)}" data-hue="${g.hue}"><i class="rf-index"></i><svg class="ic" aria-hidden="true"><use href="#i-${ICON[g.icon] || 'grid'}"/></svg><span class="d-gal-name">${esc(g.title)}</span><span class="lambda">${esc(lambdaOf(g.hue))}</span><span class="d-gal-count">${g.count ?? facets.filter((f) => f.gallery === g.id).length}</span></button>`)].join('');
list.addEventListener('click', (e) => { const b = e.target.closest('[data-g]'); if (!b) return; state.gallery = b.dataset.g; update(true); });
const surfaces = Object.keys(SURFACE).filter((s) => facets.some((f) => f.surface === s));
const surfaceSeg = byId('surface-filter');
surfaceSeg.innerHTML = `<button type="button" data-s="">All</button>` + surfaces.map((s) => `<button type="button" data-s="${s}">${SURFACE[s]} <small>${facets.filter((f) => f.surface === s).length}</small></button>`).join('');
surfaceSeg.addEventListener('click', (e) => { const b = e.target.closest('[data-s]'); if (!b) return; state.surface = b.dataset.s; update(); });
const search = byId('facet-search');
search.value = state.q;
let searchTimer;
search.addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { state.q = search.value.trim(); update(); }, 120); });
document.addEventListener('keydown', (e) => {
  if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || byId('detail').open || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName)) return;
  e.preventDefault(); search.focus();
});
byId('clear-filters').addEventListener('click', () => { Object.assign(state, { gallery: '', surface: '', q: '' }); search.value = ''; update(); });

// Everyday streaming words find the streaming keys (scenes, countdowns, on-air, chat-style tickers).
// Prism doesn't connect to any streaming app or service, and the status line says so.
const STREAM_WORDS = new Set(['obs', 'twitch', 'youtube', 'kick', 'streamlabs', 'streamer', 'streamers', 'streaming']);
const streamQuery = () => state.q.toLowerCase().split(/\s+/).some((t) => STREAM_WORDS.has(t));
function filtered() {
  const tokens = state.q.toLowerCase().split(/\s+/).filter(Boolean).map((t) => (STREAM_WORDS.has(t) ? 'stream' : t));
  return facets.filter((f) => (!state.gallery || f.gallery === state.gallery) && (!state.surface || f.surface === state.surface)
    && tokens.every((t) => [f.id, f.title, f.description, f.category, f.galleryTitle, f.surface, ...(f.tags || []), ...(f.targets || []).map((x) => x.device)].join(' ').toLowerCase().includes(t)));
}

const grid = byId('facet-grid');
const tiles = new Map(), mounted = new Map();
function tileFor(f) {
  let el = tiles.get(f.id);
  if (el) return el;
  const g = galleryById.get(f.gallery);
  el = document.createElement('article');
  el.className = 'd-tile';
  el.dataset.id = f.id;
  el.dataset.hue = g?.hue ?? 66;
  el.setAttribute('data-fl', 'tile');
  const states = f.states?.length ? `${f.states.length} states` : f.animated ? 'animated' : 'still';
  el.innerHTML = `<div class="d-tile-stage"><span class="d-tile-coord">${esc((f.category || '').toUpperCase())}</span><span class="d-tile-surface">${esc(f.surface)}</span><div class="d-mount"><span class="ph">${esc(f.title)}</span></div></div>
    <div class="d-tile-meta"><div class="d-tile-name"><a href="#${esc(f.id)}">${esc(f.title)}</a></div><p class="d-tile-desc">${esc(f.description)}</p>
    <div class="d-tile-foot"><span>${esc(states)}${f.data?.length ? '<b class="d-demo" title="Demo data on this page — open the facet to see what is live in the plugin">demo data</b>' : ''}</span><span class="lambda"><i class="rf-index is-dot"></i>${esc(lambdaOf(g?.hue ?? 66))}</span></div></div>`;
  paintHue(el, Number(el.dataset.hue));
  tiles.set(f.id, el);
  return el;
}
// Theme tiles filed under Dark or Light show the theme in its own mode, whatever mode the
// page is in, so the DARK label never sits on a light rendering (and vice versa).
const nativeMode = (f) => (f.gallery === 'themes' ? { dark: 'dark', light: 'light' }[String(f.category || '').toLowerCase()] : undefined);
function mountTile(id) {
  if (mounted.has(id)) return;
  const f = recById.get(id), el = tiles.get(id), box = el.querySelector('.d-mount');
  let view = null;
  try {
    // the tile itself always has layout (its contents may be skipped by content-visibility); stage height is fixed in CSS
    // the stage keeps a 30px band at the top for the coordinate and surface labels (deck.css)
    const small = matchMedia('(max-width: 480px)').matches, sw = (el.clientWidth || 232) - 2, sh = small ? 160 : 184, room = sh - (small ? 40 : 46);
    const mode = nativeMode(f);
    if (f.surface === 'key') view = deck.mountKey(box, id, { displaySize: Math.max(64, Math.min(112, sh - 60, sw - 48)), interactive: true, mode, theme: f.theme || keyTheme });
    else if (f.surface === 'strip' || f.surface === 'screen') view = deck.mountKey(box, id, { displaySize: Math.min(200, sw - (small ? 18 : 34)), interactive: f.surface === 'strip', mode, theme: f.theme || keyTheme });
    else {
      const target = (f.targets || []).map((t) => t.device).find((d) => ['mk2', 'mini', 'neo', 'plus'].includes(d)) || 'mk2';
      view = deck.mountDevice(box, { model: target, width: Math.min(210, sw - (small ? 18 : 34), room * (layoutOf(target).w / layoutOf(target).h)), interactive: false, mode, theme: f.theme || keyTheme, ...layoutFor(target, id) });
    }
  } catch (err) { console.error(`[prism-deck page] ${id}:`, err); box.innerHTML = '<span class="ph">could not render</span>'; }
  mounted.set(id, view);
}
function unmountTile(id) { const v = mounted.get(id); if (v) deck.unmount(v); mounted.delete(id); const box = tiles.get(id)?.querySelector('.d-mount'); if (box) box.innerHTML = `<span class="ph">${esc(recById.get(id).title)}</span>`; }
const tileObserver = new IntersectionObserver((entries) => {
  for (const e of entries) { const id = e.target.dataset.id; if (e.isIntersecting) mountTile(id); }
  if (mounted.size > 48) for (const [id] of [...mounted]) { const r = tiles.get(id).getBoundingClientRect(); if (r.bottom < -1200 || r.top > innerHeight + 1200) unmountTile(id); }
}, { rootMargin: '300px 0px' });

let shown = [];
function renderGrid() {
  const items = filtered();
  const frag = document.createDocumentFragment();
  const overview = !state.gallery && !state.surface && !state.q;
  shown = [];
  if (overview) {
    for (const g of galleries) {
      const inG = items.filter((f) => f.gallery === g.id);
      if (!inG.length) continue;
      const h = document.createElement('div');
      h.className = 'd-group'; h.dataset.hue = g.hue; paintHue(h, g.hue);
      h.innerHTML = `<i class="rf-index"></i><h3>${esc(g.title)}</h3><p>${esc(g.blurb || '')}</p><span class="lambda">${esc(lambdaOf(g.hue))}</span>`;
      frag.append(h);
      for (const f of inG) { frag.append(tileFor(f)); shown.push(f); }
    }
  } else for (const f of items) { frag.append(tileFor(f)); shown.push(f); }
  tileObserver.disconnect();
  grid.replaceChildren(frag);
  for (const f of shown) tileObserver.observe(tiles.get(f.id));
  for (const id of [...mounted.keys()]) if (!tiles.get(id).isConnected) unmountTile(id);
  const g = galleryById.get(state.gallery);
  byId('result-status').textContent = overview ? `${fmt(facets.length)} facets in ${galleries.length} galleries${deck.source === 'placeholder' ? ' (preview sketches — the live catalog could not load)' : ''}.`
    : `${fmt(items.length)} ${items.length === 1 ? 'facet' : 'facets'}${g ? ` in ${g.title}` : ''}${state.surface ? ` · ${SURFACE[state.surface]}` : ''}${state.q ? ` matching “${state.q}”` : ''}${streamQuery() ? ' — streaming keys. They don’t connect to streaming apps or chat services: a press changes the key’s own picture.' : ''}`;
  byId('empty-state').hidden = items.length > 0;
  byId('clear-filters').hidden = overview;
}
function renderNav() {
  for (const b of list.children) b.setAttribute('aria-pressed', String(b.dataset.g === state.gallery));
  for (const b of surfaceSeg.children) b.setAttribute('aria-pressed', String(b.dataset.s === state.surface));
}
function writeUrl() {
  const p = new URLSearchParams();
  if (state.gallery) p.set('g', state.gallery);
  if (state.surface) p.set('s', state.surface);
  if (state.q) p.set('q', state.q);
  const qs = p.toString();
  history.replaceState(history.state, '', `${location.pathname}${qs ? `?${qs}` : ''}${location.hash}`);
}
function update(scroll = false) {
  writeUrl(); renderNav(); renderGrid();
  if (scroll) { const top = byId('catalog').getBoundingClientRect().top; if (top < 0 || top > innerHeight * 0.5) byId('catalog').scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth' }); }
}
update();

// ── every device ─────────────────────────────────────────────────────────────
const wall = byId('device-wall');
const SPANS = { galleon: 'is-galleon', plus: 'is-plus', mk2: 'is-small', neo: 'is-small', mini: 'is-small', xl: 'is-xl', plusxl: 'is-plusxl' };
const wallModels = ['galleon', 'plus', 'mk2', 'neo', 'mini', 'xl', 'plusxl'].filter((id) => deck.devices[id]);
byId('wall-count').textContent = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'][wallModels.length] || fmt(wallModels.length);
wall.innerHTML = wallModels.map((id) => `<article class="d-dev ${SPANS[id] || 'span-4'}" data-model="${id}" data-hue="66"><div class="d-dev-stage"></div><div class="d-dev-meta"><h3>${esc(deck.devices[id].name)}</h3><p>${esc(NOTES[id] || '')}</p></div></article>`).join('');
repaint();
const wallViews = new Map();
function mountWall(card) {
  const id = card.dataset.model, stage = card.querySelector('.d-dev-stage');
  const r = stage.getBoundingClientRect();
  const w = fitWidth(id, stage, r.width - 44, Math.max(150, r.height - 40));
  if (wallViews.has(id)) deck.unmount(wallViews.get(id));
  wallViews.set(id, deck.mountDevice(stage, { model: id, width: w, interactive: true, theme: keyTheme, label: `${deck.devices[id].name}, virtual`, ...layoutFor(id) }));
}
const wallObserver = new IntersectionObserver((entries) => { for (const e of entries) if (e.isIntersecting && !wallViews.has(e.target.dataset.model)) mountWall(e.target); }, { rootMargin: '400px 0px' });
wall.querySelectorAll('.d-dev').forEach((c) => wallObserver.observe(c));
let wallResize;
new ResizeObserver(() => { clearTimeout(wallResize); wallResize = setTimeout(() => wall.querySelectorAll('.d-dev').forEach((c) => { if (wallViews.has(c.dataset.model)) mountWall(c); }), 200); }).observe(wall);

// ── detail ───────────────────────────────────────────────────────────────────
const dialog = byId('detail');
const detail = { rec: null, model: null, theme: keyTheme, keyMode: null, view: null, state: 0, fromPage: false };
const ddDevice = byId('dd-device');
function detailModels(f) {
  const fromRuntime = deck.devicesFor?.(f.id)?.filter((d) => deck.devices[d] && d !== 'studio');
  if (fromRuntime?.length) return [...new Set(fromRuntime)];
  const t = (f.targets || []).map((x) => x.device).filter((d) => d && deck.devices[d] && d !== 'studio');
  return f.surface === 'key' ? ['mk2', 'plus', 'galleon', 'xl', 'neo', 'mini'].filter((d) => deck.devices[d]) : [...new Set(t)];
}
function mountDetail() {
  const f = detail.rec, model = detail.model;
  if (detail.view) deck.unmount(detail.view);
  const r = ddDevice.getBoundingClientRect();
  const w = fitWidth(model, ddDevice, Math.min(r.width - 20, 760), Math.max(280, r.height - 20));
  const lay = layoutFor(model, f.id);
  if (f.surface === 'key' && f.states?.length) lay.keys[0] = { facet: f.id, state: detail.state };
  detail.view = deck.mountDevice(ddDevice, { model, width: w, interactive: true, theme: detail.theme, mode: detail.keyMode || undefined, label: `${f.title} on ${deck.devices[model]?.name}`, ...lay });
}
// ── real or demo? (src/apps/sources: what the plugin reads live; this page always simulates) ──
const DATA_NOTES = [
  [['cpu', 'mem', 'gpu', 'disk', 'net', 'temp', 'uptime', 'battery', 'sys', 'series'], 'System readings (CPU, memory, disk, network…) come live from your computer, read-only. GPU and temperature appear where the system reports them.'],
  [['audio', 'spectrum'], 'Sound meters follow your computer’s sound output, not your microphone, wherever the plugin can capture it (Linux out of the box; Windows and macOS need ffmpeg and a loopback audio device). Otherwise they run on demo data.'],
  [['media'], 'Now-playing details are live on Linux (the player that’s playing). On Windows and macOS they’re demo data.'],
  [['calendar'], 'Meetings are demo data, in the plugin too: no calendar is connected.'],
  [['weather'], 'Weather is demo data: Prism makes no network requests.'],
  [['timer'], 'Timers are real: the key keeps its own time.'],
  [['clock'], 'Clocks are real: your computer’s time.'],
  [['mic', 'camera'], 'Mic and camera keys show the key’s own on/muted state; they don’t switch your microphone or camera.'],
];
function honestHtml(f) {
  const keys = new Set(f.data || []);
  const live = DATA_NOTES.filter(([ks]) => ks.some((k) => keys.has(k))).map(([, note]) => `<li>${esc(note)}</li>`);
  const streaming = (f.tags || []).some((x) => /^(streaming|stream|scene|broadcast|chat)$/.test(x));
  const press = streaming
    ? 'A press changes this key’s own picture (preview, live, standby…). It doesn’t switch scenes or talk to streaming apps or chat services.'
    : 'A press changes this key’s own picture or state. Prism keys don’t control other apps by themselves: to make a key do something, put Prism art on an action that does it.';
  return `<h3>Real or demo?</h3><div class="dd-honest-body">${keys.size ? `<p><b class="d-demo">demo data</b> On this page everything runs on demo data; nothing reads your microphone, computer or accounts.</p><p>In the Stream Deck plugin:</p><ul>${live.join('') || '<li>This facet runs on demo data.</li>'}</ul>` : '<p>No data needed: what you see here is what the key shows.</p>'}<p><b>What it controls.</b> ${esc(press)}</p></div>`;
}
function segButtons(el, items, current, attr) { el.innerHTML = items.map(([v, label]) => `<button type="button" data-v="${esc(v)}" aria-pressed="${v === current}">${esc(label)}</button>`).join(''); el.hidden = items.length < 2; }
function openDetail(id) {
  const f = recById.get(id);
  if (!f) return;
  const g = galleryById.get(f.gallery);
  detail.rec = f; detail.state = 0;
  const models = detailModels(f);
  // the remembered device when this facet runs on it, else the last one shown, else the facet's home device
  const pref = recall(DEVICE_KEY);
  detail.model = models.includes(pref) ? pref : models.includes(detail.model) ? detail.model : models[0] || 'mk2';
  // a theme facet always draws its own theme, so its row shows that theme (the others open their facets)
  detail.theme = f.theme && themeIds.has(f.theme) ? f.theme : keyTheme;
  paintHue(dialog, g?.hue ?? 66); dialog.dataset.hue = g?.hue ?? 66;
  byId('dd-crumb').innerHTML = `<a href="?g=${esc(f.gallery)}" data-crumb="${esc(f.gallery)}">${esc(g?.title || f.galleryTitle)}</a> / ${esc(f.category)} / <span>${esc(f.id)}</span>`;
  byId('dd-eyebrow').innerHTML = `${esc((g?.title || '').toUpperCase())}<span class="rf-sep">·</span>${esc(SURFACE[f.surface]?.toUpperCase() || f.surface)}<span class="rf-sep">·</span><span class="rf-lambda">${esc(lambdaOf(g?.hue ?? 66))}</span>`;
  byId('dd-title').textContent = f.title;
  byId('dd-desc').textContent = f.description;
  byId('dd-tags').innerHTML = (f.tags || []).map((t) => `<span>#${esc(t)}</span>`).join('');
  const meta = [['Surface', SURFACE[f.surface] || f.surface], ['States', f.states?.length ? f.states.join(' · ') : '—'], ['Press', f.press || '—'], ['Frame rate', f.fps ? `${f.fps} fps` : '—'], ['Loop', f.animated ? `${f.loop} s` : 'still'], ['Devices', (f.targets || []).map((t) => t.device).filter(Boolean).map((d) => deck.devices[d]?.name.replace('Stream Deck ', 'SD ') || d).join(', ') || 'every key size'], ['Theme', f.theme || 'any'], ['Since', f.since || '—']];
  byId('dd-meta').innerHTML = meta.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd title="${esc(v)}">${esc(v)}</dd></div>`).join('');
  const u = f.usage || {};
  const rows = [['In the Stream Deck app', u.plugin], ['In the browser', u.web], ['In code', u.code]].filter(([, v]) => v);
  byId('dd-usage').innerHTML = rows.map(([label, v]) => `<div class="dd-cmd"><div class="dd-cmd-head"><span>${esc(label)}</span><button type="button" class="chip-btn" data-copy="${esc(v)}" aria-label="Copy: ${esc(label)}"><svg class="ic" aria-hidden="true"><use href="#i-copy"/></svg><span data-label>Copy</span></button></div><pre>${esc(v)}</pre></div>`).join('');
  // buttons keep one order on every facet (Tab order doesn't shuffle between facets)
  segButtons(byId('dd-models'), [...models].sort((a, b) => FAMILY.indexOf(a) - FAMILY.indexOf(b)).map((d) => [d, shortName(d)]), detail.model);
  segButtons(byId('dd-themes'), themeList.map((x) => [x.id, x.title]), detail.theme);
  byId('dd-honest').innerHTML = honestHtml(f);
  for (const b of byId('dd-modes').children) b.setAttribute('aria-pressed', String(b.dataset.v === (detail.keyMode || (mode() === 'day' ? 'light' : 'dark'))));
  byId('dd-states').innerHTML = f.surface === 'key' && f.states?.length ? f.states.map((s, i) => `<button type="button" class="dd-state" data-state="${i}" aria-pressed="${i === 0}">${esc(s)}</button>`).join('') : '';
  const at = shown.indexOf(f), order = at >= 0 ? shown : facets, i = order.indexOf(f);
  detail.prev = order[(i - 1 + order.length) % order.length]; detail.next = order[(i + 1) % order.length];
  byId('dd-prev').setAttribute('aria-label', `Previous: ${detail.prev.title}`);
  byId('dd-next').setAttribute('aria-label', `Next: ${detail.next.title}`);
  if (!dialog.open) dialog.showModal();
  requestAnimationFrame(mountDetail);
}
byId('dd-models').addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (!b) return; detail.model = b.dataset.v; remember(DEVICE_KEY, b.dataset.v); for (const x of byId('dd-models').children) x.setAttribute('aria-pressed', String(x === b)); mountDetail(); });
byId('dd-themes').addEventListener('click', (e) => {
  const b = e.target.closest('[data-v]');
  if (!b) return;
  const id = b.dataset.v;
  // on a theme's own facet, another theme opens that theme's facet; elsewhere it re-themes the page
  if (detail.rec?.theme && recById.has(`theme-${id}`)) { if (`theme-${id}` !== detail.rec.id) { history.replaceState(history.state, '', `#theme-${id}`); openDetail(`theme-${id}`); } setKeyTheme(id); return; }
  setKeyTheme(id);
});
byId('dd-modes').addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (!b) return; detail.keyMode = b.dataset.v; for (const x of byId('dd-modes').children) x.setAttribute('aria-pressed', String(x === b)); mountDetail(); });
byId('dd-states').addEventListener('click', (e) => { const b = e.target.closest('[data-state]'); if (!b) return; detail.state = Number(b.dataset.state); for (const x of byId('dd-states').children) x.setAttribute('aria-pressed', String(x === b)); mountDetail(); });
byId('dd-crumb').addEventListener('click', (e) => { const a = e.target.closest('[data-crumb]'); if (!a) return; e.preventDefault(); state.gallery = a.dataset.crumb; dialog.close(); update(true); });
const step = (dir) => { const n = dir < 0 ? detail.prev : detail.next; history.replaceState(history.state, '', `#${n.id}`); openDetail(n.id); };
byId('dd-prev').addEventListener('click', () => step(-1));
byId('dd-next').addEventListener('click', () => step(1));
byId('dd-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
dialog.addEventListener('keydown', (e) => { if (/^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(e.target.tagName) && e.target.closest('.dd-device')) return; if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); } else if (e.key === 'ArrowRight') { e.preventDefault(); step(1); } });
dialog.addEventListener('close', () => {
  if (detail.view) deck.unmount(detail.view);
  detail.view = null;
  if (recById.has(decodeURIComponent(location.hash.slice(1)))) { if (detail.fromPage) history.back(); else history.replaceState(history.state, '', `${location.pathname}${location.search}`); }
  detail.fromPage = false;
});
let routed = false;
function route() {
  const id = decodeURIComponent(location.hash.slice(1));
  if (recById.has(id)) { if (!dialog.open) detail.fromPage = routed; if (detail.rec?.id !== id || !dialog.open) openDetail(id); }
  else if (dialog.open) { detail.fromPage = false; dialog.close(); }
  routed = true;
}
addEventListener('hashchange', route);
route();

// ── the key theme picker (hero + catalog toolbar + the detail's theme row: one choice) ────
const heroThemes = byId('hero-themes'), themeSelect = byId('theme-select');
function swatchStyle(id) { const s = swatchOf(id); return s ? ` style="--sw-bg:${esc(s.bg)};--sw-ac:${esc(s.accent)}"` : ''; }
function renderThemePicker() {
  heroThemes.innerHTML = themeList.map((x) => `<button type="button" data-theme-id="${esc(x.id)}" aria-pressed="${x.id === keyTheme}"><i class="d-sw"${swatchStyle(x.id)} aria-hidden="true"></i>${esc(x.title)}</button>`).join('');
  themeSelect.innerHTML = themeList.map((x) => `<option value="${esc(x.id)}"${x.id === keyTheme ? ' selected' : ''}>${esc(x.title)}</option>`).join('');
}
function setKeyTheme(id) {
  if (!themeIds.has(id)) return;
  const changed = id !== keyTheme;
  keyTheme = id; remember(THEME_KEY, id);
  for (const b of heroThemes.children) b.setAttribute('aria-pressed', String(b.dataset.themeId === id));
  themeSelect.value = id;
  if (dialog.open && detail.rec) {
    if (!detail.rec.theme) detail.theme = id;
    for (const x of byId('dd-themes').children) x.setAttribute('aria-pressed', String(x.dataset.v === detail.theme));
    if (!detail.rec.theme && changed) mountDetail();
  }
  if (!changed) return;
  for (const v of hero.views) v?.set?.({ theme: id });
  for (const [fid, v] of mounted) if (v && !recById.get(fid)?.theme) v.set?.({ theme: id });
  for (const v of wallViews.values()) v?.set?.({ theme: id });
  byId('remember-note').hidden = false;
}
if (themeList.length > 1) {
  renderThemePicker();
  byId('theme-pick').hidden = false;
  byId('theme-select-wrap').hidden = false;
  heroThemes.addEventListener('click', (e) => { const b = e.target.closest('[data-theme-id]'); if (b) setKeyTheme(b.dataset.themeId); });
  themeSelect.addEventListener('change', () => setKeyTheme(themeSelect.value));
  site?.onMode(renderThemePicker);
  if (recall(THEME_KEY) || recall(DEVICE_KEY)) byId('remember-note').hidden = false;
}

// ── install: counts from the catalog and the profile list ──────────────────────────────
// Profiles are listed in index.html for each file in prism-deck/plugin/dist/profiles/ (the build's
// strict link check fails on a missing one).
const glyphCount = deck.catalog?.glyphs ? (Array.isArray(deck.catalog.glyphs) ? deck.catalog.glyphs.length : Object.keys(deck.catalog.glyphs).length) : 56;
byId('packs-note').textContent = `${fmt(themeList.length)} packs · ${fmt(glyphCount)} icons in every state, Night and Day (240 images each) · 1–8 MB`;
byId('profiles-note').textContent = `Needs the plugin · ${byId('profile-list').children.length} devices`;

// ── theme + First Light ──────────────────────────────────────────────────────
site?.onMode(() => { repaint(); deck.refreshMode(); });
deck.setGlobalMotion(paused);
site?.tilesReady?.([...grid.querySelectorAll('.d-tile')].slice(0, 12));
