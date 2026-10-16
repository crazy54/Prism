// app-mic-meter — a broadcast LED ladder for your mic. Segments climb green → amber → red with the
// live level (ctx.data.audio, dB-scaled), a peak-hold segment lingers, and a CLIP lamp latches
// red for two seconds when you hit the top. Press to mute: the ladder goes dark, the mic is struck
// through and the key says so — and if you talk while muted it asks "Talking?". 8 fps live.

import { surface, rect, path, n, P } from '../../scene/index.js';
import { clamp } from '../../scene/easing.js';
import { mix } from '../../scene/color.js';
import { audioOf } from './_data.js';
import { text, isBig } from './_d7-kit.js';
import { mutedPlate, strike } from './_muted.js';

export default {
  id: 'app-mic-meter',
  title: 'Mic Level',
  category: 'Audio',
  description: 'A broadcast LED ladder for your mic, green to red with peak hold. Press: MUTED (shows state only; linked mic keys follow). Level: sound capture, else demo.',
  tags: ['mic', 'microphone', 'level', 'meter', 'vu', 'mute', 'audio', 'stream', 'podcast', 'streaming', 'broadcast', 'muted', 'obs-style'],
  surface: 'key',
  data: ['audio', 'mic'],
  fps: 8,
  loop: 8,
  states: ['live', 'muted'],
  tones: { live: 'idle', muted: 'neg' },
  press: 'toggle',
  link: { 'mic.muted': { live: false, muted: true } },
  params: {
    label: { type: 'text', default: 'Mic', maxLength: 10, label: 'Label' },
    hue: { type: 'hue', default: 150, min: 0, max: 360, label: 'Hue' },
  },
  order: 12,
  render(ctx) {
    const k = surface(ctx);
    const { w, h } = ctx;
    const C = k.colors, u = k.m.u;
    const mic = ctx.data?.mic;
    const muted = mic && typeof mic.muted === 'boolean' ? mic.muted : ctx.stateName === 'muted';
    const A = audioOf(ctx, { count: 90, rate: 30 });
    const level = clamp(A.level), peak = clamp(Math.max(A.peak ?? level, level));
    // the clip lamp latches for 2 s after the last sample that hit the top
    const recent = A.levels.slice(-60);
    let clipAge = Infinity;
    for (let i = recent.length - 1; i >= 0; i--) if (recent[i] >= 0.97) { clipAge = (recent.length - 1 - i) / (A.rate || 30); break; }
    const clipped = !muted && clipAge < 2;
    const talking = muted && A.live && level > 0.55;   // only a real mic can catch you talking
    k.background({ tone: muted ? 'neg' : 'idle' });
    if (muted) mutedPlate(k, { since: ctx.since });
    const big = isBig(k);
    // the ladder (right) — one path per lit color, one for the unlit glass
    const N = big ? 18 : 12;
    const lx = w - k.m.safe - Math.round(w * (big ? 0.2 : 0.24)), lw = Math.round(w * (big ? 0.2 : 0.24));
    const ly0 = k.m.safe + (big ? 9 : 7) * u, ly1 = h - k.m.safe;
    const segH = (ly1 - ly0) / N, gap = Math.max(1, segH * 0.28);
    const zone = (i) => (i >= N - 2 ? 'neg' : i >= N - 6 ? 'warn' : 'pos');
    const lit = { pos: '', warn: '', neg: '' };
    let off = '';
    const peakI = Math.min(N - 1, Math.floor(peak * N - 0.001));
    for (let i = 0; i < N; i++) {
      const y = ly1 - (i + 1) * segH + gap / 2;
      const on = !muted && level * N > i + 0.15;
      const isPeak = !muted && i === peakI && peak > 0.05;
      const d = `M${n(lx)} ${n(y)}h${n(lw)}v${n(segH - gap)}h${n(-lw)}Z`;
      if (on || isPeak) lit[zone(i)] += d; else off += d;
    }
    const glass = muted ? mix(C.surface2, C.line, 0.5) : mix(C.surface2, C.line, 0.6);
    if (off) k.add(path(off, { fill: glass, fillOpacity: k.dark ? 0.8 : undefined }));
    for (const z of ['pos', 'warn', 'neg']) if (lit[z]) k.add(path(lit[z], { fill: C[z] }));
    // clip lamp above the ladder
    const cy0 = k.m.safe + (big ? 1.5 : 0.8) * u, chH = (big ? 6 : 5) * u;
    k.add(rect({ x: n(lx), y: n(cy0), width: n(lw), height: n(chH), rx: n(chH * 0.3), fill: clipped ? C.neg : glass }));
    if (big) text(k, 'CLIP', { x: lx + lw / 2, cy: cy0 + chH / 2, size: chH * 0.62, weight: 700, tracking: 0.08, color: clipped ? '#ffffff' : C.dim });
    // the mic (left), its level in dB
    const room = lx - k.m.safe - u * 3;
    const gs = Math.min(room, h * (big ? 0.46 : 0.5));
    const gx = k.m.safe + (room - gs) / 2, gy = big ? k.m.safe + 6 * u : k.m.safe * 0.6;
    k.glyph('mic', { box: { x: gx, y: gy, size: gs }, state: muted ? 'off' : 'on', since: 9, tone: muted ? 'neg' : 'active', level });
    if (muted) strike(k, { x: gx, y: gy, size: gs }, { since: ctx.since });
    const cx = k.m.safe + room / 2;
    if (muted) {
      text(k, talking ? 'TALKING?' : 'MUTED', { x: cx, y: h - k.m.safe - (big ? 4 : 2) * u, size: (big ? 12 : 10) * u, weight: 700, tracking: 0.04, color: 'ink', maxWidth: room + u * 2, minSize: 7 * u });
    } else {
      const db = level > 0.001 ? Math.round((level - 1) * 60) : null;
      text(k, db === null ? '—' : db === 0 ? '0' : `−${Math.abs(db)}`, { x: cx, y: h - k.m.safe - (big ? 12 : 3) * u, size: (big ? 17 : 12) * u, weight: 700, tabular: true, color: 'ink', maxWidth: room + u * 2 });
      if (big) text(k, 'dB', { x: cx, y: h - k.m.safe - 2 * u, size: 8 * u, weight: 600, caps: true, tracking: 0.1, color: 'muted' });
    }
    if (big) k.eyebrow(ctx.params.label, { color: muted ? 'ink' : 'muted', maxWidth: room });
    return k.svg();
  },
};
