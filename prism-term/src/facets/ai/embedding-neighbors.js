// Nearest-neighbour search in a 2-D projection of document embeddings: a query lands among the clusters, lines
// reach its five nearest documents, and the list beside the plot ranks them by similarity.
import { ATTR, uni, phase, span } from './_ai.js';
import { sub, runs, putR, hash01 as hash } from './_kit7.js';

const LOOP = 14, R0 = 12.8, R1 = 13.5;
// [label, centre x, centre y, spread]; points are fixed pseudo-random draws around each centre
const CLUSTERS = [['billing', 0.2, 0.3, 0.12], ['auth', 0.72, 0.32, 0.11], ['deploys', 0.46, 0.76, 0.12]];
const POINTS = CLUSTERS.flatMap(([, cx, cy, s], c) => Array.from({ length: 46 }, (_, i) => {
  const a = hash(i + c * 100, 1) * Math.PI * 2, r = s * Math.sqrt(hash(i + c * 100, 2));
  return [cx + Math.cos(a) * r * 1.3, cy + Math.sin(a) * r];
}));
// [query, x, y, appears, neighbours [similarity, document]]
const QUERIES = [
  ['session expires too early', 0.62, 0.47, 0.8, [[0.91, 'session-timeouts'], [0.88, 'refresh-tokens'], [0.84, 'cookie-flags'], [0.79, 'sso-logout'], [0.71, 'idle-policy']]],
  ['deploy stuck at 90%', 0.58, 0.6, 7.2, [[0.93, 'stuck-rollouts'], [0.87, 'health-checks'], [0.82, 'canary-steps'], [0.77, 'rollback'], [0.69, 'feature-flags']]],
];
const LEAVE = 6.8;
const near = (q) => POINTS.map((pt, i) => [Math.hypot(pt[0] - q[1], (pt[1] - q[2]) * 0.6), i]).sort((a, b) => a[0] - b[0]).slice(0, 5).map(([, i]) => POINTS[i]);
const NEAR = QUERIES.map(near);

export default {
  id: 'ai-embedding-neighbors',
  since: '0.3.0',
  title: 'Embedding Neighbors',
  category: 'Model Internals',
  description: 'Nearest-neighbour search in a 2-D projection of document embeddings: a query lands among the clusters and lines reach its five most similar documents.',
  tags: ['embeddings', 'vector search', 'nearest neighbors', 'similarity', 'clusters', 'model'],
  kind: 'tui',
  size: { w: 72, h: 14 },
  minSize: { w: 48, h: 9 },
  loop: LOOP,
  color: '16',
  order: 210,
  setup(ctx) {
    const th = ctx.theme;
    const draw = (b, at) => {
      const kb = at >= R0 && at < R1 ? (at - R0) / (R1 - R0) : -1;
      if (kb >= 0.9) return draw(b, 0);
      const p = kb >= 0 ? R0 : at;
      const W = b.width, H = b.height, u = uni(ctx), dots = u && ctx.caps?.braille !== false, MID = u ? '·' : '-';
      const lw = W >= 64 ? 28 : 22, pw = W - lw - 1, ph = H - 1, DX = dots ? 2 : 1, DY = dots ? 4 : 1;
      const qi = p < LEAVE ? 0 : 1, q = QUERIES[qi], qa = q[3], live = p >= qa && !(qi === 0 && p >= LEAVE);
      // a dot grid over the plot; each cell keeps its strongest mark (0 point, 1 line, 2 neighbour)
      const grid = new Map(), plot = (x, y, kind) => {
        const gx = Math.round(x * (pw * DX - 1)), gy = Math.round(y * (ph * DY - 1)), cx = Math.floor(gx / DX), cy = Math.floor(gy / DY);
        if (cx < 0 || cy < 0 || cx >= pw || cy >= ph) return;
        const key = cy * pw + cx, c = grid.get(key) || { bits: 0, kind: -1, n: 0 };
        c.bits |= dots ? [[0x01, 0x08], [0x02, 0x10], [0x04, 0x20], [0x40, 0x80]][gy % 4][gx % 2] : 0;
        c.kind = Math.max(c.kind, kind); c.n++;
        grid.set(key, c);
      };
      POINTS.forEach(([x, y]) => plot(x, y, 0));
      if (live) {
        const k = kb >= 0 ? 1 - Math.min(1, kb / 0.5) : span(p, qa + 0.6, qa + 1.2);   // the beat pulls the lines back in
        NEAR[qi].forEach(([x, y]) => { for (let s = 0; s <= 40 * k; s++) plot(q[1] + ((x - q[1]) * s) / 40, q[2] + ((y - q[2]) * s) / 40, 1); if (k >= 1) plot(x, y, 2); });
      }
      for (const [key, c] of grid) {
        const x = key % pw, y = 1 + Math.floor(key / pw);
        const ch = dots ? String.fromCharCode(0x2800 + c.bits) : c.kind === 2 ? '*' : c.kind === 1 ? '.' : u ? '·' : ':';
        b.set(x, y, ch, c.kind >= 1 ? th.accent : th.muted, undefined, c.kind === 2 ? ATTR.BOLD : 0);
      }
      // cluster names sit just above their clouds, one row higher when the query would land on one
      const qx = Math.min(pw - 1, Math.round(q[1] * (pw - 1))), qy = 1 + Math.round(q[2] * (ph - 1));
      CLUSTERS.forEach(([name, cx, cy, s]) => {
        const x = Math.round(cx * pw - name.length / 2);
        let y = 1 + Math.round((cy - s * 1.1) * (ph - 1));
        if (live && y === qy && qx >= x - 1 && qx <= x + name.length) y--;
        if (y >= 1 && x >= 0 && x + name.length <= pw) b.text(x, y, name, th.ink, undefined, ATTR.BOLD);
      });
      if (live && kb < 0.85) {
        const g = kb >= 0.7 || (kb < 0 && p < qa + 0.2) ? (u ? '·' : '.') : kb >= 0.5 || (kb < 0 && p < qa + 0.4) ? (u ? '◇' : 'o') : u ? '◆' : '@';
        b.set(qx, qy, g, g === 'o' ? th.ink : th.accent, undefined, ATTR.BOLD);
      }
      // header and the ranked list
      runs(ctx, b, 0, 0, pw, live ? [['query ', sub(th)], [`"${q[0]}"`, th.ink, ATTR.BOLD]] : [['embedding space', sub(th)], [` ${MID} 138 documents`, sub(th), 0, true]]);
      const lx = pw + 1;
      for (let y = 0; y < H; y++) b.set(lx - 1, y, u ? '│' : '|', th.line);
      b.text(lx + 1, 0, 'nearest', th.ink, undefined, ATTR.BOLD);
      if (live) {
        const shown = kb >= 0 ? 5 - Math.ceil(Math.min(1, kb / 0.5) * 5) : Math.floor(span(p, qa + 1.2, qa + 2.2) * 5 + 1e-9), rows = Math.min(5, H - 2);
        q[4].slice(0, Math.min(shown, rows)).forEach(([sim, doc], i) => {
          b.text(lx + 1, 2 + i, sim.toFixed(2), th.ink, undefined, i === 0 ? ATTR.BOLD : 0);
          runs(ctx, b, lx + 6, 2 + i, W - lx - 6, [[doc, th.ink]]);
        });
        if (shown >= 5 && H >= 9) putR(b, W, H - 1, 'cosine', sub(th));
      }
    };
    return (t) => { const p = phase(t, LOOP); draw(ctx.buffer, p >= R1 ? 0 : p); };
  },
};
