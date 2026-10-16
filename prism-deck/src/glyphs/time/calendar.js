// calendar — a bound page showing a date. The day comes from params.day (1–31; the
// icons facet passes today's date from ctx.clock when its Day param is 0).
// event: the header lights and the date takes the accent — something is on today.
// Every state change turns the page: the new date rises into place as the header settles.
import { defineGlyph } from '../_glyph.js';
import { arrive, lerp } from '../../scene/easing.js';
import { P } from '../../scene/svg.js';
import { digits } from './_digits.js';

const X0 = 9.5, X1 = 38.5, Y0 = 11, Y1 = 40, HEAD = 19, RAD = 4;

export default defineGlyph({
  id: 'calendar',
  title: 'Calendar',
  category: 'time',
  tags: ['calendar', 'date', 'day', 'schedule', 'event', 'agenda', 'meeting'],
  states: { date: 'idle', event: 'active' },
  draw(g, s) {
    const event = s.state === 'event';
    const k = arrive(s.since, 0.45);
    const raw = Math.round(Number(s.params.day));
    const day = raw >= 1 && raw <= 31 ? raw : 17;
    if (event) {
      // the header band lights from the binding down
      const hb = lerp(Y0 + RAD, HEAD, k);
      g.path(P().M(X0, hb).V(Y0 + RAD).A(RAD, RAD, 0, 0, 1, X0 + RAD, Y0).H(X1 - RAD).A(RAD, RAD, 0, 0, 1, X1, Y0 + RAD).V(hb).Z().d, { role: 'accent', fill: true, opacity: 0.9 });
    }
    g.rect(X0, Y0, X1 - X0, Y1 - Y0, { r: RAD });
    g.line(X0, HEAD, X1, HEAD, { role: event ? 'line' : 'dim' });
    // binder rings
    for (const x of [17.5, 30.5]) g.line(x, 7.5, x, 14, { role: 'line', weight: 1.05 });
    // the date rises into place with the page turn
    g.group({ y: 3.5 * (1 - k), opacity: k }, () => digits(g, day, { top: 7, role: event ? 'accent' : 'line' }));
  },
});
