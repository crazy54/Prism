// Motion gallery helper: catalogs, thumbnails and recordings have nobody pressing
// keys, so motion facets can autoplay a press once per loop until a real press
// arrives (ctx.pressAge stops being Infinity). Runtimes pass real presses; this only
// fills the silence.
//
//   const c = autoplay(ctx);            // { ...ctx, pressed, pressAge } with a simulated press
//   const k = surface(c);               // the theme's press feedback then plays too

import { phase } from '../../scene/easing.js';

export function autoplay(ctx, { every = ctx.facet.loop, at = 0.4, hold = 0.14 } = {}) {
  if (ctx.params.autoplay === false || ctx.pressed || ctx.pressAge !== Infinity || ctx.reduced) return ctx;
  const p = phase(ctx.t, every) * every;            // seconds into this loop
  const since = p >= at ? p - at : p - at + every;   // seconds since the (simulated) press began
  const pressed = since < hold;
  return { ...ctx, pressed, pressAge: pressed ? 0 : since - hold, autoplayed: true, pressedFor: since };
}

export const AUTOPLAY_PARAM = { autoplay: { type: 'bool', default: true, label: 'Demo press when idle' } };
