// app-neo-info — the Stream Deck Neo info bar (232 × 50, display-only) as a rotating glance: the
// clock, what's playing, and your next meeting, eight seconds each, each arriving by converging
// (a slight offset that resolves with ease-out-expo). A Beam under the bar shows the rotation.
// Pick one with `show` to hold it. (D5's Neo facets show each of these on its own.)

import { surface, rect, n, linearGradient, url } from '../../scene/index.js';
import { pad2 } from '../../scene/text.js';
import { arrive, clamp, phase } from '../../scene/easing.js';
import { mediaOf, calendarOf } from './_data.js';
import { colorAt } from './_kit.js';
import { hhmm, localParts } from '../screens/_d5-kit.js';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const PAGES = ['clock', 'media', 'meeting'];
const DWELL = 8;

export default {
  id: 'app-neo-info',
  title: 'Neo Info Rotator',
  category: 'Dashboards',
  description: 'The Neo info bar as a rotating glance: the clock, what is playing and your next meeting, 8 s each. Real clock; media and calendar from their sources, else simulated.',
  tags: ['neo', 'info bar', 'clock', 'now playing', 'meeting', 'calendar', 'rotating', 'screen'],
  surface: 'screen',
  screens: ['infobar'],
  data: ['clock', 'media', 'calendar'],
  fps: 4,
  loop: DWELL * PAGES.length,
  params: {
    show: { type: 'select', default: 'rotate', options: ['rotate', ...PAGES], label: 'Show' },
    hour12: { type: 'bool', default: false, label: '12-hour clock' },
  },
  order: 30,
  render(ctx) {
    const k = surface(ctx);
    const { w, h, t, params: p } = ctx;
    k.background({ tone: 'idle' });
    const rot = p.show === 'rotate';
    const cyc = rot ? phase(t, DWELL * PAGES.length) * PAGES.length : PAGES.indexOf(p.show);
    const page = PAGES[Math.floor(cyc) % PAGES.length];
    const into = rot && !ctx.reduced ? (cyc % 1) * DWELL : 9;
    const e = arrive(into, 0.5), dx = (1 - e) * 10, op = clamp(0.25 + 0.75 * e);
    const x0 = 10 + dx, x1 = w - 10;
    const c = ctx.clock;
    if (page === 'clock') {
      k.value(hhmm(c.h, c.m, p.hour12), { align: 'left', x: x0, cy: h * 0.5, size: 26, opacity: op });
      k.eyebrow(`${DAYS[c.dow]} ${c.day} ${MONTHS[c.month - 1]}`, { align: 'right', x: x1, y: h * 0.42, size: 8.5, color: 'muted', opacity: op });
      k.caption(`:${pad2(c.s)}`, { align: 'right', x: x1, y: h * 0.74, size: 9, color: 'dim', opacity: op });
    } else if (page === 'media') {
      const live = ctx.data && Object.hasOwn(ctx.data, 'media');
      const m = live && ctx.data.media === null ? null : mediaOf(ctx);
      k.eyebrow(m ? (m.playing ? 'Now playing' : 'Paused') : 'Media', { align: 'left', x: x0, y: h * 0.36, size: 8, color: 'muted', opacity: op });
      k.label(m ? m.title : 'Nothing playing', { align: 'left', x: x0, y: h * 0.68, size: 13, maxWidth: (x1 - x0) * 0.7, opacity: op, color: m ? 'ink' : 'muted' });
      if (m) {
        k.caption(m.artist, { align: 'right', x: x1, y: h * 0.68, size: 9.5, color: 'muted', maxWidth: (x1 - x0) * 0.32, opacity: op });
        const f = m.duration > 0 ? clamp(m.position / m.duration) : 0;
        k.add(rect({ x: x0, y: h - 9, width: (x1 - x0) * f, height: 1.5, fill: colorAt(ctx, 'auto', 0.8), fillOpacity: n(op, 3) }));
      }
    } else {
      const cal = calendarOf(ctx), cur = cal.current && cal.current.end > ctx.now ? cal.current : null, ev = cur || cal.next;
      if (!ev) k.label('Nothing next', { align: 'left', x: x0, y: h * 0.6, color: 'muted', opacity: op });
      else {
        const mins = Math.max(0, Math.ceil(((cur ? ev.end : ev.at) - ctx.now) / 60000)), lt = localParts(ctx, ev.at);
        const soon = !cur && mins <= 5;
        k.eyebrow(cur ? 'Now' : `Next · ${hhmm(lt.h, lt.m, p.hour12)}`, { align: 'left', x: x0, y: h * 0.36, size: 8, color: soon ? 'warn' : 'muted', opacity: op });
        k.label(ev.title, { align: 'left', x: x0, y: h * 0.68, size: 13, maxWidth: (x1 - x0) * 0.66, opacity: op });
        k.value(cur ? `${mins}m left` : mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins} min`, { align: 'right', x: x1, cy: h * 0.55, size: 14, color: soon ? 'warn' : 'ink', opacity: op });
      }
    }
    // the rotation Beam: three stops under the bar, the current one lit
    if (rot) {
      const id = k.id('rot');
      const f = cyc / PAGES.length;
      k.def(linearGradient(id, [[0, colorAt(ctx, 'auto', 0), 0], [Math.max(0, f - 0.1), colorAt(ctx, 'auto', f), 0.3], [f, k.dark ? '#ffffff' : k.colors.ink, 1], [Math.min(1, f + 0.04), colorAt(ctx, 'auto', f), 0.3], [1, colorAt(ctx, 'auto', 1), 0]], { x1: 0, y1: 0, x2: 1, y2: 0 }));
      k.add(rect({ x: 8, y: h - 3.5, width: w - 16, height: 1.25, fill: url(id) }));
    }
    return k.svg();
  },
};
