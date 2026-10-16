// screen-neo-clock — the Stream Deck Neo info bar (232 × 50 SDK layout; display-only, app 7.6+) as a
// clock: tabular time, the date as an instrument label, your next event, and a Beam that walks the
// Spectrum with the seconds.
//
// ctx.data (optional): clock (ctx.clock) · calendar { next: { title, at }, current? } (epoch ms)

import { surface, rect, linearGradient, url, n } from '../../scene/index.js';
import { capHeight, measureText, pad2 } from '../../scene/text.js';
import { calendarOf } from '../apps/_data.js';
import { infobar, px, hhmm, localParts, DAYS, MONTHS } from './_d5-kit.js';

export default {
  id: 'screen-neo-clock',
  title: 'Neo Info-Bar Clock',
  category: 'Neo Info Bar',
  description: 'The Neo info bar as a clock: tabular time, the date as an instrument label, your next event, and a Beam that walks the Spectrum with the seconds.',
  tags: ['neo', 'info bar', 'clock', 'time', 'date', 'screen', 'calendar'],
  surface: 'screen',
  screens: ['infobar'],
  data: ['clock', 'calendar'],
  dataShape: { calendar: '{ next: { title, at }, current? } epoch ms' },
  fps: 1,
  loop: 60,
  params: { hour12: { type: 'bool', default: false, label: '12-hour clock' }, showNext: { type: 'bool', default: true, label: 'Show the next event' } },
  order: 10,
  render(ctx) {
    const k = surface(ctx);
    return infobar(ctx, k, (p, F) => {
      const c = ctx.clock, h12 = ctx.params.hour12;
      const vs = px(p, 'value', 27), hh = h12 ? ((c.h + 11) % 12) + 1 : c.h, time = `${hh}:${pad2(c.m)}`;
      const st = p.typeStyle('value', { size: vs });
      p.value(time, { align: 'left', x: F.x0, cy: F.cy - 1, size: vs });
      const rx = F.x0 + measureText(time, { size: vs, weight: st.weight, tabular: true, tracking: st.tracking || 0 }) + 10;
      const ebs = px(p, 'eyebrow', 9), cs = px(p, 'caption', 10);
      const cal = calendarOf(ctx), ev = ctx.params.showNext ? (cal.current && cal.current.end > ctx.now ? cal.current : cal.next) : null;
      const near = ev && ev.at - ctx.now < 12 * 3600000;
      p.eyebrow(`${DAYS[c.dow]} ${c.day} ${MONTHS[c.month - 1]}${h12 ? ` · ${c.h < 12 ? 'AM' : 'PM'}` : ''}`, { align: 'right', x: F.x1, y: near ? F.cy - 3 : F.cy + capHeight(ebs) / 2, size: ebs, color: 'muted', maxWidth: F.x1 - rx });
      if (near) {
        const t = localParts(ctx, ev.at);
        p.caption(ev === cal.current ? `now · ${ev.title}` : `${hhmm(t.h, t.m, h12)} ${ev.title}`, { align: 'right', x: F.x1, y: F.cy + capHeight(cs) + 3, size: cs, color: 'ink', maxWidth: F.x1 - rx });
      }
      // the Beam: a spectral hairline whose bright point travels with the seconds
      const f = c.s / 60, id = p.id('sec'), T = ctx.theme;
      const o1 = Math.max(0, f - 0.18), o2 = Math.max(o1, f), o3 = Math.max(o2, Math.min(1, f + 0.12));
      p.def(linearGradient(id, [[0, T.spectral(ctx.hue - 60), 0], [o1, T.spectral(ctx.hue - 30), 0.35], [o2, p.dark ? '#ffffff' : T.colors.ink, 1], [o3, T.spectral(ctx.hue + 40), 0.35], [1, T.spectral(ctx.hue + 60), 0]], { x1: 0, y1: 0, x2: 1, y2: 0 }));
      p.add(rect({ x: F.x0, y: p.h - 6.5, width: F.w, height: n(1.5), fill: url(id) }));
    });
  },
};
