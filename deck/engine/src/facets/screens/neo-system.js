// screen-neo-system — the Neo info bar (232 × 50) as a three-gauge system strip: CPU, memory and
// network download, each a number with a hairline meter in its own Spectrum hue.
//
// ctx.data (optional; simulated otherwise, null = unavailable → —): cpu / mem 0–1 · net { up, down } bytes/s

import { surface, rect } from '../../scene/index.js';
import { metricOf, netOf, rateText } from '../apps/_data.js';
import { NET_MAX } from '../apps/_sim.js';
import { infobar, px, HUE, clamp } from './_d5-kit.js';

export default {
  id: 'screen-neo-system',
  title: 'Neo Info-Bar System',
  category: 'Neo Info Bar',
  description: 'The Neo info bar as a three-gauge system strip: CPU, memory and network download, each a number with a hairline meter in its own Spectrum hue.',
  tags: ['neo', 'info bar', 'system', 'cpu', 'memory', 'network', 'monitor', 'screen'],
  surface: 'screen',
  screens: ['infobar'],
  data: ['cpu', 'mem', 'net'],
  dataShape: { 'cpu/mem': 'number 0–1 (null = unavailable)', net: '{ up, down } bytes/s' },
  fps: 2,
  loop: 12,
  params: {},
  order: 13,
  render(ctx) {
    const k = surface(ctx);
    return infobar(ctx, k, (p, F) => {
      const cpu = metricOf(ctx, 'cpu'), mem = metricOf(ctx, 'mem'), net = netOf(ctx);
      const cols = [
        { label: 'CPU', value: cpu === null ? '—' : `${Math.round(cpu * 100)}%`, f: cpu ?? 0, hue: HUE.violet },
        { label: 'Mem', value: mem === null ? '—' : `${Math.round(mem * 100)}%`, f: mem ?? 0, hue: HUE.cyan },
        { label: 'Down', value: rateText(net?.down ?? null), f: net ? clamp(Math.sqrt(net.down / NET_MAX.down)) : 0, hue: HUE.azure },
      ];
      const gap = 10, cw = (F.w - gap * 2) / 3, ebs = px(p, 'eyebrow', 8.5), ls = px(p, 'label', 14);
      cols.forEach((c, i) => {
        const x = F.x0 + i * (cw + gap), tint = p.theme.spectral(c.hue);
        p.eyebrow(c.label, { align: 'left', x, y: 15, size: ebs, color: 'muted', maxWidth: cw });
        p.label(c.value, { align: 'left', x, y: 33, size: ls, maxWidth: cw });
        p.add(rect({ x, y: p.h - 9, width: cw, height: 2, rx: 1, fill: p.colors.line }));
        if (c.f > 0.004) p.add(rect({ x, y: p.h - 9.5, width: Math.max(3, cw * c.f), height: 3, rx: 1.5, fill: tint }));
      });
    });
  },
};
