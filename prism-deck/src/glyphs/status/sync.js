// sync — two arrows chasing each other around a circle. syncing: they turn (half a turn per
// 1.2 s; the pair is symmetric, so the loop is seamless). synced: they coast to rest and a
// check draws in at the center. error: the arrows stall in dim and an exclamation appears.
import { defineGlyph } from '../_glyph.js';
import { arrive, lerp } from '../../scene/easing.js';
import { arcHead, partialPolyline } from '../system/_kit.js';

const R = 13;
const ARCS = [[28, 152], [208, 332]];   // each arc's sweep (deg, clockwise); heads at the ends
const CHECK = [[18.5, 24.5], [22.5, 28.5], [30, 20]];
const LOOP = 2.4;

export default defineGlyph({
  id: 'sync',
  title: 'Sync',
  category: 'status',
  tags: ['sync', 'refresh', 'reload', 'update', 'backup', 'syncing'],
  states: { idle: 'idle', syncing: 'busy', synced: 'ok', error: 'alert' },
  loop: LOOP,
  draw(g, s) {
    const st = s.state;
    let rot = 0;
    if (st === 'syncing') rot = s.phase(1.2) * 180;
    else if (st === 'synced') rot = lerp(-90, 0, arrive(s.since, 0.7));   // coasts to rest
    const role = st === 'error' ? 'dim' : 'line';
    const tail = st === 'syncing' ? 0.55 : 1;
    for (const [a0, a1] of ARCS) {
      const b0 = a0 + rot, b1 = a1 + rot;
      // syncing: the tail of each arrow fades, so the turn reads as motion
      if (tail < 1) { g.arc(24, 24, R, b0, b0 + 50, { role, opacity: tail }); g.arc(24, 24, R, b0 + 50, b1, { role, cap: 'butt' }); }
      else g.arc(24, 24, R, b0, b1, { role });
      g.polyline(arcHead(24, 24, R, b1, { size: 4.4 }), { role, join: 'round' });
    }
    if (st === 'synced') {
      const pts = partialPolyline(CHECK, arrive(Math.max(0, s.since - 0.35), 0.35));
      if (pts.length > 1) g.polyline(pts, { role: 'accent', weight: 1.05 });
    } else if (st === 'error') {
      const k = arrive(s.since, 0.3);
      g.line(24, 18, 24, lerp(18, 25.5, k), { role: 'accent', weight: 1.1 });
      g.dot(24, 30, 2, { role: 'spark', opacity: k });
    }
  },
});
