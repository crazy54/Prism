// scanner — a radar scope: two range rings, the sweep line with its fading trail, blips. scanning: the
// sweep turns (a 2 s loop) and each blip flares as it passes; idle: the sweep rests at 2 o'clock.
import { defineGlyph } from '../_glyph.js';
import { lerp } from '../../scene/easing.js';
import { enter } from '../_tools.js';
import { wedge } from '../time/_dial.js';
import { bump } from '../system/_kit.js';

const BLIPS = [[30.5, 17, 50], [17.5, 30.5, 225], [29, 32.5, 150]];   // x, y, bearing (deg)

export default defineGlyph({
  id: 'scanner',
  title: 'Scanner',
  category: 'game',
  tags: ['scanner', 'scan', 'radar', 'sonar', 'detect', 'ping', 'survey'],
  states: { idle: 'idle', scanning: 'active' },
  loop: 2,
  draw(g, s) {
    const on = s.state === 'scanning';
    const k = enter(s, 0.5);
    const a = on ? s.phase(2) * 360 : lerp(-30, 60, k);
    g.path(wedge(24, 24, 15, a - 50, a), { role: 'accent', fill: true, opacity: 0.22 });
    g.circle(24, 24, 15.5);
    g.circle(24, 24, 8.5, { role: 'dim' });
    const [x, y] = g.polar(24, 24, 15, a);
    g.line(24, 24, x, y, { role: 'accent', weight: 1.05 });
    for (const [bx, by, b] of BLIPS) {
      const hit = on ? bump(((a - b) / 360 + 1) % 1, 0.08, 0.3, true) : 0;
      g.dot(bx, by, 1.6 + hit, { opacity: on ? 0.35 + 0.65 * hit : 0.8 * k });
    }
  },
});
