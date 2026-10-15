// battery — a cell with its charge as a fill by level. normal: the charge pours in on
// arrival. charging: a bolt sits in a window cut into the charge (so it reads even where
// a theme paints every role in one color) and a wave of light runs through the charge.
// low: the charge drops to a sliver that blinks.
import { defineGlyph } from '../_glyph.js';
import { arrive, clamp, lerp, pulse, smoothstep } from '../../scene/easing.js';
import { rectAround } from './_kit.js';

const X0 = 10, W = 24, Y0 = 17, H = 14;     // the charge's box inside the cell
// the bolt, row-convex so the window can follow it
const BOLT = [[24.85, 16], [16.3, 25.37], [21.54, 25.37], [19.15, 32], [27.7, 22.63], [22.46, 22.63]];
const LOOP = 1.6;

export default defineGlyph({
  id: 'battery',
  title: 'Battery',
  category: 'system',
  tags: ['battery', 'charge', 'charging', 'power', 'level', 'low'],
  states: { normal: 'active', charging: 'ok', low: 'warn' },
  loop: LOOP,
  draw(g, s) {
    g.rect(6.5, 13.5, 31, 21, { r: 5 });
    g.line(40.5, 20, 40.5, 28, { weight: 1.1 });
    const st = s.state;
    if (st === 'low') {
      const lv = Math.min(clamp(s.level), 0.16);
      const w = Math.max(2.2, W * lv);
      g.rect(X0, Y0, w, H, { r: 1.5, role: 'accent', fill: true, opacity: 0.3 + 0.7 * pulse(s.t, LOOP / 2) }); // blinks twice per loop
      return;
    }
    if (st === 'charging') {
      const lv = clamp(s.level);
      const xe = X0 + W * lv;
      for (const d of rectAround(X0, xe, Y0, Y0 + H, BOLT, 1.4)) g.path(d, { role: 'accent', fill: true, opacity: 0.5 });
      // a wave of light runs through the charge, left → right, once per loop
      const p = s.phase(LOOP);
      const c = lerp(X0 - 4, xe + 4, p), half = 3.5;
      const a = Math.max(X0, c - half), b = Math.min(xe, c + half);
      const fade = smoothstep(0, 0.15, p) * (1 - smoothstep(0.85, 1, p));
      if (b - a > 0.2 && fade > 0.01) for (const d of rectAround(a, b, Y0, Y0 + H, BOLT, 1.4)) g.path(d, { role: 'accent', fill: true, opacity: 0.5 * fade });
      const k = arrive(s.since, 0.36);
      g.polygon(BOLT.map(([x, y]) => [x, y - 2.5 * (1 - k)]), { role: 'fill', join: 'round', opacity: k });
      return;
    }
    // normal: the charge pours in
    const w = W * clamp(s.level) * arrive(s.since, 0.6);
    if (w > 0.3) g.rect(X0, Y0, w, H, { r: Math.min(1.5, w / 2), role: 'accent', fill: true });
  },
});
