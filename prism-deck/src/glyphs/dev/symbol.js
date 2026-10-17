// symbol — go to symbol: curly braces round a small solid diamond (a named thing in the code). Arriving,
// the braces close in round the symbol; a press lights it.
import { defineGlyph } from '../_glyph.js';
import { lerp } from '../../scene/easing.js';
import { enter, press, xf, mirrorX } from '../_tools.js';

const BRACE = 'M18 9.5C14.5 9.5 14 12 14 15.5V19.5C14 22.2 12.8 24 10 24C12.8 24 14 25.8 14 28.5V32.5C14 36 14.5 38.5 18 38.5';

export default defineGlyph({
  id: 'symbol',
  title: 'Symbol',
  category: 'dev',
  tags: ['symbol', 'go to symbol', 'outline', 'braces', 'function', 'class', 'code'],
  draw(g, s) {
    const k = enter(s, 0.5), p = press(s, 0.4);
    const o = lerp(-3, 0, k);
    g.group({ x: o }, () => g.path(BRACE, { role: 'line', join: 'round' }));
    g.group({ x: -o }, () => g.path(xf(BRACE, mirrorX()), { role: 'line', join: 'round' }));
    g.polygon([[24, 18.5], [29.5, 24], [24, 29.5], [18.5, 24]], { role: p > 0.3 ? 'accent' : 'fill', join: 'round', opacity: lerp(0.3, 1, k) });
  },
});
