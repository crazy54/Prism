// A voice-assistant style status orb on a hi-res canvas: it breathes when
// idle, ripples while listening, swirls while thinking, rings while speaking.
import { ATTR, glyphs, phase, mix, span } from './_ai.js';

// [start, state, tone, caption]
const STATES = [
  [0, 'idle', 'muted', 'Ready'], [1.6, 'listening', 'info', 'Listening'], [3.4, 'thinking', 'accent', 'Thinking'],
  [5.6, 'speaking', 'pos', 'Speaking'], [7.6, 'idle', 'muted', 'Ready'],
];

export default {
  id: 'ai-status-orb',
  title: 'Status Orb',
  category: 'Thinking States',
  description: 'An assistant status orb on a hi-res canvas that breathes when idle, ripples while listening, swirls while thinking and pulses rings while speaking.',
  tags: ['orb', 'voice', 'status', 'assistant', 'canvas'],
  kind: 'scene',
  canvas: 'hires',
  size: { w: 36, h: 14 },
  minSize: { w: 20, h: 8 },
  loop: 9,
  color: 'truecolor',
  order: 40,
  setup(ctx) {
    const th = ctx.theme;
    let cv = null;
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height, g = glyphs(ctx);
      const p = phase(t, 9);
      let k = 0;
      STATES.forEach(([at], i) => { if (p >= at) k = i; });
      const [at, state, tone, caption] = STATES[k];
      const prevTone = STATES[Math.max(0, k - 1)][2];
      const blendIn = span(p, at, at + 0.4);
      const col = mix(th[prevTone], th[tone], blendIn);
      if (!cv || cv.cols !== W || cv.rows !== H - 1) cv = ctx.canvas('hires', { cols: W, rows: H - 1 });
      cv.clear();
      const cx = cv.width / 2, cy = cv.height / 2;
      // Pixels aren't square: measure y in x-pixel units so the orb reads as a circle.
      const ay = cv.aspect;
      const R = Math.min(cv.width / 2, (cv.height / 2) * ay) * 0.62;
      const w = (n) => (2 * Math.PI * n) / 9;
      for (let y = 0; y < cv.height; y++) {
        for (let x = 0; x < cv.width; x++) {
          const dx = x - cx, dy = (y - cy) * ay;
          const d = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
          let r = R, glow = 0;
          if (state === 'idle') r = R * (0.86 + 0.06 * Math.sin(w(3) * p));
          if (state === 'listening') { r = R * (0.9 + 0.05 * Math.sin(a * 6 + w(9) * p)); glow = Math.max(0, 1 - Math.abs(((d - R * 1.05 - ((p * 9) % 6)) / 2))) * 0.6; }
          if (state === 'thinking') r = R * (0.88 + 0.07 * Math.sin(a * 3 - w(6) * p) * Math.cos(a * 2 + w(3) * p));
          if (state === 'speaking') { r = R * (0.88 + 0.08 * Math.abs(Math.sin(w(13) * p))); glow = Math.max(0, 1 - Math.abs(d - R * (1.15 + 0.25 * ((p * 1.5) % 1))) / 1.4) * (1 - ((p * 1.5) % 1)); }
          if (d <= r) {
            // Lit from the upper left, with a swirl while thinking.
            const shade = 0.55 + 0.45 * Math.max(0, 1 - Math.hypot(dx + r * 0.35, dy + r * 0.35) / (r * 1.4));
            const swirl = state === 'thinking' ? 0.18 * Math.sin(a * 2 + d * 0.35 - w(9) * p) : 0;
            cv.set(x, y, mix(th.bg, col, Math.min(1, shade + swirl)));
          } else if (glow > 0.05) cv.set(x, y, mix(th.bg, col, glow * 0.7));
        }
      }
      cv.paint(b);
      const label = state === 'thinking' || state === 'listening' ? `${caption}${g.ellipsis}` : caption;
      b.text(Math.max(0, Math.floor((W - label.length) / 2)), H - 1, label, th[tone], undefined, ATTR.BOLD);
    };
  },
};
