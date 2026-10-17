// screen-galleon-system — the Galleon 100 SD screen as a system monitor: CPU with every core,
// memory, GPU and network, one primary number per widget, sized to read from the keyboard.
// Left dial: compute (top CPU, bottom GPU). Right dial: memory (top) and network (bottom).
//
// ctx.data (all optional — a fictional 8-core machine is simulated otherwise; a key sent as null
// means "the source can't measure this here" and shows —):
//   cpu / mem / gpu  number 0–1          temp    °C            net  { up, down } bytes/s
//   uptime           seconds             series  { cpu?, gpu?, down?, up?: number[] } (history, oldest first)
//   sys              { cores: number[] (per-core 0–1), cpuModel, cpuGhz, memTotal, memUsed (bytes), gpuName, host }

import { surface } from '../../scene/index.js';
import { galleon, HUE, GALLEON_PARAMS } from './_d5-kit.js';
import { cpuCores, memory, gpuGauge, network } from './_d5-widgets.js';

export default {
  id: 'screen-galleon-system',
  title: 'Galleon System Monitor',
  category: 'Galleon Dashboards',
  description: 'The Galleon 100 SD screen as a system monitor: CPU with every core, memory, GPU load with its history, and network throughput.',
  tags: ['galleon', 'corsair', 'screen', 'system', 'monitor', 'cpu', 'memory', 'gpu', 'network', 'dashboard'],
  surface: 'screen',
  screens: ['galleon'],
  data: ['cpu', 'mem', 'gpu', 'net', 'temp', 'uptime'],
  dataShape: {
    'cpu/mem/gpu': 'number 0–1 (null = unavailable)',
    temp: '°C', net: '{ up, down } bytes/s', uptime: 'seconds',
    series: '{ cpu?, gpu?, down?, up?: number[] } oldest first (extension)',
    sys: '{ cores: number[], cpuModel, cpuGhz, memTotal, memUsed, gpuName, host } (extension)',
  },
  fps: 4,
  loop: 12,
  params: { ...GALLEON_PARAMS, fahrenheit: { type: 'bool', default: false, label: 'Fahrenheit' } },
  order: 22,
  render(ctx) {
    return galleon(ctx, surface(ctx), [[cpuCores(ctx, { fahrenheit: ctx.params.fahrenheit }), memory(ctx)], [gpuGauge(ctx), network(ctx)]], { hues: [[HUE.violet, HUE.cyan], [HUE.jade, HUE.azure]] });
  },
};
