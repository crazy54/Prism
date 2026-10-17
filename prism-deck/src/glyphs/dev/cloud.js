// cloud — a generic cloud (no vendor shape): three bumps on a flat base. online: a check
// draws in inside it. uploading: chevrons rise through it in a stream, fading in and out.
// offline: the cloud goes dim and the strike draws in.
import { defineGlyph } from '../_glyph.js';
import { arrive, smoothstep } from '../../scene/easing.js';
import { partialPolyline, strike } from '../system/_kit.js';
import { n } from '../../scene/svg.js';

// the outline: left bump, main bump, right bump; their bottoms sit on the base y = 35
const CL = [15.5, 28, 7], CM = [24, 21.5, 10.5], CR = [33, 27, 8];
const BASE = 35;

/** Upper intersection of two circles [cx, cy, r]. */
function meet(a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy);
  const l = (a[2] * a[2] - b[2] * b[2] + d * d) / (2 * d), h = Math.sqrt(Math.max(0, a[2] * a[2] - l * l));
  const mx = a[0] + (dx * l) / d, my = a[1] + (dy * l) / d;
  const p1 = [mx + (dy * h) / d, my - (dx * h) / d], p2 = [mx - (dy * h) / d, my + (dx * h) / d];
  return p1[1] < p2[1] ? p1 : p2;
}
/** Clockwise (screen) arc on circle c from point p to point q, as an SVG A command. */
function arcTo(c, p, q) {
  const ang = (pt) => (Math.atan2(pt[1] - c[1], pt[0] - c[0]) * 180) / Math.PI;
  const sweep = (((ang(q) - ang(p)) % 360) + 360) % 360;
  return `A${n(c[2])} ${n(c[2])} 0 ${sweep > 180 ? 1 : 0} 1 ${n(q[0])} ${n(q[1])}`;
}
const LM = meet(CL, CM), MR = meet(CM, CR);
const OUTLINE = `M${n(CL[0])} ${BASE}${arcTo(CL, [CL[0], BASE], LM)}${arcTo(CM, LM, MR)}${arcTo(CR, MR, [CR[0], BASE])}Z`;
const CHECK = [[18.5, 26.5], [22.5, 30.5], [30, 23]];
const LOOP = 1.2;

export default defineGlyph({
  id: 'cloud',
  title: 'Cloud',
  category: 'dev',
  tags: ['cloud', 'upload', 'backup', 'deploy', 'hosting', 'online', 'storage'],
  states: { online: 'active', uploading: 'busy', offline: 'neg' },
  loop: LOOP,
  draw(g, s) {
    const st = s.state;
    g.path(OUTLINE, { role: st === 'offline' ? 'dim' : 'line', join: 'round' });
    if (st === 'offline') { strike(g, s, { from: [10.5, 9.5], to: [37.5, 38.5] }); return; }
    if (st === 'online') {
      const pts = partialPolyline(CHECK, arrive(Math.max(0, s.since - 0.1), 0.4));
      if (pts.length > 1) g.polyline(pts, { role: 'accent', weight: 1.05 });
      return;
    }
    // uploading: two chevrons rising, half a loop apart
    for (const off of [0, 0.5]) {
      const u = (s.phase(LOOP) + off) % 1;
      const y = 30 - u * 11;                       // chevron tip from 30 up to 19
      const fade = smoothstep(0, 0.25, u) * (1 - smoothstep(0.65, 1, u));
      if (fade > 0.02) g.polyline([[19.5, y + 4.5], [24, y], [28.5, y + 4.5]], { role: 'line', opacity: fade });
    }
  },
});
