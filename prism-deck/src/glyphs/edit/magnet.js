// magnet — a horseshoe magnet, poles up. on: the pole caps light and field arcs pulse between them
// (a 1.6 s loop); turning on, the magnet gives a small jolt.
import { defineGlyph } from '../_glyph.js';
import { lerp, pulse, clamp } from '../../scene/easing.js';

export default defineGlyph({
  id: 'magnet',
  title: 'Magnet',
  category: 'edit',
  tags: ['magnet', 'stick', 'attract', 'snap', 'lock axes', 'stick to surface'],
  states: { off: 'idle', on: 'active' },
  loop: 1.6,
  draw(g, s) {
    const on = s.state === 'on';
    const jolt = on ? -1.5 * Math.sin(Math.PI * clamp(s.since / 0.3)) : 0;
    g.group({ y: jolt }, () => {
      // the horseshoe as one outline: outer radius 12.5, inner 5, legs up to y = 15
      g.path('M11.5 15V26.5A12.5 12.5 0 0 0 36.5 26.5V15H29V26.5A5 5 0 0 1 19 26.5V15Z', { join: 'round' });
      g.line(11.5, 20.5, 19, 20.5, { role: on ? 'accent' : 'dim' });
      g.line(29, 20.5, 36.5, 20.5, { role: on ? 'accent' : 'dim' });
      if (on) {
        g.rect(11.5, 15, 7.5, 5.5, { role: 'accent', fill: true, opacity: 0.85 });
        g.rect(29, 15, 7.5, 5.5, { role: 'accent', fill: true, opacity: 0.85 });
      }
    });
    if (!on) return;
    const k = clamp(s.since / 0.4);
    for (const [r, ph] of [[4.6, 0], [8.4, 0.5]]) {
      g.arc(24, 15, r, -58, 58, { role: 'accent', weight: 0.8, opacity: k * lerp(0.25, 0.9, pulse(s.t + ph * 1.6, 1.6)) });
    }
  },
});
