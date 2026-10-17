// Galleon 100 SD widgets for the apps gallery: one registry of widget kinds, each a painter
// (ctx, opts) → (p, W) => void in D5's widget idiom (src/facets/screens/_d5-kit.js frames,
// headers, stats, meters), so a slot routed to any kind looks like it belongs with D5's
// dashboards. D5's painters (clock, cpu, cores, gpu, memory, network, volume) are reused as-is;
// the audio, spectrum, disk, media and next-event painters are the apps engineer's.
//
//   WIDGETS[kind] = { title, hue, data: [ctx.data keys], paint(ctx, params) → (p, W) => void }
//   widgetScreen(ctx, kind)       one widget filling a 360 × 180 (2:1) surface (screens: ['galleon-widget'])
//   galleonOf(ctx, [[k00, k10], [k01, k11]])   the full 720 × 384 screen, per-slot kinds

import { surface, path, rect, n, roundRectPath } from '../../scene/index.js';
import { capHeight } from '../../scene/text.js';
import { header, stat, meter, segmented, spark, coverArt, frameOf, activeMark, panelInto, galleon, mmss, hhmm, localParts, HUE, clamp } from '../screens/_d5-kit.js';
import { clock, cpuGauge, cpuCores, gpuGauge, memory, network, volume } from '../screens/_d5-widgets.js';
import { audioOf, spectrumOf, metricOf, seriesOf, sysOf, bytesText, rateText, mediaOf, calendarOf } from './_data.js';
import { colorAt, bandPath, smoothLine } from './_kit.js';
import { expand } from './waveform.js';

const MIN = 60000;

/** Audio: the live waveform scrolling across the widget, the meter and peak underneath. */
const audioWidget = (ctx) => (p, W) => {
  const A = audioOf(ctx, { count: 150, rate: 30 });
  const db = A.level > 0 ? Math.round((1 - A.level) * -60) : null;
  header(p, W, 'Audio', A.live ? (db === null ? 'silent' : `${db} dB`) : 'demo');
  const top = W.eyebrowY + W.pad * 0.8, bot = W.footY - W.u * 5.5;
  const mid = (top + bot) / 2, amp = (bot - top) / 2;
  const seconds = 4, N = A.levels.length, step = Math.max(2, W.w / 90);
  const up = [], dn = [];
  for (let x = W.x1; x >= W.x0 - 0.01; x -= step) {
    const age = ((W.x1 - x) / W.w) * seconds;
    const idx = N - 1 - (age * A.rate - (A.frac || 0));
    const i = Math.max(0, Math.min(N - 1, Math.round(idx)));
    const v = idx < -0.5 ? 0 : A.levels[i];
    const a = amp * (0.04 + 0.96 * expand(v) ** 0.9);
    up.push([x, mid - a]); dn.push([x, mid + a]);
  }
  const g = p.id('aw');
  p.def(`<linearGradient id="${g}" x1="${n(W.x1)}" y1="0" x2="${n(W.x0)}" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${colorAt(ctx, 'auto', 1)}"/><stop offset="0.6" stop-color="${colorAt(ctx, 'auto', 0.5)}" stop-opacity="0.7"/><stop offset="1" stop-color="${colorAt(ctx, 'auto', 0.1)}" stop-opacity="0.25"/></linearGradient>`);
  p.add(path(bandPath(up, dn), { fill: `url(#${g})`, fillOpacity: p.dark ? 0.75 : 0.65 }));
  p.add(path(smoothLine(up) + smoothLine(dn), { fill: 'none', stroke: `url(#${g})`, strokeWidth: n(Math.max(1.25, W.u * 0.5)), strokeLinejoin: 'round' }));
  p.add(rect({ x: W.x0, y: mid - 0.5, width: W.w, height: 1, fill: p.colors.beam || (p.dark ? '#ffffff' : p.colors.ink), fillOpacity: 0.25 }));
  const mh = Math.max(5, Math.round(W.u * 2.2));
  segmented(p, { x: W.x0, y: W.footY - mh, w: W.w, h: mh, value: A.level, count: 30, color: colorAt(ctx, 'auto', 0.85) });
};

/** Spectrum: bands as rounded bars with falling peak caps. */
const spectrumWidget = (ctx, { bands = 24 } = {}) => (p, W) => {
  const S = spectrumOf(ctx, bands);
  header(p, W, 'Spectrum', S.live ? `${bands} bands` : 'demo');
  const top = W.eyebrowY + W.pad * 0.9, bot = W.footY, hh = bot - top;
  const gap = Math.max(2, (W.w / bands) * 0.3), bw = (W.w - gap * (bands - 1)) / bands, r = Math.min(bw / 2, 3);
  let tr = '';
  const fills = [];
  for (let i = 0; i < bands; i++) {
    const x = W.x0 + i * (bw + gap), bh = Math.max(bw * 0.6, hh * S.bands[i]);
    tr += roundRectPath(x, top, bw, hh, r);
    fills.push(path(roundRectPath(x, bot - bh, bw, bh, r), { fill: colorAt(ctx, 'auto', i / (bands - 1)) }));
    const py = bot - hh * S.peaks[i] - 2;
    fills.push(rect({ x, y: Math.max(top, py), width: bw, height: 2, rx: 1, fill: p.dark ? '#ffffff' : p.colors.ink, fillOpacity: 0.8 }));
  }
  p.add(path(tr, { fill: p.colors.line, fillOpacity: 0.35 }));
  p.add(fills.join(''));
};

/** Disk: used space as the number and meter, read/write history at the right. */
const diskWidget = (ctx) => (p, W) => {
  const v = metricOf(ctx, 'disk'), sys = sysOf(ctx);
  header(p, W, 'Disk', Number.isFinite(sys.diskFree) ? `${bytesText(sys.diskFree)} free` : '');
  const s = stat(p, { value: v === null ? '—' : Math.round(v * 100), unit: v === null ? '' : '%', xl: W.x0, base: Math.round(p.h * 0.6) });
  const bh = Math.max(6, Math.round(W.u * 2.6));
  meter(p, { x: W.x0, y: W.footY - bh, w: W.w * 0.5, h: bh, value: v ?? 0, color: v !== null && v > 0.9 ? p.colors.warn : undefined });
  const rd = seriesOf(ctx, 'read', 28, 0.5), wr = seriesOf(ctx, 'write', 28, 0.5);
  const sx = Math.max(s.right + W.u * 6, W.x0 + W.w * 0.58), box = { x: sx, y: W.eyebrowY + W.pad * 0.9, w: W.x1 - sx, h: W.footY - W.eyebrowY - W.pad * 2.2 };
  spark(p, rd.values, { ...box, shift: ctx.reduced ? 0 : rd.frac || 0, area: 0.14 });
  spark(p, wr.values, { ...box, shift: ctx.reduced ? 0 : wr.frac || 0, area: 0, head: false, color: p.theme.spectral(HUE.amber), width: Math.max(1.5, W.u * 0.6) });
  const io = Number.isFinite(sys.diskRead) || Number.isFinite(sys.diskWrite) ? (sys.diskRead || 0) + (sys.diskWrite || 0) : null;
  p.caption(io === null ? '' : `IO ${rateText(io)}`, { align: 'right', x: W.x1, y: W.footY, color: 'muted', maxWidth: W.x1 - sx });
};

/** Now playing: generated cover art, title and artist, a progress meter with times. */
const mediaWidget = (ctx) => (p, W) => {
  const live = ctx.data && Object.hasOwn(ctx.data, 'media');
  const m = live && ctx.data.media === null ? null : mediaOf(ctx);
  header(p, W, m?.playing ? 'Now playing' : 'Paused', m?.album || '');
  const art = Math.round(W.footY - W.eyebrowY - W.pad * 0.9);
  const ay = W.footY - art;
  if (!m) { p.label('Nothing playing', { align: 'left', x: W.x0, y: p.h * 0.58, color: 'muted' }); return; }
  coverArt(p, { x: W.x0, y: ay, size: art, title: m.title, artist: m.artist });
  const tx = W.x0 + art + W.u * 6, tw = W.x1 - tx;
  const ls = p.typeStyle('label'), cs = p.typeStyle('caption');
  const f = m.duration > 0 ? clamp(m.position / m.duration) : 0;
  const bh = Math.max(5, Math.round(W.u * 2)), my = W.footY - bh - cs.size * 1.4;
  const ty = ay + capHeight(ls.size * 1.15, ls.weight) + W.u, ay2 = ty + ls.size * 1.25;
  p.label(m.title, { align: 'left', x: tx, y: ty, size: ls.size * 1.15, maxWidth: tw });
  // the artist only where it clears the meter (themes with large type drop it rather than collide)
  if (ay2 + cs.size * 0.3 < my - W.u) p.caption(m.artist, { align: 'left', x: tx, y: ay2, color: 'muted', maxWidth: tw });
  meter(p, { x: tx, y: my, w: tw, h: bh, value: f });
  p.caption(mmss(m.position), { align: 'left', x: tx, y: W.footY, color: 'muted' });
  p.caption(`–${mmss(Math.max(0, m.duration - m.position))}`, { align: 'right', x: W.x1, y: W.footY, color: 'dim' });
};

/** Next event: a countdown as the hero, the title underneath, a beam that fills over the last hour. */
const nextWidget = (ctx, { hour12 = false } = {}) => (p, W) => {
  const cal = calendarOf(ctx);
  const now = ctx.now, cur = cal.current && cal.current.end > now ? cal.current : null, ev = cur || cal.next;
  if (!ev) { header(p, W, 'Calendar', ''); p.label('Nothing next', { align: 'left', x: W.x0, y: p.h * 0.58, color: 'muted' }); return; }
  const t = localParts(ctx, ev.at);
  header(p, W, cur ? 'Now' : 'Next', `${hhmm(t.h, t.m, hour12)}`);
  const mins = Math.max(0, Math.ceil(((cur ? ev.end : ev.at) - now) / MIN));
  const soon = !cur && mins <= 5;
  const big = mins >= 60 ? `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}` : `${mins}`;
  const bh = Math.max(5, Math.round(W.u * 2)), cs = p.typeStyle('caption');
  const s = stat(p, { value: big, unit: mins >= 60 ? 'h' : 'min', xl: W.x0, base: Math.round(p.h * 0.6), color: soon ? 'warn' : undefined });
  p.caption(cur ? 'left' : soon ? 'starting soon' : '', { align: 'right', x: W.x1, y: s.base, color: soon ? 'warn' : 'dim' });
  p.label(ev.title, { align: 'left', x: W.x0, y: W.footY - bh - cs.size * 0.9, size: cs.size * 1.15, maxWidth: W.w, color: cur ? 'ink' : 'muted' });
  const span = cur ? (ev.end - ev.at) : 60 * MIN;
  const f = cur ? clamp((now - ev.at) / span) : clamp(1 - (ev.at - now) / span);
  meter(p, { x: W.x0, y: W.footY - bh, w: W.w, h: bh, value: f, color: soon ? p.colors.warn : undefined });
};

// the dial turned (ctx.turnAge finite: this widget's own dial value), else a linked volume (scene/link.js), else the system
// volume from a media source, else the param
const volFrom = (ctx, params) => { const m = ctx.data?.media, lv = ctx.data?.volume; return clamp(Number.isFinite(ctx.turnAge) && typeof ctx.value === 'number' ? ctx.value : typeof lv?.level === 'number' ? lv.level : typeof m?.volume === 'number' ? m.volume : params?.volume ?? 0.62); };

/** The widget kinds (a slot can hold any of them). */
export const WIDGETS = {
  clock: { title: 'Clock', hue: HUE.periwinkle, data: ['clock', 'calendar'], paint: (ctx, o) => clock(ctx, { hour12: !!o.hour12 }) },
  next: { title: 'Next Event', hue: HUE.citrine, data: ['calendar', 'clock'], paint: (ctx, o) => nextWidget(ctx, { hour12: !!o.hour12 }) },
  media: { title: 'Now Playing', hue: HUE.rose, data: ['media'], paint: (ctx) => mediaWidget(ctx) },
  volume: { title: 'Volume', hue: HUE.citrine, data: ['media', 'volume'], paint: (ctx, o) => volume(ctx, { value: volFrom(ctx, o), muted: typeof ctx.data?.volume?.muted === 'boolean' ? ctx.data.volume.muted : !!ctx.data?.media?.muted }) },
  audio: { title: 'Audio', hue: HUE.mint, data: ['audio'], paint: (ctx) => audioWidget(ctx) },
  spectrum: { title: 'Spectrum', hue: HUE.cyan, data: ['spectrum'], paint: (ctx) => spectrumWidget(ctx) },
  cpu: { title: 'CPU', hue: HUE.violet, data: ['cpu'], paint: (ctx) => cpuGauge(ctx) },
  cores: { title: 'CPU Cores', hue: HUE.violet, data: ['cpu', 'temp'], paint: (ctx, o) => cpuCores(ctx, { fahrenheit: !!o.fahrenheit }) },
  gpu: { title: 'GPU', hue: HUE.jade, data: ['gpu'], paint: (ctx) => gpuGauge(ctx) },
  memory: { title: 'Memory', hue: HUE.cyan, data: ['mem'], paint: (ctx) => memory(ctx) },
  network: { title: 'Network', hue: HUE.azure, data: ['net', 'uptime'], paint: (ctx) => network(ctx) },
  disk: { title: 'Disk', hue: HUE.amber, data: ['disk'], paint: (ctx) => diskWidget(ctx) },
};
export const WIDGET_KINDS = Object.keys(WIDGETS);
export const WIDGET_DATA = [...new Set(Object.values(WIDGETS).flatMap((w) => w.data))];

/** One widget filling a 360 × 180 (2:1) surface (the Stream Deck app's Galleon encoder canvas). */
export function widgetScreen(ctx, kind, { tone = 'idle', active = false } = {}) {
  const W0 = WIDGETS[kind] || WIDGETS.clock;
  const scr = surface(ctx);
  scr.add(rect({ width: ctx.w, height: ctx.h, fill: '#000000' }));
  panelInto(scr, { x: 0, y: 0, w: ctx.w, h: ctx.h }, (p) => {
    p.background({ tone });
    W0.paint(ctx, ctx.params)(p, frameOf(p));
    if (active) activeMark(p);
  }, { kind: 'screen', tag: 'w', hue: W0.hue });
  return scr.svg();
}

/** The full Galleon screen from per-slot kinds: kinds[layer][dial]. */
export function galleonOf(ctx, kinds) {
  const k = (l, d) => WIDGETS[kinds[l][d]] || WIDGETS.clock;
  return galleon(ctx, surface(ctx), [[k(0, 0).paint(ctx, ctx.params), k(0, 1).paint(ctx, ctx.params)], [k(1, 0).paint(ctx, ctx.params), k(1, 1).paint(ctx, ctx.params)]], { hues: [[k(0, 0).hue, k(0, 1).hue], [k(1, 0).hue, k(1, 1).hue]] });
}


