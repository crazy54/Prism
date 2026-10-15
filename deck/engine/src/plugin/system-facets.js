// Facets the plugin draws for itself — never in the catalog:
//   sys-pair    the glowing approval key of the AI pairing prompt (code + client)
//   sys-label   a text-only key (a live look with just a title)
//   sys-value   a dial segment with a title, a value and a bar (live feedback without a facet)
//   sys-layout  an inline live feedback layout ({ items: [text | bar | gbar | pixmap] }) composited into the canvas
// Inputs arrive through ctx.data (opts.data), so params stay the engine's business.

import { normalizeFacet } from '../facets/schema.js';
import { surface } from '../scene/surface.js';
import { textPath } from '../scene/text.js';
import { n, esc, svgInner } from '../scene/svg.js';
import { validateSvg } from '../scene/validate.js';
import { pulse } from '../scene/easing.js';

const sys = (raw) => normalizeFacet({ gallery: 'apps', category: 'Dashboards', tags: ['system'], description: 'Prism Deck plugin system surface (not in the catalog).', ...raw }, `apps/${raw.id}.js`);

export const PAIR_FACET = sys({
  id: 'app-sys-pair', title: 'Pairing', surface: 'key', fps: 4, loop: 1, animated: true,
  render(ctx) {
    const k = surface(ctx);
    const d = ctx.data || {};
    const breathe = ctx.reduced ? 1 : 0.55 + 0.45 * pulse(ctx.t, 1);
    k.background({ tone: 'alert' });
    const ring = k.m.bold;
    k.add(`<rect x="${n(ring / 2 + k.m.hair)}" y="${n(ring / 2 + k.m.hair)}" width="${n(k.w - ring - 2 * k.m.hair)}" height="${n(k.h - ring - 2 * k.m.hair)}" rx="${n(k.m.radius)}" fill="none" stroke="${k.color('warn')}" stroke-width="${n(ring * 0.6)}" stroke-opacity="${n(breathe, 3)}"/>`);
    k.eyebrow('Allow AI?', { color: 'warn' });
    k.value(String(d.code || '----'), { cy: k.h * 0.5 });
    k.label(String(d.client || 'Press to allow').slice(0, 18), { maxLines: 2 });
    return k.svg();
  },
});

export const LABEL_FACET = sys({
  id: 'app-sys-label', title: 'Label', surface: 'key', animated: false,
  render(ctx) {
    const k = surface(ctx);
    const title = String(ctx.data?.title ?? '').slice(0, 24);
    k.background({ tone: ctx.data?.tone || 'idle' });
    const lines = title.split('\n').slice(0, 3);
    if (lines.length === 1 && title.length <= 5) k.value(title, { cy: k.h / 2 });
    else k.label(lines.join(' '), { y: k.h / 2 + 4 * k.m.u, maxLines: 3 }); // label's y is its baseline: optically centered
    return k.svg();
  },
});

export const VALUE_FACET = sys({
  id: 'app-sys-value', title: 'Value', surface: 'strip', segments: 1, animated: false,
  render(ctx) {
    const k = surface(ctx);
    const d = ctx.data || {};
    const v = Math.min(100, Math.max(0, Number(d.value) || 0));
    k.background({ tone: 'active' });
    if (d.title) k.eyebrow(String(d.title).slice(0, 24));
    k.value(`${Math.round(v)}%`, { align: 'right' });
    const x = 16, y = 74, w = k.w - 32, h = 8;
    k.add(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="${k.color('line')}"/>`);
    if (v > 0) k.add(`<rect x="${x}" y="${y}" width="${n(Math.max(h, (w * v) / 100))}" height="${h}" rx="${h / 2}" fill="${ctx.tint}"/>`);
    return k.svg();
  },
});

const HEX = /^#[0-9a-f]{6}$/i;

/** Decode an SVG data URL (base64 or URI-encoded) → markup or null. */
export function decodeSvgDataUrl(url) {
  const m = /^data:image\/svg\+xml(;charset=[^;,]+)?(;base64)?,(.*)$/is.exec(String(url || ''));
  if (!m) return null;
  try { return m[2] ? Buffer.from(m[3], 'base64').toString('utf8') : decodeURIComponent(m[3]); } catch { return null; }
}

const viewBoxOf = (svg) => {
  const vb = /viewBox="([-\d.\s,]+)"/.exec(svg);
  if (vb) { const [x, y, w, h] = vb[1].trim().split(/[\s,]+/).map(Number); if ([x, y, w, h].every(Number.isFinite) && w > 0 && h > 0) return { x, y, w, h }; }
  const w = Number(/\swidth="([\d.]+)"/.exec(svg)?.[1]), h = Number(/\sheight="([\d.]+)"/.exec(svg)?.[1]);
  return w > 0 && h > 0 ? { x: 0, y: 0, w, h } : null;
};

/** Place an SVG (deck subset) into rect [x, y, w, h] by scaling its viewBox. → markup or '' when invalid. */
export function placeSvg(svg, [x, y, w, h]) {
  const vb = viewBoxOf(svg);
  if (!vb || validateSvg(svg, { maxBytes: 256 * 1024 }).length) return '';
  return `<g transform="translate(${n(x)} ${n(y)}) scale(${n(w / vb.w, 4)} ${n(h / vb.h, 4)}) translate(${n(-vb.x)} ${n(-vb.y)})">${svgInner(svg)}</g>`;
}

export const LAYOUT_FACET = sys({
  id: 'app-sys-layout', title: 'Layout', surface: 'strip', segments: 1, animated: false,
  render(ctx) {
    const k = surface(ctx);
    k.background({ tone: 'idle' });
    const items = [...(ctx.data?.items || [])].sort((a, b) => (a.zOrder || 0) - (b.zOrder || 0));
    for (const it of items) {
      if (it.enabled === false) continue;
      const [x, y, w, h] = it.rect;
      const op = typeof it.opacity === 'number' && it.opacity < 1 ? ` opacity="${n(it.opacity, 2)}"` : '';
      if (it.background && HEX.test(it.background)) k.add(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${it.background}"${op}/>`);
      if (it.type === 'text') {
        const size = Math.min(h, Number(it.font?.size) || 16), weight = Number(it.font?.weight) >= 650 ? 700 : Number(it.font?.weight) >= 500 ? 600 : 400;
        const align = it.alignment || 'center';
        const tx = align === 'left' ? x : align === 'right' ? x + w : x + w / 2;
        const color = HEX.test(it.color || '') ? it.color : k.colors.ink;
        k.add(`<g${op}>${textPath(String(it.value ?? ''), { x: tx, y: y + h / 2 + size * 0.36, size, weight, anchor: align === 'left' ? 'start' : align === 'right' ? 'end' : 'middle', maxWidth: w, fill: color })}</g>`);
      } else if (it.type === 'bar' || it.type === 'gbar') {
        const min = Number(it.range?.min ?? 0), max = Number(it.range?.max ?? 100);
        const v = Math.min(1, Math.max(0, (Number(it.value) - min) / ((max - min) || 1)));
        const bh = it.type === 'gbar' ? Math.min(h, Number(it.bar_h) || 10) : h;
        const fillC = HEX.test(it.bar_fill_c || '') ? it.bar_fill_c : ctx.tint;
        const bgC = HEX.test(it.bar_bg_c || '') ? it.bar_bg_c : k.colors.line;
        k.add(`<g${op}><rect x="${x}" y="${y}" width="${w}" height="${n(bh)}" rx="${n(bh / 2)}" fill="${bgC}"/><rect x="${x}" y="${y}" width="${n(Math.max(0, w * v))}" height="${n(bh)}" rx="${n(bh / 2)}" fill="${fillC}"/></g>`);
        if (it.type === 'gbar') { const cx = x + w * v; k.add(`<path d="M${n(cx)} ${n(y + bh + 1)}l${n(-4)} ${n(Math.min(6, h - bh))}h8z" fill="${k.colors.ink}"${op}/>`); }
      } else if (it.type === 'pixmap') {
        const svg = decodeSvgDataUrl(it.value);
        if (svg) k.add(op ? `<g${op}>${placeSvg(svg, it.rect)}</g>` : placeSvg(svg, it.rect));
      }
    }
    return k.svg();
  },
});

export const SYSTEM_FACETS = Object.freeze({ pair: PAIR_FACET, label: LABEL_FACET, value: VALUE_FACET, layout: LAYOUT_FACET });

/** Safe text for logs / PI (never markup). */
export const plain = (s, max = 64) => esc(String(s ?? '').replace(/[\u0000-\u001f]/g, ' ').slice(0, max));
