// brush — a paintbrush, handle up-right, its loaded tip down-left in the accent. Arriving, the brush
// slides in along its handle; a press dabs it and leaves a stroke that fades.
import { defineGlyph } from '../_glyph.js';
import { lerp } from '../../scene/easing.js';
import { enter, press, capsule } from '../_tools.js';

const TIP = 'M21.5 25.5C17.5 25.2 14.5 28.3 14.5 31.8C14.5 34.6 12.5 36.5 9.5 37C12 39.6 15.4 40.5 18.2 40.5C22.8 40.5 26.4 37 26.4 32.6C26.4 29.4 24.6 26.6 21.5 25.5Z';

export default defineGlyph({
  id: 'brush',
  title: 'Brush',
  category: 'edit',
  tags: ['brush', 'paint', 'paintbrush', 'color', 'brush size', 'intensity', 'tool'],
  draw(g, s) {
    const k = enter(s, 0.5), p = press(s, 0.4);
    const d = lerp(4, 0, k) - 1.4 * p;
    g.group({ x: d * 0.707, y: -d * 0.707, opacity: lerp(0.35, 1, k) }, () => {
      g.path(capsule([37, 11], [26.5, 21.5], 3.6), { join: 'round' });
      g.path(TIP, { role: 'accent', fill: true, opacity: 0.9 });
      g.path(TIP, { role: 'accent', join: 'round' });
    });
  },
});
