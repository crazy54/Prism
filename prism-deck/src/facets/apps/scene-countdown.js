// app-scene-countdown — the creator's intermission keys: Starting soon · Be right back · Ending.
// Press to start the countdown; a beam of light drains around the key's edge a step each second,
// the digits arrive Refraction-style, the last ten seconds beat, and zero lands on the scene's
// end word ("We're live" · "Back now" · "Thanks!") with a burst of the Spectrum — then holds.
// Uses the runtime's per-key timer (data 'timer', target = minutes + seconds) when there is one;
// ctx.since otherwise. ~2 updates/s while counting, none at rest.

import { surface, rect, n } from '../../scene/index.js';
import { clamp, outExpo, arrive } from '../../scene/easing.js';
import { mix } from '../../scene/color.js';
import { text, isBig, perimeter, perimeterStroke, perimeterPoint, headDot, burst, mmss, capHeight } from './_d7-kit.js';

const SCENES = {
  starting: { title: 'Live soon', short: 'Soon', end: "We're live", hue: 191.3 },
  brb: { title: 'Be right back', short: 'BRB', end: 'Back now', hue: 60.4 },
  ending: { title: 'Ending in', short: 'Ending', end: 'Thanks!', hue: 8 },
};

export default {
  id: 'app-scene-countdown',
  title: 'Scene Countdown',
  category: 'Clocks & Timers',
  description: 'Starting soon, be right back, ending: press to count down as light drains round the key. A real timer; it does not switch your streaming app’s scenes (no source yet).',
  tags: ['countdown', 'starting soon', 'brb', 'intermission', 'scene', 'stream', 'creator', 'timer', 'streaming', 'broadcast', 'obs-style'],
  surface: 'key',
  data: ['timer'],
  fps: 4,
  loop: 60,
  states: ['ready', 'running'],
  tones: { ready: 'idle', running: 'active' },
  press: 'toggle',
  params: {
    scene: { type: 'select', default: 'starting', options: ['starting', 'brb', 'ending'], label: 'Scene' },
    minutes: { type: 'number', default: 5, min: 0, max: 60, step: 1, label: 'Minutes' },
    seconds: { type: 'number', default: 0, min: 0, max: 59, step: 5, label: 'Seconds' },
    title: { type: 'text', default: '', maxLength: 16, label: 'Title (blank = the scene’s)' },
  },
  order: 14,
  render(ctx) {
    const S = SCENES[ctx.params.scene] || SCENES.starting;
    const c = { ...ctx, hue: S.hue, tint: ctx.theme.spectral(S.hue) };
    const k = surface(c);
    const { w, h } = ctx;
    const C = k.colors, u = k.m.u;
    const total = Math.max(1, ctx.params.minutes * 60 + ctx.params.seconds);
    const T = ctx.data?.timer;
    const running = ctx.stateName === 'running';
    const elapsed = T && typeof T.elapsed === 'number' ? T.elapsed : running ? ctx.since : 0;
    const left = total - elapsed;
    const done = running && left <= 0;
    const big = isBig(k);
    k.background({ tone: done ? 'ok' : running ? 'active' : 'idle' });
    const tint = done ? C.pos : c.tint;
    // the edge beam: drains a step each second (the step arrives with outExpo)
    const inset = k.m.hair + k.m.line * 0.9, r = k.m.radius * 0.92;
    const per = perimeter(inset, inset, w - inset * 2, h - inset * 2, r);
    const secs = Math.ceil(Math.max(0, left));
    const frac = left - Math.floor(left);
    const step = ctx.reduced ? 1 : arrive(1 - frac, 0.3);
    const f = running ? clamp((secs - (1 - step)) / total) : 1;
    if (!done) {
      k.add(perimeterStroke(per, 1, { color: C.line, width: k.m.line, opacity: 0.7 }));
      if (f > 0) k.add(perimeterStroke(per, f, { color: tint, width: k.m.line * 1.7, opacity: running ? 1 : 0.5 }));
      if (running && f > 0.002) { const [hx, hy] = perimeterPoint(inset, inset, w - inset * 2, h - inset * 2, r, f); k.add(headDot(k, hx, hy, k.m.line * 1.1, tint)); }
    }
    const title = ctx.params.title || (big ? S.title : S.short);
    if (done) {
      const a = elapsed - total;
      k.add(burst(k, { cx: w / 2, cy: h * 0.5, r0: Math.min(w, h) * 0.12, r1: Math.min(w, h) * 0.5, age: a, dur: 1.1, count: 14, hue: S.hue }));
      text(k, title, { y: k.m.text + capHeight(7.5 * u, 600), size: 7.5 * u, weight: 600, caps: true, tracking: 0.1, color: 'muted', maxWidth: w - k.m.text * 2, minSize: 6 * u });
      text(k, S.end, { cy: h * 0.53, size: (big ? 17 : 15) * u, weight: 700, color: 'ink', maxWidth: w - k.m.text * 2, minSize: 9 * u });
      text(k, `+${mmss(a)}`, { cy: h - k.m.safe - 5 * u, size: 8.5 * u, weight: 600, color: 'muted', tabular: true });
      return k.svg();
    }
    text(k, title, { y: k.m.text + capHeight(7.5 * u, 600), size: 7.5 * u, weight: 600, caps: true, tracking: 0.1, color: running ? 'ink' : 'muted', maxWidth: w - k.m.text * 2, minSize: 6 * u });
    const digits = mmss(running ? secs : total);
    const beat = running && secs <= 10 && !ctx.reduced ? 1 - outExpo(clamp((1 - frac) / 0.35)) : 0;
    const size = (big ? 26 : 24) * u * (1 + 0.08 * beat);
    const cy = h * 0.53;
    // refraction arrival of each new second: two spectral copies converge on the digits
    const a = running && !ctx.reduced ? arrive(1 - frac, 0.28) : 1;
    if (a < 0.98) {
      const off = (1 - a) * k.m.bold * 1.1;
      text(k, digits, { x: w / 2 - off, cy, size, weight: 700, tabular: true, color: c.theme.spectral(S.hue - 60), opacity: 0.5 * (1 - a), maxWidth: w - k.m.text * 2 });
      text(k, digits, { x: w / 2 + off, cy, size, weight: 700, tabular: true, color: c.theme.spectral(S.hue + 60), opacity: 0.5 * (1 - a), maxWidth: w - k.m.text * 2 });
    }
    text(k, digits, { cy, size, weight: 700, tabular: true, color: running ? (secs <= 10 ? mix(C.ink, tint, 0.35) : 'ink') : 'muted', maxWidth: w - k.m.text * 2, opacity: 0.4 + 0.6 * a });
    if (beat > 0.02) k.add(rect({ width: w, height: h, fill: tint, fillOpacity: n((k.dark ? 0.14 : 0.08) * beat, 3) }));
    if (!running) k.caption(big ? 'press to start' : 'start', { y: h - k.m.safe - 3 * u, color: 'dim' });
    else if (big) k.caption('press to stop', { y: h - k.m.safe - 3 * u, color: 'dim' });
    return k.svg();
  },
};
