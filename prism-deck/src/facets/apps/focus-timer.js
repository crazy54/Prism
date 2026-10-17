// app-focus-timer — a pomodoro on one key: press to start focus, press again for a
// break, again to reset. A state machine driven only by ctx.since — pure.
// (Reference app for the apps engineer.)

import { surface, arc, polar, circle } from '../../scene/index.js';
import { clockText } from '../../scene/text.js';
import { arrive, clamp, pulse, lerp } from '../../scene/easing.js';

export default {
  id: 'app-focus-timer',
  title: 'Focus Timer',
  category: 'Clocks & Timers',
  description: 'A pomodoro on one key: press to start focus, again for a break; the ring drains as light and overtime counts up in amber. The timer runs for real on the key.',
  tags: ['pomodoro', 'focus', 'timer', 'countdown', 'break', 'productivity'],
  surface: 'key',
  data: ['timer'],
  fps: 4,
  loop: 60,
  states: ['ready', 'focus', 'break'],
  tones: { ready: 'idle', focus: 'active', break: 'ok' },
  params: {
    focus: { type: 'number', default: 25, min: 1, max: 90, step: 1, label: 'Focus minutes' },
    rest: { type: 'number', default: 5, min: 1, max: 30, step: 1, label: 'Break minutes' },
  },
  order: 10,
  render(ctx) {
    const k = surface(ctx);
    const { w, h, stateName, since } = ctx;
    const total = (stateName === 'break' ? ctx.params.rest : ctx.params.focus) * 60;
    const running = stateName !== 'ready';
    const left = running ? total - since : total;
    const over = left < 0;
    const tone = over ? 'warn' : ctx.tone;
    k.background({ tone });
    const m = Math.min(w, h);
    const cx = w / 2, cy = h * 0.53, r = m * 0.37, sw = k.m.bold;
    const frac = running ? clamp(left / total) : 1;
    const color = k.tone(tone === 'idle' ? 'active' : tone);
    k.add(arc({ cx, cy, r, from: 0, to: 360, color: k.colors.line, width: sw * 0.55 }));
    if (frac > 0) {
      const end = 360 * frac * (running ? arrive(since, 0.6) : 1);
      k.add(arc({ cx, cy, r, from: 0, to: Math.max(0.5, end), color, width: sw, opacity: running ? 1 : 0.45 }));
      if (running) {
        const [hx, hy] = polar(cx, cy, r, end);
        k.add(circle({ cx: hx, cy: hy, r: sw * 1.3, fill: color, fillOpacity: 0.25 }));
        k.add(circle({ cx: hx, cy: hy, r: sw * 0.55, fill: k.dark ? '#ffffff' : color }));
      }
    }
    if (over) k.add(circle({ cx, cy, r: r * 0.86, fill: k.tone('warn'), fillOpacity: 0.06 + 0.06 * pulse(ctx.t, 2) }));
    const word = over ? 'Over' : stateName === 'ready' ? 'Ready' : stateName === 'focus' ? 'Focus' : 'Break';
    k.eyebrow(word, { align: 'center', x: cx, y: cy - r * 0.32, color: over ? 'warn' : running ? color : 'muted' });
    k.value(over ? `+${clockText(-left)}` : clockText(Math.ceil(left)), { cy: cy + k.m.u * 2, maxWidth: r * 1.55, size: k.m.u * 17, color: running || over ? 'ink' : 'muted' });
    if (!running) k.caption('press to start', { y: cy + r * 0.62, maxWidth: r * 1.4, color: 'dim' });
    void lerp;
    return k.svg();
  },
};
