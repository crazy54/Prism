// "Browse from your terminal" — directions for the curl-able terminal site, with
// a preview rendered from the exact bytes curl receives: the page is fetched
// from the site (../tty, ../t/<gallery>, ../f/<facet>, plus .24 / .txt), parsed
// as ANSI and drawn by the engine's browser renderer at 80 columns.

import { esc, initChrome, engineUrl, mode, onMode, copyButton, curlHtml, applyShell } from './site.js';
import { TERMINAL as POSITIONS } from '../assets/rf/positions.mjs';

const byId = (id) => document.getElementById(id);
const siteRoot = new URL('../', location.href);
const HOST = 'https://prism.jeremyfhall.com';
// The Prism terminal schemes (prism-term/src/themes.js › TERMINAL_SCHEMES): background + foreground.
const THEMES = { dark: { id: 'prism-dark', bg: 0x0a0c12, ink: 0xe6e6ef }, light: { id: 'prism-light', bg: 0xf8f7fb, ink: 0x23222f } };

initChrome();

const [web, taxonomy] = await Promise.all([import(engineUrl('src/web/index.js')), import(engineUrl('src/facets/galleries.js'))]);

const screen = byId('preview-screen');
const state = { page: 'tty', variant: '', bg: mode() === 'day' ? 'light' : 'dark' };
for (const b of byId('preview-bg').children) b.setAttribute('aria-pressed', String(b.dataset.v === state.bg));
const cache = new Map();
let canvas = null, buffer = null, token = 0;

function fetchPage(path) {
  const url = new URL(path, siteRoot).href;
  if (!cache.has(url)) {
    cache.set(url, fetch(url).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.text();
    }));
    cache.get(url).catch(() => cache.delete(url));
  }
  return cache.get(url);
}

function draw() {
  if (!buffer) return;
  canvas ||= document.createElement('canvas');
  if (!canvas.isConnected) screen.replaceChildren(canvas);
  const width = Math.max(240, screen.clientWidth - 32);
  web.renderToCanvas(buffer, canvas, { width, theme: THEMES[state.bg] });
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', `Terminal output of curl -sL prism.jeremyfhall.com/${state.page}${state.variant}`);
  screen.style.background = '#' + THEMES[state.bg].bg.toString(16).padStart(6, '0');
}

async function show(page = state.page) {
  state.page = page;
  const t = ++token;
  byId('preview-page').value = page;
  byId('preview-cmd').innerHTML = `$ <span data-curl>${window.PrismSite?.shell?.() === 'windows' ? 'curl.exe' : 'curl'}</span> -sL prism.jeremyfhall.com/<b>${esc(page)}${esc(state.variant)}</b>`;
  try {
    const text = await fetchPage(page + state.variant);
    if (t !== token) return;
    buffer = web.parseAnsi(text, { minWidth: 80, maxWidth: 80 });
    draw();
    screen.scrollTop = 0;
  } catch (err) {
    if (t !== token) return;
    buffer = null;
    canvas = null;
    screen.innerHTML = `<p class="ph tty-unavailable">The preview reads the live terminal site, which isn't reachable from here (${esc(err.message)}).<br>Run the command in your terminal instead.</p>`;
  }
}

// Galleries: names and blurbs from the engine's taxonomy; which exist and how
// many facets each holds, from the terminal home page itself.
async function galleries() {
  let listed = null;
  try {
    const home = await fetchPage('tty.txt');
    listed = new Map([...home.matchAll(/\/t\/([a-z0-9-]+)\s{2,}(.+?)\s{2,}(\d+)\s*$/gm)].map((m) => [m[1], Number(m[3])]));
    if (!listed.size) listed = null;
  } catch { /* fall back to the full taxonomy */ }
  return taxonomy.GALLERIES.filter((g) => !listed || listed.has(g.id)).map((g) => ({ ...g, count: listed?.get(g.id) }));
}

const list = await galleries();
const select = byId('preview-page');
select.innerHTML = [
  ['tty', 'Home · /tty'], ['t/help', 'Help · /t/help'], ['t/all', 'Every facet · /t/all'],
  ...list.map((g) => [`t/${g.id}`, `${g.title} · /t/${g.id}`]),
  ['f/plasma', 'One facet · /f/plasma'],
].map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('');
select.addEventListener('change', () => show(select.value));

byId('gallery-table').innerHTML = list.map((g) => {
  const cmd = `curl -sL ${HOST}/t/${g.id}`;
  const hue = POSITIONS[g.id]?.sameAs || g.id;
  return `<div class="gal-row" role="listitem" data-rf-gallery="${esc(hue)}"><i class="rf-index"></i><span class="t-gal-icon" aria-hidden="true"><svg class="ic s18 is-spectral" aria-hidden="true"><use href="#i-${esc(g.id)}"/></svg></span><div><strong>${esc(g.title)}</strong><small>${esc(g.blurb)}</small></div><span class="t-gal-count">${g.count == null ? '' : g.count}</span><code>${curlHtml(cmd)}</code><span class="row-actions"><button type="button" class="chip-btn" data-preview="t/${esc(g.id)}" aria-label="Preview the ${esc(g.title)} page"><svg class="ic" aria-hidden="true"><use href="#i-eye"/></svg><span>Preview</span></button>${copyButton(cmd, `Copy the ${g.title} command`)}</span></div>`;
}).join('');
applyShell(byId('gallery-table'));

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-preview]');
  if (!b) return;
  show(b.dataset.preview);
  const fig = screen.closest('figure');
  if (fig.getBoundingClientRect().top < 0 || fig.getBoundingClientRect().bottom > innerHeight) fig.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
});

for (const [id, key] of [['preview-variant', 'variant'], ['preview-bg', 'bg']]) {
  byId(id).addEventListener('click', (e) => {
    const b = e.target.closest('[data-v]');
    if (!b) return;
    for (const x of byId(id).children) x.setAttribute('aria-pressed', String(x === b));
    state[key] = b.dataset.v;
    if (key === 'variant') show();
    else draw();
  });
}

let resizeTimer;
new ResizeObserver(() => { clearTimeout(resizeTimer); resizeTimer = setTimeout(draw, 100); }).observe(screen);

show('tty');
// The preview's background follows the page until someone picks one.
let bgChosen = false;
byId('preview-bg').addEventListener('click', () => { bgChosen = true; });
onMode((m) => {
  if (bgChosen) return;
  state.bg = m === 'day' ? 'light' : 'dark';
  for (const b of byId('preview-bg').children) b.setAttribute('aria-pressed', String(b.dataset.v === state.bg));
  draw();
});
