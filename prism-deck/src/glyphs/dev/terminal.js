// terminal — a window with a prompt. idle: the cursor blinks after the prompt.
// running: the prompt lights and output scrolls up past it, line after line (one pitch
// per step, the line lengths cycling with the loop, so it is seamless); lines fade in at
// the bottom and out at the top.
import { defineGlyph } from '../_glyph.js';
import { arrive, smoothstep } from '../../scene/easing.js';
import { blink } from '../system/_kit.js';

const STEP = 1.2;                                  // one line of output per step (and the cursor blink)
const OUT = [9, 6, 10.5, 7.5];                     // output line lengths, cycling
const LOOP = STEP * OUT.length;                    // the whole scroll repeats exactly
const PITCH = 5;                                   // output line pitch
const Y_TOP = 15.5, Y_BOT = 32.5;                  // output window inside the frame

export default defineGlyph({
  id: 'terminal',
  title: 'Terminal',
  category: 'dev',
  tags: ['terminal', 'shell', 'console', 'command line', 'cli', 'prompt'],
  states: { idle: 'idle', running: 'active' },
  loop: LOOP,
  draw(g, s) {
    g.rect(7, 9.5, 34, 29, { r: 4.5 });
    const run = s.state === 'running';
    const k = arrive(s.since, 0.35);
    g.polyline([[13.5, 18.5], [19, 24], [13.5, 29.5]], { role: run ? 'accent' : 'line', join: 'round' });
    if (!run) {
      const on = blink(s.phase(STEP), 0.55, 0.08);
      g.line(23.5, 29.5, 31, 29.5, { role: 'line', opacity: 0.15 + 0.85 * on });
      return;
    }
    // output scrolls up one pitch per step; line m enters at the bottom at step m
    const u = s.phase(LOOP) * OUT.length, base = Math.floor(u), p = u - base;
    for (let j = -1; j < 5; j++) {
      const y = Y_BOT - (j + p) * PITCH;
      if (y < Y_TOP - 0.01 || y > Y_BOT + 0.01) continue;
      const fade = smoothstep(Y_TOP, Y_TOP + 4, y) * (1 - smoothstep(Y_BOT - 3, Y_BOT, y));
      const len = OUT[(((base - j) % OUT.length) + OUT.length) % OUT.length];
      g.line(23.5, y, 23.5 + len, y, { role: 'dim', opacity: fade * k });
    }
  },
});
