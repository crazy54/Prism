// Clocks & timers on one key.
//
//   app-world-clock  any city's time: hairline hands on a face lit by that city's sky (night violet,
//                    dawn coral, day citrine, dusk amber), the offset from local time, a seconds glint
//   app-stopwatch    press: start → stop → reset. Seconds sweep the rim; tenths tick beside the digits.
//                    Reads ctx.data.timer { elapsed, running, laps } (src/apps/sources/timer.js) when the
//                    runtime keeps one per key — so a stopped watch keeps its time; else runs from ctx.since.
//   app-countdown    press to start; 60 ticks extinguish one by one; the last ten seconds pulse; at zero it
//                    alerts (ring + "Done", never color alone) and counts the overtime.
// (app-focus-timer, the reference, is the pomodoro.)

import { surface, path, circle, rect, n, arcPath, polar } from '../../scene/index.js';
import { clockOf } from '../../scene/context.js';
import { pad2, clockText } from '../../scene/text.js';
import { clamp, lerp, pulse, smoothstep } from '../../scene/easing.js';
import { whiteOf, colorAt, glowDot } from './_kit.js';

const big = (k) => Math.min(k.w, k.h) >= 110;

/** Sky hue + strength for a local hour (fractional): night, dawn, day, dusk. */
function skyOf(h) {
  const dawn = smoothstep(5, 7, h) * (1 - smoothstep(7, 9, h)), dusk = smoothstep(17, 19, h) * (1 - smoothstep(19, 21, h));
  const day = smoothstep(6.5, 9, h) * (1 - smoothstep(17.5, 20, h));
  if (dawn > 0.35) return { hue: 34, k: 0.55, label: 'dawn' };
  if (dusk > 0.35) return { hue: 52, k: 0.55, label: 'dusk' };
  return day > 0.5 ? { hue: 86.5, k: 0.4, label: 'day' } : { hue: 280, k: 0.5, label: 'night' };
}

const worldClock = {
  id: 'app-world-clock', title: 'World Clock', category: 'Clocks & Timers',
  description: 'Any city’s time on one key: hairline hands on a face lit by that city’s sky, with its offset from your local time. Real time from your computer’s clock.',
  tags: ['clock', 'time', 'world', 'timezone', 'city', 'analog', 'travel'],
  surface: 'key', data: ['clock'], fps: 1, loop: 60,
  params: {
    city: { type: 'text', default: 'Tokyo', maxLength: 12, label: 'City' },
    offset: { type: 'number', default: 9, min: -12, max: 14, step: 0.25, label: 'UTC offset (hours)' },
    face: { type: 'select', default: 'analog', options: ['analog', 'digital'], label: 'Face' },
    hour12: { type: 'bool', default: false, label: '12-hour clock' },
  },
  order: 20,
  render(ctx) {
    const k = surface(ctx);
    const { w, h, params: p } = ctx;
    const c = clockOf(ctx.now, Math.round(p.offset * 60));
    const local = ctx.clock.tzOffset ?? 0;
    const diff = Math.round((p.offset * 60 - local) / 15) / 4;
    const rel = diff === 0 ? 'local' : `${diff > 0 ? '+' : '–'}${Math.abs(diff)}h`;
    const hr = c.h + c.m / 60 + c.s / 3600;
    const sky = skyOf(hr);
    k.background({ tone: 'idle' });
    const hh = p.hour12 ? ((c.h + 11) % 12) + 1 : c.h;
    const digits = `${hh}:${pad2(c.m)}`;
    if (p.face === 'digital') {
      const id = k.id('sky');
      const tint = ctx.theme.spectral(sky.hue, { tier: 'wash' });
      k.def(`<radialGradient id="${id}" cx="0.5" cy="1" r="0.9"><stop offset="0" stop-color="${tint}" stop-opacity="${k.dark ? 0.32 : 0.5}"/><stop offset="1" stop-color="${tint}" stop-opacity="0"/></radialGradient>`);
      k.add(rect({ width: w, height: h, fill: `url(#${id})` }));
      k.caption(rel, { align: 'left', x: k.m.text, y: k.m.text + k.m.u * 6, color: 'muted' });
      k.value(digits, { cy: h * 0.48, maxWidth: w - k.m.text * 2 });
      k.label(p.city, { color: 'muted' });
      return k.svg();
    }
    const m = Math.min(w, h), cx = w / 2, cy = big(k) ? h * 0.43 : h * 0.42, r = m * (big(k) ? 0.31 : 0.3);
    // the face: that city's sky, as a soft disc
    const fid = k.id('face');
    const skyC = ctx.theme.spectral(sky.hue, { tier: k.dark ? 'ink' : 'wash' });
    k.def(`<radialGradient id="${fid}" cx="0.5" cy="0.35" r="0.75"><stop offset="0" stop-color="${skyC}" stop-opacity="${k.dark ? 0.34 : 0.55}"/><stop offset="1" stop-color="${skyC}" stop-opacity="${k.dark ? 0.08 : 0.18}"/></radialGradient>`);
    k.add(circle({ cx, cy, r, fill: `url(#${fid})` }));
    k.add(circle({ cx, cy, r, fill: 'none', stroke: k.colors.line, strokeWidth: n(Math.max(1, k.m.hair)) }));
    let ticks = '';
    for (let i = 0; i < 12; i++) {
      const major = i % 3 === 0;
      const [x1, y1] = polar(cx, cy, r - k.m.u * 1.5, i * 30), [x2, y2] = polar(cx, cy, r - k.m.u * (major ? 5 : 3.2), i * 30);
      ticks += `M${n(x1)} ${n(y1)}L${n(x2)} ${n(y2)}`;
    }
    k.add(path(ticks, { stroke: k.colors.muted, strokeWidth: n(Math.max(1, k.m.hair * 1.2)), strokeLinecap: 'round' }));
    const ink = k.dark ? '#ffffff' : k.colors.ink;
    const hand = (deg, len, width, color) => { const [x, y] = polar(cx, cy, len, deg), [bx, by] = polar(cx, cy, -len * 0.14, deg); return path(`M${n(bx)} ${n(by)}L${n(x)} ${n(y)}`, { stroke: color, strokeWidth: n(width), strokeLinecap: 'round' }); };
    k.add(hand(((c.h % 12) + c.m / 60) * 30, r * 0.52, k.m.bold * 0.9, ink));
    k.add(hand((c.m + c.s / 60) * 6, r * 0.78, k.m.line * 1.1, ink));
    const [sx, sy] = polar(cx, cy, r, c.s * 6);
    k.add(glowDot(k, { cx: sx, cy: sy, r: k.m.line * 1.05, color: colorAt(ctx, 'auto', 0.8), opacity: 0.8 }));
    k.add(circle({ cx, cy, r: k.m.line * 1.3, fill: ink }));
    k.caption(rel, { align: 'left', x: k.m.text, y: k.m.text + k.m.u * 6, color: 'muted' });
    if (big(k)) k.caption(digits, { align: 'right', x: w - k.m.text, y: k.m.text + k.m.u * 6, color: 'muted' });
    k.label(p.city, { color: 'ink' });
    return k.svg();
  },
};

const stopwatch = {
  id: 'app-stopwatch', title: 'Stopwatch', category: 'Clocks & Timers',
  description: 'Press to start, again to stop, again to reset: the seconds sweep the rim as light, tenths tick, laps mark the ring. The stopwatch runs for real on the key.',
  tags: ['stopwatch', 'timer', 'chronograph', 'laps', 'time'],
  surface: 'key', data: ['timer'], fps: 10, loop: 60,
  states: ['ready', 'running', 'stopped'],
  tones: { ready: 'idle', running: 'active', stopped: 'ok' },
  press: 'cycle',
  params: {},
  order: 30,
  render(ctx) {
    const k = surface(ctx);
    const { w, h, stateName: st, since } = ctx;
    const T = ctx.data?.timer;
    const elapsed = T && Number.isFinite(T.elapsed) ? T.elapsed : st === 'running' ? since : st === 'stopped' ? 83.4 : 0;
    const laps = Array.isArray(T?.laps) ? T.laps : [];
    k.background({ tone: ctx.tone });
    const m = Math.min(w, h), cx = w / 2, cy = h * 0.5, r = m * 0.38, sw = k.m.bold * 0.8;
    const color = st === 'stopped' ? k.tone('ok') : colorAt(ctx, 'auto', 0.75);
    k.add(circle({ cx, cy, r, fill: 'none', stroke: k.colors.line, strokeWidth: n(sw * 0.6) }));
    const sec = elapsed % 60, frac = sec / 60;
    if (elapsed > 0) {
      const tail = Math.min(frac * 360, 300);
      if (frac > 0.002) k.add(path(arcPath(cx, cy, r, frac * 360 - tail, frac * 360), { fill: 'none', stroke: color, strokeWidth: n(sw), strokeLinecap: 'round', strokeOpacity: st === 'running' ? 1 : 0.7 }));
      const [hx, hy] = polar(cx, cy, r, frac * 360);
      k.add(glowDot(k, { cx: hx, cy: hy, r: sw * 0.55, color: whiteOf(k), opacity: st === 'running' ? 0.9 : 0.5 }));
    }
    for (const lap of laps) { const [lx, ly] = polar(cx, cy, r + sw * 0.9, (lap % 60) * 6); k.add(circle({ cx: lx, cy: ly, r: k.m.line * 0.75, fill: k.colors.muted })); }
    const mm = Math.floor(elapsed / 60), ss = Math.floor(sec), tenth = Math.floor((elapsed * 10) % 10);
    const main = elapsed >= 3600 ? clockText(elapsed) : `${mm}:${pad2(ss)}`;
    k.value(main, { cy: cy - k.m.u * 1.5, size: k.m.u * 18, maxWidth: r * 1.5, color: st === 'ready' ? 'muted' : 'ink' });
    k.caption(st === 'ready' ? 'Start' : `.${tenth}${st === 'stopped' ? ' · stopped' : ''}`, { y: cy + r * 0.52, maxWidth: r * 1.5, color: st === 'ready' ? 'dim' : 'muted' });
    return k.svg();
  },
};

const countdown = {
  id: 'app-countdown', title: 'Countdown', category: 'Clocks & Timers',
  description: 'Press to start a countdown: sixty ticks go out one by one, the last ten pulse, and at zero it alerts and counts overtime. A real timer on the key.',
  tags: ['countdown', 'timer', 'kitchen timer', 'alarm', 'time'],
  surface: 'key', data: ['timer'], fps: 4, loop: 60,
  states: ['ready', 'running'],
  tones: { ready: 'idle', running: 'active' },
  press: 'toggle',
  params: {
    minutes: { type: 'number', default: 5, min: 0, max: 180, step: 1, label: 'Minutes' },
    seconds: { type: 'number', default: 0, min: 0, max: 59, step: 1, label: 'Seconds' },
    label: { type: 'text', default: '', maxLength: 10, label: 'Label' },
  },
  order: 31,
  render(ctx) {
    const k = surface(ctx);
    const { w, h, stateName: st, since, t, params: p } = ctx;
    const total = Math.max(1, p.minutes * 60 + p.seconds);
    const T = ctx.data?.timer;
    const left = T && Number.isFinite(T.remaining) ? T.remaining : st === 'running' ? total - since : total;
    const done = st === 'running' && left <= 0, last = st === 'running' && left > 0 && left <= 10;
    k.background({ tone: done ? 'alert' : last ? 'warn' : ctx.tone });
    const m = Math.min(w, h), cx = w / 2, cy = h * 0.5, r = m * 0.39;
    const frac = clamp(left / total), lit = Math.ceil(frac * 60 - 1e-9);
    const on = done ? k.tone('alert') : last ? k.tone('warn') : colorAt(ctx, 'auto', 0.6);
    let a = '', b = '';
    for (let i = 0; i < 60; i++) {
      const major = i % 5 === 0;
      const [x1, y1] = polar(cx, cy, r, i * 6), [x2, y2] = polar(cx, cy, r - k.m.u * (major ? 5 : 3), i * 6);
      const seg = `M${n(x1)} ${n(y1)}L${n(x2)} ${n(y2)}`;
      if (i < lit && !done) a += seg; else b += seg;
    }
    const tw = n(Math.max(1, k.m.line * (big(k) ? 1 : 0.9)));
    k.add(path(b, { stroke: k.colors.line, strokeWidth: tw, strokeLinecap: 'round' }));
    if (a) k.add(path(a, { stroke: on, strokeWidth: tw, strokeLinecap: 'round', strokeOpacity: st === 'running' ? 1 : 0.55 }));
    if (done && !ctx.reduced) k.add(circle({ cx, cy, r: r * 0.8, fill: on, fillOpacity: n(0.08 + 0.1 * pulse(t, 1), 3) }));
    const shown = done ? `+${clockText(-left)}` : clockText(Math.ceil(left));
    const beat = last && !ctx.reduced ? 0.75 + 0.25 * pulse(left, 1) : 1;
    k.value(shown, { cy: cy - k.m.u, size: k.m.u * 17 * (last ? lerp(0.96, 1.04, beat - 0.75) : 1), maxWidth: r * 1.45, color: done ? 'tone' : st === 'running' ? 'ink' : 'muted' });
    k.caption(done ? 'Done' : st === 'ready' ? (p.label || 'Start') : p.label || `of ${clockText(total)}`, { y: cy + r * 0.5, maxWidth: r * 1.4, color: done ? 'tone' : 'dim' });
    return k.svg();
  },
};

export default [worldClock, stopwatch, countdown];
