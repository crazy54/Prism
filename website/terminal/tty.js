// "Browse from your terminal" — directions for the curl-able terminal site, with
// a preview rendered from the exact bytes curl receives: the page is fetched
// from the site (../tty, ../t/<gallery>, ../f/<facet>, plus .24 / .txt), parsed
// as ANSI and drawn by the engine's browser renderer at 80 columns.

import { esc, initChrome, engineUrl } from './site.js';

const byId = (id) => document.getElementById(id);
const siteRoot = new URL('../', location.href);
const HOST = 'https://prism.jeremyfhall.com';
const THEMES = { dark: { bg: 0x0f1621, ink: 0xd9dde4 }, light: { bg: 0xfbfbfd, ink: 0x1f2430 } };

initChrome();

const [web, taxonomy] = await Promise.all([import(engineUrl('src/web/index.js')), import(engineUrl('src/facets/galleries.js'))]);

const screen = byId('preview-screen');
const state = { page: 'tty', variant: '', bg: 'dark' };
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
  byId('preview-cmd').innerHTML = `$ curl -sL prism.jeremyfhall.com/<b>${esc(page)}${esc(state.variant)}</b>`;
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
  return `<div class="gal-row" role="listitem"><span class="t-gal-icon" aria-hidden="true">${esc(g.icon)}</span><div><strong>${esc(g.title)}</strong><small>${esc(g.blurb)}</small></div><span class="t-gal-count">${g.count == null ? '' : g.count}</span><code>${esc(cmd)}</code><span class="row-actions"><button type="button" data-preview="t/${esc(g.id)}" aria-label="Preview the ${esc(g.title)} page">Preview</button><button type="button" data-copy="${esc(cmd)}" aria-label="Copy: ${esc(cmd)}">Copy ⧉</button></span></div>`;
}).join('');

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
