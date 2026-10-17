// state-do-not-disturb — focus mode on one key. Available: an open ring with a presence dot.
// Press: a shadow disc slides across the moon and carves a crescent (outExpo, 0.6 s), two stars
// light beside it, and the key tells you how long you're heads-down ("until 10:41" · "47m").
// When the time is up it turns amber and says so; press again to come back. Static between
// presses: the only change is the minutes-left readout, once a minute.

import { surface, path, circle, n, P } from '../../scene/index.js';
import { clamp, outExpo, lerp } from '../../scene/easing.js';
import { clockOf } from '../../scene/context.js';
import { mix } from '../../scene/color.js';
import { isBig, progressArc, widthOf, capHeight } from '../apps/_d7-kit.js';

/** Crescent: disc (cx, cy, R) minus a disc offset by (ox, oy) with radius r, as one closed polyline path. */
function crescentPath(cx, cy, R, ox, oy, r, steps = 36) {
  const d = Math.hypot(ox, oy);
  const full = () => P().M(cx + R, cy).A(R, R, 0, 0, 1, cx - R, cy).A(R, R, 0, 0, 1, cx + R, cy).Z().d;
  if (d >= R + r - 0.01) return full();
  if (d + R <= r) return '';
  const a = (R * R - r * r + d * d) / (2 * d);
  const hh = Math.sqrt(Math.max(0, R * R - a * a));
  const ux = ox / d, uy = oy / d;
  const bx = cx + a * ux, by = cy + a * uy;
  const p1 = [bx - hh * uy, by + hh * ux], p2 = [bx + hh * uy, by - hh * ux];
  const ang = (p, c) => Math.atan2(p[1] - c[1], p[0] - c[0]);
  const p = P();
  // along the big disc, the long way round (away from the shadow)
  let a1 = ang(p1, [cx, cy]), a2 = ang(p2, [cx, cy]);
  const toward = Math.atan2(uy, ux);
  const norm = (x) => { while (x < 0) x += Math.PI * 2; while (x >= Math.PI * 2) x -= Math.PI * 2; return x; };
  // choose the direction from a1 to a2 that does not pass `toward`
  let span = norm(a2 - a1);
  if (norm(toward - a1) < span) span -= Math.PI * 2;
  for (let i = 0; i <= steps; i++) { const t = a1 + (span * i) / steps; const x = cx + R * Math.cos(t), y = cy + R * Math.sin(t); i ? p.L(x, y) : p.M(x, y); }
  // back along the shadow disc, inside the big one
  const sc = [cx + ox, cy + oy];
  a1 = ang(p2, sc); a2 = ang(p1, sc);
  const away = Math.atan2(-uy, -ux);
  span = norm(a2 - a1);
  if (norm(away - a1) >= span) span -= Math.PI * 2;
  for (let i = 1; i <= steps; i++) { const t = a1 + (span * i) / steps; p.L(sc[0] + r * Math.cos(t), sc[1] + r * Math.sin(t)); }
  return p.Z().d;
}

const star = (x, y, s) => P().M(x, y - s).Q(x, y, x + s, y).Q(x, y, x, y + s).Q(x, y, x - s, y).Q(x, y, x, y - s).Z().d;

export default {
  id: 'state-do-not-disturb',
  title: 'Do Not Disturb',
  category: 'State Transitions',
  description: 'Focus mode: press and a shadow carves the moon into a crescent, stars light, and the key shows how long you are heads-down. Amber when the time is up.',
  tags: ['focus', 'do not disturb', 'dnd', 'quiet', 'status', 'presence', 'productivity', 'moon'],
  surface: 'key',
  fps: 8,
  loop: 4,
  states: ['available', 'focus'],
  tones: { available: 'idle', focus: 'active' },
  press: 'toggle',
  params: {
    minutes: { type: 'number', default: 60, min: 0, max: 480, step: 5, label: 'Focus for (minutes, 0 = until I press)' },
    labelOn: { type: 'text', default: 'Focus', maxLength: 14, label: 'Label in focus' },
    labelOff: { type: 'text', default: 'Available', maxLength: 14, label: 'Label when available' },
    hour12: { type: 'bool', default: false, label: '12-hour clock' },
    hue: { type: 'hue', default: 282, min: 0, max: 360, label: 'Hue' },
  },
  order: 22,
  render(ctx) {
    const k = surface(ctx);
    const { w, h } = ctx;
    const C = k.colors, u = k.m.u;
    const focus = ctx.stateName === 'focus';
    const total = ctx.params.minutes * 60;
    const left = total > 0 ? total - ctx.since : Infinity;
    const over = focus && left <= 0;
    const tone = focus ? (over ? 'warn' : 'active') : 'idle';
    k.background({ tone });
    const big = isBig(k);
    const box = k.theme.glyphBox(k, { labeled: true });
    const cx = box.x + box.size / 2, cy = box.y + box.size / 2 + (big ? u * 2 : 0);
    const R = box.size * 0.36;
    // the shadow disc's travel: from outside (upper right) to carve the crescent; leaving focus it slides away
    // every state change plays the transition; arriving in focus forms the crescent, arriving available draws the ring in
    const fresh = !Number.isFinite(ctx.pressAge) && !ctx.pressed;
    const e = ctx.reduced ? 1 : outExpo(clamp(ctx.since / 0.6));
    const f = focus ? e : fresh ? 0 : 1 - e;           // 1 = full crescent
    const ox = lerp(R * 2.3, R * 0.52, f), oy = lerp(-R * 1.7, -R * 0.42, f);
    const lit = focus ? (over ? C.warn : ctx.tint) : C.muted;
    const moonFill = focus ? (k.dark ? mix(lit, '#ffffff', 0.25) : ctx.theme.spectral(ctx.hue, { tier: 'ink' })) : 'none';
    if (f > 0.02) {
      const d = crescentPath(cx, cy, R, ox, oy, R * 0.86);
      if (focus && k.dark) k.add(circle({ cx: n(cx), cy: n(cy), r: n(R * 1.45), fill: lit, fillOpacity: n(0.08 * f, 3) }));
      k.add(path(d, { fill: focus ? moonFill : C.muted, fillOpacity: focus ? n(clamp(0.25 + 0.75 * f), 3) : n(0.35 * f, 3), stroke: focus ? lit : C.muted, strokeWidth: n(k.m.line), strokeLinejoin: 'round', strokeOpacity: n(0.4 + 0.6 * f, 3) }));
    }
    if (f < 0.98) {
      // available: an open ring with a presence dot (fades as the crescent forms)
      const o = 1 - f;
      if (fresh && !focus && e < 0.999) k.add(progressArc({ cx, cy, r: R, value: e, color: C.muted, width: k.m.line * 1.2 }));
      else k.add(circle({ cx: n(cx), cy: n(cy), r: n(R), fill: 'none', stroke: C.muted, strokeWidth: n(k.m.line * 1.2), strokeOpacity: n(o, 3) }));
      const [px, py] = [cx + R * 0.72, cy + R * 0.72];
      k.add(circle({ cx: n(px), cy: n(py), r: n(R * 0.3), fill: C.surface2, fillOpacity: n(o, 3) }) + circle({ cx: n(px), cy: n(py), r: n(R * 0.2), fill: C.pos, fillOpacity: n(o, 3) }));
    }
    // stars light once the crescent has formed
    if (focus) {
      const s1 = clamp((ctx.since - 0.3) / 0.3), s2 = clamp((ctx.since - 0.45) / 0.3);
      const st = (x, y, s, a) => (a > 0.02 ? path(star(x, y, s), { fill: k.dark ? '#ffffff' : lit, fillOpacity: n(a, 3) }) : '');
      k.add(st(cx + R * 0.95, cy - R * 0.62, R * 0.2, ctx.reduced ? 1 : s1) + st(cx + R * 0.48, cy - R * 0.02, R * 0.12, ctx.reduced ? 1 : s2));
    }
    // labels
    const label = focus ? (over ? "Time's up" : ctx.params.labelOn) : ctx.params.labelOff;
    k.label(label, { color: focus ? (over ? 'warn' : 'ink') : 'muted' });
    // time left: a hairline ring round the moon that drains by the minute (one update a minute)
    if (focus && Number.isFinite(left) && !over && f > 0.5) {
      const frac = clamp(Math.ceil(left / 60) / Math.max(1, Math.ceil(total / 60)));
      const ebs = k.typeStyle('eyebrow');
      const top = big ? k.m.text + capHeight(ebs.size, ebs.weight) + 2.5 * u : k.m.safe * 0.6;
      const rr = Math.max(R * 1.12, Math.min(R * 1.32, cy - top));   // clear of the eyebrow
      k.add(circle({ cx: n(cx), cy: n(cy), r: n(rr), fill: 'none', stroke: C.line, strokeWidth: n(Math.max(1, u * 0.8)) }));
      k.add(progressArc({ cx, cy, r: rr, value: frac, color: lit, width: Math.max(1.25, u * 1.2) }));
    }
    if (big) {
      if (focus && Number.isFinite(left)) {
        if (!over) {
          const until = clockOf(ctx.now + left * 1000, ctx.clock?.tzOffset ?? 0);
          const hh = ctx.params.hour12 ? ((until.h + 11) % 12) + 1 : until.h;
          const mins = `${Math.ceil(left / 60)}m`, at = `→ ${hh}:${String(until.m).padStart(2, '0')}`, es = k.typeStyle('eyebrow');
          const wo = (str) => widthOf(str, es.size, { weight: es.weight, tracking: es.tracking, caps: es.caps });
          if (wo(mins) + wo(at) + 5 * u <= w - k.m.text * 2) {
            k.eyebrow(mins, { align: 'right', x: w - k.m.text, color: 'ink' });
            k.eyebrow(at, { color: 'muted' });
          } else k.eyebrow(`${mins} left`, { color: 'muted', maxWidth: w - k.m.text * 2 });
        } else k.eyebrow(`+${Math.floor(-left / 60)}m over`, { color: 'warn' });
      } else if (focus) k.eyebrow('DND', { color: 'muted' });
      else k.eyebrow('Status', { color: 'dim' });
    }
    return k.svg();
  },
};
