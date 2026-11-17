// Hold to confirm: a dangerous switch that flips only after a key is held for 1.5 s.
import { ATTR, uni, glyphs, phase, ease, stringWidth } from './_input.js';

const HOLD = 1.5, LOOP = 14;
// [press, release] times. The first try lets go early; the second completes and enables; the third disables.
const PRESSES = [[1.0, 1.6], [3.6, 5.3], [8.6, 10.3]];

function stateAt(p) {
  let on = false, last = null;
  for (const [a, z] of PRESSES) {
    if (p < a) break;
    const held = Math.min(p, z) - a;
    if (held >= HOLD) { if (p >= a + HOLD) { on = !on; last = { kind: on ? 'on' : 'off', at: a + HOLD }; } }
    else if (p >= z) last = { kind: 'cancel', at: z, held };
  }
  const active = PRESSES.find(([a, z]) => p >= a && p < z && p - a < HOLD);
  const fill = active ? (p - active[0]) / HOLD : 0;
  // after a release the bar drains back over 0.3 s instead of snapping
  const drain = PRESSES.find(([a, z]) => p >= z && p < z + 0.3 && z - a < HOLD);
  return { on, last, holding: !!active, fill: active ? fill : drain ? ((drain[1] - drain[0]) / HOLD) * (1 - ease(p, drain[1], drain[1] + 0.3)) : 0, since: last ? p - last.at : Infinity };
}

export default {
  id: 'input-hold-confirm',
  since: '0.3.0',
  title: 'Hold to Confirm',
  category: 'Toggles & Checkboxes',
  description: 'A dangerous switch, maintenance mode, that flips only after Space is held for 1.5 s: a fill bar tracks the hold, an early release cancels, and the next hold turns it off again.',
  tags: ['hold to confirm', 'press and hold', 'dangerous action', 'switch', 'maintenance', 'safety'],
  kind: 'tui',
  size: { w: 56, h: 8 },
  minSize: { w: 36, h: 5 },
  loop: LOOP,
  color: '16',
  order: 240,
  setup(ctx) {
    const th = ctx.theme;
    const sub = th.mode === 'light' ? th.ink : th.muted;
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height, u = uni(ctx), g = glyphs(ctx);
      const p = phase(t, LOOP), st = stateAt(p), wide = W >= 48, MID = u ? '·' : '-';
      // the switch
      let x = b.text(0, 0, 'Maintenance mode', th.ink, undefined, ATTR.BOLD);
      const sw = st.on ? '[ ON  ]' : '[ OFF ]';
      x = b.text(x + 2, 0, sw, th.ink, undefined, st.on ? ATTR.BOLD | ATTR.INVERSE : ATTR.BOLD);
      if (st.on) { x = b.text(x + 1, 0, g.warn, th.warn, undefined, ATTR.BOLD); b.text(x + 1, 0, wide ? 'traffic drained' : 'drained', th.ink); }
      // the hold bar: what to hold, the fill, and the time held so far
      const y = H >= 7 ? 2 : 1, verb = st.on ? 'disable' : 'enable';
      const lead = W - stringWidth(`hold Space to ${verb} `) >= 10 ? `hold Space to ${verb} ` : 'hold Space ';   // the verb stays while a bar still fits
      let bx = b.text(0, y, lead, st.holding ? th.ink : sub, undefined, st.holding ? ATTR.BOLD : 0);
      const timer = ` ${(st.fill * HOLD).toFixed(1)} / ${HOLD} s`, room = W - bx - (W >= 44 ? timer.length : 0) - 2;
      const bw = Math.max(6, Math.min(16, room)), filled = Math.round(st.fill * bw);
      bx = b.text(bx, y, u ? '▕' : '|', th.line);
      for (let i = 0; i < bw; i++) b.set(bx + i, y, i < filled ? (u ? '█' : '#') : (u ? '░' : '.'), i < filled ? th.accent : sub);
      bx = b.text(bx + bw, y, u ? '▏' : '|', th.line);
      if (W >= 44 && bx + timer.length <= W) b.text(bx, y, timer, st.holding ? th.ink : sub, undefined, st.holding ? ATTR.BOLD : 0);
      else if (H >= 5 && W < 44) b.text(0, y + 1, timer.trim(), st.holding ? th.ink : sub, undefined, st.holding ? ATTR.BOLD : 0);   // narrow: under the bar
      // status: the last thing that happened; it drops first
      if (H >= 5) {
        const sy = H >= 7 ? 4 : 3, l = st.last;
        if (l && l.kind === 'cancel' && st.since < 1.8) { const c = b.text(0, sy, g.cross === 'x' ? '-' : g.cross, sub, undefined, ATTR.BOLD); b.text(c + 1, sy, `cancelled ${u ? '—' : '-'} held ${l.held.toFixed(1)} s`, th.ink); }
        else if (l && l.kind === 'on' && st.since < 2.5) { const c = b.text(0, sy, g.warn, th.warn, undefined, ATTR.BOLD); b.text(c + 1, sy, wide ? 'maintenance on: traffic drained from 3 nodes' : 'maintenance on', th.ink); }
        else if (l && l.kind === 'off' && st.since < 2.5) { const c = b.text(0, sy, g.check, th.pos, undefined, ATTR.BOLD); b.text(c + 1, sy, wide ? 'maintenance off: traffic restored' : 'maintenance off', th.ink); }
        else if (H >= 7) { const tip = [`release early to cancel ${MID} nothing changes until the bar fills`, 'release early to cancel'].find((s2) => s2.length <= W); if (tip) b.text(0, sy, tip, sub); }
      }
      const keys = [`space (hold) ${st.on ? 'disable' : 'enable'} ${MID} esc leave`, `space (hold) ${st.on ? 'disable' : 'enable'}`].find((k) => stringWidth(k) <= W);
      if (H >= 5 && keys && H - 1 > (H >= 7 ? 4 : 3)) b.text(0, H - 1, keys, sub);   // the key hint takes the last free row
    };
  },
};
