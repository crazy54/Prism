// System monitor keys — live from the system source (src/apps/sources/system.js), simulated when
// nothing is wired; a metric the machine can't measure (null) shows "—" on a disabled key, never a
// made-up number. Each metric has its own form so a deck of them reads at a glance:
//
//   app-cpu-graph    CPU history as an area chart          app-cpu-cores   one column per core
//   app-mem          a stack of LED segments + GB          app-gpu         a half gauge with a needle
//   app-net          down area + up line, both rates       app-disk        a donut of used space + IO glint
//   app-system-dial  one Stream Deck + dial segment: any metric as an arc, value and history
// (app-cpu-ring, the reference, is the CPU as a 270° ring.)

import { surface, path, rect, circle, n, arcPath, roundRectPath, polar, sparkPath, sparkPoints, spectrumArc } from '../../scene/index.js';
import { metricOf, seriesOf, netOf, sysOf, rateText, bytesText } from './_data.js';
import { colorAt, hueAt, whiteOf, lift, glowDot, clamp, lerp } from './_kit.js';

const toneFor = (v, warn = 0.75, crit = 0.9) => (v === null ? 'off' : v >= crit ? 'alert' : v >= warn ? 'warn' : 'idle');
const pctText = (v) => (v === null ? '—' : `${Math.round(v * 100)}%`);
const THRESH = { warn: { type: 'number', default: 0.75, min: 0, max: 1, step: 0.05, label: 'Warn at' }, crit: { type: 'number', default: 0.9, min: 0, max: 1, step: 0.05, label: 'Critical at' } };
const accentOf = (k, tone, f = 0.6) => (tone === 'idle' ? colorAt(k.ctx, 'auto', f) : k.tone(tone));
const big = (k) => Math.min(k.w, k.h) >= 110;

/** An area sparkline in a box, with a vertical fade and a head dot. */
function area(k, values, { x, y, w, h, shift = 0, color, name = 'area' }) {
  const o = { x, y, w, h, shift };
  const d = sparkPath(values, o);
  if (!d) return;
  const pts = sparkPoints(values, o);
  const id = k.id(name);
  k.def(`<linearGradient id="${id}" x1="0" y1="${n(y)}" x2="0" y2="${n(y + h)}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${color}" stop-opacity="${k.dark ? 0.42 : 0.3}"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient>`);
  k.add(path(`${d}L${n(pts[pts.length - 1][0])} ${n(y + h)}L${n(pts[0][0])} ${n(y + h)}Z`, { fill: `url(#${id})` }));
  k.add(path(d, { fill: 'none', stroke: color, strokeWidth: n(Math.max(1.25, k.m.line)), strokeLinecap: 'round', strokeLinejoin: 'round' }));
  const [hx, hy] = pts[pts.length - 1];
  k.add(circle({ cx: hx, cy: hy, r: k.m.line * 1.6, fill: k.colors.surface2 }) + circle({ cx: hx, cy: hy, r: k.m.line, fill: whiteOf(k) }));
}

const cpuGraph = {
  id: 'app-cpu-graph', title: 'CPU Graph', category: 'System',
  description: 'CPU load as a scrolling chart of the last 30 seconds, warming to amber and red past your thresholds. Live in the plugin (system source); simulated on the web.',
  tags: ['cpu', 'system', 'monitor', 'graph', 'history', 'sparkline', 'live'],
  surface: 'key', data: ['cpu'], fps: 4, loop: 12,
  params: { label: { type: 'text', default: 'CPU', maxLength: 10, label: 'Label' }, ...THRESH },
  order: 11,
  render(ctx) {
    const k = surface(ctx);
    const { w, h, params: p } = ctx;
    const v = metricOf(ctx, 'cpu'), tone = toneFor(v, p.warn, p.crit);
    k.background({ tone });
    const s = seriesOf(ctx, 'cpu', 30, 1);
    const c = accentOf(k, tone, 0.3);
    if (v !== null) area(k, s.values, { x: k.m.bleed, y: h * 0.5, w: w - k.m.bleed * 2, h: h * 0.3, shift: ctx.reduced ? 0 : s.frac, color: c });
    k.eyebrow(p.label, { color: 'muted' });
    k.value(pctText(v), { cy: h * 0.36, maxWidth: w - k.m.text * 2, color: tone === 'idle' || tone === 'off' ? 'ink' : 'tone' });
    return k.svg();
  },
};

const cpuCores = {
  id: 'app-cpu-cores', title: 'CPU Cores', category: 'System',
  description: 'Every CPU core as its own column, lit by its load, with the total underneath. Live in the plugin (system source); simulated on the web.',
  tags: ['cpu', 'cores', 'threads', 'system', 'monitor', 'bars', 'live'],
  surface: 'key', data: ['cpu'], fps: 4, loop: 12,
  params: { ...THRESH },
  order: 12,
  render(ctx) {
    const k = surface(ctx);
    const { w, h, params: p } = ctx;
    const v = metricOf(ctx, 'cpu'), tone = toneFor(v, p.warn, p.crit);
    k.background({ tone });
    const cores = (sysOf(ctx).cores || []).slice(0, 32);
    const n0 = cores.length || 8;
    const x0 = k.m.text, x1 = w - k.m.text, top = k.m.text, bot = h * 0.66;
    const gap = Math.max(1, ((x1 - x0) / n0) * 0.3), bw = (x1 - x0 - gap * (n0 - 1)) / n0, r = Math.min(bw / 2, k.m.u * 2);
    let track = '';
    const lit = [];
    for (let i = 0; i < n0; i++) {
      const x = x0 + i * (bw + gap), cv = clamp(cores[i] ?? 0), bh = Math.max(bw * 0.8, (bot - top) * cv);
      track += roundRectPath(x, top, bw, bot - top, r);
      const ct = cv >= p.crit ? k.tone('alert') : cv >= p.warn ? k.tone('warn') : colorAt(ctx, 'auto', 0.15 + 0.7 * (i / Math.max(1, n0 - 1)));
      if (v !== null) lit.push(path(roundRectPath(x, bot - bh, bw, bh, r), { fill: ct }));
    }
    k.add(path(track, { fill: k.colors.line, fillOpacity: k.dark ? 0.5 : 0.55 }));
    k.add(lit.join(''));
    k.value(pctText(v), { cy: h * 0.81, size: k.m.u * (big(k) ? 15 : 14), maxWidth: w - k.m.text * 2, color: tone === 'idle' || tone === 'off' ? 'ink' : 'tone' });
    return k.svg();
  },
};

const GIB = 1024 ** 3;
const gbText = (b) => { const x = b / GIB; return x >= 100 ? `${Math.round(x)}` : x.toFixed(1).replace(/\.0$/, ''); };

const mem = {
  id: 'app-mem', title: 'Memory', category: 'System',
  description: 'Memory in use as LED segments beside the percentage and the gigabytes, in binary units. Live in the plugin (system source); simulated on the web.',
  tags: ['memory', 'ram', 'system', 'monitor', 'meter', 'live'],
  surface: 'key', data: ['mem'], fps: 2, loop: 12,
  params: { ...THRESH, warn: { ...THRESH.warn, default: 0.85 }, crit: { ...THRESH.crit, default: 0.95 } },
  order: 13,
  render(ctx) {
    const k = surface(ctx);
    const { w, h, params: p } = ctx;
    const v = metricOf(ctx, 'mem'), tone = toneFor(v, p.warn, p.crit);
    k.background({ tone });
    const sys = sysOf(ctx);
    const count = big(k) ? 12 : 10;
    const x = k.m.text, sw = w * 0.2, top = k.m.text, bot = h - k.m.text, g = Math.max(1.25, k.m.u * 1.1);
    const sh = (bot - top - g * (count - 1)) / count, lit = v === null ? 0 : Math.round(v * count);
    let off = '', on = '', head = '';
    for (let i = 0; i < count; i++) {
      const y = bot - (i + 1) * sh - i * g, d = roundRectPath(x, y, sw, sh, Math.min(sh / 2, k.m.u * 1.5));
      if (i < lit - 1) on += d; else if (i === lit - 1) head += d; else off += d;
    }
    const c = accentOf(k, tone, 0.55);
    k.add(path(off, { fill: k.colors.line, fillOpacity: k.dark ? 0.55 : 0.6 }));
    if (on) k.add(path(on, { fill: c }));
    if (head) k.add(path(head, { fill: lift(k, c, k.dark ? 0.45 : 0.3) }));
    const tx = x + sw + (w - x - sw) / 2, room = w - x - sw - k.m.text;
    k.eyebrow('Memory', { align: 'center', x: tx, maxWidth: room });
    k.value(pctText(v), { x: tx, cy: h * 0.48, maxWidth: room, color: tone === 'idle' || tone === 'off' ? 'ink' : 'tone' });
    const used = sys.memUsed ?? (v !== null && sys.memTotal ? v * sys.memTotal : null);
    k.caption(used === null || used === undefined ? '' : `${gbText(used)}${sys.memTotal ? ` / ${gbText(sys.memTotal)}` : ''} GB`, { x: tx, y: h * 0.74, maxWidth: room, color: 'muted' });
    return k.svg();
  },
};

const gpu = {
  id: 'app-gpu', title: 'GPU Gauge', category: 'System',
  description: 'GPU load on a half gauge that disperses across the Spectrum, with a needle. Live in the plugin where the system source can read the GPU; simulated on the web.',
  tags: ['gpu', 'graphics', 'system', 'monitor', 'gauge', 'needle', 'live'],
  surface: 'key', data: ['gpu'], fps: 4, loop: 12,
  params: { label: { type: 'text', default: 'GPU', maxLength: 10, label: 'Label' }, ...THRESH },
  order: 14,
  render(ctx) {
    const k = surface(ctx);
    const { w, h, params: p } = ctx;
    const v = metricOf(ctx, 'gpu'), tone = toneFor(v, p.warn, p.crit);
    k.background({ tone });
    const m = Math.min(w, h), cx = w / 2, cy = h * 0.6, r = m * 0.36, sw = k.m.ring * 0.85;
    k.add(path(arcPath(cx, cy, r, -90, 90), { fill: 'none', stroke: k.colors.line, strokeWidth: n(sw), strokeLinecap: 'round' }));
    const S = ctx.colors.spectrum || { l: 0.75, c: 0.12 };
    if (v !== null) k.add(spectrumArc({ cx, cy, r, width: sw, from: -90, to: 90, value: v, h0: hueAt(ctx, 'auto', 0.9), h1: hueAt(ctx, 'auto', 0.05), l: S.l, c: S.c + 0.01, segments: big(k) ? 28 : 18 }));
    if (m >= 96) for (let i = 0; i <= 4; i++) { const a = -90 + i * 45; const [x1, y1] = polar(cx, cy, r - sw * 1.1, a), [x2, y2] = polar(cx, cy, r - sw * 1.1 - k.m.u * 3, a); k.add(path(`M${n(x1)} ${n(y1)}L${n(x2)} ${n(y2)}`, { stroke: k.colors.dim, strokeWidth: n(k.m.hair), strokeLinecap: 'round' })); }
    const a = lerp(-90, 90, v ?? 0);
    const [tx, ty] = polar(cx, cy, r - sw * 0.2, a), [l1x, l1y] = polar(cx, cy, k.m.line, a - 90), [l2x, l2y] = polar(cx, cy, k.m.line, a + 90);
    const nc = tone === 'idle' ? whiteOf(k) : k.tone(tone);
    if (v !== null) k.add(path(`M${n(l1x)} ${n(l1y)}L${n(tx)} ${n(ty)}L${n(l2x)} ${n(l2y)}Z`, { fill: nc }) + circle({ cx, cy, r: k.m.bold * 0.8, fill: nc }) + circle({ cx, cy, r: k.m.line * 0.7, fill: k.colors.surface2 }));
    k.eyebrow(p.label, { color: 'muted' });
    k.value(pctText(v), { cy: h * 0.82, size: k.m.u * 15, maxWidth: w - k.m.text * 2, color: tone === 'idle' || tone === 'off' ? 'ink' : 'tone' });
    return k.svg();
  },
};

const net = {
  id: 'app-net', title: 'Network', category: 'System',
  description: 'Network traffic: download as a glowing area, upload as a line, with the rates in bytes per second. Live in the plugin (system source); simulated on the web.',
  tags: ['network', 'bandwidth', 'download', 'upload', 'system', 'monitor', 'live'],
  surface: 'key', data: ['net'], fps: 4, loop: 12,
  params: { bits: { type: 'bool', default: false, label: 'Show bits per second' } },
  order: 15,
  render(ctx) {
    const k = surface(ctx);
    const { w, h, params: p } = ctx;
    const r = netOf(ctx);
    k.background({ tone: r ? 'idle' : 'off' });
    if (r) {
      const d = seriesOf(ctx, 'down', 30, 1), u = seriesOf(ctx, 'up', 30, 1);
      const box = { x: k.m.bleed, y: h * 0.42, w: w - k.m.bleed * 2, h: h * 0.28 };
      area(k, d.values, { ...box, shift: ctx.reduced ? 0 : d.frac, color: colorAt(ctx, 'auto', 0.8), name: 'down' });
      const ud = sparkPath(u.values.map((x) => x * 0.8), { ...box, shift: ctx.reduced ? 0 : u.frac });
      if (ud) k.add(path(ud, { fill: 'none', stroke: colorAt(ctx, 'auto', 0.05), strokeWidth: n(Math.max(1.25, k.m.line * 0.85)), strokeLinecap: 'round', strokeLinejoin: 'round', strokeOpacity: 0.9 }));
    }
    const short = (b) => rateText(b, { bits: p.bits }).replace('/s', '').replace(' ', '');
    const vs = k.m.u * (big(k) ? 12.5 : 12);
    k.value(r ? `↓${short(r.down)}` : '—', { cy: h * 0.26, size: vs, maxWidth: w - k.m.text * 2 });
    k.caption(r ? `↑ ${rateText(r.up, { bits: p.bits })}` : 'no network data', { y: h - k.m.u * 11.5, maxWidth: w - k.m.text * 2, color: 'muted' });
    return k.svg();
  },
};

const disk = {
  id: 'app-disk', title: 'Disk', category: 'System',
  description: 'Disk space used as a donut with the free space underneath; a glint while the disk is busy. Live in the plugin (system source); simulated on the web.',
  tags: ['disk', 'storage', 'ssd', 'space', 'system', 'monitor', 'live'],
  surface: 'key', data: ['disk'], fps: 4, loop: 12,
  params: { ...THRESH, warn: { ...THRESH.warn, default: 0.85 }, crit: { ...THRESH.crit, default: 0.95 } },
  order: 16,
  render(ctx) {
    const k = surface(ctx);
    const { w, h, t, params: p } = ctx;
    const v = metricOf(ctx, 'disk'), tone = toneFor(v, p.warn, p.crit);
    k.background({ tone });
    const sys = sysOf(ctx);
    const m = Math.min(w, h), cx = w / 2, cy = h * 0.44, r = m * 0.28, sw = k.m.ring * 1.1;
    const c = accentOf(k, tone, 0.45);
    k.add(circle({ cx, cy, r, fill: 'none', stroke: k.colors.line, strokeWidth: n(sw) }));
    if (v !== null && v > 0.005) k.add(path(arcPath(cx, cy, r, 0, 360 * v), { fill: 'none', stroke: c, strokeWidth: n(sw), strokeLinecap: 'butt' }));
    const io = (sys.diskRead || 0) + (sys.diskWrite || 0);
    const busy = clamp(Math.log10(1 + io / 1e5) / 3.5);
    if (v !== null && busy > 0.05 && !ctx.reduced) { const [gx, gy] = polar(cx, cy, r, (t * 220) % 360); k.add(glowDot(k, { cx: gx, cy: gy, r: sw * 0.42, color: whiteOf(k), opacity: 0.35 + 0.65 * busy })); }
    k.value(pctText(v), { cy, size: k.m.u * (big(k) ? 13 : 12.5), maxWidth: r * 1.6, color: tone === 'idle' || tone === 'off' ? 'ink' : 'tone' });
    k.caption(Number.isFinite(sys.diskFree) ? `${bytesText(sys.diskFree)} free` : 'Disk', { y: h - k.m.u * 11.5, maxWidth: w - k.m.text * 2, color: 'muted' });
    return k.svg();
  },
};

const DIAL_METRICS = ['cpu', 'mem', 'gpu', 'disk', 'net'];
const DIAL_LABEL = { cpu: 'CPU', mem: 'Memory', gpu: 'GPU', disk: 'Disk', net: 'Network' };

const systemDial = {
  id: 'app-system-dial', title: 'System Dial', category: 'System',
  description: 'One + dial segment for CPU, memory, GPU, disk or network: an arc, the value and its history. Live in the plugin (system source); simulated on the web.',
  tags: ['system', 'monitor', 'dial', 'strip', 'stream deck +', 'cpu', 'memory', 'gpu', 'network', 'live'],
  surface: 'strip', segments: 1,
  data: ['cpu', 'mem', 'gpu', 'disk', 'net'], fps: 4, loop: 12,
  params: { metric: { type: 'select', default: 'cpu', options: DIAL_METRICS, label: 'Metric' }, ...THRESH },
  order: 17,
  render(ctx) {
    const s = surface(ctx);
    const { w, h, params: p } = ctx;
    const key = p.metric;
    const r = key === 'net' ? netOf(ctx) : null;
    const v = key === 'net' ? (r ? clamp(seriesOf(ctx, 'down', 2, 1).values.at(-1)) : null) : metricOf(ctx, key);
    const tone = key === 'net' ? (r ? 'idle' : 'off') : toneFor(v, p.warn, p.crit);
    s.background({ tone });
    const cx = 46, cy = 54, rr = 30, sw = 6;
    s.add(path(arcPath(cx, cy, rr, -135, 135), { fill: 'none', stroke: s.colors.line, strokeWidth: sw, strokeLinecap: 'round' }));
    const c = tone === 'idle' ? colorAt(ctx, 'auto', 0.6) : s.tone(tone);
    if (v !== null && v > 0.004) s.add(path(arcPath(cx, cy, rr, -135, lerp(-135, 135, v)), { fill: 'none', stroke: c, strokeWidth: sw, strokeLinecap: 'round' }));
    const txt = key === 'net' ? (r ? rateText(r.down).replace('/s', '') : '—') : pctText(v);
    s.value(txt, { x: cx, cy, size: key === 'net' ? 13 : 17, maxWidth: rr * 1.55 });
    s.eyebrow(DIAL_LABEL[key], { align: 'left', x: 92, y: 22, size: 10 });
    if (v !== null) {
      const ser = seriesOf(ctx, key === 'net' ? 'down' : key === 'disk' ? 'read' : key, 24, 1);
      area(s, ser.values, { x: 92, y: 34, w: w - 92 - 10, h: 44, shift: ctx.reduced ? 0 : ser.frac, color: c });
    }
    s.caption(key === 'net' && r ? `↑ ${rateText(r.up)}` : key === 'disk' ? 'read activity' : '', { align: 'left', x: 92, y: h - 9, size: 9.5, color: 'muted' });
    return s.svg();
  },
};

export default [cpuGraph, cpuCores, mem, gpu, net, disk, systemDial];
