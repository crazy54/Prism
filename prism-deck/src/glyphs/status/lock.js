// lock — a padlock. locked: the shackle drops home with a small overshoot (the clunk) and
// the keyhole lights. unlocked: the shackle springs up and its free leg leaves the body;
// the keyhole goes dark.
import { defineGlyph } from '../_glyph.js';
import { arrive, lerp, outBack, outExpo } from '../../scene/easing.js';

const BX = 11.5, BY = 22.5, BW = 25, BH = 17; // body 11.5…36.5 × 22.5…39.5
const LX = 17.5, RX = 30.5, SR = 6.5;         // shackle legs + radius
const SY = 17;                                // shackle arc center, locked (top 10.5; open 6)
const LIFT = 4.5;                             // how far it rises when open

export default defineGlyph({
  id: 'lock',
  title: 'Lock',
  category: 'status',
  tags: ['lock', 'unlock', 'secure', 'security', 'privacy', 'padlock'],
  states: { locked: 'active', unlocked: 'idle' },
  draw(g, s) {
    const locked = s.state === 'locked';
    // lift: 0 = home, LIFT = open; locked drops with outBack (dips just below home, then settles)
    const lift = locked ? LIFT * (1 - arrive(s.since, 0.42, outBack)) : LIFT * arrive(s.since, 0.4, outExpo);
    const cy = +(SY - lift).toFixed(2);
    const free = lerp(BY, cy + 5, lift / LIFT);  // the free (right) leg ends here
    g.path(`M${LX} ${BY}V${cy}A${SR} ${SR} 0 0 1 ${RX} ${cy}V${free.toFixed(2)}`, { role: 'line', weight: 1.08 });
    g.rect(BX, BY, BW, BH, { r: 4 });
    const on = locked ? arrive(Math.max(0, s.since - 0.2), 0.3) : 1 - arrive(s.since, 0.2);
    g.circle(24, 29.5, 2.5, { role: on > 0.5 ? 'accent' : 'dim', fill: true, opacity: 0.6 + 0.4 * Math.abs(on * 2 - 1) });
    g.line(24, 31, 24, 34.5, { role: on > 0.5 ? 'accent' : 'dim', weight: 0.9, opacity: 0.6 + 0.4 * Math.abs(on * 2 - 1) });
  },
});
