// A keyframe timeline, After-Effects style. Up top a stage where a sprite
// moves, grows and changes color; below it one track per property with its
// keyframes (◆ eased, ◇ linear), the value curve between them, and a playhead
// sweeping across with a running timecode. Every property is interpolated
// from its own keys, so you can watch the timeline drive the picture.
import { easing } from '../../easing.js';
import { mix } from '../../color.js';
import { put } from './_lab.js';

const LEN = 4; // seconds
// [time, value, easing-into-this-key]
const TRACKS = [
  { name: 'x', keys: [[0, 0.08, 'linear'], [1.2, 0.5, 'inOutCubic'], [2.4, 0.92, 'outBack'], [3.4, 0.5, 'inOutCubic'], [4, 0.08, 'inOutCubic']] },
  { name: 'y', keys: [[0, 0.75, 'linear'], [0.8, 0.2, 'outQuad'], [1.6, 0.75, 'outBounce'], [2.8, 0.35, 'inOutSine'], [4, 0.75, 'inOutSine']] },
  { name: 'scale', keys: [[0, 0.5, 'linear'], [1.2, 1, 'outElastic'], [2.6, 0.6, 'inOutCubic'], [4, 0.5, 'linear']] },
  { name: 'hue', keys: [[0, 0, 'linear'], [2, 0.5, 'linear'], [4, 1, 'linear']] },
];
function valueAt(keys, t) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1, e] = keys[i], [t0, v0] = keys[i - 1];
    if (t <= t1) return v0 + (v1 - v0) * easing[e]((t - t0) / (t1 - t0));
  }
  return keys[keys.length - 1][1];
}

export default {
  id: 'lab-keyframes',
  title: 'Keyframe Timeline',
  gallery: 'lab',
  category: 'Easing & Timing',
  kind: 'tui',
  tags: ['keyframes', 'timeline', 'playhead', 'interpolation', 'tracks', 'motion design'],
  order: 40,
  description: 'A keyframe timeline driving a sprite: per-property tracks with eased keys, value curves, a playhead and timecode.',
  size: { w: 72, h: 22 },
  minSize: { w: 30, h: 10 },
  loop: LEN,
  canvas: 'line',
  palette: 'prism',
  params: {},
  setup(ctx) {
    const th = ctx.theme, pal = ctx.palette();
    const W = ctx.width, H = ctx.height;
    const trackH = Math.max(1, Math.min(3, Math.floor((H * 0.5) / TRACKS.length)));
    const tlTop = H - TRACKS.length * trackH - 1, stageH = tlTop - 1;
    const gutter = 7;
    const stage = ctx.canvas('line', { cols: W, rows: Math.max(1, stageH) });
    const curves = ctx.canvas('line', { cols: W - gutter, rows: TRACKS.length * trackH });
    const guide = mix(th.bg, th.line, 0.9), curveC = mix(th.bg, th.muted, 0.7);
    const T = (s) => gutter + Math.round((s / LEN) * (W - gutter - 1));
    return (t) => {
      const tl = ((t % LEN) + LEN) % LEN;
      const [x, y, sc, hue] = TRACKS.map((tr) => valueAt(tr.keys, tl));
      // Stage: floor line, the sprite, and a faint onion-skin of its last positions.
      stage.clear();
      for (let i = 0; i < stage.width; i += 3) stage.set(i, stage.height - 1, guide);
      for (let g = 4; g >= 1; g--) {
        const tg = (((tl - g * 0.08) % LEN) + LEN) % LEN, [gx, gy] = TRACKS.map((tr) => valueAt(tr.keys, tg));
        stage.circle(gx * stage.width, gy * (stage.height - 1), 1, mix(th.bg, th.muted, 0.5 - g * 0.08), true);
      }
      const r = Math.max(1.5, Math.min(stage.width, stage.height * stage.aspect) * 0.24 * sc);
      stage.circle(x * stage.width, y * (stage.height - 1 - r / stage.aspect) + r / stage.aspect, r, pal(hue), true);
      stage.paint(ctx.buffer, 0, 0);
      // Timeline: per-track value curve, then keys and the playhead as text.
      curves.clear();
      TRACKS.forEach((tr, k) => {
        const top = k * trackH * curves.sy, h = trackH * curves.sy - 1;
        let px = 0, py = top + h * (1 - tr.keys[0][1]);
        for (let i = 1; i <= curves.width; i++) {
          const v = valueAt(tr.keys, (i / curves.width) * LEN), ny = top + h * (1 - Math.max(0, Math.min(1.2, v)) / 1.2);
          curves.line(px, py, i, ny, curveC); px = i; py = ny;
        }
      });
      curves.paint(ctx.buffer, gutter, tlTop + 1);
      const b = ctx.buffer;
      // Ruler with seconds.
      for (let x2 = gutter; x2 < W; x2++) b.set(x2, tlTop, '─', guide);
      for (let s = 0; s <= LEN; s++) { const cx = Math.min(W - 2, T(s)); b.set(cx, tlTop, '┬', th.muted); put(b, cx + 1, tlTop, `${s}s`, th.muted); }
      TRACKS.forEach((tr, k) => {
        const row = tlTop + 1 + k * trackH + Math.floor(trackH / 2);
        put(b, 0, row, tr.name, th.ink, undefined, undefined, gutter - 1);
        for (const [kt, , e] of tr.keys) b.set(Math.min(W - 1, T(kt)), row, e === 'linear' ? '◇' : '◆', Math.abs(kt - tl) < 0.12 ? th.accent : th.info);
      });
      const ph = T(tl);
      for (let row = tlTop; row < H; row++) {
        const ch = b.get(ph, row)?.ch;
        b.set(ph, row, ch === '◆' || ch === '◇' ? ch : '│', th.accent); // keys under the playhead stay visible
      }
      put(b, 0, tlTop, `${tl.toFixed(2)}s`, th.accent, undefined, undefined, gutter - 1);
    };
  },
};
