// dial-scrubber — a jog wheel for one encoder segment (200 × 100). The ruler and the
// clip's waveform slide under a fixed playhead: every detent jogs the position (≈ ½ s
// by default) and the timecode follows to the frame. Push (or tap the strip) to play /
// pause: playing, the tape rolls at ≤ 8 fps and the panel lights; paused, it is a still.
// With live `media` data the position, duration and play state come from the player.

import { surface, path, rect, n, P } from '../../scene/index.js';
import { clamp } from '../../scene/easing.js';
import { finish, arrival, pointer } from './_d4-dial.js';

const PPS = 22;     // ruler px per second
const FPS = 24;     // timecode frames

const tc = (sec) => {
  const t = Math.max(0, sec), m = Math.floor(t / 60), s = Math.floor(t % 60), f = Math.floor((t % 1) * FPS);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(f).padStart(2, '0')}`;
};
const amp = (ctx, tau) => {
  const a = ctx.noise.n1(tau * 0.9) * 0.55 + ctx.noise.n1(tau * 3.7 + 11) * 0.3 + ctx.noise.n1(tau * 0.17 + 5) * 0.35;
  return clamp(0.18 + 0.82 * Math.abs(a) * 1.25);
};

export default {
  id: 'dial-scrubber',
  title: 'Scrubber',
  category: 'Gauges & Scrubbers',
  description: 'A jog wheel: the ruler and waveform slide under a fixed playhead, each detent jogs about half a second and the timecode follows to the frame. Push or tap to play.',
  tags: ['scrub', 'jog', 'shuttle', 'timeline', 'timecode', 'video', 'audio', 'media', 'dial', 'playhead'],
  surface: 'strip',
  segments: 1,
  data: ['media'],
  fps: 8,
  loop: 8,
  states: ['paused', 'playing'],
  tones: { paused: 'idle', playing: 'active' },
  press: 'toggle',
  params: {
    label: { type: 'text', default: 'Clip 04', label: 'Clip', maxLength: 14 },
    duration: { type: 'number', default: 184, min: 10, max: 3600, step: 1, label: 'Duration (s)' },
    value: { type: 'number', default: 0.42, min: 0, max: 1, step: 0.001, label: 'Position' },
    step: { type: 'number', default: 0.0025, min: 0.0005, max: 0.05, step: 0.0005, label: 'Step per detent' },
  },
  order: 50,
  render(ctx) {
    const k = surface(ctx);
    const { w, h } = ctx;
    const C = k.colors, s = k.m.safe;
    const m = ctx.data?.media;
    const dur = m && m.duration > 0 ? m.duration : ctx.params.duration;
    const playing = m ? !!m.playing : ctx.stateName === 'playing';
    let pos = m && typeof m.position === 'number' ? m.position : ctx.value * dur + (playing && !ctx.reduced ? ctx.since : 0);
    pos = playing ? ((pos % dur) + dur) % dur : clamp(pos, 0, dur);   // playing loops the clip; jogging stops at its ends
    const e = arrival(ctx, 0.5);
    k.background({ tone: playing ? 'active' : 'idle' });
    const cx = w / 2, half = (w - 2 * s) / 2, lo = pos - half / PPS, hi = pos + half / PPS;
    const xOf = (tau) => cx + (tau - pos) * PPS;
    // ruler: minor ticks every ½ s, majors every second, labels every 5 s
    const rt = 33, minor = P(), major = P();
    for (let q = Math.ceil(lo * 2); q <= Math.floor(hi * 2); q++) {
      const tau = q / 2;
      if (tau < 0 || tau > dur) continue;
      const x = xOf(tau);
      (q % 2 ? minor : major).M(x, rt).V(rt + (q % 2 ? 3.2 : q % 10 ? 5.5 : 8));
    }
    k.add(rect({ x: s, y: rt - 1, width: w - 2 * s, height: 1, fill: C.line }));
    k.add(path(minor.d, { fill: 'none', stroke: C.dim, strokeWidth: 1, strokeOpacity: 0.7 }));
    k.add(path(major.d, { fill: 'none', stroke: C.muted, strokeWidth: 1.2 }));
    for (let q = Math.ceil(lo / 5); q <= Math.floor(hi / 5); q++) {
      const tau = q * 5;
      if (tau < 0 || tau > dur || Math.abs(xOf(tau) - cx) < 22 || xOf(tau) + 24 > w - s || xOf(tau) < s) continue;
      const mm = Math.floor(tau / 60), ss = String(tau % 60).padStart(2, '0');
      k.caption(`${mm}:${ss}`, { x: xOf(tau) + 2.5, y: rt + 15.5, align: 'left', color: 'dim', size: 10.5 });
    }
    // the clip's waveform: bars on a fixed time grid, so they slide without shimmer
    const step = 3.2 / PPS, mid = 66.5, amax = 11.5 * e;
    const played = P(), ahead = P();
    for (let q = Math.ceil(lo / step); q <= Math.floor(hi / step); q++) {
      const tau = q * step;
      if (tau < 0 || tau > dur) continue;
      const x = xOf(tau), a = Math.max(0.8, amp(ctx, tau) * amax);
      (tau <= pos ? played : ahead).M(x, mid - a).V(mid + a);
    }
    k.add(path(ahead.d, { fill: 'none', stroke: C.dim, strokeWidth: 1.9, strokeLinecap: 'round', strokeOpacity: 0.65 }));
    k.add(path(played.d, { fill: 'none', stroke: ctx.tint, strokeWidth: 1.9, strokeLinecap: 'round' }));
    // clip ends
    for (const edge of [0, dur]) if (edge >= lo && edge <= hi) k.add(rect({ x: xOf(edge) - 0.75, y: mid - 15, width: 1.5, height: 30, fill: C.muted }));
    // overview: the whole clip and where we are in it
    const oy = 85, ow = w - 2 * s, f = pos / dur;
    k.add(rect({ x: s, y: oy, width: ow, height: 2.4, rx: 1.2, fill: C.line }));
    k.add(rect({ x: s, y: oy, width: Math.max(2.4, ow * f), height: 2.4, rx: 1.2, fill: ctx.tint }));
    // the playhead
    const ink = k.dark ? '#ffffff' : C.ink;
    k.add(rect({ x: cx - 0.8, y: rt - 2, width: 1.6, height: oy - rt - 3, fill: ink }));
    k.add(path(pointer(cx, rt - 6.5, 4.6), { fill: ink }));
    k.add(`<circle cx="${n(s + ow * f)}" cy="${n(oy + 1.2)}" r="3.1" fill="${ink}"/>`);
    // readouts
    k.eyebrow(playing ? `▶ ${ctx.params.label}` : ctx.params.label, { color: playing ? 'ink' : 'muted', maxWidth: w * 0.42 });
    k.value(tc(pos), { align: 'right', x: w - s, cy: 15.5, size: 19, color: 'ink', maxWidth: w * 0.56 });
    return finish(k);
  },
};
