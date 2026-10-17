// The calendar key shows today (from the runtime clock) unless a day is pinned.
import { iconFacet } from './_icon.js';

const base = iconFacet('calendar', { label: 'Calendar' });

export default {
  ...base,
  data: ['clock', 'calendar'],
  params: { ...base.params, day: { type: 'number', default: 0, min: 0, max: 31, step: 1, label: 'Day (0 = today)' } },
  render(ctx) {
    const day = ctx.params.day >= 1 ? ctx.params.day : ctx.clock.day;
    return base.render({ ...ctx, params: { ...ctx.params, day } });
  },
};
