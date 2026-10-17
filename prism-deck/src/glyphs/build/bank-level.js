// bank-level — level the track: the bank horizon ball rolls back flat and its level marks light as
// the horizon meets them. A press rocks it once and it settles level again.
import { defineGlyph } from '../_glyph.js';
import { lerp } from '../../scene/easing.js';
import { enter, press } from '../_tools.js';
import { ball } from './_bank.js';

export default defineGlyph({
  id: 'bank-level',
  title: 'Level Bank',
  category: 'build',
  tags: ['level', 'bank', 'flat', 'reset', 'horizon', 'track', 'coaster', 'build'],
  draw(g, s) {
    const k = enter(s, 0.6), p = press(s, 0.5);
    ball(g, lerp(-22, 0, k) - 6 * p, { marks: k > 0.9 && p < 0.3 ? 'accent' : 'dim' });
  },
});
