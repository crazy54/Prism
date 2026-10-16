// prism-deck/web/core — the pure parts of the browser runtime: dial math, input
// gestures, device fitting, accessible labels and the showcase layout a page puts
// on a virtual device. No DOM, no timers: player.js drives these and
// test/web.test.js checks them in Node.

import { stillTime } from '../render.js';
import { quantize } from '../scene/scheduler.js';
import { getDevice, deviceLayout } from '../devices.js';
import { readoutOf } from '../scene/link.js';

/** A dial turns through 270° from 0 to 1 (−135° … +135°, 0° = 12 o'clock). */
export const DIAL_SWEEP = 270;
/** Pointer travel (CSS px) that counts as a tap rather than a drag. */
export const TAP_SLOP = 5;
/** Vertical drag (CSS px) per dial detent. */
export const DRAG_PX = 6;
/** Wheel travel (px) per detent for trackpads, which send many small deltas. */
export const WHEEL_PX = 60;

export const clamp01 = (v) => (Number.isFinite(v) ? (v < 0 ? 0 : v > 1 ? 1 : v) : 0);

/** Pointer angle of a dial at value v (degrees). */
export const dialAngle = (v) => -DIAL_SWEEP / 2 + clamp01(v) * DIAL_SWEEP;

/** The detent size a dial facet asks for: params.step → its `step` param default → 0.02. */
export function dialStep(facet, params = {}) {
  const s = params.step ?? facet?.params?.step?.default;
  return typeof s === 'number' && s > 0 ? s : 0.02;
}

/** Turn a 0–1 value by `ticks` detents of `step`, clamped (and rounded so repeated turns don't drift). */
export function stepValue(value, ticks, step = 0.02) {
  return Math.round(clamp01((Number.isFinite(value) ? value : 0) + ticks * step) * 1e6) / 1e6;
}

/**
 * Wheel → dial detents. A discrete wheel notch (|delta| ≥ WHEEL_PX px, or a line/page
 * delta) is exactly one detent per notch; trackpads' small deltas accumulate in `acc`.
 * Scrolling up (negative deltaY) turns clockwise (+). → { ticks, acc }
 */
export function wheelTicks(acc, deltaY, deltaMode = 0) {
  if (!deltaY) return { ticks: 0, acc };
  if (deltaMode === 1 || deltaMode === 2) return { ticks: -Math.sign(deltaY) * Math.max(1, Math.round(Math.abs(deltaY) / (deltaMode === 1 ? 3 : 1))), acc: 0 };
  if (Math.abs(deltaY) >= WHEEL_PX) return { ticks: -Math.sign(deltaY) * Math.max(1, Math.round(Math.abs(deltaY) / 100)), acc: 0 };
  const a = acc + deltaY;
  const t = Math.trunc(a / WHEEL_PX);
  return { ticks: -t || 0, acc: a - t * WHEEL_PX || 0 };
}

/** Vertical drag → detents; up (negative clientY travel, so dy = startY − y > 0) is clockwise. → { ticks, rest } */
export function dragTicks(dy, px = DRAG_PX) {
  const ticks = Math.trunc(dy / px) || 0;
  return { ticks, rest: dy - ticks * px || 0 };
}

/** Did a pointer that travelled (dx, dy) tap, or drag? */
export const isTap = (dx, dy, slop = TAP_SLOP) => Math.hypot(dx, dy) <= slop;

/** Index of the equal segment (of n) under x within a box of `width` (the touch strip → its dial). */
export function segmentAt(x, width, n) {
  if (!(n > 0) || !(width > 0)) return 0;
  return Math.min(n - 1, Math.max(0, Math.floor((x / width) * n)));
}

/** Long-touch threshold on the touch strip (s). */
export const HOLD_S = 0.5;

/**
 * A touch on the Stream Deck + / + XL strip. (px, py): the pointer inside the strip's box of
 * width × height CSS px; strip: { w, h, segments } in native px. → { i (dial segment), x, y (strip px), segX (px inside segment i) }
 */
export function stripTouch(px, py, width, height, strip) {
  const segs = Math.max(1, strip?.segments || 1), W = strip?.w || 800, H = strip?.h || 100;
  const x = clamp01(width > 0 ? px / width : 0) * W, y = clamp01(height > 0 ? py / height : 0) * H;
  const segW = W / segs, i = Math.min(segs - 1, Math.floor(x / segW));
  return { i, x: Math.round(x), y: Math.round(y), segX: Math.round(x - i * segW) };
}

/** The context inputs API 1.3 derives from a slot's press / turn / touch history at time t. */
export function inputState({ pressed = false, pressStart = 0, turnAt = -Infinity, touch = null } = {}, t = 0) {
  return {
    pressedFor: pressed ? Math.max(0, t - pressStart) : 0,
    turnAge: turnAt === -Infinity ? Infinity : Math.max(0, t - turnAt),
    touch: touch ? { x: touch.x, y: touch.y, hold: !!touch.hold, age: Math.max(0, t - touch.at) } : undefined,
  };
}

/**
 * CSS width that fits a device into a box. box: { width, height, max, min } (any may be missing;
 * height 0/undefined = unbounded). Returns a whole pixel count.
 */
export function fitWidth(device, box = {}) {
  const L = deviceLayout(getDevice(device));
  const aspect = L.w / L.h;
  let w = box.width > 0 ? box.width : L.w;
  if (box.height > 0) w = Math.min(w, box.height * aspect);
  if (box.max > 0) w = Math.min(w, box.max);
  if (box.min > 0) w = Math.max(w, box.min);
  return Math.max(40, Math.floor(w));
}

/** The instant a slot draws: a meaningful still under reduced motion, else t snapped to its fps grid. */
export const frameTime = (facet, t, { still = false, fps = 30 } = {}) => (still ? stillTime(facet) : quantize(t, fps || 30));

/** Spoken label for a key / dial / strip slot: "Microphone — off", "Volume — 64%". */
export function slotLabel(facet, { state = 0, role = 'key', value, index } = {}) {
  if (!facet) return `${role === 'dial' ? 'Dial' : 'Key'} ${(index ?? 0) + 1} (empty)`;
  const st = facet.states?.[state];
  const pct = role === 'dial' && Number.isFinite(value) ? ` — ${Math.round(clamp01(value) * 100)}%` : '';
  return `${facet.title}${st ? ` — ${st}` : ''}${pct}`;
}

// ── games, non-visually ─────────────────────────────────────────────────────

/** A game cell's accessible state — facet.game.cell(state, k, params) → { label?, pressed? } (optional hook;
 *  k = the key's cell in the facet's grid). A string is a label. → null when the facet says nothing. */
export function gameCell(facet, state, k, params = {}) {
  const fn = facet?.game?.cell;
  if (typeof fn !== 'function' || !state || !Number.isInteger(k) || k < 0) return null;
  try {
    const r = fn(state, k, params);
    if (typeof r === 'string') return r ? { label: r } : null;
    if (!r || typeof r !== 'object') return null;
    const out = {};
    if (typeof r.label === 'string' && r.label) out.label = r.label;
    if (typeof r.pressed === 'boolean') out.pressed = r.pressed;
    return Object.keys(out).length ? out : null;
  } catch { return null; }
}

/** What a screen reader hears after a game input: facet.game.announce(state, prev, params) when the facet
 *  declares it, else the readout cards (scene/link.js readoutOf) whose title or value changed — the first
 *  with its sub line: "Rolled: 7 (3 + 4). Rolls: 2". '' when nothing worth saying changed. */
export function gameAnnouncement(facet, prev, state, params = {}) {
  const fn = facet?.game?.announce;
  if (typeof fn === 'function') {
    try { const s = fn(state, prev ?? null, params); if (typeof s === 'string') return s.replace(/\s+/g, ' ').trim(); } catch { /* fall back to the readout */ }
  }
  const now = readoutOf(facet, state, params);
  if (!now) return '';
  const before = prev ? readoutOf(facet, prev, params) : null;
  const changed = now.cards.filter((c, i) => {
    const p = before?.cards?.[i];
    return !p || p.title !== c.title || String(p.value) !== String(c.value);
  });
  return changed.map((c, i) => `${c.title}: ${c.value}${i === 0 && c.sub ? ` (${c.sub})` : ''}`).join('. ');
}

// ── showcase layout ─────────────────────────────────────────────────────────

const GALLERY_ORDER = ['icons', 'apps', 'motion', 'games', 'themes', 'spans', 'dials', 'screens'];
const isKey = (f) => f.surface === 'key';
const isDialSeg = (f) => f.surface === 'strip' && (f.segments === 1 || f.segments === '1');
const isFullStrip = (f) => f.surface === 'strip' && !isDialSeg(f);
const onScreen = (f, kind) => f.surface === 'screen' && (f.screens || []).some((s) => String(s).startsWith(kind));
const byGallery = (a, b) => GALLERY_ORDER.indexOf(a.gallery) - GALLERY_ORDER.indexOf(b.gallery);

/**
 * Interleave key facets so a device shows range: icons, then an app key, then motion, round-robin.
 * → facets (stable within each gallery).
 */
export function keyPool(facets) {
  const lanes = new Map();
  for (const f of facets.filter(isKey).sort(byGallery)) { if (!lanes.has(f.gallery)) lanes.set(f.gallery, []); lanes.get(f.gallery).push(f); }
  const order = [...lanes.keys()];
  const weight = { icons: 3, apps: 1, motion: 1 };
  const out = [];
  const idx = Object.fromEntries(order.map((g) => [g, 0]));
  let left = facets.filter(isKey).length;
  while (left > 0) {
    for (const g of order) {
      for (let k = 0; k < (weight[g] || 1); k++) {
        const lane = lanes.get(g);
        if (idx[g] < lane.length) { out.push(lane[idx[g]++]); left--; }
      }
    }
  }
  return out;
}

/**
 * What a page puts on a virtual device to show it off: one facet per key (icons interleaved with
 * app and motion keys; every third stateful key starts in its second state so some keys are lit),
 * a dial-segment facet per Stream Deck + dial (or a full-strip facet), and a screen facet for the
 * Galleon screen or the Neo info bar. Works with catalog records or normalized facets.
 * → { keys: [{ facet: id, state }], dials: [id], strip: id | null, screen: id | null }
 */
export function showcaseLayout(device, facets, { offset = 0 } = {}) {
  const d = getDevice(device);
  const out = { keys: [], dials: [], strip: null, screen: null };
  if (d.display !== 'lcd' && d.display !== 'software') return out;
  const pool = keyPool(facets);
  const n = (d.cols || 0) * (d.rows || 0);
  for (let i = 0; i < n && pool.length; i++) {
    const f = pool[(i + offset) % pool.length];
    out.keys.push({ facet: f.id, state: (f.states?.length || 0) > 1 && i % 3 === 1 ? 1 : 0 });
  }
  if (d.strip) {
    const segs = facets.filter(isDialSeg);
    if (segs.length) for (let i = 0; i < d.strip.segments; i++) out.dials.push(segs[(i + offset) % segs.length].id);
    else out.strip = facets.find(isFullStrip)?.id || null;
  }
  if (d.screen?.kind) out.screen = facets.find((f) => onScreen(f, d.screen.kind === 'infobar' ? 'infobar' : d.screen.kind))?.id || null;
  return out;
}

/** One model per distinct native key size, smallest first (72 MK.2 … 160 Galleon 100 SD). */
export const KEY_SIZE_DEVICES = ['mk2', 'mini', 'xl', 'plusxl', 'plus', 'studio', 'galleon'];
export const FAMILY = ['mini', 'mk2', 'xl', 'neo', 'plus', 'plusxl', 'galleon', 'studio'];

/**
 * Devices a facet is shown on in an "every device" view: keys → one model per native key size;
 * strips → + and + XL; screens → the models that have that screen; spans / decks → their render
 * targets, else every hardware family.
 */
export function devicesFor(facet) {
  if (!facet) return FAMILY;
  if (facet.surface === 'key') return facet.devices?.length ? [...facet.devices] : KEY_SIZE_DEVICES;
  if (facet.surface === 'strip') return ['plus', 'plusxl'];
  if (facet.surface === 'screen') {
    const s = (facet.screens || []).map(String);
    return [...new Set([...(s.some((x) => x.startsWith('galleon')) ? ['galleon'] : []), ...(s.includes('infobar') ? ['neo'] : [])])];
  }
  const t = (facet.targets || []).map((x) => x.device).filter(Boolean);
  return t.length ? [...new Set(t)] : FAMILY;
}
