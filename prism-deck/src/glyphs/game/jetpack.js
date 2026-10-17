// jetpack — a backpack thruster: twin tanks on a frame, nozzles below. firing: flames burn under the
// nozzles and flicker (a 0.4 s loop); idle: cold nozzles. A press fires a short burst.
import { defineGlyph } from '../_glyph.js';
import { lerp, clamp } from '../../scene/easing.js';
import { enter, press } from '../_tools.js';

export default defineGlyph({
  id: 'jetpack',
  title: 'Jetpack',
  category: 'game',
  tags: ['jetpack', 'jet pack', 'fly', 'thrust', 'boost', 'hover', 'jump'],
  states: { idle: 'idle', firing: 'active' },
  loop: 0.4,
  draw(g, s) {
    const on = s.state === 'firing';
    const k = enter(s, 0.5), p = press(s, 0.5);
    g.rect(11.5, 8, 10, 21, { r: 5 });
    g.rect(26.5, 8, 10, 21, { r: 5 });
    g.line(21.5, 14, 26.5, 14, { role: 'line' });
    g.line(21.5, 22, 26.5, 22, { role: 'dim' });
    g.polyline([[13.5, 29], [12.5, 32], [20.5, 32], [19.5, 29]], { role: 'line', join: 'round' });
    g.polyline([[28.5, 29], [27.5, 32], [35.5, 32], [34.5, 29]], { role: 'line', join: 'round' });
    const burn = on ? k : p;
    if (burn < 0.02) return;
    const flick = on ? 0.8 + 0.2 * Math.sin(s.phase(0.4) * Math.PI * 2) : 1;
    for (const cx of [16.5, 31.5]) {
      const h = lerp(2, 8.5, clamp(burn)) * flick;
      g.path(`M${cx - 3} 33.5C${cx - 3} ${33.5 + h * 0.5} ${cx - 1} ${33.5 + h * 0.8} ${cx} ${33.5 + h}C${cx + 1} ${33.5 + h * 0.8} ${cx + 3} ${33.5 + h * 0.5} ${cx + 3} 33.5Z`, { role: 'accent', fill: true, opacity: 0.9 });
    }
  },
});
