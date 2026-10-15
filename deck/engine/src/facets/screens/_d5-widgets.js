// Galleon widgets shared by D5's dashboards: each factory takes the render context and returns a
// cell painter (p, W) => void for galleon() in _d5-kit.js. Live values come through the apps
// engineer's data layer (../apps/_data.js): absent keys are simulated, null keys show "—".

import { path, roundRectPath } from '../../scene/index.js';
import { capHeight } from '../../scene/text.js';
import { metricOf, tempOf, netOf, seriesOf, sysOf, rateText, calendarOf } from '../apps/_data.js';
import { header, stat, meter, segmented, gauge, spark, hhmm, localParts, DAYS, MONTHS, HUE, clamp } from './_d5-kit.js';

const split = (s) => { const i = s.lastIndexOf(' '); return i < 0 ? [s, ''] : [s.slice(0, i), s.slice(i + 1)]; };
const pctOf = (v) => (v === null ? '—' : Math.round(v * 100));
const tempText = (ctx, f) => { const t = tempOf(ctx); return t === null ? null : f ? `${Math.round(t * 1.8 + 32)} °F` : `${Math.round(t)} °C`; };

/** CPU: the load as the hero number, every core as a column on the right. */
export const cpuCores = (ctx, { fahrenheit = false } = {}) => (p, W) => {
  const sys = sysOf(ctx), v = metricOf(ctx, 'cpu');
  const cores = Array.isArray(sys.cores) ? sys.cores : [];
  header(p, W, 'CPU', cores.length ? `${cores.length} cores` : sys.cpuGhz ? `${sys.cpuGhz} GHz` : '');
  stat(p, { value: pctOf(v), unit: v === null ? '' : '%', xl: W.x0, base: Math.round(p.h * 0.64) });
  const tt = tempText(ctx, fahrenheit);
  p.caption(tt ? `${tt} package` : sys.cpuModel || '', { align: 'left', x: W.x0, y: W.footY, color: 'muted', maxWidth: W.w * 0.56 });
  if (!cores.length) return;
  const k = Math.min(16, cores.length), x0 = W.x0 + W.w * 0.6, ww = W.x1 - x0;
  const gap = Math.max(3, (ww / k) * 0.34), bw = (ww - gap * (k - 1)) / k;
  const top = W.eyebrowY + Math.round(W.pad * 0.9), bot = W.footY, hh = bot - top;
  let tr = '', on = '';
  for (let i = 0; i < k; i++) {
    const x = x0 + i * (bw + gap), bh = Math.max(bw, hh * clamp(cores[i] ?? 0));
    tr += roundRectPath(x, top, bw, hh, Math.min(bw / 2, 3));
    on += roundRectPath(x, bot - bh, bw, bh, Math.min(bw / 2, 3));
  }
  p.add(path(tr, { fill: p.colors.line, fillOpacity: 0.6 }));
  p.add(path(on, { fill: p.ctx.tint }));
};

/** CPU as a gauge with its history (the overview dashboard). */
export const cpuGauge = (ctx) => (p, W) => {
  const sys = sysOf(ctx), v = metricOf(ctx, 'cpu');
  header(p, W, 'CPU', Array.isArray(sys.cores) && sys.cores.length ? `${sys.cores.length} cores` : sys.cpuGhz ? `${sys.cpuGhz} GHz` : '');
  gaugeWithHistory(ctx, p, W, v, 'cpu');
};

/** GPU as a gauge with its history. */
export const gpuGauge = (ctx) => (p, W) => {
  const sys = sysOf(ctx), v = metricOf(ctx, 'gpu');
  header(p, W, 'GPU', sys.gpuName || '');
  gaugeWithHistory(ctx, p, W, v, 'gpu');
};

function gaugeWithHistory(ctx, p, W, v, key) {
  const r = Math.round((W.footY - W.eyebrowY) * 0.4), cx = W.x0 + r + W.u * 2, cy = W.eyebrowY + (W.footY - W.eyebrowY) * 0.56;
  gauge(p, { cx, cy, r, width: Math.max(6, Math.round(W.u * 3.2)), value: v ?? 0, from: -135, to: 135 });
  const vs = p.typeStyle('value');
  p.value(v === null ? '—' : `${Math.round(v * 100)}`, { x: cx, cy, size: vs.size * 0.62, maxWidth: r * 1.5 });
  p.caption('%', { x: cx, y: cy + r * 0.78, color: 'muted' });
  if (v === null) return;   // the source can't measure it here: no invented history either
  const sx = cx + r + W.u * 9, s = seriesOf(ctx, key, 28, 0.5);
  spark(p, s.values, { x: sx, y: W.eyebrowY + W.pad * 0.9, w: W.x1 - sx, h: W.footY - W.eyebrowY - W.pad * 1.6, shift: ctx.reduced ? 0 : s.frac || 0 });
  p.caption('last 15 s', { align: 'right', x: W.x1, y: W.footY, color: 'dim' });
}

/** Memory in binary units (32 GB, the way operating systems label RAM). */
export const memory = (ctx) => (p, W) => {
  const sys = sysOf(ctx), v = metricOf(ctx, 'mem');
  const total = sys.memTotal || 0, used = sys.memUsed ?? (v !== null && total ? v * total : null);
  const gb = (b) => { const x = b / 1024 ** 3; return x >= 100 ? `${Math.round(x)}` : x.toFixed(1).replace(/\.0$/, ''); };
  header(p, W, 'Memory', v !== null ? [total ? `${Math.round(v * 100)}% of ${gb(total)} GB` : null, `${Math.round(v * 100)}% used`] : total ? `${gb(total)} GB` : '');
  const none = used === null || used === undefined;
  stat(p, { value: none ? '—' : gb(used), unit: none ? '' : 'GB', xl: W.x0, base: Math.round(p.h * 0.64) });
  const bh = Math.max(6, Math.round(W.u * 2.6));
  meter(p, { x: W.x0, y: W.footY - bh, w: W.w, h: bh, value: v ?? 0 });
};

/** Network: download as the number, upload beneath, both histories scrolling at the right. */
export const network = (ctx) => (p, W) => {
  const net = netOf(ctx);
  const up = Number.isFinite(ctx.data?.uptime) ? ctx.data.uptime : 4 * 3600 + 12 * 60 + ctx.t;
  header(p, W, 'Network', `up ${Math.floor(up / 3600)}:${String(Math.floor((up % 3600) / 60)).padStart(2, '0')}`);
  const base = Math.round(p.h * 0.64), vs = p.typeStyle('value'), cs = p.typeStyle('caption');
  const [dn, du] = split(rateText(net?.down ?? null)), [un, uu] = split(rateText(net?.up ?? null));
  const aw = Math.round(cs.size * 0.9);
  p.caption('↓', { align: 'left', x: W.x0, y: base, color: 'muted' });
  const s = stat(p, { role: 'value', value: dn, unit: du, xl: W.x0 + aw, base, size: vs.size });
  p.caption(`↑ ${un}${uu ? ` ${uu}` : ''}`, { align: 'left', x: W.x0, y: W.footY, color: 'muted' });
  if (!net) return;
  const sx = Math.max(s.right + W.u * 6, W.x0 + W.w * 0.6), d = seriesOf(ctx, 'down', 28, 0.5), u = seriesOf(ctx, 'up', 28, 0.5);
  const box = { x: sx, y: W.eyebrowY + W.pad * 0.9, w: W.x1 - sx, h: W.footY - W.eyebrowY - W.pad * 0.9 };
  spark(p, d.values, { ...box, shift: ctx.reduced ? 0 : d.frac || 0, area: 0.16 });
  spark(p, u.values, { ...box, shift: ctx.reduced ? 0 : u.frac || 0, area: 0, head: false, color: p.theme.spectral(HUE.violet), width: Math.max(1.5, W.u * 0.6) });
};

/** Volume: the speaker glyph at its level, the percentage, a 24-notch meter (the Galleon's notched dial). */
export const volume = (ctx, { value, muted = false, meta = 'Speakers' }) => (p, W) => {
  const vol = clamp(value);
  header(p, W, 'Volume', muted ? 'muted' : meta, { metaColor: muted ? 'neg' : 'dim' });
  const gs = Math.round(p.h * 0.52);
  p.glyph('volume', { state: muted ? 'muted' : 'on', level: vol, box: { x: W.x0 - gs * 0.16, y: W.eyebrowY + (W.footY - W.eyebrowY - gs) * 0.4 - W.u, size: gs } });
  stat(p, { value: Math.round(vol * 100), unit: '%', xr: W.x1 - Math.round(p.h * 0.17), base: Math.round(p.h * 0.66), color: muted ? 'dim' : undefined });
  const mh = Math.max(6, Math.round(W.u * 3.4));
  segmented(p, { x: W.x0, y: W.footY - mh, w: W.w, h: mh, value: vol, count: 24, color: muted ? p.colors.dim : p.ctx.tint });
};

/** Clock: the time as the hero, the date as the instrument label, the next event underneath. */
export const clock = (ctx, { hour12 = false, seconds = true } = {}) => (p, W) => {
  const c = ctx.clock;
  header(p, W, `${DAYS[c.dow]} · ${c.day} ${MONTHS[c.month - 1]}`, seconds ? `:${String(c.s).padStart(2, '0')}` : '', { metaColor: 'dim' });
  const hero = p.typeStyle('hero'), base = Math.round(p.h * 0.66), sz = hero.size;
  const hh = hour12 ? ((c.h + 11) % 12) + 1 : c.h;
  p.hero(`${hh}:${String(c.m).padStart(2, '0')}`, { align: 'left', x: W.x0 - sz * 0.03, cy: base - capHeight(sz, hero.weight) / 2, size: sz, maxWidth: W.w * 0.78 });
  if (hour12) p.caption(c.h < 12 ? 'AM' : 'PM', { align: 'right', x: W.x1, y: base, color: 'muted' });
  // the next event (or the week number) underneath
  const cal = calendarOf(ctx), ev = cal.current && cal.current.end > ctx.now ? cal.current : cal.next;
  if (ev && ev.at - ctx.now < 12 * 3600000) {
    const t = localParts(ctx, ev.at);
    p.caption(ev === cal.current ? `Now · ${ev.title}` : `${hhmm(t.h, t.m, hour12)} · ${ev.title}`, { align: 'left', x: W.x0, y: W.footY, color: 'muted', maxWidth: W.w });
  } else p.caption(`Week ${weekOf(c)}`, { align: 'left', x: W.x0, y: W.footY, color: 'muted' });
};

/** ISO week number from clock parts. */
function weekOf(c) {
  const days = [31, (c.year % 4 === 0 && c.year % 100 !== 0) || c.year % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let doy = c.day;
  for (let i = 0; i < c.month - 1; i++) doy += days[i];
  const dow = ((c.dow + 6) % 7) + 1;
  return Math.max(1, Math.floor((doy - dow + 10) / 7));
}
