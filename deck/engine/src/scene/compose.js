// Compositing: draw sub-surfaces (keys, strip segments, screens) inside a larger
// canvas — for deck previews (themes gallery), whole-device apps and spans that put
// a "real key" inside one cell.
//
//   const deck = surface(ctx);                       // a deck / span canvas
//   for (const cell of ctx.grid.cells)
//     keyInto(deck, cell, (k) => { k.background({ tone: 'active' }); k.glyph('mic', { state: 'on', labeled: true }); k.label('Mic'); });
//   return deck.svg();
//
// The sub-surface gets its own id prefix, the parent's theme, t, seed and data, and
// its own size, so the theme's metrics and typography are right for the cell.

import { KeySurface, PanelSurface } from './surface.js';
import { n, attrs } from './svg.js';

/** A child context for a rect of a parent surface: kind 'key' (default) or a panel kind. */
export function childContext(ctx, rect, { kind = 'key', tag = 'c', state, tone, hue } = {}) {
  return { ...ctx, kind, w: rect.w, h: rect.h, size: Math.min(rect.w, rect.h), idPrefix: `${ctx.idPrefix}${tag}`, tone: tone ?? 'idle', stateName: state ?? null, hue: hue ?? ctx.hue, tint: hue !== undefined ? ctx.theme.spectral(hue) : ctx.tint, pressed: false, pressAge: Infinity };
}

/** Draw into a sub-surface placed at rect inside parent. Returns what draw() returned. */
export function compose(parent, rect, draw, { kind = 'key', tag, clip = true, ...rest } = {}) {
  const sub = childContext(parent.ctx, rect, { kind, tag: tag ?? `${kind[0]}${Math.round(rect.x)}x${Math.round(rect.y)}`, ...rest });
  const k = kind === 'key' ? new KeySurface(sub) : new PanelSurface(sub);
  const out = draw(k);
  if (k.defs) parent.def(k.defs);
  let body = k.body;
  if (clip) {
    const id = parent.id('clip');
    parent.def(`<clipPath id="${id}"><rect width="${n(rect.w)}" height="${n(rect.h)}"/></clipPath>`);
    body = `<g clip-path="url(#${id})">${body}</g>`;
  }
  parent.add(`<g${attrs({ transform: `translate(${n(rect.x)} ${n(rect.y)})` })}>${body}</g>`);
  return out;
}

/** compose() for a key cell. */
export const keyInto = (parent, cell, draw, opts = {}) => compose(parent, cell, draw, { kind: 'key', tag: `k${cell.i ?? ''}`, ...opts });
