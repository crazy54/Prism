// A phosphor oscilloscope on the chiptune: graticule, a trace triggered on the
// bass so it stands still, and persistence — the last few sweeps fading out
// behind the beam. `--set mode=xy` plots bass against lead as Lissajous figures.
import { lerpc } from './_kit.js';
import { songAt } from './_music.js';

const PHOSPHOR = { green: 0x40ff80, amber: 0xffb020, blue: 0x60c8ff };

export default {
  title: 'Oscilloscope',
  gallery: 'retro',
  category: 'Chiptune Visuals',
  kind: 'scene',
  tags: ['oscilloscope', 'scope', 'waveform', 'phosphor', 'lissajous', 'audio', 'chiptune'],
  order: 30,
  description: 'A phosphor oscilloscope on the chiptune: graticule, a bass-triggered trace with persistence, and an XY Lissajous mode.',
  size: { w: 64, h: 18 },
  minSize: { w: 20, h: 6 },
  loop: 7.68,
  canvas: 'line',
  params: {
    mode: { default: 'yt', options: ['yt', 'xy'], label: 'Mode' },
    phosphor: { default: 'green', options: ['green', 'amber', 'blue', 'theme'], label: 'Phosphor' },
  },
  setup(ctx) {
    const { theme } = ctx;
    const b = ctx.buffer;
    const W = ctx.width, H = ctx.height;
    const cv = ctx.canvas('line');
    const PW = cv.width, PHt = cv.height;
    const xy = ctx.param('mode', 'yt') === 'xy';
    const ph = ctx.param('phosphor', 'green');
    const beam = ph === 'theme' ? theme.accent : PHOSPHOR[ph] ?? PHOSPHOR.green;
    // Phosphor glows on dark CRT glass, even in daylight; the 'theme' phosphor draws
    // in the theme's own ink on the page instead (with a firmer persistence by Day).
    const day = theme.mode === 'light';
    const glass = day && ph !== 'theme' ? 0x060b08 : theme.bg;
    const K = (k) => (day && ph === 'theme' ? 1 - (1 - k) * (1 - k) : k);
    const grid = lerpc(glass, beam, K(0.2)), axis = lerpc(glass, beam, K(0.32));
    const trails = [1, 0.5, 0.26, 0.12].map((k) => lerpc(glass, beam, K(k)));
    const readout = H >= 10 && W >= 36;
    const cx = PW / 2, cy = PHt / 2;
    const amp = PHt * 0.42;
    function graticule() {
      const dx = PW / 10, dy = PHt / 8;
      for (let i = 0; i <= 10; i++) {
        const x = Math.min(PW - 1, Math.round(i * dx));
        for (let y = 0; y < PHt; y += 3) cv.set(x, y, i === 5 ? axis : grid);
      }
      for (let j = 0; j <= 8; j++) {
        const y = Math.min(PHt - 1, Math.round(j * dy));
        for (let x = 0; x < PW; x += 3) cv.set(x, y, j === 4 ? axis : grid);
      }
      // Minor ticks along the center axes.
      for (let i = 0; i <= 50; i++) { const x = Math.round((i * PW) / 50); cv.set(x, Math.round(cy) - 1, axis); cv.set(x, Math.round(cy) + 1, axis); }
      for (let j = 0; j <= 40; j++) { const y = Math.round((j * PHt) / 40); cv.set(Math.round(cx) - 1, y, axis); cv.set(Math.round(cx) + 1, y, axis); }
    }
    // The scope looks at the tonal voices through a gentle low-pass: rounded
    // squares and pulses plus the kick's thump; the noise channels stay out.
    const soft = (ph, duty) => Math.tanh(4 * (Math.sin(2 * Math.PI * ph) + (duty - 0.5) * 2)) * 0.95;
    function sweepYT(t, color) {
      // Trigger on the bass so the picture holds still: two bass periods per screen.
      const s = songAt(t), fb = s.bassFreq;
      const start = Math.floor(t * fb) / fb, span = 2 / fb;
      let px = 0, py = cy;
      for (let x = 0; x < PW; x++) {
        const tau = start + (x / PW) * span, a = s.kickAge + (tau - start);
        const v = 0.42 * s.bass * soft(tau * fb, 0.5) + 0.28 * s.lead * soft(tau * s.leadFreq, 0.3) + 0.45 * s.kick * Math.sin(2 * Math.PI * 52 * a);
        const y = cy - v * amp;
        if (x) cv.line(px, py, x, y, color);
        px = x; py = y;
      }
    }
    // XY: the bass/lead interval picks a small-integer frequency ratio, so the
    // figure changes shape with the harmony and closes on itself.
    const RATIO = [[1, 1], [9, 8], [9, 8], [6, 5], [5, 4], [4, 3], [7, 5], [3, 2], [8, 5], [5, 3], [7, 4], [2, 1]];
    function sweepXY(t, color) {
      const s = songAt(t);
      const [p, q] = RATIO[(((s.leadNote - s.bassNote) % 12) + 12) % 12];
      const ax = (0.55 + 0.35 * s.bass) * (1 + s.kick * 0.18), ay = (0.5 + 0.4 * s.lead) * (1 + s.kick * 0.18);
      const phase = t * 0.9, N = Math.max(200, PW * 4);
      let px = 0, py = 0;
      for (let i = 0; i <= N; i++) {
        const u = (i / N) * 2 * Math.PI;
        const x = cx + Math.sin(q * u + phase) * ax * cx * 0.92;
        const y = cy - Math.sin(p * u) * ay * amp * 1.05;
        if (i) cv.line(px, py, x, y, color);
        px = x; py = y;
      }
    }
    return (t) => {
      b.fill(0, 0, W, H, ' ', theme.ink, glass);
      cv.clear();
      graticule();
      // Persistence: older sweeps first, dimmer, so the newest sits on top.
      for (let k = trails.length - 1; k >= 0; k--) (xy ? sweepXY : sweepYT)(t - k / 30, trails[k]);
      cv.paint(b);
      if (readout) {
        const s = songAt(t);
        const dim = lerpc(glass, beam, K(0.6));
        b.text(1, 0, xy ? 'X: BASS  Y: LEAD' : 'CH1 0.5V/div', dim);
        b.text(W - 12, 0, xy ? '    XY MODE' : 'TRIG ↑ BASS', dim);
        b.text(1, H - 1, xy ? `${RATIO[(((s.leadNote - s.bassNote) % 12) + 12) % 12].join(':')}  ${s.bassFreq.toFixed(1)} Hz` : `${s.bassFreq.toFixed(1)} Hz`, dim);
        if (!xy) b.text(W - 11, H - 1, `${((2 / s.bassFreq) * 100).toFixed(2)}ms/div`.padStart(10), dim);
      }
    };
  },
};
