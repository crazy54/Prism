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

/** How long the approval key must be held (s). A tap never approves: an accidental or stray press can't pair. */
export const PAIR_HOLD_S = 1.5;

export const PAIR_FACET = sys({
  id: 'app-sys-pair', title: 'Pairing', surface: 'key', fps: 4, loop: 1, animated: true,
  render(ctx) {
    const k = surface(ctx);
    const d = ctx.data || {};
    const breathe = ctx.reduced ? 1 : 0.55 + 0.45 * pulse(ctx.t, 1);
    // hold-to-approve: a progress ring fills while the key is held (ctx.pressedFor), from the top, clockwise
    const held = ctx.pressed ? Math.min(1, Math.max(0, (ctx.pressedFor || 0) / PAIR_HOLD_S)) : 0;
    k.background({ tone: held >= 1 ? 'ok' : 'alert' });
    const ring = k.m.bold, inset = ring / 2 + k.m.hair, w = k.w - 2 * inset, h = k.h - 2 * inset, r = k.m.radius;
    k.add(`<rect x="${n(inset)}" y="${n(inset)}" width="${n(w)}" height="${n(h)}" rx="${n(r)}" fill="none" stroke="${k.color('warn')}" stroke-width="${n(ring * 0.6)}" stroke-opacity="${n(held > 0 ? 0.35 : breathe, 3)}"/>`);
    if (held > 0) {
      const per = 2 * (w + h) - (8 - 2 * Math.PI) * r, len = per * held;
      const x0 = inset, y0 = inset, x1 = inset + w, y1 = inset + h, cx = k.w / 2;
      const d0 = `M${n(cx)} ${n(y0)}H${n(x1 - r)}A${n(r)} ${n(r)} 0 0 1 ${n(x1)} ${n(y0 + r)}V${n(y1 - r)}A${n(r)} ${n(r)} 0 0 1 ${n(x1 - r)} ${n(y1)}H${n(x0 + r)}A${n(r)} ${n(r)} 0 0 1 ${n(x0)} ${n(y1 - r)}V${n(y0 + r)}A${n(r)} ${n(r)} 0 0 1 ${n(x0 + r)} ${n(y0)}Z`;
      k.add(`<path d="${d0}" fill="none" stroke="${k.color('pos')}" stroke-width="${n(ring)}" stroke-linecap="round" stroke-dasharray="${n(len)} ${n(per)}"/>`);
    }
    k.eyebrow(held >= 1 ? 'Allowed' : 'Allow AI?', { color: held >= 1 ? 'pos' : 'warn' });
    k.value(String(d.code || '----'), { cy: k.h * 0.5 });
    // the assistant names itself, so its name is never shown on the key (the property inspector quotes it)
    k.label(held >= 1 ? 'Paired' : held > 0 ? 'Holding' : 'Hold', { maxLines: 1 });
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
