// BBS main menu: a shaded header, two columns of hotkey commands with a
// lightbar walking through them, a who's-online panel and the classic
// time-left status line.
import { bbsPalette } from './_kit.js';
import { frame } from './_bbs.js';

const ITEMS = [
  ['M', 'Message Bases'], ['F', 'File Areas'], ['D', 'Door Games'], ['C', 'Chat with SysOp'],
  ['B', 'Bulletins'], ['W', "Who's Online"], ['N', 'New Files Scan'], ['U', 'User Settings'],
  ['L', 'Last Callers'], ['G', 'Goodbye (Log Off)'],
];
const ONLINE = [['1', 'ZERO COOL', 'Playing L.O.R.D.'], ['2', 'ACID BURN', 'Reading msgs'], ['3', 'LIGHTMAN', 'Main menu'], ['4', 'THE PHREAK', 'Downloading']];

export default {
  title: 'BBS Main Menu',
  gallery: 'retro',
  category: 'BBS & ANSI Art',
  kind: 'art',
  tags: ['bbs', 'ansi', 'menu', 'lightbar', 'hotkeys', 'sysop'],
  order: 20,
  description: 'A BBS main menu: shaded header, hotkey commands with a walking lightbar, who-is-online and time left.',
  size: { w: 80, h: 22 },
  minSize: { w: 40, h: 12 },
  loop: 10,
  color: '16',
  params: { colors: { default: 'vga', options: ['vga', 'theme'], label: 'Colors' } },
  setup(ctx) {
    const P = bbsPalette(ctx);
    const b = ctx.buffer;
    const W = ctx.width, H = ctx.height;
    const twoCols = W >= 60;
    const panel = W >= 72 && H >= 16;
    return (t) => {
      b.fill(0, 0, W, H, ' ', P[7], P[0]);
      // Header: ░▒▓█ MAIN MENU █▓▒░ across the top.
      const title = ' MAIN MENU ';
      const side = Math.max(0, Math.floor((W - title.length) / 2));
      const grad = '░▒▓█';
      for (let x = 0; x < W; x++) {
        const d = x < side ? side - x : x - side - title.length;
        if (x >= side && x < side + title.length) continue;
        b.set(x, 0, grad[Math.max(0, 3 - Math.min(3, Math.floor(d / Math.max(1, side / 4))))], x % 2 ? P[1] : P[9]);
      }
      b.text(side, 0, title, P[15], P[1]);
      b.text(Math.max(0, Math.floor((W - 37) / 2)), 1, 'PRISM BBS · terminal art since 1991'.slice(0, W), P[8]);
      // Menu.
      const menuW = panel ? Math.min(52, W - 28) : W - 2;
      const colW = twoCols ? Math.floor((menuW - 4) / 2) : menuW - 4;
      const perCol = twoCols ? Math.ceil(ITEMS.length / 2) : ITEMS.length;
      const visible = Math.min(perCol, Math.max(1, H - 7));
      frame(b, 1, 3, menuW, visible + 2, P[1], 'COMMANDS', P[14]);
      const sel = Math.floor(t / 0.8) % ITEMS.length;
      ITEMS.forEach(([key, label], i) => {
        const col = twoCols ? Math.floor(i / perCol) : 0, row = twoCols ? i % perCol : i;
        if (row >= visible) return;
        const x = 3 + col * (colW + 1), y = 4 + row;
        const on = i === sel;
        if (on) b.fill(x - 1, y, colW, 1, ' ', P[0], P[3]);
        b.text(x, y, '[', on ? P[0] : P[1], on ? P[3] : undefined);
        b.text(x + 1, y, key, on ? P[0] : P[14], on ? P[3] : undefined);
        b.text(x + 2, y, ']', on ? P[0] : P[1], on ? P[3] : undefined);
        b.text(x + 4, y, label.slice(0, colW - 6), on ? P[0] : P[7], on ? P[3] : undefined);
      });
      // Who's online.
      if (panel) {
        const px = menuW + 3, pw = W - px - 1;
        frame(b, px, 3, pw, ONLINE.length * 2 + 2, P[5], 'ONLINE', P[13]);
        ONLINE.forEach(([n, who, what], i) => {
          const y = 4 + i * 2;
          const live = Math.floor(t * 1.5 + i) % 5 !== 0;
          b.text(px + 2, y, `${n}`, P[8]);
          b.text(px + 4, y, who.slice(0, pw - 6), i === 2 ? P[11] : P[15]);
          b.text(px + 4, y + 1, what.slice(0, pw - 6), live ? P[7] : P[8]);
        });
      }
      // Prompt + status line.
      const py = Math.min(H - 3, 4 + visible + 2);
      const blink = Math.floor(t * 2.5) % 2 === 0;
      const end = b.text(2, py, 'Command ', P[11]);
      const end2 = b.text(end, py, '» ', P[14]);
      b.text(end2, py, ITEMS[sel][0], P[15]);
      if (blink) b.set(end2 + 1, py, '█', P[7]);
      const left = 58 - Math.floor(t / 60);
      b.fill(0, H - 1, W, 1, ' ', P[0], P[7]);
      b.text(1, H - 1, `Time left: ${left} min  ·  Node 3  ·  3 new msgs  ·  ↑↓ select  Enter`.slice(0, W - 2), P[0], P[7]);
    };
  },
};
