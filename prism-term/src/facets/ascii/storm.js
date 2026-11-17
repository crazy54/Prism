// Pure ASCII — a storm passage: a lone square-rigger heels over a heavy swell under
// a scudding cloud deck, with driving rain, breaking crests and lightning twice a
// loop. 7-bit glyphs only; split from waterline.js. On short screens it carries a
// smaller rig so the masthead stays below the cloud deck.
import { sprite, hash } from './_ascii.js';
import { mix } from '../../color.js';
import { clamp } from '../../easing.js';

const shared = { gallery: 'ascii', glyphs: 'ascii', color: '16', kind: 'art', size: { w: 80, h: 24 }, minSize: { w: 36, h: 12 } };
const TAU = Math.PI * 2;
/** Time within the loop, quantized so t and t + loop draw identical frames (flicker keys included). */
const phase = (t, loop) => Math.round((((t % loop) + loop) % loop) * 1e6) / 1e6;

// ── storm passage ────────────────────────────────────────────────────────────
const SHIP = [
  '      |       ',
  '     /|\\      ',
  '    /)|(\\     ',
  '   /))|((\\    ',
  '  /___|___\\   ',
  ' _____|_____  ',
  ' \\_o__o__o_/--',
  "  `--------'  ",
];

// On short screens (H < 17) a 5-row rigger, so masthead and pennant stay below the cloud deck.
const SHIP_S = [
  '    |     ',
  '   /|\\    ',
  '  /_|_\\   ',
  ' \\_o_o_/- ',
  "  `---'   ",
];

const storm = {
  ...shared,
  id: 'ascii-storm-ship',
  since: '0.3.0',
  title: 'Ship in a Storm',
  category: 'ASCII Art',
  tags: ['ship', 'storm', 'sail', 'lightning', 'rain', 'waves'],
  order: 210,
  loop: 10,
  minSize: { w: 40, h: 12 },
  description: 'A lone square-rigger heels over the swell under scudding cloud: driving rain, breaking crests, and a lightning strike twice a passage.',
  setup(ctx) {
    const { width: W, height: H, theme: th } = ctx;
    const seaMid = Math.floor(H * 0.62);
    const A1 = Math.max(1.2, H * 0.1), A2 = Math.max(0.6, H * 0.045);
    const surfAt = (x, tt) => seaMid + A1 * Math.sin(x * 0.09 - TAU * 2 * tt / 10) + A2 * Math.sin(x * 0.21 - TAU * 4 * tt / 10);
    const drops = Math.round(W * H / 24);
    // Short screens: the small rigger, and a cloud deck held to the top rows so the masthead stays clear.
    const ship = H < 17 ? SHIP_S : SHIP, hull = H < 17 ? 3 : 5, sw = ship[0].length, mastX = ship[0].indexOf('|');
    const deck = H < 17 ? 0.9 : Infinity; // one row of cloud, with a clear row above the masthead
    const spans = ship.map((row) => [row.search(/\S/), row.trimEnd().length]); // sails are opaque: blank their span first
    return (t) => {
      const b = ctx.buffer;
      const p = phase(t, 10);
      t = p;
      const fl = Math.max(0, 1 - Math.abs(p - 2.4) * 5, 1 - Math.abs(p - 7.1) * 5);
      if (fl > 0.15) b.fill(0, 0, W, seaMid - 2, ' ', undefined, mix(th.bg, th.muted, fl * 0.4));
      for (let x = 0; x < W; x++) {                     // scudding cloud deck
        const cb = Math.min(deck, 1.5 + 1.4 * Math.sin(x * 0.11 + TAU * 2 * t / 10) + 0.8 * Math.sin(x * 0.23 + TAU * 3 * t / 10));
        for (let y = 0; y <= cb; y++) {
          const r = hash(x, y, 3);
          b.set(x, y, r < 0.3 ? '(' : r < 0.6 ? ')' : '~', mix(th.muted, th.bg, 0.3 + r * 0.3));
        }
      }
      for (let x = 0; x < W; x++) {                     // the swell
        const s = surfAt(x, t), sr = Math.round(s);
        const steep = surfAt(x + 1, t) - surfAt(x - 1, t);
        for (let y = Math.max(0, sr); y < H; y++) {
          const depth = (y - sr) / Math.max(1, H - seaMid);
          let ch = ' ';
          if (y === sr) {
            ch = Math.abs(steep) > 1.1 ? (steep < 0 ? '/' : '\\') : '~';
            if (s < seaMid - A1 * 0.55 && hash(x, Math.floor(t * 3), 9) < 0.55) ch = '*';
          } else {
            const v = Math.sin(x * (0.1 + hash(y, 5) * 0.08) + hash(y, 61) * TAU - t * (TAU * (2 + Math.floor(hash(y, 67) * 3)) / 10));
            if (v > 0.82 - depth * 0.15 && hash(x, y, 41) < 0.5) ch = '~';
          }
          if (ch !== ' ') b.set(x, y, ch, ch === '*' ? th.ink : mix(th.info, th.bg, clamp(0.2 + depth * 0.65, 0, 0.8)));
        }
      }
      const sx = Math.floor(W * 0.44) + Math.round(Math.sin(TAU * t / 10) * 2);
      const sy = Math.max(ship.length + 1, Math.round(surfAt(sx + 6, t))); // a crest never lifts the masthead above row 2 (no-op at 80x24)
      const lean = clamp((surfAt(sx + 12, t) - surfAt(sx, t)) / 12 * 5, -2, 2);
      for (let r = 0; r < ship.length; r++) {           // hull + sail, sheared by the wave slope
        const shift = Math.round(lean * (ship.length - 1 - r) * 0.33), y = sy - ship.length + 1 + r;
        for (let c = spans[r][0]; c >= 0 && c < spans[r][1]; c++) b.set(sx + shift + c, y, ' ');
        sprite(b, sx + shift, y, [ship[r]], r >= hull ? th.muted : th.ink);
      }
      const my = sy - ship.length + 1;                  // pennant streaming off the masthead
      for (let i = 0; i < 3; i++) b.set(sx + mastX + 1 + Math.round(lean * (ship.length - 1) * 0.33) + i, my + Math.max(0, Math.round(Math.sin(TAU * t - i) * 0.6)), i === 2 ? '>' : '~', th.accent); // never above the masthead
      if (Math.abs(lean) > 1.2) b.set(sx + (lean > 0 ? sw - 1 : 1), sy, '*', th.ink);
      for (let k = 0; k < drops; k++) {                 // driving rain
        const z = hash(k, 1), spd = (5 + Math.floor(z * 5)) * (H + 6) / 10; // 5–9 falls per loop, so the rain closes
        const yy = ((hash(k, 2) * H + t * spd) % (H + 6)) - 3;
        const xx = Math.floor((hash(k, 4) * W + yy * 0.6) % W);
        if (yy > 1 && yy < surfAt(xx, t) - 0.5) b.set(xx, Math.floor(yy), z > 0.6 ? '\\' : z > 0.3 ? ':' : '.', z > 0.6 ? th.info : z > 0.3 ? th.muted : th.dim);
      }
      if (fl > 0.5) {                                   // the strike
        let x = Math.floor(W * (0.2 + 0.6 * hash(Math.floor(p), 77)));
        for (let y = 2; y < surfAt(x, t) - 1; y++) {
          const dx = hash(y, Math.floor(t), 9) < 0.5 ? -1 : 1;
          b.set(x, y, dx < 0 ? '/' : '\\', th.ink);
          b.set(x + 1, y, dx < 0 ? '/' : '\\', th.warn);
          x += dx;
        }
      }
    };
  },
};

export default storm;
