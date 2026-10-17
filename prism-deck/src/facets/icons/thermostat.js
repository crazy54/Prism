// The thermostat key: `value` is the setpoint (a dial turns it; on keys it is a param),
// shown on a 10–30 °C scale (or °F).
import { iconFacet } from './_icon.js';

const base = iconFacet('thermostat', { label: 'Climate' });

export default {
  ...base,
  params: {
    ...base.params,
    value: { type: 'number', default: 0.55, min: 0, max: 1, step: 0.025, label: 'Setpoint' },
    unit: { type: 'select', default: 'C', options: ['C', 'F'], label: 'Unit' },
  },
};
