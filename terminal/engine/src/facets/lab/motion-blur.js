// Frame rate versus motion blur, side by side. The same scene — a three-blade
// propeller and a ball swinging past — sampled four ways: 60 fps sharp, 12 fps
// sharp (it strobes), 12 fps with a 180° shutter (smooth again, at the same
// frame rate) and 6 fps with a 360° shutter. Blur is real temporal
// supersampling: each panel averages sub-frame samples across its shutter.
import { mix } from '../../color.js';
import { grid, put } from './_lab.js';

const PANELS = [['60 fps', 60, 0], ['12 fps', 12, 0], ['12 fps · 180° shutter', 12, 0.5], ['6 fps · 360° shutter', 6, 1]];
const SUBS = 10, SPIN = 1.15; // revolutions per second

export default {
  id: 'lab-motion-blur',
  title: 'Frame Rate vs Motion Blur',
  gallery: 'lab',
  category: 'Easing & Timing',
  kind: 'scene',
  tags: ['motion blur', 'frame rate', 'shutter angle', 'strobing', 'temporal aliasing', 'fps'],
  order: 60,
  description: 'One scene sampled four ways — 60 fps, 12 fps, 12 fps with a 180° shutter and 6 fps blurred — to compare strobe and blur.',
  size: { w: 72, h: 22 },
  minSize: { w: 30, h: 10 },
  loop: 4,
  canvas: 'field',
  palette: 'prism',
  params: {},
  setup(ctx) {
    const th = ctx.theme, pal = ctx.palette();
    const two = ctx.width >= 28;
    const rects = grid(ctx.width, ctx.height, two ? 2 : 1, two ? 2 : 4, 2, 1).slice(0, PANELS.length);
    const cv = ctx.canvas('field');
    const asp = cv.aspect, blade = pal(0.08), ballC = pal(0.55);
    const covers = (cx, cy, R, x, y, tt) => {
      // Propeller: three tapered blades plus a hub; ball: a disc on a pendulum swing.
      const dx = x - cx, dy = (y - cy) * asp, r = Math.hypot(dx, dy);
      let hit = 0;
      if (r < R * 0.9) {
        const a = Math.atan2(dy, dx) - tt * SPIN * Math.PI * 2;
        for (let k = 0; k < 3; k++) {
          let d = (a + (k * Math.PI * 2) / 3) % (Math.PI * 2); if (d < -Math.PI) d += Math.PI * 2; if (d > Math.PI) d -= Math.PI * 2;
          if (Math.abs(d) < 0.32 * (1 - (r / R) * 0.6) || r < R * 0.14) { hit = 1; break; }
        }
      }
      const bx = cx + Math.sin(tt * Math.PI * 1.5) * R * 1.9, by = cy + R * 1.05;
      if (Math.hypot(x - bx, (y - by) * asp) < R * 0.28) hit = 2;
      return hit;
    };
    return (t) => {
      cv.clear();
      PANELS.forEach(([, fps, shutter], k) => {
        const r = rects[k];
        if (!r || r.h < 3) return;
        const x0 = r.x * cv.sx, y0 = r.y * cv.sy, w = r.w * cv.sx, h = (r.h - 1) * cv.sy;
        const R = Math.min(w / 4.4, (h * asp) / 2.9), cx = x0 + w / 2, cy = y0 + h * 0.4;
        const tf = Math.floor(t * fps) / fps, n = shutter ? SUBS : 1;
        for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
          let a = 0, b = 0;
          for (let s = 0; s < n; s++) {
            const hit = covers(cx, cy, R, x + 0.5, y + 0.5, tf + (shutter * (s + 0.5)) / (n * fps));
            if (hit === 1) a++; else if (hit === 2) b++;
          }
          if (!a && !b) continue;
          let c = mix(th.bg, blade, a / n);
          c = mix(c, ballC, b / n);
          cv.set(x, y, c);
        }
      });
      cv.paint(ctx.buffer);
      PANELS.forEach(([name], k) => { const r = rects[k]; if (r && r.h >= 3) put(ctx.buffer, r.x, r.y + r.h - 1, name, th.muted, undefined, undefined, r.w); });
    };
  },
};
