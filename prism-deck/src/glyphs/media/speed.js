// speed — a speedometer: a dial arc filled to the needle, the needle set by level (a dial turn moves
// it; 0.5 = normal speed). Arriving, the needle sweeps up from zero; fast: the needle trembles at
// its mark and the arc lights.
import { defineGlyph } from '../_glyph.js';
import { lerp, clamp } from '../../scene/easing.js';
import { enter } from '../_tools.js';

const CX = 24, CY = 27, R = 15, A0 = -120, A1 = 120;

export default defineGlyph({
  id: 'speed',
  title: 'Speed',
  category: 'media',
  tags: ['speed', 'playback speed', 'game speed', 'fast', 'slow', 'pace', 'gauge', 'rate'],
  states: { normal: 'idle', fast: 'active' },
  loop: 0.6,
  draw(g, s) {
    const fast = s.state === 'fast';
    const k = enter(s, 0.6);
    const lv = clamp(fast ? Math.max(s.level, 0.8) : s.level);
    const a = lerp(A0, lerp(A0, A1, lv), k) + (fast ? 1.6 * Math.sin(s.phase(0.6) * Math.PI * 2) : 0);
    g.arc(CX, CY, R, A0, A1, { role: 'dim' });
    if (a > A0 + 1) g.arc(CX, CY, R, A0, a, { role: fast ? 'accent' : 'line' });
    for (const t of [-60, 0, 60]) { const [x0, y0] = g.polar(CX, CY, R - 4.5, t), [x1, y1] = g.polar(CX, CY, R - 2.5, t); g.line(x0, y0, x1, y1, { role: 'dim', weight: 0.8 }); }
    const [nx, ny] = g.polar(CX, CY, R - 5, a);
    g.line(CX, CY, nx, ny, { role: 'accent', weight: 1.05 });
    g.circle(CX, CY, 2.6, { role: 'fill' });
  },
});
