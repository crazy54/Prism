// press-clip — the "that was good, save it" key. A mini timeline runs along the bottom with the
// replay buffer lit at its end. Press: a shutter flash, the buffer fills right-to-left as it is
// saved ("Clip ✓ 30 s") — or, as a marker key, a pin drops onto the timeline with a bounce
// ("Marked ✓") — and the wall-clock time of the press is stamped on the key. The confirmation
// holds 2.6 s, then the key quietly re-arms. Static at rest (momentary; no idle motion).

import { surface, rect, path, n, P } from '../../scene/index.js';
import { clamp, outExpo, outBack, lerp } from '../../scene/easing.js';
import { clockOf } from '../../scene/context.js';
import { mix } from '../../scene/color.js';
import { text, isBig, headDot } from '../apps/_d7-kit.js';

const HOLD = 2.6, OUT = 0.4;
const stamp = (c) => `${c.h}:${String(c.m).padStart(2, '0')}:${String(c.s).padStart(2, '0')}`;

export default {
  id: 'press-clip',
  title: 'Clip & Marker',
  category: 'Press Feedback',
  description: 'Save the moment: press and the replay buffer fills as it saves, or a marker pin drops on the timeline — the time of the press is stamped, then the key re-arms.',
  tags: ['clip', 'marker', 'replay', 'highlight', 'bookmark', 'stream', 'recording', 'creator', 'confirm'],
  surface: 'key',
  fps: 10,
  loop: 4,
  press: 'momentary',
  params: {
    kind: { type: 'select', default: 'clip', options: ['clip', 'marker'], label: 'Saves a' },
    seconds: { type: 'number', default: 30, min: 5, max: 120, step: 5, label: 'Clip length (s)' },
    label: { type: 'text', default: '', maxLength: 12, label: 'Label (blank = Clip / Marker)' },
    hue: { type: 'hue', default: 8, min: 0, max: 360, label: 'Hue' },
  },
  order: 32,
  render(ctx) {
    const k = surface(ctx);
    const { w, h } = ctx;
    const C = k.colors, u = k.m.u;
    const clip = ctx.params.kind !== 'marker';
    const age = ctx.pressed ? 0 : ctx.pressAge;                  // seconds since the press
    const active = Number.isFinite(age) && age < HOLD + OUT;
    const out = active ? 1 - clamp((age - HOLD) / OUT) : 0;       // confirmation strength (fades at the end)
    const done = active && (clip ? age >= 0.6 : age >= 0.35);
    k.background({ tone: active ? (done ? 'ok' : 'active') : 'idle' });
    const big = isBig(k);
    // the timeline: hairline + ticks, the buffer (clip) at the right end
    const arr = !Number.isFinite(ctx.pressAge) && !ctx.pressed && !ctx.reduced ? outExpo(clamp(ctx.since / 0.6)) : 1;   // the key arrives: the timeline draws in
    const x0 = k.m.text, x1 = k.m.text + (w - k.m.text * 2) * arr, ty = h - (big ? 24.5 : 22.5) * u;
    const lineCol = C.line;
    const tk = P();
    for (let i = 0; i <= 8; i++) { const x = lerp(x0, x1, i / 8); tk.M(x, ty - (i % 4 === 0 ? 2.5 : 1.4) * u).V(ty); }
    k.add(rect({ x: n(x0), y: n(ty), width: n(x1 - x0), height: n(Math.max(1, u * 0.9)), fill: lineCol }));
    k.add(path(tk.d, { stroke: lineCol, strokeWidth: n(Math.max(1, u * 0.7)) }));
    const tint = ctx.tint, ok = C.pos;
    if (clip) {
      const bw = (x1 - x0) * 0.42, bx = x1 - bw, bh = Math.max(3, 3.2 * u);
      k.add(rect({ x: n(bx), y: n(ty - bh / 2), width: n(bw), height: n(bh), rx: n(bh / 2), fill: tint, fillOpacity: active ? 0.35 : 0.28 }));
      if (active) {
        const f = clamp(age / 0.6);
        const fw = bw * outExpo(f);
        const col = mix(tint, ok, done ? 1 : 0);
        k.add(rect({ x: n(x1 - fw), y: n(ty - bh / 2), width: n(Math.max(bh, fw)), height: n(bh), rx: n(bh / 2), fill: col, fillOpacity: out < 1 ? n(out, 3) : undefined }));
        if (!done) k.add(headDot(k, x1 - fw + bh / 2, ty, bh * 0.55, col));
        // bracket ends
        const br = P().M(bx + u * 1.5, ty - bh * 1.15).H(bx).V(ty + bh * 1.15).H(bx + u * 1.5).M(x1 - u * 1.5, ty - bh * 1.15).H(x1).V(ty + bh * 1.15).H(x1 - u * 1.5);
        k.add(path(br.d, { fill: 'none', stroke: col, strokeWidth: n(Math.max(1, u * 0.9)), strokeOpacity: n(out, 3) }));
      }
    } else if (active) {
      // the pin drops onto the timeline, bounces, holds
      const px = x1 - (x1 - x0) * 0.12;
      const d = outBack(clamp(age / 0.35), 2.2);
      const top = ty - 14 * u, y = lerp(top - 10 * u, ty, d);
      const s = 4.2 * u;
      const pin = P().M(px, y).L(px, y - s * 2.2).M(px, y - s * 2.2).L(px + s * 1.5, y - s * 1.7).L(px, y - s * 1.2);
      k.add(path(pin.d, { fill: done ? ok : tint, fillOpacity: n(out, 3), stroke: done ? ok : tint, strokeWidth: n(Math.max(1.2, u * 1.1)), strokeLinejoin: 'round', strokeLinecap: 'round', strokeOpacity: n(out, 3) }));
      k.add(rect({ x: n(px - u * 2), y: n(ty - u * 0.5), width: n(u * 4), height: n(u * 1.9), rx: n(u), fill: done ? ok : tint, fillOpacity: n(out, 3) }));
    }
    // the glyph (above the timeline)
    const gTop = big ? k.m.safe + 10 * u : k.m.safe * 0.6;
    const gs = Math.min(w * 0.5, ty - 2.5 * u - gTop);
    const gy = gTop + (ty - 2.5 * u - gTop - gs) / 2;
    const g = clip ? 'record' : 'marker';
    const gstate = clip ? (active && !done ? 'recording' : 'ready') : (active ? 'marked' : 'ready');
    k.glyph(g, { box: { x: w / 2 - gs / 2, y: gy, size: gs }, state: gstate, since: active ? age : 9, tone: active ? (done ? 'ok' : clip ? 'alert' : 'active') : 'idle' });
    // shutter flash
    if (active && age < 0.18) k.add(rect({ width: w, height: h, fill: k.dark ? '#ffffff' : C.ink, fillOpacity: n(0.28 * (1 - age / 0.18), 3) }));
    // words: the label, then the stamp
    const name = ctx.params.label || (clip ? 'Clip' : 'Marker');
    const when = active ? clockOf(ctx.now - age * 1000, ctx.clock?.tzOffset ?? 0) : null;
    const word = !active ? name : done ? (clip ? `Clip ✓` : 'Marked ✓') : (clip ? 'Saving' : 'Mark');
    k.label(word, { color: active && done ? 'pos' : 'ink', opacity: active ? Math.max(0.35, out) : undefined });
    if (big) {
      if (active && done) k.eyebrow(stamp(when), { color: 'muted', opacity: out, maxWidth: w - k.m.text * 2 });
      else if (!active) k.eyebrow(clip ? `last ${ctx.params.seconds} s` : 'timeline', { color: 'dim' });
    }
    return k.svg();
  },
};
