// A neofetch-style system summary: logo art on the left, key/value facts on the
// right, the color swatch row underneath. The facts tick like a live box.
import { ATTR, uni, mix } from './_kit.js';
import { palette } from '../../palettes.js';

const LOGO = [
  '        /\\        ',
  '       /  \\       ',
  '      / /\\ \\      ',
  '     / /  \\ \\     ',
  '    / /    \\ \\    ',
  '   / /  /\\  \\ \\   ',
  '  / /  /  \\  \\ \\  ',
  ' /_/__/____\\__\\_\\ ',
];

export default {
  id: 'callouts-neofetch',
  title: 'System Summary (neofetch)',
  category: 'Key-Value',
  description: 'A neofetch-style summary: gradient logo art beside aligned key/value system facts and the ANSI color swatch row, with uptime ticking.',
  tags: ['neofetch', 'fastfetch', 'system info', 'key value', 'motd'],
  kind: 'widget',
  size: { w: 64, h: 15 },
  minSize: { w: 38, h: 10 },
  loop: 12,
  color: '256',
  order: 10,
  setup(ctx) {
    const th = ctx.theme;
    const grad = palette('prism', th);
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height, u = uni(ctx);
      const showLogo = W >= 56;
      const lx = 1, ly = Math.max(0, Math.floor((H - Math.max(LOGO.length, 12)) / 2));
      if (showLogo) LOGO.forEach((row, y) => [...row].forEach((ch, x) => { if (ch !== ' ') b.set(lx + x, ly + y, ch, grad((x + y) / 28 + t * 0.05), undefined, ATTR.BOLD); }));
      const kx = showLogo ? lx + 21 : 1;
      const up = 6 * 86400 + 4 * 3600 + 17 * 60 + Math.floor(t);
      const upS = `${Math.floor(up / 86400)} days, ${Math.floor(up / 3600) % 24} hours, ${Math.floor(up / 60) % 60} mins`;
      const mem = 6120 + Math.round(Math.sin(t * 0.6) * 140);
      const facts = [
        ['', 'ops@prism-edge-01', true],
        ['', u ? '─'.repeat(17) : '-'.repeat(17)],
        ['OS', 'Debian GNU/Linux 12 x86_64'],
        ['Host', 'c6i.2xlarge'],
        ['Kernel', '6.1.0-26-cloud-amd64'],
        ['Uptime', upS],
        ['Packages', '612 (dpkg)'],
        ['Shell', 'bash 5.2.15'],
        ['Terminal', 'tmux 3.3a'],
        ['CPU', 'Intel Xeon 8375C (8) @ 2.90GHz'],
        ['Memory', `${mem.toLocaleString('en-US')}MiB / 15,733MiB`],
      ];
      let y = ly;
      for (const [k, v, title] of facts) {
        if (y >= H - 2) break;
        if (title) {
          const [user, host] = v.split('@');
          let x = b.text(kx, y, user, th.accent, undefined, ATTR.BOLD);
          x = b.text(x, y, '@', th.ink);
          b.text(x, y, host, th.accent, undefined, ATTR.BOLD);
        } else if (!k) b.text(kx, y, v, th.muted);
        else {
          const x = b.text(kx, y, k, th.accent, undefined, ATTR.BOLD);
          b.text(x, y, ': ', th.ink);
          b.text(x + 2, y, v.slice(0, Math.max(0, W - x - 3)), th.ink);
        }
        y++;
      }
      // Color swatches: the 8 ANSI-ish tones, then their bright twins.
      const tones = [th.bg, th.neg, th.pos, th.warn, th.info, th.crit, th.accent, th.ink];
      const sy = Math.min(H - 2, y + 1);
      tones.forEach((c, i) => {
        b.text(kx + i * 3, sy, '   ', undefined, c);
        if (sy + 1 < H) b.text(kx + i * 3, sy + 1, '   ', undefined, mix(c, 0xffffff, 0.3));
      });
    };
  },
};
