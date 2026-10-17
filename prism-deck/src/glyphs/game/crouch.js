// crouch — a figure squatting low over the ground line (seen from the front, knees out), a down
// chevron over its head. Arriving, it sinks from standing into the squat; a press bobs it once more.
import { defineGlyph } from '../_glyph.js';
import { lerp, clamp } from '../../scene/easing.js';
import { enter, chevron } from '../_tools.js';
import { figure, blend } from './_figure.js';

const STAND = { head: [24, 12.5], spine: [[24, 18], [24, 28.5]], arms: [[[24, 19.5], [19.5, 24.5], [18.5, 29]], [[24, 19.5], [28.5, 24.5], [29.5, 29]]], legs: [[[24, 28.5], [21.5, 34], [21, 39.5]], [[24, 28.5], [26.5, 34], [27, 39.5]]] };
const LOW = { head: [24, 19], spine: [[24, 24.5], [24, 31]], arms: [[[24, 26], [18.5, 28.5], [17, 32.5]], [[24, 26], [29.5, 28.5], [31, 32.5]]], legs: [[[24, 31], [15.5, 32.5], [18.5, 39.5]], [[24, 31], [32.5, 32.5], [29.5, 39.5]]] };

export default defineGlyph({
  id: 'crouch',
  title: 'Crouch',
  category: 'game',
  tags: ['crouch', 'duck', 'sneak', 'squat', 'kneel', 'person', 'action'],
  draw(g, s) {
    const k = enter(s, 0.5);
    const bob = !s.pressed && s.pressAge < 0.45 ? Math.sin(Math.PI * clamp(s.pressAge / 0.45)) : 0;
    figure(g, blend(STAND, LOW, clamp(k)));
    g.polyline(chevron([24, lerp(9.5, 12, k) + 1.5 * bob], 180, 5.5, 45), { role: 'accent', join: 'round', opacity: k });
    g.line(10, 40.5, 38, 40.5, { role: 'dim' });
  },
});
