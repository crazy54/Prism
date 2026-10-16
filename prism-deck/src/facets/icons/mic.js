// icon-mic — the mic glyph, linked to the device's mic state (scene/link.js 'mic.muted'): mute it here and
// every mic key, the Galleon screen and a + mic dial say MUTED too. Muted is unmissable (apps/_muted.js):
// the whole key washes red, the glyph is struck through and the label reads MUTED.
import { iconFacet } from './_icon.js';
import { surface } from '../../scene/surface.js';
import { mutedKey, pairLink } from '../apps/_muted.js';

const base = iconFacet('mic', { label: 'Mic', description: 'The mic glyph, live or muted. Muted fills the key red with a struck mic and MUTED; linked keys and screens on the deck follow. Shows state only.' });

export default {
  ...base,
  tags: [...new Set([...base.tags, 'microphone', 'mute', 'muted', 'stream', 'streaming', 'meeting'])],
  link: pairLink('mic', ['on', 'off']),
  render(ctx) {
    if (ctx.stateName !== 'off') return base.render(ctx);
    const k = surface(ctx);
    mutedKey(k, { labeled: !!(ctx.params.showLabel && ctx.params.label), since: ctx.since });
    return k.svg();
  },
};
