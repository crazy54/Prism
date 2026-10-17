// beam — a tool's beam: an emitter on the left throwing a cone of light to the right, its width set by
// level (beam size on a dial). Arriving, the beam reaches out from the emitter; active: it shimmers.
import { defineGlyph } from '../_glyph.js';
import { lerp, clamp, pulse } from '../../scene/easing.js';
import { enter } from '../_tools.js';

export default defineGlyph({
  id: 'beam',
  title: 'Beam',
  category: 'game',
  tags: ['beam', 'beam size', 'ray', 'laser', 'terrain tool', 'cone', 'width'],
  states: { idle: 'idle', active: 'active' },
  loop: 1.2,
  draw(g, s) {
    const on = s.state === 'active';
    const k = enter(s, 0.5);
    g.rect(7, 19, 9, 10, { r: 2.5 });
    const half = lerp(3, 12, clamp(s.level)), x1 = lerp(18, 40, k);
    const h = lerp(1, half, k);
    g.path(`M17.5 22L${x1} ${24 - h}M17.5 26L${x1} ${24 + h}`, { role: on ? 'accent' : 'line' });
    g.line(x1, 24 - h, x1, 24 + h, { role: 'dim', opacity: on ? 0.6 + 0.4 * pulse(s.t, 1.2) : 1 });
  },
});
