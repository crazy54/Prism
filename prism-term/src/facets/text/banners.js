// Banner styles — a figlet session (standard / small / block), gradient swatch
// book, outlined / hollow lettering, and a rotating 3D extrusion built from
// stacked offset copies.
import { NONE, mix, mixOklab } from '../../color.js';
import { drawBanner, measureBanner } from '../../text/banner.js';
import { bannerMode, fitScale, fitFont } from './_text.js';
import { figlet, bitmap } from '../ascii/_ascii.js';

const shared = { gallery: 'text', category: 'Banners & Fonts', kind: 'text', glyphs: 'unicode', color: 'truecolor', animated: true };
const asciiOnly = (ctx) => ctx.caps.unicode === false || ctx.mode === 'ascii';

// ── figlet session ──────────────────────────────────────────────────────────
const RUNS = [['standard', 'Hello'], ['small', 'PRISM'], ['block', 'OPS'], ['standard', 'ok!']];
const RSEG = 4.5;

/** Solid block letters (figlet "block"-style) with a drop shadow one font pixel down-right. */
function shadowBlock(text, font, ascii) {
  const { w, h, px } = bitmap(text, font, 2);
  const at = (x, y) => (x >= 0 && y >= 0 && x < w && y < h ? px[y][x] : 0);
  const [ink, shade] = ascii ? ['#', ':'] : ['█', '░'];
  const out = [];
  for (let y = 0; y <= h; y++) {
    let s = '';
    for (let x = 0; x < w + 2; x++) s += at(x, y) ? ink : at(x - 2, y - 1) ? shade : ' ';
    out.push(s);
  }
  return out;
}

const figletStyles = {
  ...shared,
  id: 'text-figlet-styles',
  title: 'figlet: Standard, Small, Block',
  tags: ['figlet', 'banner', 'shell', 'standard', 'small', 'block'],
  order: 135,
  loop: RSEG * RUNS.length,
  size: { w: 72, h: 14 },
  minSize: { w: 36, h: 9 },
  description: 'A shell session running figlet three ways: the outlined standard face, the compact small face and solid block letters with a shadow.',
  setup(ctx) {
    const { width: W, height: H, theme: th } = ctx;
    const ascii = asciiOnly(ctx);
    const cursor = ascii ? '_' : '▌';
    const runs = RUNS.map(([style, word]) => {
      const make = (font) => (style === 'block' ? shadowBlock(word, font, ascii) : figlet(word, font));
      let lines = make(style === 'small' ? 'tiny' : style === 'block' ? 'bold' : 'standard');
      if (lines[0].length > W || lines.length > H - 2) lines = make('tiny');
      while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
      return { style, word, lines };
    });
    return (t) => {
      const b = ctx.buffer;
      const k = Math.floor(t / RSEG) % runs.length, tau = t % RSEG;
      const { style, word, lines } = runs[k];
      const cmd = `figlet -f ${style} ${word}`;
      const n = Math.min(cmd.length, Math.max(0, Math.floor((tau - 0.2) * 26)));
      b.text(0, 0, '$ ', th.pos);
      b.text(2, 0, cmd.slice(0, n), th.ink);
      const outAt = 0.2 + cmd.length / 26 + 0.25;
      if (tau < outAt) { b.text(2 + n, 0, cursor, th.accent); return; }
      const shown = Math.min(lines.length, Math.floor((tau - outAt) * 60));
      const color = style === 'block' ? (ch) => (ch === '█' || ch === '#' ? th.accent : th.dim) : style === 'small' ? () => th.info : () => th.ink;
      for (let r = 0; r < shown && r + 1 < H; r++) {
        const l = lines[r];
        for (let x = 0; x < Math.min(l.length, W); x++) if (l[x] !== ' ') b.set(x, r + 1, l[x], color(l[x]));
      }
      if (shown === lines.length && lines.length + 1 < H) {
        b.text(0, lines.length + 1, '$ ', th.pos);
        if (Math.floor(tau / 0.53) % 2 === 0) b.text(2, lines.length + 1, cursor, th.accent);
      }
    };
  },
};

// ── gradient swatch book ────────────────────────────────────────────────────
const FILLS = [
  ['prism', 'horizontal'],
  ['sunset', 'vertical'],
  ['aurora', 'diagonal'],
  ['ocean', 'horizontal'],
  ['candy', 'diagonal'],
  ['gold', 'vertical'],
  ['toxic', 'horizontal'],
  ['magma', 'diagonal'],
];

const gradientBook = {
  ...shared,
  id: 'text-banner-gradient',
  title: 'Gradient Swatch Book',
  tags: ['gradient', 'banner', 'palette', 'fill', 'lolcat'],
  order: 140,
  loop: 16,
  size: { w: 80, h: 24 },
  minSize: { w: 36, h: 10 },
  description: 'One word stacked in stripes, each filled with a different palette sweeping horizontally, vertically or diagonally.',
  setup(ctx) {
    const { width: W, height: H, theme: th } = ctx;
    const mode = bannerMode(ctx, 'half');
    const text = String(ctx.param('text', 'GRADIENT'));
    const labelW = W >= 60 ? 12 : 0;
    const { font, scale } = fitFont(text, ['bold', 'standard', 'tiny'], { mode }, W - labelW - 2, H);
    const rowH = measureBanner(text, { font, mode, scale }).height + (mode === 'braille' ? 0 : 1);
    const rows = Math.max(1, Math.floor((H + 1) / rowH));
    return (t) => {
      const b = ctx.buffer;
      const shift = Math.floor(t / 4);
      for (let r = 0; r < rows; r++) {
        const [pal, dir] = FILLS[(r + shift) % FILLS.length];
        const y = r * rowH;
        if (labelW) {
          b.text(1, y, pal, th.ink);
          b.text(1, y + 1, dir.slice(0, labelW - 1), th.dim);
        }
        drawBanner(b, labelW + 1, y, text, { font, mode, scale, fill: pal, direction: dir, theme: th, t: t + r * 0.7, speed: 0.22 });
      }
    };
  },
};

// ── outline / hollow ────────────────────────────────────────────────────────
const STYLES = ['hollow', 'scanline', 'outlined', 'shadow'];

const outline = {
  ...shared,
  id: 'text-banner-outline',
  title: 'Outline & Shadow',
  tags: ['outline', 'hollow', 'shadow', 'banner', '80s'],
  order: 150,
  loop: 16,
  size: { w: 60, h: 12 },
  minSize: { w: 36, h: 8 },
  description: 'Hollow outline lettering, scanline-filled 80s type, outlined gradients and drop shadows — four looks, one word.',
  setup(ctx) {
    const { width: W, height: H, theme: th } = ctx;
    const mode = bannerMode(ctx, ctx.caps.sextant === false ? 'quad' : 'sextant');
    const text = String(ctx.param('text', 'OUTLINE'));
    const font = 'bold';
    const base = { font, mode, outline: true, shadow: true, shadowOffset: [2, 2] };
    const scale = fitScale(text, base, W - 2, H - 2);
    return (t) => {
      const b = ctx.buffer;
      const k = Math.floor(t / 4) % STYLES.length, lt = t % 4;
      const style = STYLES[k];
      const o = { font, mode, scale, theme: th, t, speed: 0.15 };
      if (style === 'hollow') Object.assign(o, { fill: () => NONE, outline: th.accent });
      else if (style === 'scanline') Object.assign(o, { fill: [th.warn, th.crit], outline: th.ink, shader: (c, u, v) => (Math.floor(v * 14 + t * 6) % 3 === 0 ? c : NONE) });
      else if (style === 'outlined') Object.assign(o, { fill: 'synthwave', direction: 'vertical', outline: th.ink });
      else Object.assign(o, { fill: [th.info, th.pos], shadow: mix(th.bg, th.accent, 0.45), shadowOffset: [2, 2] });
      // Settle-in: each style slides up a little as it arrives.
      const rise = lt < 0.4 ? Math.round((0.4 - lt) * 5) : 0;
      const m = measureBanner(text, { ...base, scale });
      const r = drawBanner(b, Math.floor((W - m.width) / 2), Math.max(0, Math.floor((H - m.height) / 2) - 1 + rise), text, o);
      const label = `${style}`;
      if (r.y + r.height < H) b.text(Math.floor((W - label.length) / 2), Math.min(H - 1, r.y + r.height), label, th.dim);
    };
  },
};

// ── 3D extrusion ────────────────────────────────────────────────────────────
const extrude = {
  ...shared,
  id: 'text-extrude',
  title: '3D Extruded Banner',
  tags: ['3d', 'extrude', 'depth', 'banner', 'retro'],
  order: 160,
  loop: 12.566,
  size: { w: 80, h: 20 },
  minSize: { w: 36, h: 10 },
  description: 'Solid 3D block letters: a stack of shaded offset copies forms the sides, and the light direction swings slowly around.',
  setup(ctx) {
    const { width: W, height: H, theme: th } = ctx;
    const mode = bannerMode(ctx, 'half');
    const text = String(ctx.param('text', 'DEPTH'));
    const depth = mode === 'braille' ? 6 : mode === 'ascii' ? 2 : 4;
    const pad = depth + 1;
    const font = 'bold';
    const scale = fitScale(text, { font, mode, padX: pad, padY: pad }, W - 1, H - 1);
    const size = measureBanner(text, { font, mode, scale, padX: pad, padY: pad });
    const side = th.accent, face = [mixOklab(th.ink, th.warn, 0.25), th.warn];
    return (t) => {
      const b = ctx.buffer;
      const a = t * 0.5;
      const ux = Math.cos(a) * 1.0, uy = Math.sin(a) * 0.6 + 0.4;
      const ghosts = [];
      for (let k = depth; k >= 1; k--) {
        const shade = 0.25 + 0.55 * (k / depth);
        ghosts.push({ dx: Math.round(ux * k), dy: Math.round(uy * k), color: mixOklab(side, th.bg, shade) });
      }
      drawBanner(b, Math.floor((W - size.width) / 2), Math.floor((H - size.height) / 2), text, {
        font, mode, scale, padX: pad, padY: pad, fill: face, direction: 'vertical', theme: th, ghosts,
        shader: (c, u, v) => (Math.abs(u - ((t * 0.25) % 1.6 - 0.3) - v * 0.2) < 0.04 ? mixOklab(c, 0xffffff, 0.7) : c),
      });
    };
  },
};

export default [figletStyles, gradientBook, outline, extrude];
