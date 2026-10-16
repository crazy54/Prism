// code — angle brackets around a slash (the Prism code icon, deck weight). editing: the
// brackets open out as the state arrives, the slash lights, and a glint of light runs
// down it, fading in and out at the ends, once per loop.
import { defineGlyph } from '../_glyph.js';
import { arrive, lerp, smoothstep } from '../../scene/easing.js';

const S0 = [27, 11], S1 = [21, 37];   // the slash
const LOOP = 2.4;

export default defineGlyph({
  id: 'code',
  title: 'Code',
  category: 'dev',
  tags: ['code', 'editor', 'source', 'develop', 'programming', 'brackets'],
  states: { idle: 'idle', editing: 'active' },
  loop: LOOP,
  draw(g, s) {
    const on = s.state === 'editing';
    const k = arrive(s.since, 0.4);
    const o = on ? lerp(0, 1.5, k) : lerp(1.5, 0, k);   // brackets open by 1.5 when editing
    g.polyline([[16 - o, 14], [7.5 - o * 0.4, 24], [16 - o, 34]], { join: 'round' });
    g.polyline([[32 + o, 14], [40.5 + o * 0.4, 24], [32 + o, 34]], { join: 'round' });
    g.line(S0[0], S0[1], S1[0], S1[1], { role: on ? 'accent' : 'dim', weight: 1.05 });
    if (!on) return;
    const p = s.phase(LOOP);
    const fade = smoothstep(0, 0.12, p) * (1 - smoothstep(0.62, 0.8, p));
    if (fade < 0.02) return;
    const u = Math.min(1, p / 0.8);
    g.dot(lerp(S0[0], S1[0], u), lerp(S0[1], S1[1], u), 2, { opacity: fade * k });
  },
});
