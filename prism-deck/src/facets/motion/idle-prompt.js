// idle-prompt — a terminal on a key: a prompt types a command, "enter" prints the
// answer in the ok tone, a block cursor blinks, and it clears and starts again.
// Characters sit on a fixed cell grid (each drawn in the theme's own label type), so
// it reads as a terminal in every theme — and is most at home in phosphor and pixel.
// Typing is ~8 updates a second; the blink costs 2.

import { surface, rect, n, phase, clamp } from '../../scene/index.js';

const LOOP = 6;

export default {
  id: 'idle-prompt',
  title: 'Prompt',
  category: 'Idle Loops',
  description: 'A terminal on a key: a prompt types a command, enter prints the answer in green, a block cursor blinks, then it clears and types again.',
  tags: ['idle', 'terminal', 'prompt', 'cursor', 'typing', 'shell', 'retro'],
  surface: 'key',
  fps: 8,
  loop: LOOP,
  params: {
    command: { type: 'text', default: 'deploy', label: 'Command', maxLength: 10 },
    answer: { type: 'text', default: 'ok', label: 'Answer', maxLength: 10 },
    prompt: { type: 'text', default: '>', label: 'Prompt', maxLength: 2 },
  },
  order: 60,
  render(ctx) {
    const k = surface(ctx);
    const { w, h } = k;
    k.background({ tone: 'idle' });
    const cmd = String(ctx.params.command || ''), ans = String(ctx.params.answer || '');
    const pr = String(ctx.params.prompt || '>');
    // timeline (s): type → pause → enter → hold (blinking) → clear
    const tl = ctx.reduced ? 3.2 : phase(ctx.t, LOOP) * LOOP;
    const tType = 0.25, dt = Math.min(0.14, 2 / Math.max(1, cmd.length));
    const typed = clamp(Math.floor((tl - tType) / dt) + 1, 0, cmd.length);
    const tEnter = tType + cmd.length * dt + 0.45;
    const entered = tl >= tEnter && tl < LOOP - 0.35;
    // the character grid: as many cells as the longest line needs, within the text safe area
    const safe = k.m.text ?? k.m.safe;
    const cols = Math.max(6, pr.length + 1 + Math.max(cmd.length, ans.length) + 1);
    const cw = (w - safe * 2) / cols;
    const size = Math.min(k.m.u * 11, cw * 1.55);
    const row = (i) => h * (entered ? 0.42 : 0.55) + i * size * 1.45;
    const put = (str, col, y, color) => { [...str].forEach((ch, i) => { if (ch !== ' ') k.label(ch, { x: safe + (col + i + 0.5) * cw, y, align: 'center', size, color, maxWidth: cw * 1.6 }); }); };
    put(pr, 0, row(0), 'muted');
    put(cmd.slice(0, typed), pr.length + 1, row(0), 'ink');
    let cur = { col: pr.length + 1 + typed, y: row(0) };
    if (entered) {
      put(ans, 0, row(1), k.tone('ok'));
      cur = { col: ans.length + 1, y: row(1) };
    }
    // the block cursor: solid while typing, blinking at 1 Hz while waiting
    const typing = tl >= tType && typed < cmd.length;
    const on = typing || ctx.reduced || phase(ctx.t, 1) < 0.5;
    if (on && tl < LOOP - 0.35) {
      const ch = size * 0.74, cwid = Math.max(2, Math.round(cw * 0.62));
      k.add(rect({ x: n(Math.round(safe + cur.col * cw + (cw - cwid) / 2)), y: n(Math.round(cur.y - ch)), width: cwid, height: n(Math.round(ch)), fill: k.tone(entered ? 'ok' : 'active'), fillOpacity: 0.9 }));
    }
    return k.svg();
  },
};
