// walk — a walking figure, mid-stride. walking: the stride swings back and forth (a 1 s loop, the two
// halves mirror so it is seamless); idle: it holds the stride. Arriving, it steps in from the left.
import { defineGlyph } from '../_glyph.js';
import { lerp } from '../../scene/easing.js';
import { enter } from '../_tools.js';
import { figure, blend } from './_figure.js';

const A = { head: [26.5, 10], spine: [[25.5, 15.5], [23, 26]], arms: [[[25, 17], [19, 22.5], [16.5, 27]], [[25, 17], [30.5, 21.5], [33.5, 26]]], legs: [[[23, 26], [18.5, 32.5], [15.5, 39]], [[23, 26], [27.5, 32], [29, 39]]] };
const B = { head: [26.5, 10], spine: [[25.5, 15.5], [23, 26]], arms: [[[25, 17], [28.5, 22], [31, 26.5]], [[25, 17], [21, 22.5], [19, 27]]], legs: [[[23, 26], [26, 32.5], [27.5, 39]], [[23, 26], [20.5, 32.5], [17.5, 39]]] };

export default defineGlyph({
  id: 'walk',
  title: 'Walk',
  category: 'game',
  tags: ['walk', 'auto walk', 'move', 'person', 'stroll', 'pedestrian', 'guest'],
  states: { idle: 'idle', walking: 'active' },
  loop: 1,
  draw(g, s) {
    const on = s.state === 'walking';
    const k = enter(s, 0.5);
    const t = on ? 0.5 - 0.5 * Math.cos(s.phase(1) * Math.PI * 2) : 0;
    g.group({ x: lerp(-5, 0, k), opacity: lerp(0.3, 1, k) }, () => figure(g, blend(A, B, t), { role: on ? 'accent' : 'line' }));
  },
});
