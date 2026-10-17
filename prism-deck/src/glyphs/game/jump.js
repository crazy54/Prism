// jump — a figure in the air, arms up and knees tucked, its shadow on the ground below. Arriving, it
// springs up from a crouch; a press makes it hop again.
import { defineGlyph } from '../_glyph.js';
import { lerp, clamp } from '../../scene/easing.js';
import { enter } from '../_tools.js';
import { figure, blend } from './_figure.js';

const AIR = { head: [24, 9], spine: [[24, 14.5], [24, 25]], arms: [[[24, 16], [19, 12.5], [16.5, 8.5]], [[24, 16], [29, 12.5], [31.5, 8.5]]], legs: [[[24, 25], [18.5, 29], [20, 34]], [[24, 25], [29.5, 29], [28, 34]]] };
const LOW = { head: [24, 15], spine: [[24, 20.5], [24, 29]], arms: [[[24, 22], [18.5, 25], [16.5, 29.5]], [[24, 22], [29.5, 25], [31.5, 29.5]]], legs: [[[24, 29], [18, 33], [20, 38.5]], [[24, 29], [30, 33], [28, 38.5]]] };

export default defineGlyph({
  id: 'jump',
  title: 'Jump',
  category: 'game',
  tags: ['jump', 'leap', 'hop', 'jetpack', 'person', 'action'],
  draw(g, s) {
    const k = enter(s, 0.5);
    const hop = !s.pressed && s.pressAge < 0.5 ? Math.sin(Math.PI * clamp(s.pressAge / 0.5)) : 0;
    const t = clamp(k - hop * 0.7);
    figure(g, blend(LOW, AIR, t));
    g.line(lerp(17, 18.5, t), 40, lerp(31, 29.5, t), 40, { role: 'dim', opacity: lerp(1, 0.7, t) });
  },
});
