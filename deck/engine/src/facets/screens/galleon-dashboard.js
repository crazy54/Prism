// screen-galleon-dashboard — the Corsair Galleon 100 SD screen (720 × 384) as an everyday overview,
// two dials × two layers the way the keyboard routes them: left dial = time (top: the clock and the
// next event) and compute (bottom: CPU); right dial = volume (top — the Galleon's default for that
// dial) and network (bottom). The hardware underlines the active layer; `layer` marks it here too.
// Through the Stream Deck app each widget is an Encoder action (render() slices the four widgets);
// over hidraw the whole screen is written at once.
//
// ctx.data (all optional — simulated otherwise; null = "can't measure here", shows —):
//   cpu number 0–1 · net { up, down } bytes/s · uptime s · clock (ctx.clock) · calendar { next, current? }
//   media { volume? 0–1, muted? } — the system volume, when a source reports it (else params.volume)
//   series { cpu?, down?, up?: number[] } · sys { cores, cpuGhz } (extensions)

import { surface } from '../../scene/index.js';
import { galleon, HUE, GALLEON_PARAMS, clamp } from './_d5-kit.js';
import { clock, volume, cpuGauge, network } from './_d5-widgets.js';

export default {
  id: 'screen-galleon-dashboard',
  title: 'Galleon Dashboard',
  category: 'Galleon Dashboards',
  description: 'The Galleon 100 SD screen as an everyday overview: the clock and your next event, volume on the right dial, CPU and network — one widget per dial layer.',
  tags: ['galleon', 'corsair', 'screen', 'dashboard', 'cpu', 'clock', 'volume', 'network', 'widgets'],
  surface: 'screen',
  screens: ['galleon'],
  data: ['cpu', 'net', 'audio', 'media', 'clock', 'calendar', 'uptime'],
  dataShape: {
    cpu: 'number 0–1', net: '{ up, down } bytes/s', uptime: 'seconds', calendar: '{ next: { title, at, end }, current? }',
    media: '{ volume? 0–1, muted? } (system volume)', series: '{ cpu?, down?, up? } (extension)',
  },
  fps: 4,
  loop: 12,
  params: {
    ...GALLEON_PARAMS,
    volume: { type: 'number', default: 0.62, min: 0, max: 1, step: 0.01, label: 'Volume (when no source sends one)' },
    hour12: { type: 'bool', default: false, label: '12-hour clock' },
  },
  order: 10,
  render(ctx) {
    const m = ctx.data?.media;
    const vol = clamp(typeof m?.volume === 'number' ? m.volume : ctx.params.volume);
    return galleon(ctx, surface(ctx), [
      [clock(ctx, { hour12: ctx.params.hour12 }), volume(ctx, { value: vol, muted: !!m?.muted })],
      [cpuGauge(ctx), network(ctx)],
    ], { hues: [[HUE.periwinkle, HUE.citrine], [HUE.violet, HUE.azure]] });
  },
};
