// music-note — a beamed pair of notes. playing: the notes light and sway to a
// 1.2 s beat while a small spark rises off the beam; off: still ink.
import { defineGlyph } from '../_glyph.js';
import { arrive, pulse, lerp, smoothstep } from '../../scene/easing.js';
import { n } from '../../scene/svg.js';

/** A note head: an ellipse tilted -22°, as a path (two arcs). */
function head(cx, cy, rx = 5.4, ry = 4) {
  const a = (-22 * Math.PI) / 180, c = Math.cos(a) * rx, sn = Math.sin(a) * rx;
  return `M${n(cx + c)} ${n(cy + sn)}A${rx} ${ry} -22 0 1 ${n(cx - c)} ${n(cy - sn)}A${rx} ${ry} -22 0 1 ${n(cx + c)} ${n(cy + sn)}Z`;
}

export default defineGlyph({
  id: 'music-note',
  title: 'Music',
  category: 'audio',
  tags: ['music', 'note', 'song', 'audio', 'playlist', 'media'],
  states: { off: 'idle', playing: 'active' },
  loop: 2.4,
  draw(g, s) {
    const on = s.state === 'playing';
    const k = arrive(s.since, 0.4);
    const sway = on ? Math.sin((s.t / 1.2) * Math.PI * 2) * 3.5 * k : 0;
    const bob = on ? -1.2 * pulse(s.t, 1.2) * k : 0;
    g.group({ rotate: sway, origin: [24, 38], y: bob }, () => {
      g.path(head(15, 33.5), { role: on ? 'accent' : 'fill', fill: true });
      g.path(head(31, 30.5), { role: on ? 'accent' : 'fill', fill: true });
      g.line(19.6, 32, 19.6, 13.5, { role: 'line', cap: 'butt' });
      g.line(35.6, 29, 35.6, 10.5, { role: 'line', cap: 'butt' });
      g.polygon([[18.3, 11.2], [36.9, 7.6], [36.9, 12.6], [18.3, 16.2]], { role: on ? 'accent' : 'fill', fill: true });
    });
    if (!on) return;
    // a spark lifts off the beam and fades, once per loop
    const u = s.phase(2.4);
    const fade = smoothstep(0, 0.15, u) * (1 - smoothstep(0.55, 0.85, u));
    g.dot(lerp(39, 40.5, u), lerp(16, 7.5, u), lerp(1.8, 1.1, u), { opacity: fade * k });
  },
});
