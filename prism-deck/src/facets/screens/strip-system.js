// screen-strip-system — the Stream Deck + touch strip as a system monitor, one dial per gauge:
// CPU, memory, GPU and network (the + XL adds temperature and disk). Each 200 × 100 segment is its
// own theme panel, so the plugin can send it as that dial's layout and the four line up as one strip.
//
// ctx.data (optional; simulated otherwise, null = unavailable → —):
//   cpu / mem / gpu / disk 0–1 · net { up, down } bytes/s · temp °C · series { cpu?, gpu?, down? } · sys { memTotal, memUsed, diskTotal, diskFree }

import { surface } from '../../scene/index.js';
import { metricOf, tempOf, netOf, seriesOf, sysOf, rateText, bytesText } from '../apps/_data.js';
import { strip, stripHeader, stat, meter, spark, px, HUE, clamp } from './_d5-kit.js';

const split = (s) => { const i = s.lastIndexOf(' '); return i < 0 ? [s, ''] : [s.slice(0, i), s.slice(i + 1)]; };

export default {
  id: 'screen-strip-system',
  title: 'Strip System Monitor',
  category: 'Strip Dashboards',
  description: 'The Stream Deck + touch strip as a system monitor, one dial per gauge: CPU, memory, GPU and network (the + XL adds temperature and disk).',
  tags: ['plus', 'plus xl', 'strip', 'touch strip', 'system', 'monitor', 'cpu', 'memory', 'gpu', 'network', 'dashboard'],
  surface: 'strip',
  segments: 'all',
  data: ['cpu', 'mem', 'gpu', 'disk', 'net', 'temp'],
  dataShape: { 'cpu/mem/gpu/disk': 'number 0–1 (null = unavailable)', net: '{ up, down } bytes/s', temp: '°C', series: '{ cpu?, gpu?, down? } (extension)', sys: '{ memTotal, memUsed, diskTotal, diskFree } (extension)' },
  fps: 4,
  loop: 12,
  params: { fahrenheit: { type: 'bool', default: false, label: 'Fahrenheit' } },
  order: 30,
  render(ctx) {
    const sys = sysOf(ctx);
    const base = (p) => Math.round(p.h * 0.66);
    const big = (p) => px(p, 'value', 22) * 1.05;
    const history = (p, F, key, sx) => {
      const s = seriesOf(ctx, key, 22, 0.5);
      spark(p, s.values, { x: sx, y: F.eyebrowY + 9, w: F.x1 - sx, h: F.footY - F.eyebrowY - 11, shift: ctx.reduced ? 0 : s.frac || 0, width: Math.max(1.6, p.m.u), area: 0.14 });
    };
    const loadCell = (key, title) => (p, F) => {
      const v = metricOf(ctx, key);
      stripHeader(p, F, title, key === 'cpu' && Array.isArray(sys.cores) ? `${sys.cores.length} cores` : '');
      const s = stat(p, { role: 'value', value: v === null ? '—' : Math.round(v * 100), unit: v === null ? '' : '%', xl: F.x0, base: base(p), size: big(p), unitScale: 0.45 });
      if (v !== null) history(p, F, key, Math.max(s.right + 8, F.x0 + F.w * 0.5));
    };
    const memory = (p, F) => {
      const v = metricOf(ctx, 'mem'), total = sys.memTotal || 0, used = sys.memUsed ?? (v !== null && total ? v * total : null);
      const gb = (b) => { const x = b / 1024 ** 3; return x >= 100 ? `${Math.round(x)}` : x.toFixed(1).replace(/\.0$/, ''); };
      stripHeader(p, F, 'Memory', total ? `of ${gb(total)} GB` : '');
      stat(p, { role: 'value', value: used === null || used === undefined ? '—' : gb(used), unit: used === null || used === undefined ? '' : 'GB', xl: F.x0, base: base(p), size: big(p), unitScale: 0.45 });
      meter(p, { x: F.x0, y: F.footY - 5, w: F.w, h: 5, value: v ?? 0 });
    };
    const network = (p, F) => {
      const net = netOf(ctx);
      const [dn, du] = split(rateText(net?.down ?? null)), [un, uu] = split(rateText(net?.up ?? null));
      stripHeader(p, F, 'Network', [`↑ ${un}${uu ? ` ${uu}` : ''}`, `↑ ${un}`]);
      const cs = px(p, 'caption', 13.5);
      p.caption('↓', { align: 'left', x: F.x0, y: base(p), size: cs, color: 'muted' });
      const s = stat(p, { role: 'value', value: dn, unit: du, xl: F.x0 + Math.round(cs * 0.85), base: base(p), size: big(p), unitScale: 0.42 });
      if (net) history(p, F, 'down', Math.max(s.right + 8, F.x0 + F.w * 0.62));
    };
    const temp = (p, F) => {
      const t = tempOf(ctx), f = ctx.params.fahrenheit;
      stripHeader(p, F, 'Temp', 'package');
      stat(p, { role: 'value', value: t === null ? '—' : Math.round(f ? t * 1.8 + 32 : t), unit: t === null ? '' : f ? '°F' : '°C', xl: F.x0, base: base(p), size: big(p), unitScale: 0.45, color: t !== null && t >= 90 ? 'warn' : undefined });
      meter(p, { x: F.x0, y: F.footY - 5, w: F.w, h: 5, value: t === null ? 0 : clamp((t - 30) / 70), color: t !== null && t >= 90 ? p.colors.warn : undefined });
    };
    const disk = (p, F) => {
      const v = metricOf(ctx, 'disk');
      stripHeader(p, F, 'Disk', Number.isFinite(sys.diskFree) ? `${bytesText(sys.diskFree)} free` : '');
      stat(p, { role: 'value', value: v === null ? '—' : Math.round(v * 100), unit: v === null ? '' : '%', xl: F.x0, base: base(p), size: big(p), unitScale: 0.45 });
      meter(p, { x: F.x0, y: F.footY - 5, w: F.w, h: 5, value: v ?? 0 });
    };
    return strip(ctx, surface(ctx), [loadCell('cpu', 'CPU'), memory, loadCell('gpu', 'GPU'), network, temp, disk], { hues: [HUE.violet, HUE.cyan, HUE.jade, HUE.azure, HUE.coral, HUE.citrine] });
  },
};
