// Virtual Stream Decks for the website — the placeholder runtime.
//
// Same surface as prism-deck/src/web (mountDevice, mountKey, setGlobalMotion): draws any
// model from devices.js, plays facets on its keys, dials, touch strip, info bar or screen at
// their own fps (≤ 15, hardware-like), sleeps off-screen, holds a still frame under
// prefers-reduced-motion or when the page pauses motion, and takes clicks / Enter / Space on
// keys and wheel / arrows / drag on dials. adapter.js swaps this for prism-deck's runtime
// once that ships (docs/CONTRACT-READY).
import { DEVICES, deviceLayout, wallGrid } from './devices.js';
import { FACETS, GALLERIES, STILL_TIME, hueColors } from './sketches.js';

export const SOURCE = 'placeholder';
const byId = new Map(FACETS.map((f) => [f.id, f]));
const hueOf = new Map(GALLERIES.map((g) => [g.id, g.hue]));
export const findFacet = (id) => byId.get(id) || null;

let paused = false, chosen = false, raf = 0, uid = 0;
const views = new Set();
const reducedQ = matchMedia('(prefers-reduced-motion: reduce)');
const still = () => paused || (!chosen && reducedQ.matches);
reducedQ.addEventListener?.('change', () => { for (const v of views) v.redraw(); wake(); });

function pump(now) {
  raf = 0;
  let again = false;
  for (const v of views) if (v.wants()) { again = true; v.tick(now); }
  if (again) raf = requestAnimationFrame(pump);
}
function wake() { if (!raf && views.size) raf = requestAnimationFrame(pump); }

/** Pause (true) / resume (false) every deck on the page. Resuming is explicit, so it also plays under reduced motion. */
export function setGlobalMotion(p) { paused = !!p; chosen = true; for (const v of views) v.redraw(); wake(); }
export const isGlobalMotionPaused = () => paused;

let observer = null;
function observe(v) {
  if (!globalThis.IntersectionObserver) { v.visible = true; return; }
  observer ||= new IntersectionObserver((entries) => {
    for (const e of entries) { const view = e.target.__pdv; if (view) { view.visible = e.isIntersecting; if (view.visible) { view.redraw(); wake(); } } }
  }, { rootMargin: '120px' });
  v.root.__pdv = v;
  observer.observe(v.root);
}

const STYLE = `
.pdv{position:relative;width:100%;user-select:none;-webkit-user-select:none;container-type:inline-size}
.pdv-body{position:absolute;inset:0;background:linear-gradient(160deg,#262934,#14161c 38%,#0b0c10);box-shadow:inset 0 1px 0 rgba(255,255,255,.09),inset 0 -3px 8px rgba(0,0,0,.6),0 1px 0 rgba(255,255,255,.02),0 28px 60px -30px rgba(0,0,0,.85)}
:root[data-rf-mode="day"] .pdv-body{box-shadow:inset 0 1px 0 rgba(255,255,255,.12),inset 0 -3px 8px rgba(0,0,0,.5),0 30px 50px -30px rgba(48,32,120,.45),0 4px 10px -4px rgba(48,32,120,.18)}
.pdv-body::after{content:"";position:absolute;inset:0;border-radius:inherit;background:radial-gradient(120% 70% at 20% 0%,rgba(255,255,255,.06),transparent 60%);pointer-events:none}
.pdv-panel{position:absolute;background:#040506;border-radius:1.2cqw;box-shadow:inset 0 0 0 1px rgba(0,0,0,.6)}
.pdv-key,.pdv-tile{position:absolute;padding:0;margin:0;border:0;background:#000;overflow:hidden;border-radius:14%;box-shadow:0 0 0 .35cqw #050608,0 .5cqw .8cqw -.2cqw rgba(0,0,0,.7),inset 0 0 0 1px rgba(255,255,255,.07);transition:transform 120ms cubic-bezier(.16,1,.3,1);color:inherit;font:inherit}
.pdv-key::after,.pdv-tile::after{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;background:linear-gradient(162deg,rgba(255,255,255,.11),rgba(255,255,255,.03) 28%,transparent 46%)}
.pdv-lcd,.pdv-lcd>svg{display:block;width:100%;height:100%}
.pdv-key.is-down,.pdv-tile.is-down{transform:scale(.955)}
button.pdv-key,button.pdv-tile{cursor:pointer}
.pdv-key:focus-visible,.pdv-tile:focus-visible,.pdv-dial:focus-visible{outline:2px solid var(--rf-focus,#d9ccff);outline-offset:2px}
.pdv-strip{position:absolute;display:flex;overflow:hidden;border-radius:.8cqw;background:#000;box-shadow:0 0 0 .3cqw #050608,inset 0 0 0 1px rgba(255,255,255,.06)}
.pdv-strip>span{flex:1;display:block;position:relative}.pdv-strip>span+span{box-shadow:inset 1px 0 0 rgba(0,0,0,.6)}
.pdv-strip svg{display:block;width:100%;height:100%}
.pdv-dial{position:absolute;border-radius:50%;background:repeating-conic-gradient(#30333e 0 4deg,#17181f 4deg 8deg);box-shadow:0 .8cqw 1.6cqw -.4cqw rgba(0,0,0,.8),inset 0 0 0 1px rgba(255,255,255,.08);touch-action:none;cursor:grab}
.pdv-dial>i{position:absolute;inset:9%;border-radius:50%;background:radial-gradient(circle at 35% 28%,#3a3e4b,#16181f 65%,#0c0d12);box-shadow:inset 0 1px 0 rgba(255,255,255,.12),0 1px 3px rgba(0,0,0,.6)}
.pdv-dial>i::after{content:"";position:absolute;left:50%;top:9%;width:5%;height:20%;margin-left:-2.5%;border-radius:2px;background:var(--pdv-hue,#f7ac5c);box-shadow:0 0 6px var(--pdv-hue,#f7ac5c)}
.pdv-dial>i{transform:rotate(var(--rot,0deg))}
.pdv-screen{position:absolute;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;gap:1px;overflow:hidden;border-radius:.8cqw;background:#050608;box-shadow:inset 0 0 0 1px rgba(255,255,255,.05)}
.pdv-screen>span{display:block;position:relative;overflow:hidden}.pdv-screen svg{display:block;width:100%;height:100%}
.pdv-info{position:absolute;overflow:hidden;border-radius:.6cqw;background:#000;box-shadow:inset 0 0 0 1px rgba(255,255,255,.06)}
.pdv-info svg{display:block;width:100%;height:100%}
.pdv-touch{position:absolute;border-radius:999px;background:rgba(255,255,255,.07);box-shadow:inset 0 0 0 1px rgba(255,255,255,.06)}
.pdv-tile{position:relative;display:block;width:100%;aspect-ratio:1;box-shadow:0 0 0 3px #06070a,0 10px 24px -14px rgba(0,0,0,.9),inset 0 0 0 1px rgba(255,255,255,.07)}
.pdv-tile.is-wide{aspect-ratio:2;border-radius:10px}.pdv-tile.is-strip{aspect-ratio:8;border-radius:8px}
@media(prefers-reduced-motion:reduce){.pdv-key,.pdv-tile{transition:none}}`;
function injectStyle() {
  if (document.getElementById('pdv-style')) return;
  const st = document.createElement('style');
  st.id = 'pdv-style';
  st.textContent = STYLE;
  document.head.appendChild(st);
}
const pct = (v, of) => `${(v / of) * 100}%`;
const box = (r, L) => `left:${pct(r.x, L.w)};top:${pct(r.y, L.h)};width:${pct(r.w, L.w)};height:${pct(r.h, L.h)}`;

function spec(x) {
  if (!x) return null;
  if (typeof x === 'string') { const f = byId.get(x); return f ? { facet: f } : null; }
  if (x.render) return { facet: x };
  if (x.facet) return { ...x, facet: typeof x.facet === 'string' ? byId.get(x.facet) : x.facet };
  return null;
}

class Slot {
  constructor(view, kind, i, s, el) {
    this.view = view; this.kind = kind; this.i = i; this.el = el;
    this.facet = s.facet; this.state = s.state || 0; this.ticks = 0; this.value = s.value ?? 0.62;
    this.pressAt = -1e9; this.stateAt = 0; this.last = ''; this.next = 0;
    this.prefix = `pdv${view.id}${kind[0]}${i}x`;
  }
  get fps() { return Math.min(this.facet.fps || 10, 15); }
  stateName() { return this.facet.states?.[this.state] ?? 'on'; }
  label() { const f = this.facet; return `${f.title}${f.states?.length > 1 ? `: ${this.stateName()}` : ''}`; }
  draw(t) {
    const v = this.view;
    const ctx = { t, since: Math.max(0, t - this.stateAt), state: this.state, stateName: this.stateName(), mode: v.mode, hue: hueColors(hueOf.get(this.facet.gallery) ?? 66, v.mode),
      id: this.prefix, pressAge: Math.max(0, t - this.pressAt), ticks: this.ticks, value: this.value, now: Date.now(), reduced: still() };
    if (this.kind === 'wall') ctx.grid = v.grid;
    if (this.kind === 'strip') ctx.w = v.stripW || 800;
    let svg;
    try { svg = this.facet.render(ctx); } catch (err) { console.error(`[prism-deck preview] ${this.facet.id}:`, err); return; }
    if (svg === this.last) return;
    this.last = svg;
    if (this.kind === 'wall') v.wallEl.innerHTML = svg;
    else this.el.innerHTML = svg;
  }
}

class View {
  constructor(root, opts) {
    injectStyle();
    this.id = ++uid;
    this.root = root;
    this.opts = { interactive: true, mode: null, ...opts };
    this.t0 = performance.now();
    this.slots = [];
    this.visible = false;
    views.add(this);
    observe(this);
  }
  get mode() { return this.opts.mode || (document.documentElement.dataset.rfMode === 'day' ? 'day' : 'night'); }
  time() { return (performance.now() - this.t0) / 1000; }
  wants() { const t = this.time(); return this.visible && !still() && this.slots.some((s) => s.facet.animated || t - s.pressAt < 0.6 || t - s.stateAt < 0.4); }
  tick(now) {
    const t = this.time();
    for (const s of this.slots) {
      const recent = t - s.pressAt < 0.6 || t - s.stateAt < 0.4;
      if (!s.facet.animated && !recent) continue;
      if (now < s.next) continue;
      s.next = now + 1000 / s.fps - 4;
      s.draw(t);
    }
  }
  redraw() { const t = this.time(); for (const s of this.slots) s.draw(still() ? STILL_TIME(s.facet) : t); }
  /** Pin this deck to 'night' | 'day', or pass null to follow the page (data-rf-mode). */
  setMode(mode) { this.opts.mode = mode; this.retheme(); return this; }
  retheme() { for (const s of this.slots) s.last = ''; this.redraw(); }
  bindKey(el, slot) {
    if (!this.opts.interactive || slot.facet.press === 'none') { el.setAttribute('aria-label', slot.label()); return; }
    el.setAttribute('aria-label', `${slot.label()}. Press to ${slot.facet.press === 'count' ? 'count' : slot.facet.press === 'momentary' ? 'trigger' : 'change state'}.`);
    const press = () => {
      const t = this.time(), f = slot.facet;
      slot.pressAt = t;
      if (f.press === 'toggle' || f.press === 'cycle') { slot.state = (slot.state + 1) % (f.states?.length || 1); slot.stateAt = t; }
      if (f.press === 'count') slot.ticks++;
      el.setAttribute('aria-label', `${slot.label()}. Press to ${f.press === 'count' ? 'count' : f.press === 'momentary' ? 'trigger' : 'change state'}.`);
      slot.draw(still() ? STILL_TIME(f) : t);
      this.opts.onPress?.({ facet: f.id, state: slot.state, stateName: slot.stateName(), index: slot.i });
      wake();
    };
    el.addEventListener('pointerdown', () => el.classList.add('is-down'));
    for (const ev of ['pointerup', 'pointerleave', 'blur']) el.addEventListener(ev, () => el.classList.remove('is-down'));
    el.addEventListener('click', press);
  }
  destroy() { views.delete(this); observer?.unobserve(this.root); this.root.replaceChildren(); }
}

export class DeckView extends View {
  constructor(root, opts = {}) { super(root, opts); this.build(); }
  build() {
    const o = this.opts, L = deviceLayout(o.model || 'mk2'), d = DEVICES[L.id];
    this.layout = L;
    this.slots = [];
    const el = document.createElement('div');
    el.className = 'pdv';
    el.dataset.model = L.id;
    el.style.aspectRatio = `${L.w} / ${L.h}`;
    if (!o.interactive) el.setAttribute('aria-hidden', 'true');
    const keyTag = o.interactive ? 'button' : 'div';
    let html = `<div class="pdv-body" style="border-radius:${pct(L.r, L.w)} / ${pct(L.r, L.h)}"></div>`;
    const pad = 10;
    html += `<div class="pdv-panel" style="${box({ x: L.panel.x - pad, y: L.panel.y - pad, w: L.panel.w + pad * 2, h: L.panel.h + pad * 2 }, L)}"></div>`;
    L.keys.forEach((k) => { html += `<${keyTag} class="pdv-key"${o.interactive ? ' type="button"' : ''} data-key="${k.i}" style="${box(k, L)}"><span class="pdv-lcd"></span></${keyTag}>`; });
    if (L.strip) html += `<div class="pdv-strip" style="${box(L.strip, L)}">${'<span></span>'.repeat(L.strip.segments)}</div>`;
    if (L.dials) L.dials.forEach((dl) => { html += `<div class="pdv-dial" data-dial="${dl.i}"${o.interactive ? ' tabindex="0" role="slider" aria-valuemin="0" aria-valuemax="100"' : ''} style="${box({ x: dl.cx - dl.d / 2, y: dl.cy - dl.d / 2, w: dl.d, h: dl.d }, L)}"><i></i></div>`; });
    if (L.screen) html += `<div class="pdv-screen" style="${box(L.screen, L)}">${'<span></span>'.repeat(L.widgets.length)}</div>`;
    if (L.infobar) html += `<div class="pdv-info" style="${box(L.infobar, L)}"></div>`;
    if (L.touch) L.touch.forEach((t) => { html += `<i class="pdv-touch" style="${box(t, L)}"></i>`; });
    el.innerHTML = html;
    // a wall renders once per frame into a hidden source; every key shows its own window onto it
    if (o.wall) {
      const g = wallGrid(L.id, 144);
      this.grid = g;
      const srcId = `pdv${this.id}wall`;
      const src = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      src.setAttribute('width', '0'); src.setAttribute('height', '0'); src.setAttribute('aria-hidden', 'true');
      src.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
      src.innerHTML = `<defs><g id="${srcId}"></g></defs>`;
      el.appendChild(src);
      this.wallEl = src.querySelector('g');
      el.querySelectorAll('.pdv-key .pdv-lcd').forEach((lcd, i) => { const c = g.cells[i]; lcd.innerHTML = `<svg viewBox="${c.x} ${c.y} 144 144" width="100%" height="100%" preserveAspectRatio="xMidYMid slice"><use href="#${srcId}"/></svg>`; });
      const s = spec(o.wall);
      if (s) this.slots.push(new Slot(this, 'wall', 0, s, null));
      if (o.interactive) el.querySelectorAll('.pdv-key').forEach((k) => { k.setAttribute('aria-label', `${s?.facet.title || 'Wall'}, key ${Number(k.dataset.key) + 1}`); k.addEventListener('click', () => { this.t0 = performance.now(); wake(); }); });
    } else {
      el.querySelectorAll('.pdv-key').forEach((k, i) => {
        const s = spec(o.keys?.[i]);
        if (!s) { k.querySelector('.pdv-lcd').innerHTML = blankKey(this.mode); if (o.interactive) { k.setAttribute('aria-label', `Key ${i + 1}: empty`); } return; }
        const slot = new Slot(this, 'key', i, s, k.querySelector('.pdv-lcd'));
        this.slots.push(slot);
        this.bindKey(k, slot);
      });
    }
    if (L.strip) {
      this.stripW = L.strip.w;
      const segs = el.querySelectorAll('.pdv-strip>span');
      const strip = spec(o.strip);
      if (strip) { const holder = el.querySelector('.pdv-strip'); holder.innerHTML = '<span></span>'; this.slots.push(new Slot(this, 'strip', 0, strip, holder.firstChild)); }
      else segs.forEach((seg, i) => { const s = spec(o.dials?.[i]); if (s) this.slots.push(new Slot(this, 'dial', i, s, seg)); });
    }
    if (L.screen) el.querySelectorAll('.pdv-screen>span').forEach((w, i) => { const s = spec(o.widgets?.[i] || o.dials?.[i % 2]); if (s) this.slots.push(new Slot(this, 'dial', i, { ...s, value: s.value ?? (0.3 + 0.2 * i) }, w)); });
    if (L.infobar) { const s = spec(o.infobar); if (s) this.slots.push(new Slot(this, 'strip', 0, s, el.querySelector('.pdv-info'))); this.stripW = 232; }
    // dials drive the segment above them (or the Galleon's widgets, by layer)
    el.querySelectorAll('.pdv-dial').forEach((dl) => {
      const i = Number(dl.dataset.dial);
      const targets = this.slots.filter((s) => s.kind === 'dial' && (L.screen ? s.i % 2 === i : s.i === i));
      const hue = targets[0] ? hueColors(hueOf.get(targets[0].facet.gallery) ?? 66, this.mode).vivid : null;
      if (hue) dl.style.setProperty('--pdv-hue', hue);
      const set = (v) => {
        v = Math.max(0, Math.min(1, v));
        for (const s of targets) { s.value = v; s.draw(this.time()); }
        dl.style.setProperty('--rot', `${-135 + v * 270}deg`);
        if (this.opts.interactive) { dl.setAttribute('aria-valuenow', String(Math.round(v * 100))); dl.setAttribute('aria-label', `Dial ${i + 1}${targets[0] ? `: ${targets[0].facet.title}` : ''}`); }
      };
      set(targets[0]?.value ?? 0.5);
      if (!this.opts.interactive) return;
      const cur = () => targets[0]?.value ?? 0.5;
      dl.addEventListener('wheel', (e) => { e.preventDefault(); set(cur() + (e.deltaY < 0 ? 0.04 : -0.04)); }, { passive: false });
      dl.addEventListener('keydown', (e) => {
        const step = { ArrowUp: 0.04, ArrowRight: 0.04, ArrowDown: -0.04, ArrowLeft: -0.04, PageUp: 0.2, PageDown: -0.2 }[e.key];
        if (step) { e.preventDefault(); set(cur() + step); } else if (e.key === 'Home') { e.preventDefault(); set(0); } else if (e.key === 'End') { e.preventDefault(); set(1); }
      });
      let drag = null;
      dl.addEventListener('pointerdown', (e) => { drag = { y: e.clientY, x: e.clientX, v: cur() }; dl.setPointerCapture(e.pointerId); });
      dl.addEventListener('pointermove', (e) => { if (drag) set(drag.v + ((drag.y - e.clientY) + (e.clientX - drag.x)) / 160); });
      dl.addEventListener('pointerup', () => { drag = null; });
    });
    this.root.replaceChildren(el);
    this.redraw();
    wake();
  }
  setKeys(list) { this.opts.keys = list; this.opts.wall = null; this.build(); return this; }
  setWall(w) { this.opts.wall = w; this.build(); return this; }
  setModel(model) { this.opts.model = model; this.build(); return this; }
  retheme() { this.build(); }
}

function blankKey(mode) {
  return mode === 'day'
    ? '<svg viewBox="0 0 144 144" width="100%" height="100%"><rect width="144" height="144" fill="#ecebf3"/></svg>'
    : '<svg viewBox="0 0 144 144" width="100%" height="100%"><defs><radialGradient id="pdvblank" cx=".5" cy="0" r="1.1"><stop offset="0" stop-color="#11141e"/><stop offset="1" stop-color="#05060a"/></radialGradient></defs><rect width="144" height="144" fill="url(#pdvblank)"/></svg>';
}

/** One facet in a tile: a key (square), a dial segment (2:1), the strip (8:1), or a wall on a small device. */
export class KeyView extends View {
  constructor(root, facet, opts = {}) {
    super(root, opts);
    const s = spec(facet);
    const f = s.facet;
    if (f.kind === 'wall') { this.inner = new DeckView(root, { model: opts.model || 'mk2', wall: s, interactive: false, mode: opts.mode }); views.delete(this); return; }
    const tag = this.opts.interactive && f.press !== 'none' ? 'button' : 'div';
    const el = document.createElement(tag);
    el.className = `pdv-tile${f.kind === 'dial' ? ' is-wide' : f.kind === 'strip' ? ' is-strip' : ''}`;
    if (tag === 'button') el.type = 'button';
    else el.setAttribute('role', 'img');
    el.innerHTML = '<span class="pdv-lcd"></span>';
    root.replaceChildren(el);
    const slot = new Slot(this, f.kind === 'strip' ? 'strip' : f.kind === 'dial' ? 'dial' : 'key', 0, s, el.firstChild);
    this.slots = [slot];
    this.bindKey(el, slot);
    if (f.kind === 'dial' && this.opts.interactive) {
      el.addEventListener('wheel', (e) => { e.preventDefault(); slot.value = Math.max(0, Math.min(1, slot.value + (e.deltaY < 0 ? 0.04 : -0.04))); slot.draw(this.time()); }, { passive: false });
    }
    this.redraw();
    wake();
  }
  setMode(mode) { if (this.inner) { this.inner.setMode(mode); return this; } return super.setMode(mode); }
  retheme() { if (this.inner) this.inner.retheme(); else super.retheme(); }
  setState(state) { const s = this.slots[0]; if (s) { s.state = state; s.stateAt = this.time(); s.last = ''; s.draw(still() ? STILL_TIME(s.facet) : this.time()); } return this; }
  destroy() { if (this.inner) this.inner.destroy(); else super.destroy(); }
}

export const mountDevice = (el, opts) => new DeckView(el, opts);
export const mountKey = (el, facet, opts) => new KeyView(el, facet, opts);
/** Redraw every deck that follows the page's mode (call after the site relights Night ↔ Day). */
export function refreshMode() { for (const v of [...views]) if (!v.opts.mode) v.retheme(); }
export function deckStats() { let slots = 0; for (const v of views) slots += v.slots.length; return { decks: views.size, slots }; }
