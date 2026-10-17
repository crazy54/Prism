// shuffle — two crossing arrows. on: the arrowheads light and sparks run along both
// paths (the order being mixed); turning on, the arrows slide out to their heads.
import { defineGlyph } from '../_glyph.js';
import { arrive, lerp, smoothstep } from '../../scene/easing.js';
import { n } from '../../scene/svg.js';

const DX = 1.5; // optical centering
const Y0 = 15.5, Y1 = 32.5;
// each path: start → H to X0 → cubic → H to X1 (the arrowhead)
const X0 = 13.5 + DX, XC0 = 20.5 + DX, XC1 = 21.5 + DX, XE = 28.5 + DX, X1 = 37 + DX, XS = 8 + DX;

const cubic = (p0, p1, p2, p3, t) => {
  const u = 1 - t;
  return [u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
    u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]];
};
/** Control points of the sub-curve t0..t1 of a cubic (de Casteljau, exact). */
function subCubic(P, t0, t1) {
  const split = (Q, t) => {
    const l = (a, b) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    const a = l(Q[0], Q[1]), b = l(Q[1], Q[2]), c = l(Q[2], Q[3]), d = l(a, b), e = l(b, c), f = l(d, e);
    return [[Q[0], a, d, f], [f, e, c, Q[3]]];
  };
  const right = split(P, t0)[1];
  return split(right, (t1 - t0) / (1 - t0))[0];
}
const ctrl = (ya, yb) => [[X0, ya], [XC0, ya], [XC1, yb], [XE, yb]];
const pt = (p) => `${n(p[0])} ${n(p[1])}`;
const seg = (Q) => `C${pt(Q[1])} ${pt(Q[2])} ${pt(Q[3])}`;

/** Point at u (0..1, roughly by length) along a full shuffle path → [x, y, hidden]; hidden = under the crossing. */
function along(ya, yb, u, under) {
  const L1 = X0 - XS, LC = 27, L2 = X1 - XE, T = L1 + LC + L2;
  const d = u * T;
  if (d < L1) return [XS + d, ya, false];
  if (d < L1 + LC) { const t = (d - L1) / LC; return [...cubic(...ctrl(ya, yb), t), under && t > 0.37 && t < 0.63]; }
  return [XE + (d - L1 - LC), yb, false];
}

export default defineGlyph({
  id: 'shuffle',
  title: 'Shuffle',
  category: 'media',
  tags: ['shuffle', 'random', 'mix', 'playlist', 'media'],
  states: { off: 'idle', on: 'active' },
  loop: 2.4,
  draw(g, s) {
    const on = s.state === 'on';
    const k = arrive(s.since, 0.45);
    // on: the paths step back so the comets running along them read
    const base = { role: 'line', opacity: on ? lerp(1, 0.7, k) : 1 };
    // under path (bottom → top), broken where the other crosses over it
    const B = ctrl(Y1, Y0);
    const b1 = subCubic(B, 0, 0.37), b2 = subCubic(B, 0.63, 1);
    g.path(`M${XS} ${Y1}H${X0}${seg(b1)}`, base);
    g.path(`M${pt(b2[0])}${seg(b2)}H${X1}`, base);
    // over path (top → bottom)
    g.path(`M${XS} ${Y0}H${X0}${seg(ctrl(Y0, Y1))}H${X1}`, base);
    // arrowheads: lit when on, sliding out to the tips as the state arrives
    const push = on ? lerp(-3, 0, k) : 0;
    for (const y of [Y0, Y1]) {
      const x = X1 + push;
      g.polyline([[x - 4.5, y - 4.5], [x, y], [x - 4.5, y + 4.5]], { role: on ? 'accent' : 'line' });
    }
    if (!on) return;
    // comets run along both paths, half a loop apart (hidden where the under path dips below)
    for (const [ya, yb, off, under] of [[Y0, Y1, 0, false], [Y1, Y0, 0.5, true]]) {
      const u = (s.phase(2.4) + off) % 1;
      const fade = smoothstep(0, 0.1, u) * (1 - smoothstep(0.8, 0.95, u)) * k;
      if (fade < 0.02) continue;
      const pts = [];
      for (let j = 0; j <= 6; j++) pts.push(along(ya, yb, Math.max(0, u - 0.2 + (0.2 * j) / 6), under));
      let run = [];
      const flush = () => { if (run.length > 1) g.polyline(run, { role: 'accent', weight: 1.45, opacity: fade }); run = []; };
      for (const p of pts) { if (p[2]) flush(); else run.push([p[0], p[1]]); }
      flush();
      const head = pts[pts.length - 1];
      if (!head[2]) g.dot(head[0], head[1], 2.5, { opacity: fade });
    }
  },
});
