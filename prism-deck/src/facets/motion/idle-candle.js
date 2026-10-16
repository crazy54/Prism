// idle-candle — a candle burning in a key. A pillar of wax with a soft melt pool and a drip,
// a flame that flickers and leans (never the same twice inside the loop), a warm halo that
// breathes with it. Press and a breath of air bends the flame low, it gutters and recovers.
// For a focus key, a do-not-disturb key, or just company.

import { surface, linearGradient, url, n } from '../../scene/index.js';
import { mix } from '../../scene/color.js';
import { smoothstep, phase } from '../../scene/easing.js';
import { glow, polyD, ellipseD, fillP, strokeP, f1, lineD } from './_d6-living.js';

const LOOP = 6, TAU = Math.PI * 2;

/** The flame as a teardrop polygon: base center (x, y), height H, half-width W, tip lean s. */
function teardrop(x, y, H, W, s) {
  const pts = [];
  const N = 14;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * TAU;
    // a circle at the base pulled up into a point: r shrinks as the angle approaches the tip
    const up = 0.5 - 0.5 * Math.cos(a);               // 0 at the bottom … 1 at the top
    const px = x + Math.sin(a) * W * Math.pow(1 - up, 0.55) + s * up * up;
    const py = y - W * 0.2 - (1 - Math.cos(a)) * 0.5 * H;
    pts.push([px, py]);
  }
  return pts;
}

export default {
  id: 'idle-candle',
  title: 'Candle',
  category: 'Idle Loops',
  description: 'A candle burning in a key: a flickering, leaning flame, a warm halo that breathes with it, a melt pool and a drip. Press and the flame bends low and recovers.',
  tags: ['idle', 'candle', 'flame', 'warm', 'cozy', 'focus', 'calm', 'ambient', 'loop'],
  surface: 'key',
  fps: 8,
  loop: LOOP,
  press: 'momentary',
  params: {
    label: { type: 'text', default: 'Focus', label: 'Label', maxLength: 14 },
    hue: { type: 'hue', default: 42, min: 0, max: 360, step: 1, label: 'Flame hue' },
  },
  order: 60,
  render(ctx) {
    const k = surface(ctx);
    const T = ctx.theme, dark = T.dark;
    k.background({ tone: 'idle' });
    const W = k.w, Hh = k.h, S = Math.min(W, Hh), u = k.m.u;
    const labeled = !!ctx.params.label;
    const t = ctx.reduced ? 2.2 : phase(ctx.t, LOOP) * LOOP;
    // a gust on press: the flame leans hard, shrinks, then recovers
    const age = ctx.pressed ? 0 : ctx.pressAge;
    const gust = age < 1.6 ? (ctx.pressed ? 1 : 1 - smoothstep(0.2, 1.6, age)) : 0;
    // flicker from looped noise (two octaves, whole cycles per loop)
    const a = (t / LOOP) * TAU;
    const fl = 0.5 + 0.28 * Math.sin(a * 3 + 0.7) + 0.16 * Math.sin(a * 7 + 2.1) + 0.06 * Math.sin(a * 13);
    const sway = (Math.sin(a * 2 + 1.1) * 0.6 + Math.sin(a * 5) * 0.4) * S * 0.035;
    // the candle
    const cx = W / 2;
    const bottom = labeled ? Hh - k.m.text - S * 0.2 : Hh - S * 0.08;
    const top = bottom - S * (labeled ? 0.3 : 0.4);
    const cw = S * 0.13;
    const wax = dark ? mix('#f4ead6', ctx.theme.spectral(ctx.params.hue), 0.08) : mix('#fffaf0', ctx.theme.spectral(ctx.params.hue), 0.12);
    const waxShade = mix(wax, dark ? T.colors.bg : T.colors.ink, dark ? 0.45 : 0.32);
    const flameC = T.spectral(ctx.params.hue, { dl: dark ? 0.06 : 0 });
    const hot = mix(flameC, '#fffbe8', 0.7);
    // the halo (breathes with the flicker)
    const fy = top - S * 0.02;
    glow(k, cx, fy - S * 0.1, S * 0.62, flameC, (dark ? 0.75 : 0.55) * (0.75 + 0.25 * fl) * (1 - gust * 0.6), 'halo', [[0, 0.5], [0.3, 0.2], [0.7, 0.05], [1, 0]]);
    // wax pillar with a vertical lit-side gradient, the melt pool and a drip
    const wg = k.id('wax');
    k.def(linearGradient(wg, [[0, waxShade], [0.38, wax], [0.62, wax], [1, waxShade]], { x1: 0, y1: 0, x2: 1, y2: 0 }));
    k.add(`<path d="M${f1(cx - cw)} ${f1(top)}L${f1(cx - cw)} ${f1(bottom)}Q${f1(cx)} ${f1(bottom + S * 0.025)} ${f1(cx + cw)} ${f1(bottom)}L${f1(cx + cw)} ${f1(top)}Z" fill="${url(wg)}"${dark ? '' : ` stroke="${T.colors.ink}" stroke-opacity="0.22" stroke-width="${f1(Math.max(0.8, u * 0.6))}"`}/>`);
    k.add(`<path d="${ellipseD(cx, top, cw, S * 0.025)}" fill="${mix(wax, flameC, 0.35 + 0.25 * fl)}"/>`);
    k.add(`<path d="M${f1(cx + cw * 0.35)} ${f1(top)}q${f1(cw * 0.25)} ${f1(S * 0.02)} ${f1(cw * 0.2)} ${f1(S * 0.09)}a${f1(cw * 0.12)} ${f1(cw * 0.12)} 0 0 1 ${f1(-cw * 0.24)} 0q${f1(-cw * 0.02)} ${f1(-S * 0.05)} ${f1(-cw * 0.2)} ${f1(-S * 0.09)}Z" fill="${wax}"/>`);
    // the wick
    k.add(`<path d="${lineD(cx, top + 0.5, cx + sway * 0.15 + gust * S * 0.02, top - S * 0.04)}" ${strokeP(dark ? '#2a221c' : '#3a2e24', Math.max(1, u * 1.2))}/>`);
    // the flame: outer, inner core, blue root
    const H = S * (0.2 + 0.07 * fl) * (1 - gust * 0.45), Wf = S * 0.052 * (1 + gust * 0.25);
    const lean = sway + gust * S * 0.16;
    const by = top - S * 0.035;
    k.add(`<path d="${polyD(teardrop(cx, by, H, Wf, lean))}" ${fillP(flameC, 0.95)}/>`);
    k.add(`<path d="${polyD(teardrop(cx + lean * 0.05, by - S * 0.004, H * 0.62, Wf * 0.58, lean * 0.7))}" ${fillP(hot, 0.95)}/>`);
    k.add(`<path d="${ellipseD(cx, by - Wf * 0.2, Wf * 0.5, Wf * 0.45)}" ${fillP(dark ? '#7fb2ff' : '#4f7fd9', dark ? 0.55 : 0.4)}/>`);
    // a thread of smoke after the gust
    if (gust > 0.05 && gust < 0.95) {
      let d = `M${f1(cx)} ${f1(top - S * 0.05)}`;
      for (let i = 1; i <= 6; i++) d += `L${f1(cx + Math.sin(i * 1.3 + t * 3) * S * 0.03 + i * S * 0.012)} ${f1(top - S * 0.05 - i * S * 0.05)}`;
      k.add(`<path d="${d}" ${strokeP(dark ? '#cfc8bd' : '#8a8178', Math.max(1, u * 0.9), n(0.5 * Math.sin(Math.PI * gust), 2))}/>`);
    }
    if (labeled) k.label(ctx.params.label);
    return k.svg();
  },
};
