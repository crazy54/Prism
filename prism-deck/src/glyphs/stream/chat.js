// chat — a speech bubble. quiet: three still dots. active: the dots run a wave
// (messages flowing). mention: an @ pops into the bubble (someone called you).
import { defineGlyph } from '../_glyph.js';
import { arrive, pulse, outBack, clamp, lerp } from '../../scene/easing.js';

const BUBBLE = 'M14.5 10H33.5A6.5 6.5 0 0 1 40 16.5V26.5A6.5 6.5 0 0 1 33.5 33H21.5L14 39V33A6 6 0 0 1 8 27V16.5A6.5 6.5 0 0 1 14.5 10Z';

export default defineGlyph({
  id: 'chat',
  title: 'Chat',
  category: 'stream',
  tags: ['chat', 'message', 'comments', 'talk', 'bubble', 'stream', 'mention'],
  states: { quiet: 'idle', active: 'active', mention: 'alert' },
  loop: 1.2,
  draw(g, s) {
    g.path(BUBBLE, { role: 'line', join: 'round' });
    if (s.state === 'mention') {
      const pop = outBack(clamp(s.since / 0.42), 2.2);
      g.group({ scale: lerp(0.4, 1, pop), origin: [24, 21.5], opacity: clamp(s.since / 0.12) }, () => {
        g.text('@', { x: 24, y: 27, size: 17, weight: 700, role: 'accent' });
      });
      return;
    }
    const active = s.state === 'active';
    const k = arrive(s.since, 0.3);
    [17, 24, 31].forEach((x, i) => {
      const hop = active ? pulse(s.t - i * 0.16, 1.2) ** 3 * k : 0;
      g.circle(x, 21.5 - 2.6 * hop, 2.3, { role: active ? 'accent' : 'dim', fill: true, opacity: active ? 0.6 + 0.4 * hop : 1 });
    });
  },
});
