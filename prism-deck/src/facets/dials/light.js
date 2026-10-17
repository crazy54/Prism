// dial-light — a key light / desk lamp on one encoder (200 × 100; on the Galleon the same art fills a
// 2:1 widget). Turn for brightness: the panel's glow and the percent follow every detent, and the
// light takes the color temperature you set (warm 2700 K … cool 7000 K, drawn from a blackbody
// approximation). Push to switch it off and on. Static between turns.

import { surface, rect, path, n, P, linearGradient, radialGradient, url } from '../../scene/index.js';
import { clamp, lerp, outExpo } from '../../scene/easing.js';
import { mix, oklch, hexToOklch } from '../../scene/color.js';
import { finish, arrival } from './_d4-dial.js';
import { text, kelvinHex } from '../apps/_d7-kit.js';

export default {
  id: 'dial-light',
  title: 'Key Light',
  category: 'Dial Segments',
  description: 'A key light on one dial: turn for brightness and the panel glows brighter in its own color temperature; push to switch it off and on.',
  tags: ['light', 'lamp', 'key light', 'brightness', 'color temperature', 'kelvin', 'home', 'stream', 'dial'],
  surface: 'strip',
  segments: 1,
  fps: 10,
  loop: 4,
  states: ['on', 'off'],
  tones: { on: 'idle', off: 'off' },
  press: 'toggle',
  params: {
    label: { type: 'text', default: 'Key light', maxLength: 12, label: 'Light' },
    kelvin: { type: 'number', default: 4600, min: 2700, max: 7000, step: 100, label: 'Color temperature (K)' },
    value: { type: 'number', default: 0.6, min: 0, max: 1, step: 0.01, label: 'Brightness' },
    step: { type: 'number', default: 0.02, min: 0.01, max: 0.1, step: 0.01, label: 'Step per detent' },
  },
  order: 40,
  render(ctx) {
    const k = surface(ctx);
    const { w, h } = ctx;
    const C = k.colors;
    const on = ctx.stateName !== 'off';
    const v = clamp(ctx.value);
    const e = arrival(ctx, 0.5);
    k.background({ tone: on ? 'idle' : 'off' });
    const kel = ctx.params.kelvin;
    const raw = kelvinHex(kel);
    // keep the lamp color legible in this theme: the blackbody hue at the theme's light
    const [, cRaw, hRaw] = hexToOklch(raw);
    const lamp = oklch(k.dark ? 0.86 : 0.7, Math.max(0.04, cRaw * (k.dark ? 0.9 : 1.2)), hRaw);
    const lit = on ? v * e : 0;
    const s = k.m.safe;
    // the panel: a diffuser in a frame, its glow behind (a radial wash), a few rays below
    const px = s + 3, py = 25, pw = 68, ph = 44;
    const gid = k.id('glow');
    k.def(radialGradient(gid, [[0, lamp, 0.55 * lit], [0.5, lamp, 0.18 * lit], [1, lamp, 0]], { cx: 0.5, cy: 0.5, r: 0.5 }));
    if (lit > 0.01) k.add(rect({ x: n(px - 26), y: n(py - 22), width: n(pw + 52), height: n(ph + 50), fill: url(gid) }));
    const did = k.id('diff');
    const face = on ? mix(k.dark ? '#1a1d26' : C.surface2, lamp, 0.25 + 0.75 * lit) : mix(C.surface2, C.line, 0.4);
    k.def(linearGradient(did, [[0, mix(face, '#ffffff', on ? 0.35 * lit : 0)], [1, face]], { x1: 0, y1: 0, x2: 0, y2: 1 }));
    k.add(rect({ x: px, y: py, width: pw, height: ph, rx: 6, fill: k.dark ? '#0b0c10' : C.line, stroke: C.line, strokeWidth: 1.2 }));
    k.add(rect({ x: px + 3.5, y: py + 3.5, width: pw - 7, height: ph - 7, rx: 3.5, fill: url(did) }));
    // the LED grid on the diffuser (one path)
    let dots = '';
    for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) { const x = px + 9.5 + c * 9.8, y = py + 11.5 + r * 10.5; dots += `M${n(x + 1.3)} ${n(y)}A1.3 1.3 0 1 1 ${n(x - 1.3)} ${n(y)}A1.3 1.3 0 1 1 ${n(x + 1.3)} ${n(y)}Z`; }
    k.add(path(dots, { fill: on ? mix(lamp, '#ffffff', 0.6) : C.dim, fillOpacity: n(on ? 0.35 + 0.65 * lit : 0.5, 3) }));
    // stand
    k.add(path(P().M(px + pw / 2, py + ph).V(py + ph + 9).M(px + pw / 2 - 9, py + ph + 9).H(px + pw / 2 + 9).d, { stroke: C.dim, strokeWidth: 2, strokeLinecap: 'round' }));
    // readout: the percent, the temperature, a beam with detent ticks
    const rx0 = px + pw + 14, rx1 = w - s;
    k.eyebrow(on ? ctx.params.label : `${ctx.params.label} · off`, { x: s, color: on ? 'muted' : 'dim', maxWidth: w - s * 2 });
    const turning = Number.isFinite(ctx.turnAge) && ctx.turnAge < 0.6 && on;
    text(k, on ? `${Math.round(v * 100)}%` : 'Off', { x: rx1, cy: 47, size: turning ? 31 : 29, weight: 700, tabular: true, anchor: 'end', color: on ? 'ink' : 'muted', maxWidth: rx1 - rx0 });
    text(k, `${kel} K`, { x: rx1, y: 74, size: 11, weight: 600, anchor: 'end', tabular: true, color: on ? 'muted' : 'dim' });
    const by = 84, bw = rx1 - rx0, bh = 3.2;
    const bid = k.id('beam');
    k.def(linearGradient(bid, [[0, mix(lamp, C.surface2, 0.6)], [1, lamp]], { x1: n(rx0), y1: 0, x2: n(rx1), y2: 0, gradientUnits: 'userSpaceOnUse' }));
    k.add(rect({ x: n(rx0), y: by, width: n(bw), height: bh, rx: bh / 2, fill: C.line }));
    if (on && v > 0.004) {
      k.add(rect({ x: n(rx0), y: by, width: n(Math.max(bh, bw * v * e)), height: bh, rx: bh / 2, fill: url(bid) }));
      const hx = rx0 + bw * v * e;
      k.add(rect({ x: n(hx - 1), y: by - (turning ? 4 : 2.5), width: 2, height: bh + (turning ? 8 : 5), rx: 1, fill: k.dark ? '#ffffff' : C.ink }));
    }
    void lerp; void outExpo;
    return finish(k);
  },
};
