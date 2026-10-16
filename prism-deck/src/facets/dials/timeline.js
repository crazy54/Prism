// strip-timeline — an editing timeline across the whole touch strip (800 × 100 on
// Stream Deck +, 1200 × 100 on + XL): a ruler, a video lane, a dialogue lane and a music
// bed, with markers. Each dial owns the readout above it: dial 1 scrubs the playhead,
// dial 2 zooms the window (10–90 s), dials 3–4 set the video and dialogue levels (on
// + XL also the music level and the play speed). Push or tap any dial to play / pause.
// The page stays put while the playhead sweeps across it (page-scroll, like an editor),
// so while playing only the segment under the playhead and the timecode change; every
// other culled slice stays byte-identical. ≤ 6 fps.

import { surface, path, rect, linearGradient, url, n, P } from '../../scene/index.js';
import { clamp, lerp } from '../../scene/easing.js';
import { rng as makeRng } from '../../scene/noise.js';
import { arrival, ramp, dbOf, pointer } from './_d4-dial.js';

const SEG = 200;
const LANES = { ruler: [25, 33], video: [39, 56], voice: [59, 72], music: [75, 87] };
const FUNCS = ['Scrub', 'Zoom', 'Video', 'Voice', 'Music', 'Speed'];

const tc = (sec) => { const t = Math.max(0, sec), m = Math.floor(t / 60), s = Math.floor(t % 60), f = Math.floor((t % 1) * 24); return `${m}:${String(s).padStart(2, '0')}.${String(f).padStart(2, '0')}`; };
const clock = (sec) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;

/** The edit: clips per lane over the whole duration, from the seed (memoized per seed + duration). */
const memo = new Map();
function edit(seed, dur) {
  const key = `${seed}:${dur}`;
  if (memo.has(key)) return memo.get(key);
  const r = makeRng(seed * 7 + 3);
  const video = [], voice = [], markers = [];
  for (let t = 0, i = 0; t < dur; i++) { const len = 2.5 + r() * 9; video.push({ a: t, b: Math.min(dur, t + len), i }); t += len + (r() < 0.35 ? 0.4 + r() * 1.2 : 0); }
  for (let t = 1 + r() * 3; t < dur;) { const len = 6 + r() * 22; voice.push({ a: t, b: Math.min(dur, t + len) }); t += len + 1.5 + r() * 6; }
  for (let t = 6 + r() * 8; t < dur; t += 9 + r() * 22) markers.push(t);
  const music = [{ a: 0.5, b: dur * 0.58 }, { a: dur * 0.6, b: dur - 0.5 }];
  const out = { video, voice, music, markers };
  if (memo.size > 32) memo.clear();
  memo.set(key, out);
  return out;
}

export default {
  id: 'strip-timeline',
  title: 'Timeline Strip',
  category: 'Strip Panoramas',
  description: 'An editing timeline across the strip: ruler, video, dialogue and music lanes. Dial 1 scrubs, dial 2 zooms, the rest set levels. Push to play; the playhead sweeps.',
  tags: ['timeline', 'edit', 'video', 'nle', 'daw', 'scrub', 'zoom', 'playhead', 'strip', 'touch strip', 'panorama'],
  surface: 'strip',
  segments: 'all',
  data: ['media'],
  fps: 6,
  loop: 12,
  states: ['paused', 'playing'],
  tones: { paused: 'idle', playing: 'active' },
  press: 'toggle',
  params: {
    duration: { type: 'number', default: 240, min: 30, max: 3600, step: 1, label: 'Duration (s)' },
    step: { type: 'number', default: 0.005, min: 0.001, max: 0.05, step: 0.001, label: 'Step per detent' },
    hue: { type: 'hue', default: 243.6, min: 0, max: 360, label: 'Hue' },
  },
  order: 30,
  render(ctx) {
    const k = surface(ctx);
    const { w, h } = ctx;
    const C = k.colors, s = k.m.safe;
    const count = Math.round(w / SEG);
    const val = (i, d) => ctx.values[i] ?? d;
    const m = ctx.data?.media;
    const dur = m && m.duration > 0 ? m.duration : ctx.params.duration;
    const playing = m ? !!m.playing : ctx.stateName === 'playing';
    const rate = count > 5 ? Math.max(0.25, Math.round(lerp(0.25, 2, val(5, 0.45)) * 4) / 4) : 1;
    let pos = m && typeof m.position === 'number' ? m.position : val(0, 0.35) * dur + (playing && !ctx.reduced ? ctx.since * rate : 0);
    pos = playing ? ((pos % dur) + dur) % dur : clamp(pos, 0, dur - 0.001);
    const win = Math.round(lerp(10, 90, val(1, 0.8)));
    const page = Math.floor(pos / win) * win;
    const pps = (w - 2 * s) / win, X = (t) => s + (t - page) * pps;
    const lv = { video: val(2, 0.55), voice: val(3, 0.2), music: val(4, 0.65) };
    const e = arrival(ctx, 0.6);
    k.background({ tone: playing ? 'active' : 'idle' });
    const E = edit(ctx.seed, dur);
    const px = X(pos), ink = k.dark ? '#ffffff' : C.ink;
    // ruler: majors ≥ 40 px apart, labels ≥ 110 px apart (text outlines are most of a strip's bytes)
    const nice = (px) => [1, 2, 5, 10, 15, 30, 60, 120, 300].find((st) => st * pps >= px) || 600;
    const major = nice(40), every = Math.max(major, nice(110));
    for (let i = 0; i < count; i++) {
      const xa = i * SEG, xb = xa + SEG;
      const ta = page + (xa - s) / pps, tb = page + (xb - s) / pps;
      const inSeg = (a, b) => b >= ta && a <= tb;
      const clipX = (a, b) => [Math.max(xa, X(a), s), Math.min(xb, X(b), w - s)];
      // ruler
      const tk = P(), tkm = P();
      const minor = major / 5;
      for (let q = Math.ceil(ta / minor); q <= Math.floor(tb / minor); q++) {
        const t = q * minor, x = X(t);
        if (x < Math.max(xa, s) || x >= Math.min(xb, w - s) || t > dur) continue;
        (q % 5 ? tk : tkm).M(x, LANES.ruler[1]).V(LANES.ruler[1] - (q % 5 ? 2.6 : 6));
        if (!(q % 5) && Math.abs(t / every - Math.round(t / every)) < 1e-6 && x + 26 < w - s) k.caption(clock(t), { x: x + 2.5, y: LANES.ruler[1] - 2, align: 'left', color: 'dim', size: 10 });
      }
      k.add(path(tk.d, { fill: 'none', stroke: C.dim, strokeWidth: 1, strokeOpacity: 0.7 }) + path(tkm.d, { fill: 'none', stroke: C.muted, strokeWidth: 1.2 }));
      k.add(rect({ x: Math.max(xa, s), y: LANES.ruler[1], width: Math.min(xb, w - s) - Math.max(xa, s), height: 1, fill: C.line }));
      // video clips: colored bars, a lit top edge, their level as opacity
      let vd = '';
      for (const c of E.video) {
        if (!inSeg(c.a, c.b)) continue;
        const [x0, x1] = clipX(c.a + 0.05, c.b - 0.05);
        if (x1 - x0 < 0.6) continue;
        const [y0, y1] = LANES.video, hh = (y1 - y0) * e;
        k.add(rect({ x: x0, y: y1 - hh, width: x1 - x0, height: hh, rx: 2, fill: ramp(ctx, (c.i % 7) / 6, 120), fillOpacity: n(lerp(0.25, 0.9, lv.video), 3) }));
        vd += `M${n(x0)} ${n(y1 - hh + 0.75)}H${n(x1)}`;
      }
      if (vd) k.add(path(vd, { fill: 'none', stroke: '#ffffff', strokeWidth: 1, strokeOpacity: k.dark ? 0.35 : 0.6 }));
      // dialogue: clips with their waveform (gain = the dial)
      let wave = '';
      for (const c of E.voice) {
        if (!inSeg(c.a, c.b)) continue;
        const [x0, x1] = clipX(c.a, c.b);
        if (x1 - x0 < 0.6) continue;
        const [y0, y1] = LANES.voice, mid = (y0 + y1) / 2;
        k.add(rect({ x: x0, y: y0, width: x1 - x0, height: y1 - y0, rx: 2, fill: C.line, fillOpacity: 0.75 }));
        for (let x = Math.ceil(x0 / 3) * 3 + 1.5; x < x1 - 1; x += 3) {
          const t = page + (x - s) / pps;
          const a = Math.max(0.6, clamp(0.25 + Math.abs(ctx.noise.n1(t * 1.9) * 1.1 + ctx.noise.n1(t * 7.3 + 3) * 0.4)) * (y1 - y0) * 0.45 * lerp(0.2, 1, lv.voice) * e);
          wave += `M${n(x)} ${n(mid - a)}V${n(mid + a)}`;
        }
      }
      if (wave) k.add(path(wave, { fill: 'none', stroke: ramp(ctx, 0.85, 120), strokeWidth: 1.6, strokeLinecap: 'round' }));
      // music bed: a soft envelope
      for (const c of E.music) {
        if (!inSeg(c.a, c.b)) continue;
        const [x0, x1] = clipX(c.a, c.b);
        if (x1 - x0 < 0.6) continue;
        const [y0, y1] = LANES.music;
        const env = P().M(x0, y1);
        for (let x = x0; x <= x1 + 0.01; x += 4) { const t = page + (Math.min(x, x1) - s) / pps; env.L(Math.min(x, x1), y1 - (y1 - y0) * clamp(0.45 + 0.4 * ctx.noise.n1(t * 0.31 + 9)) * lerp(0.25, 1, lv.music) * e); }
        k.add(path(`${env.L(x1, y1).d}Z`, { fill: ramp(ctx, 0.15, 120), fillOpacity: 0.6 }));
        k.add(rect({ x: x0, y: y1 - 0.5, width: x1 - x0, height: 1, fill: ramp(ctx, 0.15, 120), fillOpacity: 0.8 }));
      }
      // markers on the ruler
      for (const t of E.markers) { const x = X(t); if (x >= Math.max(xa, s) && x < Math.min(xb, w - s)) k.add(path(P().M(x, LANES.ruler[1] + 0.8).L(x + 2.7, LANES.ruler[1] + 3.4).L(x, LANES.ruler[1] + 6).L(x - 2.7, LANES.ruler[1] + 3.4).Z().d, { fill: C.warn })); }
      // what has played on this page: a veil from the page start to the playhead (per segment, so only the playhead's segment changes)
      const vx1 = Math.min(xb, px, w - s), vx0 = Math.max(xa, s);
      if (vx1 > vx0) k.add(rect({ x: vx0, y: LANES.video[0] - 1, width: vx1 - vx0, height: LANES.music[1] - LANES.video[0] + 2, fill: k.dark ? '#ffffff' : '#000000', fillOpacity: 0.05 }));
      // the dial's readout
      const f = FUNCS[i] || `Dial ${i + 1}`;
      const read = [tc(pos), `${win} s`, `${Math.round(lv.video * 100)}%`, `${dbOf(lv.voice)} dB`, `${dbOf(lv.music)} dB`, `${rate}×`][i] ?? '';
      k.eyebrow(i === 0 && playing ? `▶ ${f}` : f, { x: xa + (i ? 10 : s), align: 'left', color: i === 0 && playing ? 'ink' : 'muted', maxWidth: SEG * 0.4 });
      k.eyebrow(read, { x: xb - (i === count - 1 ? s : 10), align: 'right', color: 'ink', maxWidth: SEG * 0.55 });
      if (i) {
        const did = k.id(`div${i}`);
        k.def(linearGradient(did, [[0, C.ink, 0.28], [1, C.ink, 0]]));
        k.add(rect({ x: xa - 0.5, y: 6, width: 1, height: 16, fill: url(did) }));
      }
    }
    // the playhead
    k.add(rect({ x: px - 0.8, y: LANES.ruler[0] - 1, width: 1.6, height: LANES.music[1] - LANES.ruler[0] + 3, fill: ink }));
    k.add(path(pointer(px, LANES.ruler[0] - 3.5, 3.6), { fill: playing ? ctx.tint : ink }));
    return k.svg();
  },
};
