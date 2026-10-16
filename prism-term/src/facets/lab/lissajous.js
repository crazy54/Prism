// A Lissajous table: columns are the x frequency, rows the y frequency, and
// each cell traces x = sin(a·s + δ), y = sin(b·s) in braille. The phase δ
// drifts slowly, so every figure turns in 3D-looking rotation, and a bright
// dot runs each curve at its own pace.
import { fadeMark } from '../../palettes.js';
import { grid, put, pxRect } from './_lab.js';

export default {
  id: 'lab-lissajous',
  title: 'Lissajous Table',
  gallery: 'lab',
  category: 'Loops & Cycles',
  kind: 'chart',
  tags: ['lissajous', 'harmonics', 'phase', 'frequency ratio', 'parametric', 'braille'],
  order: 30,
  description: 'A Lissajous table — x frequency across, y frequency down — with drifting phase and a dot running every figure.',
  size: { w: 64, h: 22 },
  minSize: { w: 20, h: 7 },
  loop: 20,
  canvas: 'line',
  palette: 'prism',
  params: {},
  setup(ctx) {
    const cv = ctx.canvas('line');
    const th = ctx.theme, pal = ctx.palette();
    const head = ctx.height >= 10 ? 1 : 0, side = head ? 4 : 0;
    const cols = Math.max(1, Math.min(5, Math.floor((ctx.width - side) / 11))), rows = Math.max(1, Math.min(3, Math.floor((ctx.height - head) / 6)));
    const cells = grid(ctx.width - side, ctx.height - head, cols, rows, 1, 0, side, head);
    return (t) => {
      cv.clear();
      const delta = (t / 20) * Math.PI * 2;
      cells.forEach((r, k) => {
        const a = (k % cols) + 1, b = Math.floor(k / cols) + 1;
        const P = pxRect(cv, r), cx = P.x + P.w / 2, cy = P.y + P.h / 2;
        const rx = P.w / 2 - 1, ry = Math.min(P.h / 2 - 1, rx / cv.aspect);
        const col = pal((k / cells.length) * 0.9), n = 90 * Math.max(a, b);
        let px = null, py = null;
        for (let i = 0; i <= n; i++) {
          const s = (i / n) * Math.PI * 2, x = cx + Math.sin(a * s + delta) * rx, y = cy - Math.sin(b * s) * ry;
          if (px !== null) cv.line(px, py, x, y, fadeMark(th, col, 0.75));
          px = x; py = y;
        }
        const s = t * 1.3;
        cv.circle(cx + Math.sin(a * s + delta) * rx, cy - Math.sin(b * s) * ry, 1.2, th.ink, true);
      });
      cv.paint(ctx.buffer);
      if (head) {
        for (let c = 0; c < cols; c++) put(ctx.buffer, cells[c].x + Math.floor(cells[c].w / 2) - 1, 0, `a${c + 1}`, th.muted);
        for (let r = 0; r < rows; r++) put(ctx.buffer, 0, cells[r * cols].y + Math.floor(cells[r * cols].h / 2), `b${r + 1}`, th.muted);
      }
    };
  },
};
