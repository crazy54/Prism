// app-widget-* — the Galleon 100 SD widget set: one facet per widget kind, each filling a single
// dial-layer widget (360 × 192, the Stream Deck app's encoder canvas on the Galleon). Assign any
// of them to any dial / layer: that is per-widget routing in the Stream Deck app. The same kinds
// compose the whole screen in app-galleon-mix and in src/apps/routing.js (hidraw).

import { WIDGETS, widgetScreen } from './_widgets.js';

const FPS = { clock: 2, next: 1, media: 2, volume: 4, audio: 12, spectrum: 12, cpu: 4, cores: 4, gpu: 4, memory: 2, network: 4, disk: 2 };
const BLURB = {
  clock: 'The time as the hero, the date as an instrument label and your next event underneath.',
  next: 'Your next meeting as a countdown, its title, and a beam that fills over the last hour.',
  media: 'Now playing: generated cover art, title and artist, and the track’s progress with times.',
  volume: 'System volume on the Galleon’s notched dial: the speaker glyph at its level and a 24-notch meter.',
  audio: 'The live waveform scrolling across the widget, with a 30-segment level meter underneath.',
  spectrum: 'A 24-band spectrum analyzer with falling peak caps, low to high across the Spectrum.',
  cpu: 'CPU load as a gauge with its last 15 seconds of history.',
  cores: 'CPU load as the hero number with every core as a column, plus the package temperature.',
  gpu: 'GPU load as a gauge with its history.',
  memory: 'Memory in use in binary units, with a meter of the total.',
  network: 'Download and upload rates with both histories scrolling.',
  disk: 'Disk space used, free space, and read / write activity as two histories.',
};
const TAGS = { clock: ['clock', 'time', 'date'], next: ['calendar', 'meeting', 'countdown'], media: ['media', 'now playing', 'music'], volume: ['volume', 'audio'], audio: ['audio', 'waveform', 'level'], spectrum: ['audio', 'spectrum', 'analyzer'], cpu: ['cpu', 'system'], cores: ['cpu', 'cores', 'system'], gpu: ['gpu', 'system'], memory: ['memory', 'ram', 'system'], network: ['network', 'system'], disk: ['disk', 'storage', 'system'] };

const params = (kind) => ({
  ...(kind === 'clock' || kind === 'next' ? { hour12: { type: 'bool', default: false, label: '12-hour clock' } } : {}),
  ...(kind === 'volume' ? { volume: { type: 'number', default: 0.62, min: 0, max: 1, step: 0.01, label: 'Volume (when no source sends one)' } } : {}),
  ...(kind === 'cores' ? { fahrenheit: { type: 'bool', default: false, label: 'Fahrenheit' } } : {}),
  active: { type: 'bool', default: false, label: 'Mark as the active layer' },
});

export default Object.entries(WIDGETS).map(([kind, W], i) => ({
  id: `app-widget-${kind}`,
  title: `${W.title} Widget`,
  category: 'Dashboards',
  description: `Galleon widget — ${BLURB[kind]}`.slice(0, 180),
  tags: ['galleon', 'widget', 'screen', ...TAGS[kind]],
  surface: 'screen',
  screens: ['galleon-widget'],
  data: W.data,
  fps: FPS[kind],
  loop: kind === 'clock' || kind === 'next' ? 60 : 12,
  params: params(kind),
  order: 40 + i,
  render(ctx) { return widgetScreen(ctx, kind, { active: ctx.params.active }); },
}));
