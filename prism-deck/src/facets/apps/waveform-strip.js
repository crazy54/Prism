// app-waveform-strip — live audio flowing along the Stream Deck + (or + XL) touch strip: one
// continuous mirrored waveform across every dial segment (the strip is one LCD, so no gaps), a
// lifted core, second marks along the top like a tape counter, and the level in dB at the head.
// Each dial's 200 × 100 segment is drawn as its own sub-surface, so per-slice culling keeps them small.

import { surface, path, rect, n } from '../../scene/index.js';
import { audioOf } from './_data.js';
import { colorAt, lift, whiteOf, bandPath, smoothLine, PALETTE_OPTIONS, clamp } from './_kit.js';
import { expand } from './waveform.js';
import { panelInto } from '../screens/_d5-kit.js';

export default {
  id: 'app-waveform-strip',
  title: 'Waveform Strip',
  category: 'Audio',
  description: 'Audio flowing along the Stream Deck + touch strip as one waveform across every dial, the level in dB at the head. Live from sound capture in the plugin; simulated until one runs.',
  tags: ['audio', 'waveform', 'strip', 'stream deck +', 'live', 'level', 'oscilloscope'],
  surface: 'strip',
  segments: 'all',
  data: ['audio'],
  fps: 15,
  loop: 16,
  params: {
    seconds: { type: 'number', default: 5, min: 2, max: 15, step: 0.5, label: 'Seconds on the strip' },
    palette: { type: 'select', default: 'auto', options: PALETTE_OPTIONS, label: 'Palette' },
    gain: { type: 'number', default: 1, min: 0.3, max: 2, step: 0.05, label: 'Gain' },
  },
  order: 15,
  render(ctx) {
    const s = surface(ctx);
    const { w, h, params: p } = ctx;
    const segs = ctx.strip.segments, sw = w / segs;
    const seconds = p.seconds * (w / 800);
    const A = audioOf(ctx, { count: Math.ceil(seconds * 30) + 4, rate: 30 });
    const pps = w / seconds, N = A.levels.length;
    const mid = h * 0.56, amp = h * 0.36, step = 3;
    const lv = (x) => {
      const idx = N - 1 - (((w - x) / pps) * A.rate - (A.frac || 0));
      if (idx < -0.5) return 0;
      const c = clamp(idx, 0, N - 1), i = Math.floor(c), f = c - i;
      return clamp((A.levels[i] + ((A.levels[Math.min(N - 1, i + 1)] ?? A.levels[i]) - A.levels[i]) * f) * p.gain);
    };
    s.add(rect({ width: w, height: h, fill: '#000000' }));
    const dark = s.dark;
    const stops = (op, k) => Array.from({ length: 7 }, (_, i) => { const f = i / 6; const c = colorAt(ctx, p.palette, 0.1 + 0.9 * f); return `<stop offset="${n(f, 3)}" stop-color="${k ? lift(s, c, k) : c}" stop-opacity="${n(op(f), 3)}"/>`; }).join('');
    const ramp = (f) => 0.15 + 0.85 * f ** 1.3;
    const gid = (name, op, k) => { const id = s.id(name); s.def(`<linearGradient id="${id}" x1="0" y1="0" x2="${n(w)}" y2="0" gradientUnits="userSpaceOnUse">${stops(op, k)}</linearGradient>`); return `url(#${id})`; };
    const body = gid('body', (f) => (dark ? 0.6 : 0.5) * ramp(f)), core = gid('core', (f) => 0.85 * ramp(f), dark ? 0.5 : 0.35), edge = gid('edge', (f) => 0.3 + 0.7 * ramp(f));
    for (let i = 0; i < segs; i++) {
      const X = i * sw;
      panelInto(s, { x: X, y: 0, w: sw, h }, (q) => {
        q.background({ tone: 'idle' });
        const oT = [], oB = [], iT = [], iB = [];
        for (let x = -step; x <= sw + step; x += step) {
          const v = lv(X + x), a = amp * (0.03 + 0.97 * expand(v) ** 1.1), c = a * (0.34 + 0.26 * expand(v));
          oT.push([x, mid - a]); oB.push([x, mid + a]); iT.push([x, mid - c]); iB.push([x, mid + c]);
        }
        // gradients are in strip space: shift them into this segment
        q.add(`<g transform="translate(${n(-X)} 0)">${[
          path(bandPath(oT.map(([x, y]) => [x + X, y]), oB.map(([x, y]) => [x + X, y])), { fill: body }),
          path(bandPath(iT.map(([x, y]) => [x + X, y]), iB.map(([x, y]) => [x + X, y])), { fill: core }),
          path(smoothLine(oT.map(([x, y]) => [x + X, y])) + smoothLine(oB.map(([x, y]) => [x + X, y])), { fill: 'none', stroke: edge, strokeWidth: 1.25, strokeLinejoin: 'round' }),
        ].join('')}</g>`);
        q.add(rect({ x: 0, y: mid - 0.5, width: sw, height: 1, fill: q.colors.beam || whiteOf(q), fillOpacity: dark ? 0.22 : 0.3 }));
        // second marks: a tape counter running back from the head
        for (let k = 1; k <= Math.ceil(seconds); k++) {
          const x = w - k * pps - X;
          if (x < 4 || x > sw - 4) continue;
          q.add(rect({ x: x - 0.5, y: 8, width: 1, height: 6, fill: q.colors.muted, fillOpacity: 0.7 }));
          if (x > 18 && x < sw - 18) q.caption(`${k}s`, { x: x + 4, y: 16, align: 'left', size: 9, color: 'dim' });
        }
        if (i === segs - 1) {
          const db = A.level > 0 ? Math.round((1 - A.level) * -60) : null;
          q.caption(db === null ? 'silent' : `${db} dB`, { align: 'right', x: sw - 10, y: 16, size: 10, color: A.live ? 'ink' : 'muted' });
          const hx = sw - 6, ha = Math.max(3, amp * (0.03 + 0.97 * expand(lv(w - 6)) ** 1.1));
          q.add(path(`M${n(hx)} ${n(mid - ha)}L${n(hx)} ${n(mid + ha)}`, { stroke: whiteOf(q), strokeWidth: 1.5, strokeOpacity: 0.9, strokeLinecap: 'round' }));
        }
      }, { kind: 'strip', tag: `s${i}` });
    }
    return s.svg();
  },
};
