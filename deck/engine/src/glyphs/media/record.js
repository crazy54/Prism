// record — a dot in a ring. ready: ink dot, quiet ring. armed: the ring breaks into
// marching segments and the dot blinks (record-arm). recording: the segments close
// into a solid ring, the dot swells and beats, and a lit "tape head" sweeps the ring.
import { defineGlyph } from '../_glyph.js';
import { arrive, pulse, lerp, outBack, clamp } from '../../scene/easing.js';

const R = 15.5;          // ring radius (8.5 … 39.5)
const SEGS = 12;         // armed: dashed ring segments

export default defineGlyph({
  id: 'record',
  title: 'Record',
  category: 'media',
  tags: ['record', 'rec', 'capture', 'arm', 'recording', 'transport', 'stream'],
  states: { ready: 'idle', armed: 'warn', recording: 'alert' },
  loop: 2.4,
  draw(g, s) {
    const k = arrive(s.since, 0.45);
    if (s.state === 'ready') {
      g.circle(24, 24, R, { role: 'dim' });
      g.circle(24, 24, 8.5, { role: 'fill' });
      return;
    }
    if (s.state === 'armed') {
      // marching segments: one segment-step of rotation per loop → seamless
      const step = 360 / SEGS, gap = lerp(step * 0.5, step * 0.42, k);
      const rot = s.phase(2.4) * step;
      for (let i = 0; i < SEGS; i++) {
        const a = i * step + rot;
        g.arc(24, 24, R, a + gap / 2, a + step - gap / 2, { role: 'line', cap: 'round' });
      }
      // record-arm blink: a soft on/off at 1.2 s
      const b = pulse(s.t, 1.2);
      g.circle(24, 24, 8.5, { role: 'accent', fill: true, opacity: 0.45 + 0.55 * b });
      return;
    }
    // recording — the segments close into a ring as the state arrives
    const close = k;
    const step = 360 / SEGS, gap = step * 0.42 * (1 - close);
    if (gap > 0.5) for (let i = 0; i < SEGS; i++) g.arc(24, 24, R, i * step + gap / 2, (i + 1) * step - gap / 2, { role: 'line' });
    else g.circle(24, 24, R, { role: 'line' });
    // the tape head: a lit arc with a bright spark, one turn per loop
    const head = s.phase(2.4) * 360;
    g.arc(24, 24, R, head - 70, head, { role: 'accent', opacity: 0.85 * close, weight: 1.05 });
    const [hx, hy] = g.polar(24, 24, R, head);
    g.dot(hx, hy, 2.1, { opacity: close });
    // the dot swells in (overshoot) and beats gently while rolling
    const swell = lerp(8.5, 9.5, outBack(clamp(s.since / 0.5)));
    const beat = 1 - 0.06 * pulse(s.t, 1.2);
    g.circle(24, 24, swell * beat, { role: 'accent', fill: true });
  },
});
