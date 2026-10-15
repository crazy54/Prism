// network — traffic in and out: a down arrow and an up arrow. online: the shafts turn
// into packet streams flowing each way, faster with the level (whole dash periods per
// loop, so the flow is seamless). idle: quiet solid arrows. offline: the strike draws in.
import { defineGlyph } from '../_glyph.js';
import { arrive, clamp } from '../../scene/easing.js';
import { strike } from './_kit.js';

const XD = 16.5, XU = 31.5;        // down arrow (left), up arrow (right)
const TOP = 10, BOT = 38, HW = 5.5; // shaft span + chevron half-width
const DASH = 3.5, GAP = 3.5, PER = DASH + GAP;
const LOOP = 1.2;

/** Packets on a vertical shaft between y0 (tail) and y1 (head), moving toward the head. */
function packets(g, x, y0, y1, off, opts) {
  const dir = Math.sign(y1 - y0), len = Math.abs(y1 - y0);
  for (let u = -PER + (off % PER); u < len; u += PER) {
    const a = Math.max(0, u), b = Math.min(len, u + DASH);
    if (b - a > 0.4) g.line(x, y0 + dir * a, x, y0 + dir * b, opts);
  }
}

export default defineGlyph({
  id: 'network',
  title: 'Network',
  category: 'system',
  tags: ['network', 'traffic', 'upload', 'download', 'ethernet', 'lan', 'throughput'],
  states: { online: 'active', idle: 'idle', offline: 'neg' },
  loop: LOOP,
  draw(g, s) {
    const st = s.state;
    const role = st === 'offline' ? 'dim' : 'line';
    // heads
    g.polyline([[XD - HW, BOT - HW], [XD, BOT], [XD + HW, BOT - HW]], { role });
    g.polyline([[XU - HW, TOP + HW], [XU, TOP], [XU + HW, TOP + HW]], { role });
    if (st !== 'online') {
      g.line(XD, TOP, XD, BOT, { role });
      g.line(XU, BOT, XU, TOP, { role });
      if (st === 'offline') strike(g, s, { from: [9.5, 11.5], to: [38.5, 36.5] });
      return;
    }
    // online: packet streams; speed = whole periods per loop by level
    const k = arrive(s.since, 0.3);
    const steps = 1 + Math.round(clamp(s.level) * 2);
    const off = s.phase(LOOP) * PER * steps;
    packets(g, XD, TOP, BOT - 1, off, { role: 'accent', opacity: k });
    packets(g, XU, BOT, TOP + 1, off + PER / 2, { role: 'accent', opacity: k });
    if (k < 1) { g.line(XD, TOP, XD, BOT, { role: 'line', opacity: 1 - k }); g.line(XU, BOT, XU, TOP, { role: 'line', opacity: 1 - k }); }
  },
});
