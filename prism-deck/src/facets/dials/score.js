// dial-score — a team's score on one encoder, on split-flap cards. Turn right to score, left to
// take one back: one detent is one point (the dial's value in hundredths, so the runtime keeps the
// score), and the cards flip. Push to mark who serves. Put two on the Galleon 100 SD's two dials
// (one team each, side by side on the screen) or four on a Stream Deck + — a scoreboard for game
// night. On the + strip, hold to reset to 0. Static between turns.

import { surface, rect, circle, n } from '../../scene/index.js';
import { clamp } from '../../scene/easing.js';
import { finish } from './_d4-dial.js';
import { flap, flapColors, text } from '../apps/_d7-kit.js';

const FLIP = 0.5;

export default {
  id: 'dial-score',
  title: 'Score Dial',
  category: 'Dial Segments',
  description: 'A team’s score on split-flap cards: turn right to score, left to take one back, push to mark the serve. Two dials on the Galleon make a scoreboard.',
  tags: ['score', 'scoreboard', 'game night', 'counter', 'tally', 'split flap', 'team', 'dial'],
  surface: 'strip',
  segments: 1,
  fps: 10,
  loop: 4,
  states: ['play', 'serve'],
  tones: { play: 'idle', serve: 'active' },
  press: 'toggle',
  params: {
    team: { type: 'text', default: 'Home', maxLength: 10, label: 'Team' },
    hue: { type: 'hue', default: 243.6, min: 0, max: 360, label: 'Team hue' },
    value: { type: 'number', default: 0, min: 0, max: 1, step: 0.01, label: 'Score ÷ 100' },
    step: { type: 'number', default: 0.01, min: 0.01, max: 0.01, step: 0.01, label: 'One point per detent' },
  },
  order: 44,
  render(ctx) {
    const k = surface(ctx);
    const { w, h } = ctx;
    const C = k.colors, T = ctx.theme;
    const serve = ctx.stateName === 'serve';
    k.background({ tone: serve ? 'active' : 'idle' });
    const score = Math.min(99, Math.round(clamp(ctx.value) * 100));
    const str = String(score).padStart(2, '0');
    // a turn flips the ones card (assuming the usual +1) and the tens card when it rolled over
    const turning = Number.isFinite(ctx.turnAge) && ctx.turnAge < FLIP * 1.25 && !ctx.reduced;
    // arrival (the segment appears): both cards flip in from blank
    const arriving = !turning && !ctx.reduced && !Number.isFinite(ctx.turnAge) && ctx.since < FLIP * 1.25;
    const p = turning ? (ctx.turnAge / FLIP) * 1.25 : arriving ? (ctx.since / FLIP) * 1.25 : 9;
    const prevOnes = arriving ? '' : String((Number(str[1]) + 9) % 10);
    const prevTens = arriving ? '' : str[1] === '0' ? String((Number(str[0]) + 9) % 10) : str[0];
    const F = flapColors(k);
    const s = k.m.safe;
    // the team: color disc + name; the serve marker
    const tint = T.spectral(ctx.hue), deep = T.spectral(ctx.hue, { tier: 'ink' });
    k.add(rect({ x: s, y: 21, width: 4, height: 62, rx: 2, fill: tint }));
    text(k, ctx.params.team, { x: s + 11, y: 44, size: 17, weight: 700, anchor: 'start', color: k.dark ? 'ink' : deep, maxWidth: 76, minSize: 11 });
    text(k, serve ? 'serving' : 'score', { x: s + 11, y: 62, size: 10, weight: 600, caps: true, tracking: 0.1, anchor: 'start', color: serve ? tint : 'muted' });
    if (serve) k.add(circle({ cx: s + 15.5, cy: 77, r: 4, fill: tint }) + circle({ cx: s + 15.5, cy: 77, r: 7.5, fill: 'none', stroke: tint, strokeWidth: 1.2, strokeOpacity: 0.5 }));
    // two flap cards, right-aligned
    const cw = 40, ch = 70, gap = 4, y = 16;
    const x1 = w - s - cw, x0 = x1 - gap - cw;
    flap(k, { x: x0, y, w: cw, h: ch, r: 5, prev: turning || arriving ? prevTens : undefined, cur: str[0], p, size: 52, weight: 700, tag: 'tens', colors: F });
    flap(k, { x: x1, y, w: cw, h: ch, r: 5, prev: turning || arriving ? prevOnes : undefined, cur: str[1], p, size: 52, weight: 700, tag: 'ones', colors: F });
    k.add(rect({ x: n(x0 + 6), y: n(y + ch + 3), width: n(cw * 2 + gap - 12), height: 2, rx: 1, fill: tint }));
    return finish(k);
  },
};
