// screen-neo-agenda — the Neo info bar (232 × 50) as a meeting countdown: how long until the next
// event (or how long is left in this one), its title and time, and a hairline that fills as it nears.
//
// ctx.data (optional; a fictional working day otherwise): calendar { next: { title, at, end }, current?: { title, at, end } } (epoch ms)

import { surface, rect } from '../../scene/index.js';
import { capHeight, measureText } from '../../scene/text.js';
import { calendarOf } from '../apps/_data.js';
import { infobar, px, hhmm, localParts, clamp } from './_d5-kit.js';

const MIN = 60000;

export default {
  id: 'screen-neo-agenda',
  title: 'Neo Info-Bar Agenda',
  category: 'Neo Info Bar',
  description: 'The Neo info bar as a meeting countdown: minutes until the next event (or left in this one), its title and time, and a hairline that fills as it nears.',
  tags: ['neo', 'info bar', 'calendar', 'meeting', 'agenda', 'countdown', 'screen'],
  surface: 'screen',
  screens: ['infobar'],
  data: ['calendar', 'clock'],
  dataShape: { calendar: '{ next: { title, at, end }, current?: { title, at, end } } epoch ms' },
  fps: 1,
  loop: 60,
  params: { hour12: { type: 'bool', default: false, label: '12-hour times' }, lead: { type: 'number', default: 30, min: 5, max: 120, step: 5, label: 'Countdown window (min)' } },
  order: 12,
  render(ctx) {
    const k = surface(ctx);
    const cal = calendarOf(ctx), now = ctx.now;
    const cur = cal.current && cal.current.end > now ? cal.current : null, ev = cur || cal.next;
    const mins = ev ? Math.max(0, Math.ceil(((cur ? cur.end : ev.at) - now) / MIN)) : 0;
    const soon = !cur && !!ev && mins <= 5;
    return infobar(ctx, k, (p, F) => {
      if (!ev) { p.label('Nothing scheduled', { align: 'left', x: F.x0, y: F.cy + 4, size: px(p, 'label', 13), color: 'muted' }); return; }
      const vs = px(p, 'value', 24), cs = px(p, 'caption', 10), ls = px(p, 'label', 12.5);
      const big = mins >= 600 ? '—' : mins >= 60 ? `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}` : `${mins}`;
      const st = p.typeStyle('value', { size: vs });
      const vw = measureText(big, { size: vs, weight: st.weight, tabular: true, tracking: st.tracking || 0 });
      p.value(big, { align: 'left', x: F.x0, cy: F.cy - 3, size: vs });
      p.caption(cur ? 'left' : mins >= 60 ? 'h' : 'min', { align: 'left', x: F.x0 + vw + 3, y: F.cy - 3 + capHeight(vs, st.weight) / 2, size: cs, color: 'muted' });
      const x = F.x0 + Math.max(vw + 30, 62);
      const t0 = localParts(ctx, ev.at), t1 = localParts(ctx, ev.end ?? ev.at), h12 = ctx.params.hour12;
      p.label(ev.title, { align: 'left', x, y: F.cy - 2, size: ls, maxWidth: F.x1 - x });
      p.caption(cur ? `now · until ${hhmm(t1.h, t1.m, h12)}` : `${hhmm(t0.h, t0.m, h12)}${ev.end ? `–${hhmm(t1.h, t1.m, h12)}` : ''}`, { align: 'left', x, y: F.cy + capHeight(cs) + 4, size: cs, color: 'muted', maxWidth: F.x1 - x });
      // the hairline: fills over the countdown window (or through the meeting)
      const f = cur ? clamp((now - cur.at) / Math.max(MIN, cur.end - cur.at)) : clamp(1 - (ev.at - now) / (ctx.params.lead * MIN));   // continuous: it creeps each second
      const y = p.h - 6.5;
      p.add(rect({ x: F.x0, y, width: F.w, height: 1.5, fill: p.colors.line }));
      if (f > 0.001) p.add(rect({ x: F.x0, y: y - 0.5, width: Math.max(2, F.w * f), height: 2.5, rx: 1.25, fill: soon ? p.colors.warn : p.ctx.tint }));
    }, { tone: soon ? 'warn' : 'idle' });
  },
};
