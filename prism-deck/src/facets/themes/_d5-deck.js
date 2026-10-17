// D5's theme previews: the architect's whole-device preview (./_deck.js) with one change — on the
// Galleon 100 SD the screen shows the real everyday dashboard (screen-galleon-dashboard) dressed in
// the theme, instead of a placeholder clock. Everything else (keys, strip, Neo bar) is themeFacet's.

import { themeFacet } from './_deck.js';
import { normalizeFacet } from '../schema.js';
import { createContext } from '../../scene/context.js';
import { svgInner, n } from '../../scene/svg.js';
import dashboardModule from '../screens/galleon-dashboard.js';

const dashboard = normalizeFacet(dashboardModule, 'screens/galleon-dashboard.js');

export function themeFacetWithScreen(themeId, opts) {
  const base = themeFacet(themeId, opts);
  return {
    ...base,
    render(ctx) {
      const S = ctx.deck?.screen;
      if (!S || S.kind !== 'galleon') return base.render(ctx);
      const svg = base.render({ ...ctx, deck: { ...ctx.deck, screen: null } });
      const sc = createContext(dashboard, { theme: themeId, mode: ctx.theme.mode, t: ctx.t, now: ctx.now, seed: ctx.seed, data: ctx.data, reduced: ctx.reduced, idPrefix: `${ctx.idPrefix}gs`, tzOffset: ctx.clock?.tzOffset ?? 0 });
      // hoist the dashboard's defs into the document's top-level <defs>, so per-slice culling can
      // bound the screen by its widget clips and the key slices never carry the screen's markup
      let defs = '', body = svgInner(dashboard.render(sc));
      if (body.startsWith('<defs>')) { const e = body.indexOf('</defs>'); defs = body.slice(6, e); body = body.slice(e + 7); }
      const open = svg.indexOf('>', svg.indexOf('<svg')) + 1, end = svg.lastIndexOf('</svg>');
      const g = `<g transform="translate(${n(S.x)} ${n(S.y)})">${body}</g>`;
      const head = !defs ? svg.slice(0, end) : svg.startsWith('<defs>', open) ? `${svg.slice(0, open + 6)}${defs}${svg.slice(open + 6, end)}` : `${svg.slice(0, open)}<defs>${defs}</defs>${svg.slice(open, end)}`;
      return head + g + svg.slice(end);
    },
  };
}
