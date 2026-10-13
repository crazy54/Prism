// lm-sensors — chip blocks with per-core temperatures, high/crit limits, NVMe composite and fan RPM.
import { G, C, ATTR, writer, walk, fixed, lpad } from './_kit.js';

export default {
  id: 'ops-sensors',
  title: 'sensors',
  category: 'System Monitors',
  description: 'lm-sensors output: coretemp package and cores with high/crit limits, an NVMe composite and fan speeds, readings warming with load.',
  tags: ['sensors', 'lm-sensors', 'temperature', 'fan', 'hardware'],
  kind: 'tui',
  size: { w: 64, h: 18 },
  minSize: { w: 50, h: 8 },
  loop: 20,
  glyphs: 'ascii',
  color: '16',
  setup(ctx) {
    const w = writer(ctx), c = C(ctx), g = G(ctx);
    const H = ctx.height;
    const deg = g.deg === '°' ? '°C' : ' C';
    const tc = (v, hi) => (v >= hi ? c.red : v >= hi - 12 ? c.yellow : c.green);
    return (t) => {
      const heat = walk(ctx, 1, t, 0.12);
      const temp = (k, base) => base + heat * 22 + (walk(ctx, k, t, 0.6) - 0.5) * 6;
      const lines = [];
      const row = (label, v, limits, hi = 80) => lines.push([[label.padEnd(15), c.fg], [`${v >= 0 ? '+' : ''}${fixed(v)}${deg}`.padStart(9), tc(v, hi), ATTR.BOLD], [`  ${limits}`, c.muted]]);
      lines.push([['coretemp-isa-0000', c.fg, ATTR.BOLD]]);
      lines.push([['Adapter: ISA adapter', c.muted]]);
      const pkg = temp(2, 46);
      row('Package id 0:', pkg, `(high = +80.0${deg}, crit = +100.0${deg})`);
      for (let i = 0; i < 4; i++) row(`Core ${i}:`, temp(10 + i, 43 + i), `(high = +80.0${deg}, crit = +100.0${deg})`);
      lines.push([]);
      lines.push([['nvme-pci-0100', c.fg, ATTR.BOLD]]);
      lines.push([['Adapter: PCI adapter', c.muted]]);
      row('Composite:', 38 + heat * 9, `(low  = -273.1${deg}, high = +84.8${deg})`, 84.8);
      lines.push([['', c.fg], [' '.repeat(26) + `(crit = +84.8${deg})`, c.muted]]);
      lines.push([]);
      lines.push([['it8628-isa-0a40', c.fg, ATTR.BOLD]]);
      lines.push([['Adapter: ISA adapter', c.muted]]);
      const fan = (k, base) => Math.round(base + heat * 900 + (walk(ctx, k, t, 0.9) - 0.5) * 60);
      for (const [name, base] of [['fan1:', 1080], ['fan2:', 760]]) lines.push([[name.padEnd(15), c.fg], [`${lpad(fan(name.length * 7, base), 4)} RPM`.padStart(9), c.cyan, ATTR.BOLD], ['  (min =    0 RPM)', c.muted]]);
      lines.slice(0, H).forEach((parts, y) => w.seg(0, y, parts));
    };
  },
};
