// app-galleon-mix — the Galleon 100 SD screen with per-widget routing: pick what each of the four
// dial-layer widgets shows (any kind of the widget set: clock, next event, now playing, volume,
// audio, spectrum, CPU, cores, GPU, memory, network, disk). Each kind reads only its own ctx.data
// keys; src/apps/routing.js turns the same choice into the data keys a runtime must start.

import { WIDGET_KINDS, WIDGET_DATA, galleonOf } from './_widgets.js';
import { GALLEON_PARAMS } from '../screens/_d5-kit.js';

const slot = (def, label) => ({ type: 'select', default: def, options: WIDGET_KINDS, label });

export default {
  id: 'app-galleon-mix',
  title: 'Galleon Mix',
  category: 'Dashboards',
  description: 'The Galleon 100 SD screen with per-widget routing: audio, spectrum, media, system, clock or your next meeting. Each is live from its source in the plugin, else simulated.',
  tags: ['galleon', 'corsair', 'screen', 'dashboard', 'routing', 'widgets', 'audio', 'spectrum', 'system'],
  surface: 'screen',
  screens: ['galleon'],
  data: WIDGET_DATA,
  fps: 8,
  loop: 16,
  params: {
    dial0Top: slot('clock', 'Left dial · top layer'),
    dial1Top: slot('volume', 'Right dial · top layer'),
    dial0Bottom: slot('audio', 'Left dial · bottom layer'),
    dial1Bottom: slot('spectrum', 'Right dial · bottom layer'),
    ...GALLEON_PARAMS,
    hour12: { type: 'bool', default: false, label: '12-hour clock' },
    volume: { type: 'number', default: 0.62, min: 0, max: 1, step: 0.01, label: 'Volume (when no source sends one)' },
  },
  order: 20,
  render(ctx) {
    const p = ctx.params;
    return galleonOf(ctx, [[p.dial0Top, p.dial1Top], [p.dial0Bottom, p.dial1Bottom]]);
  },
};
