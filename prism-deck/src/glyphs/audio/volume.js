// volume — speaker with three wave slots filled continuously by level (so a dial turn
// reads smoothly: the leading wave brightens as it fills, empty slots stay as faint
// headroom); the outermost lit wave breathes. muted: a cross draws in.
import { defineGlyph } from '../_glyph.js';
import { arrive, pulse, clamp, lerp } from '../../scene/easing.js';

const R = [7.5, 12.5, 17.5];

export default defineGlyph({
  id: 'volume',
  title: 'Volume',
  category: 'audio',
  tags: ['volume', 'speaker', 'sound', 'mute', 'audio'],
  states: { on: 'active', muted: 'neg' },
  loop: 2,
  draw(g, s) {
    g.polygon([[8, 19], [15, 19], [24, 11], [24, 37], [15, 29], [8, 29]], { role: 'line', join: 'round' });
    if (s.state === 'muted') {
      const k = arrive(s.since, 0.3);
      if (k < 0.02) return; // a zero-length round-capped line would be a stray dot
      g.line(30, 19, 30 + 10 * k, 19 + 10 * k, { role: 'accent' });
      g.line(40, 19, 40 - 10 * k, 19 + 10 * k, { role: 'accent' });
      return;
    }
    const lv = clamp(s.level) * 3;
    const lead = Math.min(2, Math.max(0, Math.ceil(lv) - 1)); // the outermost wave with any fill
    R.forEach((r, i) => {
      const f = clamp(lv - i);
      if (f <= 0) { g.arc(24, 24, r, 52, 128, { role: 'dim', opacity: 0.3 }); return; }
      const breathe = i === lead ? 0.45 + 0.55 * pulse(s.t, 2) : 1;
      g.arc(24, 24, r, 52, 128, { role: i === 0 ? 'line' : 'accent', opacity: lerp(0.3, 1, f) * breathe });
    });
  },
});
