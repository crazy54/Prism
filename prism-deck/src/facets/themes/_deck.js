// Themes gallery helper: a whole-device preview of one theme — every key a real
// glyph + label + state, plus the strip / screen where the device has them.
//
//   // src/facets/themes/paper.js
//   import { themeFacet } from './_deck.js';
//   export default themeFacet('paper', { category: 'Light', title: 'Paper', description: '…' });

import { surface, compose, keyInto, svgInner, n } from '../../scene/index.js';
import { createContext } from '../../scene/context.js';
import { normalizeFacet } from '../schema.js';
import dashboardModule from '../screens/galleon-dashboard.js';
import { glyphRegistry } from '../../glyphs/_registry.js';
import { arc } from '../../scene/shapes.js';
import { splitElements } from '../../scene/cull.js';
import { lerp } from '../../scene/easing.js';

/** The default key layout: glyph, state, label — cycled across however many keys a device has. */
export const SHOWCASE = [
  ['mic', 'on', 'Mic'], ['volume', 'on', 'Volume'], ['play-pause', 'playing', 'Play'], ['broadcast', 'live', 'On Air'],
  ['cpu', 'busy', 'CPU'], ['clock', 'default', 'Clock'], ['bulb', 'on', 'Lights'], ['power', 'on', 'Power'],
  ['mic', 'off', 'Muted'], ['volume', 'muted', 'Silent'], ['play-pause', 'paused', 'Paused'], ['broadcast', 'offline', 'Offline'],
  ['bulb', 'off', 'Lamp'], ['power', 'off', 'Standby'], ['cpu', 'idle', 'Idle'], ['clock', 'default', 'Timer'],
];

/** Draw a key cell with a glyph in the theme. */
export function showcaseKey(k, [glyph, state, label], { hue } = {}) {
  const reg = glyphRegistry().glyphs;
  const g = reg.get(glyph) || reg.values().next().value;
  if (!g) return;
  const st = g.states[state] ? state : g.defaultState;
  k.background({ tone: g.states[st] });
  k.glyph(g.id, { state: st, labeled: true });
  k.label(label, { color: g.states[st] === 'off' ? 'dim' : undefined });
  void hue;
}

const DASHBOARD = normalizeFacet(dashboardModule, 'screens/galleon-dashboard.js');

/**
 * The Galleon screen in a preview: the real everyday dashboard (screen-galleon-dashboard)
 * rendered in this theme (D5's approach). Its defs are hoisted into the document's <defs>
 * so per-slice culling bounds the screen by its widget clips and key slices never carry it.
 */
function screenInto(d, ctx, S) {
  const sc = createContext(DASHBOARD, { theme: ctx.facet.theme || ctx.theme.id, mode: ctx.theme.mode, t: ctx.t, now: ctx.now, seed: ctx.seed, data: ctx.data, reduced: ctx.reduced, idPrefix: `${ctx.idPrefix}gs`, tzOffset: ctx.clock?.tzOffset ?? 0 });
  let body = svgInner(DASHBOARD.render(sc));
  if (body.startsWith('<defs>')) { const e = body.indexOf('</defs>'); d.def(body.slice(6, e)); body = body.slice(e + 7); }
  const sx = S.w / sc.w, sy = S.h / sc.h;
  // top-level elements stay top-level (each widget its own), so per-slice culling gives every Galleon
  // widget window only its own widget (API 1.5.1: deck renders return widget slices)
  const tf = S.x || S.y || sx !== 1 || sy !== 1 ? `translate(${n(S.x)} ${n(S.y)})${sx !== 1 || sy !== 1 ? ` scale(${n(sx, 4)} ${n(sy, 4)})` : ''}` : null;
  for (const el of splitElements(body)) d.add(tf ? `<g transform="${tf}">${el}</g>` : el);
}

/** A small dial readout for strip segments in previews. */
function dialSegment(p, value, label, i) {
  p.background({ tone: i === 0 ? 'active' : 'idle' });
  p.eyebrow(label);
  p.value(`${Math.round(value * 100)}`, { cy: p.h * 0.48 });
  p.add(arc({ cx: p.w / 2, cy: p.h * 0.5, r: p.h * 0.36, from: -135, to: lerp(-135, 135, value), color: p.tone('active'), width: p.m.line * 1.4 }));
}

export function themeFacet(themeId, { title, description, category = 'Signature', tags = [], order = 10, keys = SHOWCASE } = {}) {
  return {
    id: `theme-${themeId}`,
    title: title || themeId,
    category,
    description: description || `The ${themeId} theme across a whole device: every key, the strip and the screen.`,
    tags: ['theme', 'preview', ...tags],
    surface: 'deck',
    theme: themeId,
    animated: true,
    fps: 8,
    loop: 6,
    order,
    render(ctx) {
      const d = surface(ctx);
      d.add(`<rect width="${ctx.w}" height="${ctx.h}" fill="#000000"/>`);
      ctx.deck.keys.forEach((cell, i) => { const spec = keys[i % keys.length]; const g = glyphRegistry().glyphs.get(spec[0]); keyInto(d, cell, (k) => showcaseKey(k, spec), { tag: `k${i}`, hue: g?.hue }); });
      if (ctx.deck.strip) {
        const S = ctx.deck.strip, w = S.w / S.segments;
        const labels = ['Master', 'Mic', 'Music', 'Chat', 'FX', 'Out'];
        for (let i = 0; i < S.segments; i++) compose(d, { x: S.x + i * w, y: S.y, w, h: S.h }, (p) => dialSegment(p, ctx.values[i] ?? 0.5, labels[i], i), { kind: 'strip', tag: `s${i}` });
      }
      if (ctx.deck.screen && ctx.deck.screen.kind === 'galleon') screenInto(d, ctx, ctx.deck.screen);
      if (ctx.deck.screen && ctx.deck.screen.kind === 'infobar') {
        compose(d, ctx.deck.screen, (p) => {
          p.background({ tone: 'idle' });
          p.value('9:41', { align: 'left', x: 10, cy: p.h * 0.5, size: p.h * 0.5 });
          p.eyebrow(ctx.theme.title, { align: 'right', x: p.w - 10, y: p.h * 0.58, size: p.h * 0.16 });
        }, { kind: 'screen', tag: 'bar' });
      }
      return d.svg();
    },
  };
}
