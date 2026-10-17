// sticker — a sticker: a rounded square with a smile and one corner peeling up. Arriving, the corner
// peels back; a press presses it flat for a moment.
import { defineGlyph } from '../_glyph.js';
import { lerp } from '../../scene/easing.js';
import { enter, press } from '../_tools.js';

export default defineGlyph({
  id: 'sticker',
  title: 'Sticker',
  category: 'productivity',
  tags: ['sticker', 'stickers', 'decal', 'reaction', 'emoji', 'chat'],
  draw(g, s) {
    const k = enter(s, 0.5), p = press(s, 0.4);
    const c = lerp(3, 10, k) * (1 - 0.6 * p);         // how far the corner has peeled
    const X = 39.5, Y = 39.5;
    g.path(`M11.5 8.5H36.5A3 3 0 0 1 39.5 11.5V${Y - c}L${X - c} ${Y}H11.5A3 3 0 0 1 8.5 36.5V11.5A3 3 0 0 1 11.5 8.5Z`, { join: 'round' });
    g.path(`M${X} ${Y - c}H${X - c + 3}A3 3 0 0 0 ${X - c} ${Y - c + 3}V${Y}`, { role: 'line', weight: 0.9, join: 'round' });
    g.circle(18.5, 19.5, 2, { role: 'fill' });
    g.circle(28.5, 19.5, 2, { role: 'fill' });
    g.arc(23.5, 24, 7.5, 125, 235, { role: 'accent', weight: 1.05 });
  },
});
