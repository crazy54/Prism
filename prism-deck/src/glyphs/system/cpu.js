// cpu — a chip with pins; while busy its four cores light in turn. The load sets how many
// cores are lit at once (level → 1–4): a lit window of cores chases around the die, the
// lead core brightest, so even a full load keeps moving.
import { defineGlyph } from '../_glyph.js';
import { clamp } from '../../scene/easing.js';

export default defineGlyph({
  id: 'cpu',
  title: 'CPU',
  category: 'system',
  tags: ['cpu', 'processor', 'chip', 'system', 'performance', 'load'],
  states: { busy: 'active', idle: 'idle' },
  loop: 1.2,
  draw(g, s) {
    g.rect(13, 13, 22, 22, { r: 3.5 });
    for (const p of [18.5, 24, 29.5]) {
      g.line(p, 7.5, p, 12, { role: 'dim' });
      g.line(p, 36, p, 40.5, { role: 'dim' });
      g.line(7.5, p, 12, p, { role: 'dim' });
      g.line(36, p, 40.5, p, { role: 'dim' });
    }
    const busy = s.state === 'busy';
    const lead = Math.floor(s.phase(1.2) * 4);
    const count = Math.max(1, Math.ceil(clamp(s.level) * 4 - 1e-9));
    [[18.5, 18.5], [25, 18.5], [25, 25], [18.5, 25]].forEach(([x, y], i) => {
      const rel = (lead - i + 4) % 4;              // 0 = the lead core, then the ones it just left
      const on = busy && rel < count;
      g.rect(x, y, 4.5, 4.5, { r: 1, role: on ? 'spark' : 'fill', fill: true, opacity: on ? (rel === 0 ? 1 : 0.72) : 0.5 });
    });
  },
});
