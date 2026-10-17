// strip-eq — a parametric EQ across the whole touch strip (800 × 100 on Stream Deck +:
// 4 bands; 1200 × 100 on + XL: 6 bands). Each band's node sits right above its dial:
// turn a dial and its node rises or falls (±12 dB, 0.5 dB a detent) and the curve
// reshapes around it; the post-EQ spectrum moves behind it at ≤ 4 fps (live `spectrum`
// data when fed). Push or tap any dial for bypass: the curve relaxes flat and the light
// leaves it. Everything is drawn per 200 px segment, so the slices that didn't change
// stay byte-identical.

import { surface, path, rect, linearGradient, url, n, P } from '../../scene/index.js';
import { clamp, lerp, arrive } from '../../scene/easing.js';
import { arrival, ramp } from './_d4-dial.js';

const SEG = 200, Y0 = 53, RANGE = 22, SIGMA = 88, FLOOR = 80;
const NAMES = { 4: ['Low', 'Lo mid', 'Hi mid', 'High'], 6: ['Sub', 'Low', 'Lo mid', 'Hi mid', 'High', 'Air'] };
const hz = (f) => (f < 1000 ? `${Math.round(f)} Hz` : `${(f / 1000).toFixed(f < 9950 ? 1 : 0)}k`);

export default {
  id: 'strip-eq',
  title: 'EQ Strip',
  category: 'Strip Panoramas',
  description: 'A parametric EQ across the whole strip: each band node sits above its dial, turn to boost or cut, the curve reshapes and the spectrum moves behind it. Push for bypass.',
  tags: ['eq', 'equalizer', 'parametric', 'audio', 'mix', 'strip', 'touch strip', 'panorama', 'spectrum', 'bands'],
  surface: 'strip',
  segments: 'all',
  data: ['spectrum'],
  fps: 4,
  loop: 8,
  states: ['on', 'bypass'],
  tones: { on: 'active', bypass: 'idle' },
  press: 'toggle',
  params: {
    labels: { type: 'text', default: '', label: 'Band names (comma separated; blank = automatic)', maxLength: 60 },
    step: { type: 'number', default: 0.02083, min: 0.005, max: 0.1, step: 0.005, label: 'Step per detent' },
    analyzer: { type: 'bool', default: true, label: 'Spectrum behind the curve' },
    hue: { type: 'hue', default: 191.3, min: 0, max: 360, label: 'Hue' },
  },
  order: 20,
  render(ctx) {
    const k = surface(ctx);
    const { w, h } = ctx;
    const C = k.colors, s = k.m.safe;
    const count = Math.round(w / SEG);
    const bypass = ctx.stateName === 'bypass';
    const e = arrival(ctx, 0.6), drain = bypass ? arrive(ctx.since, 0.45) : 0;
    const amt = bypass ? 1 - drain : e;                            // how much of the EQ is applied
    k.background({ tone: bypass ? 'idle' : 'active' });
    const custom = String(ctx.params.labels).split(',').map((x) => x.trim()).filter(Boolean);
    const names = Array.from({ length: count }, (_, i) => custom[i] || (NAMES[count] || [])[i] || `Band ${i + 1}`);
    const gains = Array.from({ length: count }, (_, i) => ((ctx.values[i] ?? 0.5) - 0.5) * 24);          // dB
    const bx = (i) => i * SEG + SEG / 2;
    const freq = (x) => 20 * 1000 ** (x / w);
    const curve = (x) => { let g = 0; for (let i = 0; i < count; i++) g += gains[i] * Math.exp(-(((x - bx(i)) / SIGMA) ** 2)); return clamp(g * amt, -12, 12); };
    const yOf = (g) => Y0 - (g / 12) * RANGE;
    const bands = ctx.data?.spectrum?.bands;
    const ink = k.dark ? '#ffffff' : C.ink;
    for (let i = 0; i < count; i++) {
      const xa = i * SEG, xb = xa + SEG;
      // grid: the 0 dB line, ±6 dB marks, decade lines that fall in this segment
      k.add(rect({ x: xa + (i ? 0 : s), y: Y0 - 0.5, width: SEG - (i ? 0 : s) - (i === count - 1 ? s : 0), height: 1, fill: C.line }));
      const grid = P();
      for (const g of [-6, 6]) for (let x = xa + (i ? 3 : s); x < xb - (i === count - 1 ? s : 0); x += 6) grid.M(x, yOf(g)).H(x + 2);
      for (const f of [100, 1000, 10000]) { const x = (Math.log10(f / 20) / 3) * w; if (x >= xa && x < xb) { grid.M(x, Y0 - RANGE - 1).V(FLOOR); k.caption(f >= 1000 ? `${f / 1000}k` : String(f), { x: x + 2.5, y: FLOOR - 2, align: 'left', color: 'dim', size: 9.5 }); } }
      k.add(path(grid.d, { fill: 'none', stroke: C.line, strokeWidth: 1, strokeOpacity: 0.85 }));
      if (i) {
        const did = k.id(`div${i}`);
        k.def(linearGradient(did, [[0, C.ink, 0], [0.5, C.ink, 0.22], [1, C.ink, 0]]));
        k.add(rect({ x: xa - 0.5, y: h * 0.1, width: 1, height: h * 0.8, fill: url(did) }));
      }
      // post-EQ spectrum (behind the curve)
      if (ctx.params.analyzer) {
        const BARS = 12, pitch = SEG / BARS, bw = pitch * 0.62;
        let d = '';
        for (let j = 0; j < BARS; j++) {
          const x = xa + j * pitch + (pitch - bw) / 2, fx = (x + bw / 2) / w;
          if (x < s || x + bw > w - s) continue;
          const base = bands?.length ? bands[Math.min(bands.length - 1, Math.floor(fx * bands.length))] : clamp(0.62 - 0.32 * fx + 0.3 * ctx.noise.n2(fx * 9, (ctx.reduced ? 1 : ctx.t) * 1.7));
          const lv = clamp(base + (curve(x + bw / 2) / 12) * 0.28);
          const bh = Math.max(1, lv * 40);
          d += `M${n(x)} ${n(FLOOR - bh)}h${n(bw)}V${FLOOR}h${n(-bw)}Z`;
        }
        if (d) k.add(path(d, { fill: bypass ? C.dim : ctx.tint, fillOpacity: k.dark ? 0.16 : 0.13 }));
      }
      // the curve over this segment, filled to 0 dB, stroked in the Spectrum
      const pts = [];
      for (let x = xa; x <= xb + 0.01; x += 5) pts.push([x, yOf(curve(x))]);
      const line = P().M(...pts[0]);
      for (const p of pts.slice(1)) line.L(...p);
      const gid = k.id(`eq${i}`);
      k.def(linearGradient(gid, [[0, ramp(ctx, xa / w, 150)], [1, ramp(ctx, xb / w, 150)]], { x1: xa, y1: 0, x2: xb, y2: 0, gradientUnits: 'userSpaceOnUse' }));
      k.add(path(`${line.d}L${n(xb)} ${n(Y0)}L${n(xa)} ${n(Y0)}Z`, { fill: bypass ? C.dim : url(gid), fillOpacity: 0.16 }));
      k.add(path(line.d, { fill: 'none', stroke: bypass ? C.dim : url(gid), strokeWidth: 2.4, strokeLinejoin: 'round', strokeOpacity: bypass ? n(lerp(1, 0.7, drain), 3) : null }));
      // the band's node, right above its dial
      const nx = bx(i), ny = yOf(curve(nx)), nc = bypass ? C.dim : ramp(ctx, nx / w, 150);
      k.add(`<circle cx="${n(nx)}" cy="${n(ny)}" r="6.4" fill="${C.surface2}" stroke="${nc}" stroke-width="2.2"/>`);
      k.add(`<circle cx="${n(nx)}" cy="${n(ny)}" r="2.2" fill="${bypass ? C.dim : ink}"/>`);
      // readouts
      const g = gains[i] * (bypass ? 1 : e);
      k.eyebrow(names[i], { x: xa + s, align: 'left', color: bypass ? 'dim' : 'muted', maxWidth: SEG * 0.5 });
      k.caption(hz(freq(nx)), { x: nx, y: 91, align: 'center', color: bypass ? 'dim' : 'muted', maxWidth: SEG * 0.5 });
      k.eyebrow(`${g >= 0.05 ? '+' : g <= -0.05 ? '–' : ''}${Math.abs(g).toFixed(1)} dB`, { x: xb - s, align: 'right', color: bypass ? 'dim' : 'ink', maxWidth: SEG * 0.45 });
    }
    if (bypass) k.caption('Bypass', { x: w / 2, y: Y0 - RANGE - 1, align: 'center', color: 'muted', opacity: drain });
    return k.svg();
  },
};
