// edit — a pencil, tip down-left. editing: the tip lights and writes a short stroke under itself,
// over and over (a 2.4 s loop). Arriving, the pencil slides in along its own axis; a press dabs it.
import { defineGlyph } from '../_glyph.js';
import { lerp, smoothstep } from '../../scene/easing.js';
import { enter, press, xf, rot } from '../_tools.js';

const M = rot(45);
// the pencil drawn upright (tip at the bottom), then turned 45° clockwise
const BODY = 'M19 31.5V11A3 3 0 0 1 22 8H26A3 3 0 0 1 29 11V31.5L24 40.5Z';
const BAND = 'M19 14.5H29';
const LEAD = 'M22.1 37.1L25.9 37.1L24 40.5Z';
const LOOP = 2.4;

export default defineGlyph({
  id: 'edit',
  title: 'Edit',
  category: 'edit',
  tags: ['edit', 'pencil', 'write', 'modify', 'edit mode', 'draw', 'change'],
  states: { idle: 'idle', editing: 'active' },
  loop: LOOP,
  draw(g, s) {
    const on = s.state === 'editing';
    const k = enter(s, 0.5), p = press(s, 0.4);
    const d = lerp(4, 0, k) - 1.6 * p;               // along the axis, toward the tip
    g.group({ x: -d * 0.707, y: d * 0.707, opacity: lerp(0.35, 1, k) }, () => {
      g.path(xf(BODY, M), { join: 'round' });
      g.path(xf(BAND, M), { role: 'dim' });
      g.path(xf(LEAD, M), { role: on ? 'accent' : 'fill', fill: true });
    });
    if (!on) return;
    // the written stroke: draws out from under the tip, holds, fades
    const u = s.phase(LOOP);
    const w = smoothstep(0.05, 0.5, u), fade = 1 - smoothstep(0.75, 0.95, u);
    if (w > 0.02) g.line(10.5, 40, lerp(10.5, 22, w), 40, { role: 'accent', weight: 0.9, opacity: fade * k });
  },
});
