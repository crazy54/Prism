// wifi — a fan of three waves over a base dot. connected: 1–3 waves light by signal
// level (the rest stay as faint ghosts), drawing out from the dot on arrival, and the
// outermost lit wave breathes. searching: a ripple runs dot → outer wave and repeats.
// off: everything goes quiet and the strike draws in.
import { defineGlyph } from '../_glyph.js';
import { arrive, clamp, pulse } from '../../scene/easing.js';
import { bump, strike } from './_kit.js';

const CX = 24, CY = 34.5;          // the waves' common center (the base dot)
const R = [8, 15, 22];             // wave radii: 12.5 … 37.1 high, 7.8 … 40.2 wide
const HALF = [44, 46, 47.5];       // half-angle of each wave (deg)
const LOOP = 2.4;

export default defineGlyph({
  id: 'wifi',
  title: 'Wi-Fi',
  category: 'system',
  tags: ['wifi', 'wireless', 'signal', 'network', 'connection', 'strength'],
  states: { connected: 'active', searching: 'busy', off: 'off' },
  loop: LOOP,
  draw(g, s) {
    const st = s.state;
    if (st === 'off') {
      R.forEach((r, i) => g.arc(CX, CY, r, -HALF[i], HALF[i], { role: 'dim', opacity: 0.55 }));
      g.circle(CX, CY, 2.6, { role: 'dim', fill: true, opacity: 0.55 });
      strike(g, s, { from: [11.5, 11.5], to: [36.5, 36.5] });
      return;
    }
    if (st === 'searching') {
      // one ripple per 1.2 s: dot (0) → waves 1 … 3, wrapping back to the dot
      const w = (s.phase(1.2) * 4) % 4;
      R.forEach((r, i) => {
        const hot = Math.max(bump(w, i + 1, 1.1), bump(w + 4, i + 1, 1.1));
        g.arc(CX, CY, r, -HALF[i], HALF[i], { role: 'dim', opacity: 0.4 });
        if (hot > 0.02) g.arc(CX, CY, r, -HALF[i], HALF[i], { role: 'line', opacity: hot });
      });
      const dot = Math.max(bump(w, 0, 1.1), bump(w, 4, 1.1));
      g.circle(CX, CY, 2.6, { role: 'dim', fill: true, opacity: 0.6 });
      g.dot(CX, CY, 2.6, { role: 'spark', opacity: dot });
      return;
    }
    // connected: lit waves by level
    const bars = Math.ceil(clamp(s.level) * 3 - 1e-9);
    R.forEach((r, i) => {
      if (i >= bars) { g.arc(CX, CY, r, -HALF[i], HALF[i], { role: 'dim', opacity: 0.32 }); return; }
      const k = arrive(Math.max(0, s.since - i * 0.08), 0.42);
      const h = HALF[i] * k;
      if (h < 0.5) return;
      const outer = i === bars - 1 && bars > 1;
      g.arc(CX, CY, r, -h, h, { role: i === 0 ? 'line' : 'accent', opacity: outer ? 0.55 + 0.45 * pulse(s.t, LOOP) : 1 });
    });
    g.circle(CX, CY, 2.6, { role: 'fill' });
  },
});
