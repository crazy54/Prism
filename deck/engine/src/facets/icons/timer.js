// The timer key runs itself from state + since: press to start, the wedge drains over
// `minutes` × level, then flashes. A runtime can still drive `level` live.
import { iconFacet } from './_icon.js';

const base = iconFacet('timer', { label: 'Timer' });

export default {
  ...base,
  data: ['timer'],
  params: { ...base.params, minutes: { type: 'number', default: 5, min: 1, max: 120, step: 1, label: 'Dial minutes' } },
};
