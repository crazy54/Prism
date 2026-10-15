// alert-pulse — the canonical "needs attention": the key's rim and light pulse at the
// alert's severity (warn slow, alert quicker, critical quickest) with a ring rippling
// out from the glyph on every beat. The beat is a quick rise and a long fall, not a
// strobe. Press to acknowledge: the key holds steady and stops asking.

import { surface, rect, circle, n, phase, lerp, clamp, outCubic, arrive } from '../../scene/index.js';
import { glyphId, stateWithTone, themeBox, cellOf, layer, addFaded, glyphTime } from './_d2-motion.js';

export const SEVERITY = { warn: 1.6, alert: 1.2, crit: 0.8 };
/** One beat over p ∈ [0, 1): rise in 18%, ease down over the rest; 0 at the wrap. */
export const beat = (p) => (p < 0.18 ? outCubic(p / 0.18) : (1 - (p - 0.18) / 0.82) ** 2.2);

export default {
  id: 'alert-pulse',
  title: 'Pulse',
  category: 'Alerts & Attention',
  description: 'An alert that pulses at its severity: slow for a warning, quicker for an alert, quickest for critical, with a ripple per beat. Press to acknowledge.',
  tags: ['alert', 'pulse', 'attention', 'warning', 'critical', 'notification', 'acknowledge'],
  surface: 'key',
  fps: 10,
  loop: 4.8,
  states: ['alerting', 'acknowledged'],
  tones: { alerting: 'alert', acknowledged: 'idle' },
  press: 'toggle',
  params: {
    glyph: { type: 'glyph', default: 'broadcast', label: 'Glyph' },
    label: { type: 'text', default: 'Alert', label: 'Label', maxLength: 14 },
    severity: { type: 'select', default: 'alert', options: ['warn', 'alert', 'crit'], label: 'Severity' },
  },
  order: 10,
  render(ctx) {
    const k = surface(ctx);
    const sev = SEVERITY[ctx.params.severity] ? ctx.params.severity : 'alert';
    const gid = glyphId(ctx, ctx.params.glyph, 'broadcast');
    const g = ctx.glyphs.get(gid);
    const alerting = ctx.stateName !== 'acknowledged';
    const color = k.tone(sev);
    if (!alerting) {
      // acknowledged: settles from the alert to rest, then holds still
      const s = arrive(ctx.since, 0.5);
      k.background({ tone: 'idle' });
      addFaded(k, layer(k, sev), 1 - s);
      k.glyph(gid, { labeled: true, state: g.defaultState, t: glyphTime(ctx, g) });
      k.eyebrow('Seen', { color: 'muted' });
      k.label(ctx.params.label, { color: 'muted' });
      return k.svg();
    }
    const T = SEVERITY[sev];
    const p = ctx.reduced ? 0.15 : phase(ctx.t, T);
    const box = themeBox(k, true);
    const cell = cellOf(k, box);
    let v = beat(p);
    if (cell) v = v > 0.66 ? 1 : v > 0.33 ? 0.6 : 0.25;   // 8-bit: three steps, no fade
    k.background({ tone: sev });
    // the rim: the key's edge lights with the beat
    const inset = k.m.hair * 1.5;
    k.add(rect({ x: inset, y: inset, width: k.w - inset * 2, height: k.h - inset * 2, rx: cell ? 0 : k.m.radius, fill: 'none', stroke: color, strokeWidth: n(cell ? Math.max(1, Math.round(cell / 2)) : k.m.line * 1.4), strokeOpacity: n(lerp(0.2, 0.95, v), 3) }));
    k.add(rect({ width: k.w, height: k.h, fill: color, fillOpacity: n((k.dark ? 0.1 : 0.08) * v, 3) }));
    // the ripple: one ring per beat, out from the glyph
    const cx = box.x + box.size / 2, cy = box.y + box.size / 2;
    const rp = clamp(p / 0.75);
    if (!ctx.reduced && rp < 1) {
      const r = lerp(box.size * 0.32, Math.hypot(k.w, k.h) * 0.5, outCubic(rp));
      if (cell) {
        const R = Math.round(r / cell) * cell, sw = Math.max(1, Math.round(cell / 2));
        k.add(rect({ x: Math.round(cx - R), y: Math.round(cy - R), width: R * 2, height: R * 2, fill: 'none', stroke: color, strokeWidth: sw, strokeOpacity: n(rp < 0.5 ? 0.8 : 0.4, 2) }));
      } else {
        k.add(circle({ cx, cy, r, fill: 'none', stroke: color, strokeWidth: n(k.m.line * (1.6 - rp)), strokeOpacity: n((1 - rp) ** 1.3 * 0.85, 3) }));
      }
    }
    k.glyph(gid, { labeled: true, t: glyphTime(ctx, g), state: stateWithTone(g, [sev, 'alert', 'crit', 'warn', 'active']) });
    k.label(ctx.params.label, { color: v > 0.6 ? color : 'ink' });
    return k.svg();
  },
};
