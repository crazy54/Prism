// idle-snowglobe — the key's glyph inside a little snow globe. Once a loop (or whenever you
// press the key) the globe is shaken: the snow lifts off the heap in a swirl, then drifts
// down around the glyph and settles back on the floor of the globe, the heap growing as it
// lands. Glass highlight, a base for the label. On the pixel theme the snow steps on the
// theme's lattice.

import { surface, linearGradient, url } from '../../scene/index.js';
import { mix } from '../../scene/color.js';
import { clamp, smoothstep, outCubic, phase, lerp } from '../../scene/easing.js';
import { hash } from '../../scene/noise.js';
import { glyphId, litState, cellOf, themeBox, dots, dotD, polyD, fillP, strokeP, f1 } from './_d6-living.js';

const LOOP = 8, TAU = Math.PI * 2;

export default {
  id: 'idle-snowglobe',
  title: 'Snow Globe',
  category: 'Idle Loops',
  description: "The key's glyph inside a snow globe: shaken once a loop or on press, the snow swirls up, drifts down around the glyph and settles in a growing heap.",
  tags: ['idle', 'snow', 'globe', 'winter', 'holiday', 'shake', 'press', 'calm', 'loop'],
  surface: 'key',
  fps: 8,
  loop: LOOP,
  press: 'momentary',
  params: {
    glyph: { type: 'glyph', default: 'home', label: 'Glyph' },
    label: { type: 'text', default: 'Home', label: 'Label', maxLength: 14 },
    shake: { type: 'bool', default: true, label: 'Shake once a loop' },
  },
  order: 61,
  render(ctx) {
    const k = surface(ctx);
    const T = ctx.theme, dark = T.dark;
    k.background({ tone: 'idle' });
    const W = k.w, H = k.h, S = Math.min(W, H), u = k.m.u;
    const labeled = !!ctx.params.label;
    const cell = cellOf(k, themeBox(k, labeled));
    // seconds since the last shake: a real press wins, else once a loop (or settled)
    const age = ctx.pressed ? 0 : ctx.pressAge;
    let s = age < LOOP ? age : ctx.params.shake ? phase(ctx.t, LOOP) * LOOP : LOOP;
    if (ctx.reduced) s = 2.6;
    // the globe
    const R = S * (labeled ? 0.29 : 0.36);
    const cx = W / 2, cy = labeled ? H * 0.4 : H * 0.46;
    const glass = dark ? '#ffffff' : T.colors.ink;
    const gid = k.id('glass');
    const tint = ctx.theme.spectral(ctx.hue, { tier: 'wash' });
    k.def(linearGradient(gid, [[0, mix(tint, '#ffffff', 0.4), dark ? 0.16 : 0.32], [1, tint, dark ? 0.06 : 0.14]]));
    k.add(`<path d="${dotD(cx, cy, R)}" fill="${url(gid)}"/>`);
    // the base
    const by = cy + R * 0.82, bw = R * 0.95;
    const baseC = dark ? mix(T.colors.surface, T.colors.ink, 0.12) : mix(T.colors.surface, T.colors.ink, 0.22);
    k.add(`<path d="${polyD([[cx - bw * 0.82, by], [cx + bw * 0.82, by], [cx + bw, by + R * 0.3], [cx - bw, by + R * 0.3]])}" ${fillP(baseC)}/>`);
    // the glyph inside
    const g = ctx.glyphs.get(glyphId(ctx, ctx.params.glyph, 'home'));
    const gs = R * 1.05;
    k.glyph(g.id, { box: { x: cx - gs / 2, y: cy - gs / 2 + R * 0.05, size: gs }, state: litState(g), t: 0, since: 60 });
    // the snow: lifted in a swirl (0–0.7 s), drifting down, landing in the heap
    const N = 28;
    const pts = [];
    let landed = 0;
    const floorY = cy + R * 0.72;
    for (let i = 0; i < N; i++) {
      const rx = cx + (hash(i, 1) - 0.5) * R * 1.1, ry = floorY - hash(i, 2) * R * 0.08;   // resting spot in the heap
      const ang = hash(i, 3) * TAU, rad = R * (0.2 + 0.65 * Math.sqrt(hash(i, 4)));
      const hx = cx + Math.cos(ang) * rad, hy = cy - R * 0.1 + Math.sin(ang) * rad * 0.8;   // where the shake throws it
      const fall = 2.6 + 4.2 * hash(i, 5);                                                    // when it lands
      let x, y;
      if (s < 0.7) {
        const e = outCubic(s / 0.7), sw = (1 - e) * 1.6;
        x = lerp(rx, hx, e) + Math.cos(ang + sw) * R * 0.1 * (1 - e); y = lerp(ry, hy, e);
      } else if (s < fall) {
        const f = (s - 0.7) / (fall - 0.7);
        x = lerp(hx, rx, f) + Math.sin(f * 7 + i) * R * 0.08 * (1 - f); y = lerp(hy, ry, smoothstep(0, 1, f));
      } else { x = rx; y = ry; landed++; continue; }
      // keep it inside the glass
      const dx = x - cx, dy = y - cy, dl = Math.hypot(dx, dy), lim = R * 0.9;
      if (dl > lim) { x = cx + (dx / dl) * lim; y = cy + (dy / dl) * lim; }
      pts.push([x, y, Math.max(0.8, S * (0.012 + 0.008 * hash(i, 6)))]);
    }
    // the heap grows with what has landed
    const heap = clamp(0.25 + 0.75 * (landed / N));
    const snowC = dark ? '#ffffff' : mix('#ffffff', T.colors.surface, 0.15);
    const hw = R * 0.66, hh = R * 0.16 * heap;
    k.add(`<path d="M${f1(cx - hw)} ${f1(floorY + R * 0.04)}Q${f1(cx - hw * 0.4)} ${f1(floorY - hh * 1.6)} ${f1(cx)} ${f1(floorY - hh)}Q${f1(cx + hw * 0.5)} ${f1(floorY - hh * 1.4)} ${f1(cx + hw)} ${f1(floorY + R * 0.04)}Z" ${fillP(snowC, dark ? 0.95 : 1)}${dark ? '' : ` stroke="${T.colors.ink}" stroke-opacity="0.18" stroke-width="${f1(Math.max(0.6, u * 0.5))}"`}/>`);
    dots(k, pts, dark ? fillP(snowC, 0.95) : `${fillP(snowC)} stroke="${T.colors.ink}" stroke-opacity="0.35" stroke-width="${f1(Math.max(0.5, u * 0.35))}"`, cell);
    // the glass rim and its highlight
    k.add(`<path d="${dotD(cx, cy, R)}" ${strokeP(glass, Math.max(1, k.m.line), dark ? 0.55 : 0.45)}/>`);
    const ha = -2.3, hb = -1.4;
    k.add(`<path d="M${f1(cx + Math.cos(ha) * R * 0.8)} ${f1(cy + Math.sin(ha) * R * 0.8)}A${f1(R * 0.8)} ${f1(R * 0.8)} 0 0 1 ${f1(cx + Math.cos(hb) * R * 0.8)} ${f1(cy + Math.sin(hb) * R * 0.8)}" ${strokeP('#ffffff', Math.max(1.2, k.m.line * 1.4), dark ? 0.55 : 0.85)}/>`);
    if (labeled) k.label(ctx.params.label);
    return k.svg();
  },
};
