// Font specimens — one facet per bitmap face, laid out like a type-foundry
// waterfall: the sample at its largest scale, then smaller, with the face's
// character set ticking past underneath.
import { NONE, mix, mixOklab } from '../../color.js';
import { drawBanner, measureBanner } from '../../text/banner.js';
import { getFont } from '../../text/fonts.js';
import { CYBER_FONT } from './_fonts.js';
import { bannerMode } from './_text.js';

const PAGE = 4;

function specimen({ id, title, font, label, samples, stops, order, description, tags }) {
  return {
    id,
    title,
    gallery: 'text',
    category: 'Banners & Fonts',
    kind: 'text',
    tags: ['font', 'specimen', 'bitmap font', 'waterfall', ...tags],
    order,
    animated: true,
    loop: PAGE * samples.length,
    glyphs: 'unicode',
    color: 'truecolor',
    size: { w: 80, h: 24 },
    minSize: { w: 36, h: 10 },
    description,
    setup(ctx) {
      const { width: W, height: H, theme: th } = ctx;
      const mode = bannerMode(ctx, 'half');
      const f = getFont(font);
      const fill = stops(th), chartInk = mix(th.muted, th.bg, 0.25);
      const m = (s, scale = 1) => measureBanner(s, { font: f, mode, scale });
      const fits = samples.filter((s) => m(s).width <= W - 2);
      const pages = fits.length ? fits : [samples[0].slice(0, Math.max(1, Math.floor((W - 2) / Math.max(1, m('M').width + 1))))];
      const top = 2, heroMax = Math.max(m(pages[0]).height, Math.floor((H - top - 1) * 0.5));
      const heroScale = pages.map((s) => {
        let k = 1;
        while (k < 6 && m(s, k + 1).width <= W - 2 && m(s, k + 1).height <= heroMax) k++;
        return k;
      });
      // Glyph chart: the face's own character set, set in itself, wrapped to the width.
      const chart = [];
      let cur = '';
      for (const ch of Object.keys(f.glyphs)) {
        if (ch === ' ') continue;
        if (cur && m(cur + ch).width > W - 2) { chart.push(cur); cur = ''; }
        cur += ch;
      }
      if (cur) chart.push(cur);
      return (t) => {
        const b = ctx.buffer;
        const page = Math.floor(t / PAGE) % pages.length, lt = t % PAGE;
        const text = pages[page], scale = heroScale[page];
        const head = `${label}  ${f.width}x${f.height}${f.descent ? `+${f.descent}` : ''}  ${Object.keys(f.glyphs).length} glyphs`;
        b.text(1, 0, head.slice(0, W - 2), th.ink, undefined, 1);
        const tag = `mode ${mode}  ${scale}x`;
        if (W > head.length + tag.length + 4) b.text(W - tag.length - 1, 0, tag, th.dim);
        b.text(1, 1, '-'.repeat(Math.max(0, W - 2)), th.line);
        const reveal = Math.min(1.15, lt / 0.6);
        const r = drawBanner(b, 1, top, text, {
          font: f, mode, scale, fill, theme: th, t, speed: 0.12, direction: 'diagonal',
          shader: reveal >= 1.15 ? undefined : (c, u) => (u > reveal ? NONE : reveal - u < 0.12 ? mixOklab(c, th.ink, 1 - (reveal - u) / 0.12) : c),
        });
        let y = top + r.height + 1;
        for (let k = 0; k < chart.length; k++) {
          const line = chart[(k + page * 2) % chart.length];
          const h = m(line).height;
          if (y + h > H) break;
          const hi = Math.floor(t * 5) % line.length;
          drawBanner(b, 1, y, line, { font: f, mode, fill: chartInk, theme: th, charStyle: (ci) => (ci === hi ? { fg: th.accent } : null) });
          y += h + (mode === 'braille' ? 0 : 1);
        }
      };
    },
  };
}

export default [
  specimen({
    id: 'text-font-standard',
    title: 'Standard 5x7 Specimen',
    font: 'standard',
    label: 'STANDARD',
    samples: ['Hello, World!', 'Sphinx of quartz', 'grep -i "jq"', 'Prism 0123'],
    stops: (th) => [th.accent, th.info, th.pos],
    order: 100,
    tags: ['standard', 'lcd', 'lowercase'],
    description: 'Type-specimen waterfall for the standard 5x7 face — upper and lower case with descenders — at every scale that fits.',
  }),
  specimen({
    id: 'text-font-tiny',
    title: 'Tiny 3x5 Specimen',
    font: 'tiny',
    label: 'TINY',
    samples: ['CPU 42%', 'P99 180MS', 'UPTIME 9D', '1,204 RPS'],
    stops: (th) => [th.pos, th.info],
    order: 110,
    tags: ['tiny', 'compact', 'kpi', 'numbers'],
    description: 'The compact 3x5 caps-and-digits face set as KPI read-outs, in a waterfall from display size down to its native pixels.',
  }),
  specimen({
    id: 'text-font-bold',
    title: 'Bold 6x7 Specimen',
    font: 'bold',
    label: 'BOLD',
    samples: ['BOLD', 'SHIP IT', 'ALERT!', '2026'],
    stops: (th) => [th.warn, th.crit, th.accent],
    order: 120,
    tags: ['bold', 'display', 'heavy'],
    description: 'The 6x7 display face with two-pixel stems — the heavyweight for headlines — shown as a scaled waterfall with its glyph set.',
  }),
  specimen({
    id: 'text-font-cyber',
    title: 'Cyber 5x7 Specimen',
    font: CYBER_FONT,
    label: 'CYBER',
    samples: ['CYBER', 'ONLINE', 'GRID 07', 'XR-84'],
    stops: (th) => [th.info, th.accent, th.crit],
    order: 130,
    tags: ['cyber', 'techno', 'squared', 'new face'],
    description: 'A new hand-drawn squared techno face — hard corners, square counters, chamfered B and D — in a specimen waterfall.',
  }),
];
