// play-pause — a solid play triangle that morphs into pause bars (and back) on state change.
import { defineGlyph } from '../_glyph.js';
import { arrive } from '../../scene/easing.js';
import { P } from '../../scene/svg.js';

// the triangle as two quads, so every vertex has a partner on the pause bars
const PLAY = [[[16, 11], [26.5, 17.5], [26.5, 30.5], [16, 37]], [[26.5, 17.5], [37, 24], [37, 24], [26.5, 30.5]]];
const PAUSE = [[[14.5, 11], [21.5, 11], [21.5, 37], [14.5, 37]], [[26.5, 11], [33.5, 11], [33.5, 37], [26.5, 37]]];
const lerpPts = (a, b, k) => a.map((p, i) => [p[0] + (b[i][0] - p[0]) * k, p[1] + (b[i][1] - p[1]) * k]);

export default defineGlyph({
  id: 'play-pause',
  title: 'Play / Pause',
  category: 'media',
  tags: ['play', 'pause', 'transport', 'media', 'music'],
  states: { paused: 'idle', playing: 'active' },
  draw(g, s) {
    const m = arrive(s.since, 0.3);
    const k = s.state === 'playing' ? m : 1 - m; // 0 = play triangle, 1 = pause bars
    // both quads in ONE path, so the triangle's halves fill without an anti-aliasing seam
    const p = P();
    for (let i = 0; i < 2; i++) { const q = lerpPts(PLAY[i], PAUSE[i], k); p.M(...q[0]); for (const v of q.slice(1)) p.L(...v); p.Z(); }
    g.path(p.d, { role: 'fill', join: 'round' });
  },
});
