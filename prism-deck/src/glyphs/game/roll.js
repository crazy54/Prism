// roll — a barrel roll: a turn arrow wrapped round a horizontal axis (its far side dashed). Arriving,
// the arrow winds round the axis; a press spins it on.
import { defineGlyph } from '../_glyph.js';
import { lerp, clamp, outExpo } from '../../scene/easing.js';
import { enter, chevron } from '../_tools.js';

const CX = 24, CY = 24, RX = 7.5, RY = 14;

export default defineGlyph({
  id: 'roll',
  title: 'Roll',
  category: 'game',
  tags: ['roll', 'barrel roll', 'spin', 'rotate', 'bank', 'flip', 'rolls'],
  draw(g, s) {
    const k = enter(s, 0.55);
    const spin = s.pressed ? 0 : s.pressAge < 0.5 ? outExpo(clamp(s.pressAge / 0.5)) : 1;
    // the axis, its arrowhead pointing the way of travel
    g.line(7.5, CY, 40, CY, { role: 'dim' });
    g.polyline(chevron([41, CY], 90, 4.5, 45), { role: 'dim', join: 'round' });
    // far side of the roll (left half of the ellipse), dashed
    g.path(`M${CX} ${CY - RY}A${RX} ${RY} 0 0 0 ${CX} ${CY + RY}`, { role: 'dim', dash: [2.2, 2.6], opacity: lerp(0.3, 1, k) });
    // near side (right half), drawn from the top round to the bottom, the head at its end
    const a = lerp(40, 180, k) * (0.85 + 0.15 * spin);       // sweep in degrees from the top
    const pts = [];
    for (let i = 0; i <= 16; i++) { const t = ((a * i) / 16) * Math.PI / 180; pts.push([CX + RX * Math.sin(t), CY - RY * Math.cos(t)]); }
    g.polyline(pts, { role: 'line', join: 'round' });
    const end = pts[pts.length - 1], prev = pts[pts.length - 2];
    const dir = (Math.atan2(end[0] - prev[0], -(end[1] - prev[1])) * 180) / Math.PI;
    g.polyline(chevron([end[0], end[1]], dir, 5.5, 45), { role: 'accent', join: 'round' });
  },
});
