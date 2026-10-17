// press-hold-confirm — a deploy key you can't fire by accident. Hold it: a ring of light fills
// around the rocket while the engine lights and the rocket strains (ctx.pressedFor). Let go early
// and the ring drains back — cancelled. Hold to the end and it launches: the rocket lifts off the
// key, the key works (busy beam + progress), then lands on "Shipped ✓" with a burst of the Spectrum.
//
// How a key remembers its last press: each press-down flips the state (press: 'toggle'), so
// ctx.since counts from the press and ctx.pressAge from the release; held = since − pressAge.
// Both states draw the same — they only mark "a new press began". Static at rest.

import { surface, rect, n } from '../../scene/index.js';
import { clamp, lerp, outExpo, inQuad, smoothstep } from '../../scene/easing.js';
import { mix } from '../../scene/color.js';
import { text, isBig, holdAge, progressArc, headDot, burst, perimeterPoint, capHeight } from '../apps/_d7-kit.js';
import { polar } from '../../scene/shapes.js';

const LAUNCH = 0.55;      // rocket leaves the key
const SHIPPED = 4;        // seconds "Shipped ✓" holds before the key re-arms
const ago = (s) => (s < 60 ? 'just now' : s < 3600 ? `${Math.floor(s / 60)}m ago` : `${Math.floor(s / 3600)}h ago`);

export default {
  id: 'press-hold-confirm',
  title: 'Hold to Deploy',
  category: 'Press Feedback',
  description: 'Hold to confirm: a ring fills while the rocket strains, letting go early cancels, holding through launches it — then the key deploys and lands on Shipped.',
  tags: ['hold', 'confirm', 'deploy', 'release', 'ship', 'safety', 'long press', 'rocket', 'dev'],
  surface: 'key',
  fps: 10,
  loop: 4,
  states: ['ready', 'rearmed'],
  press: 'toggle',
  params: {
    label: { type: 'text', default: 'Deploy', maxLength: 12, label: 'Action' },
    target: { type: 'text', default: 'prod', maxLength: 12, label: 'Target' },
    hold: { type: 'number', default: 1.5, min: 0.5, max: 5, step: 0.1, label: 'Hold for (s)' },
    duration: { type: 'number', default: 6, min: 1, max: 120, step: 1, label: 'Deploy takes (s, shown as progress)' },
    hue: { type: 'hue', default: 296, min: 0, max: 360, label: 'Hue' },
  },
  order: 30,
  render(ctx) {
    const k0 = surface(ctx);
    const { w, h } = ctx;
    const C = k0.colors, u = k0.m.u;
    const H = holdAge(ctx);
    const need = ctx.params.hold, dur = ctx.params.duration;
    const fired = H.held >= need;
    const after = fired ? ctx.since - need : -1;        // seconds since it fired
    let phase = 'ready';
    if (H.pressed && !fired) phase = 'holding';
    else if (!H.pressed && !fired && H.released < 1.4) phase = 'cancel';
    else if (fired && after < LAUNCH) phase = 'launch';
    else if (fired && after < LAUNCH + dur) phase = 'deploying';
    else if (fired && after < LAUNCH + dur + SHIPPED) phase = 'shipped';
    const tone = phase === 'deploying' ? 'busy' : phase === 'shipped' ? 'ok' : phase === 'holding' || phase === 'launch' ? 'active' : phase === 'cancel' ? 'warn' : 'idle';
    // the theme's press sink would fight the hold animation: only the ready key gets it
    const k = phase === 'ready' || phase === 'cancel' ? k0 : surface({ ...ctx, pressed: false, pressAge: Infinity });
    k.background({ tone });
    const big = isBig(k);
    const box = k.theme.glyphBox(k, { labeled: true });
    // the ring sits between the eyebrow (big keys) and the label
    const lab = k.typeStyle('label'), eb = k.typeStyle('eyebrow');
    const top = big ? k.m.text + capHeight(eb.size, eb.weight) + 3.5 * u : k.m.safe * 0.9;
    const bottom = h - (k.theme.type.label?.baseline ?? 6.5) * u - capHeight(lab.size, lab.weight) - 3 * u;
    const R = Math.max(8 * u, Math.min((bottom - top) / 2, w / 2 - k.m.safe));
    const cx = w / 2, cy = (top + bottom) / 2;
    const sw = Math.max(1.5, k.m.bold * 0.9);
    const ink = k.dark ? '#ffffff' : C.ink;
    // the ring: track, then the fill (holding / draining / complete)
    const f = phase === 'holding' ? clamp(H.held / need)
      : phase === 'cancel' ? clamp(H.held / need) * (1 - outExpo(clamp(H.released / 0.45)))
      : phase === 'launch' ? 1 : 0;
    // arrival (the key appears / re-arms): the ring track sweeps in, the rocket settles onto its pad
    const fresh = phase === 'ready' && !Number.isFinite(ctx.pressAge) && !ctx.pressed;
    const arr = fresh && !ctx.reduced ? outExpo(clamp(ctx.since / 0.6)) : 1;
    if (phase !== 'deploying' && phase !== 'shipped') {
      k.add(progressArc({ cx, cy, r: R, value: arr, color: C.line, width: sw * 0.6 }));
      if (f > 0.003) {
        const col = phase === 'cancel' ? C.warn : mix(ctx.tint, C.warn, smoothstep(0.55, 1, f) * 0.6);
        k.add(progressArc({ cx, cy, r: R, value: f, color: col, width: sw }));
        if (phase === 'holding') { const [hx, hy] = polar(cx, cy, R, 360 * f); k.add(headDot(k, hx, hy, sw * 0.6, col)); }
      }
    }
    if (phase === 'ready' || phase === 'holding' || phase === 'cancel' || phase === 'launch') {
      // the rocket: strains while held (engine lit, a tremble that grows), lifts off the key on launch
      const strain = phase === 'holding' ? f : phase === 'launch' ? 1 : 0;
      const jitter = phase === 'holding' && !ctx.reduced ? (ctx.noise.n1(ctx.t * 23) - 0.5) * box.size * 0.04 * strain : 0;
      const lift = phase === 'launch' ? inQuad(clamp(after / LAUNCH)) * (cy + R * 2) : -(1 - arr) * R * 0.35;
      const gs = R * 1.55;
      k.glyph('rocket', { box: { x: cx - gs / 2 + jitter, y: cy - gs / 2 - lift, size: gs }, state: strain > 0.05 ? 'launched' : 'ready', since: phase === 'holding' ? H.held * 0.6 : phase === 'launch' ? 1 : 9, opacity: arr < 1 ? 0.3 + 0.7 * arr : undefined, tone: phase === 'cancel' ? 'warn' : strain > 0.05 ? 'active' : 'idle' });
      if (phase === 'launch') k.add(rect({ width: w, height: h, fill: ink, fillOpacity: n(0.22 * (1 - clamp(after / 0.3)), 3) }));
    }
    // words
    const P = ctx.params;
    if (phase === 'ready') {
      k.label(P.label, { color: 'ink' });
      if (big) k.eyebrow(fired ? `Shipped ${ago(after - LAUNCH - dur)}` : `→ ${P.target}`, { color: fired ? 'pos' : 'muted', maxWidth: w - k.m.text * 2 });
    } else if (phase === 'holding') {
      k.label(f > 0.7 ? 'Almost…' : 'Hold…', { color: 'ink' });
      if (big) k.eyebrow(`→ ${P.target}`, { color: 'muted' });
    } else if (phase === 'cancel') {
      k.label('Cancelled', { color: 'warn' });
      if (big) k.eyebrow('too short', { color: 'muted' });
    } else if (phase === 'launch') {
      k.label(P.label, { color: 'ink' });
    } else if (phase === 'deploying') {
      // progress: an eased, believable curve; the percentage as the value
      const p = clamp((after - LAUNCH) / dur);
      const shown = 1 - (1 - p) ** 1.6;
      const by = cy + R * 0.58, bw = w - k.m.text * 2, bh = Math.max(3, u * 3);
      text(k, `${Math.floor(shown * 100)}%`, { cy: cy - R * 0.12, size: (big ? 22 : 20) * u, weight: 700, tabular: true, color: 'ink' });
      k.add(rect({ x: n(k.m.text), y: n(by), width: n(bw), height: n(bh), rx: n(bh / 2), fill: C.line }));
      k.add(rect({ x: n(k.m.text), y: n(by), width: n(Math.max(bh, bw * shown)), height: n(bh), rx: n(bh / 2), fill: ctx.tint }));
      k.add(headDot(k, k.m.text + Math.max(bh, bw * shown) - bh / 2, by + bh / 2, bh * 0.55, ctx.tint));
      k.label(big ? `Deploying` : 'Deploy…', { color: 'muted' });
      if (big) k.eyebrow(`→ ${P.target}`, { color: 'muted' });
    } else if (phase === 'shipped') {
      const a = after - LAUNCH - dur;
      k.add(burst(k, { cx, cy, r0: R * 0.35, r1: R * 1.25, age: a, dur: 1, count: 12, hue: ctx.hue }));
      k.glyph('check', { box: { x: cx - R * 0.9, y: cy - R * 0.9, size: R * 1.8 }, state: 'done', since: a, tone: 'ok' });
      k.label('Shipped', { color: 'pos' });
      if (big) k.eyebrow(`${P.target} ✓`, { color: 'pos' });
    }
    void lerp; void perimeterPoint;
    return k.svg();
  },
};
