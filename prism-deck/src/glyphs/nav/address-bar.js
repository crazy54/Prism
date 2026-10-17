// address-bar — the address field: a pill with the site mark and the address typed in it, the caret
// after it. Arriving, the address types in; a press lights the field (focus the address bar).
import { defineGlyph } from '../_glyph.js';
import { lerp } from '../../scene/easing.js';
import { enter, press } from '../_tools.js';

export default defineGlyph({
  id: 'address-bar',
  title: 'Address Bar',
  category: 'nav',
  tags: ['address bar', 'url', 'omnibox', 'location', 'web address', 'browser', 'search'],
  draw(g, s) {
    const k = enter(s, 0.55), p = press(s, 0.4);
    g.rect(6.5, 16, 35, 16, { r: 8, role: p > 0.3 ? 'accent' : 'line' });
    g.circle(14.5, 24, 2.8, { role: 'dim' });
    const end = lerp(20.5, 31, k);
    g.line(20.5, 24, end, 24, { role: 'line' });
    g.line(end + 3, 20, end + 3, 28, { role: 'accent', weight: 0.9, opacity: lerp(0.4, 1, k) });
  },
});
