// Dialing in, 1992: the modem init string, the dial, RINGING, CONNECT 2400,
// then the board's welcome screen painting itself cell by cell at line speed —
// cursor racing ahead of the paint — until NO CARRIER sends you back to start.
import { CellBuffer } from '../../buffer.js';
import { textMask, bbsPalette } from './_kit.js';
import { blockLogo, frame } from './_bbs.js';

const SCRIPT = [
  [0.0, 'ATZ'], [0.6, 'OK'], [1.0, 'ATDT 555-0142'], [2.4, 'RINGING'], [3.4, 'RINGING'], [4.2, 'CONNECT 2400/ARQ/V42BIS'],
];
const PAINT_AT = 5.0, PAINT = 3.4, HOLD = 2.6;

function welcome(W, H, P) {
  const s = new CellBuffer(W, H);
  s.clear(P[0]);
  const logo = textMask('PRISM', { font: 'bold' });
  const sx = logo.w * 2 + 2 <= W ? 2 : 1;
  let y = 1;
  if (H >= 14 && logo.w * sx <= W) {
    blockLogo(s, Math.floor((W - logo.w * sx) / 2), y, logo, { sx, ramp: (v) => (v < 0.25 ? P[15] : v < 0.5 ? P[14] : v < 0.8 ? P[6] : P[4]), shadow: P[8] });
    y += 5;
  }
  const lines = [['P R I S M   B B S', P[11]], ['300 · 1200 · 2400 bps · 24 hours · 2 nodes', P[7]], ['', 0], ['Home of the terminal art underground', P[6]]];
  for (const [text, c] of lines) { if (y < H - 4 && text) s.text(Math.max(0, Math.floor((W - text.length) / 2)), y, text, c); y++; }
  const fw = Math.min(W - 2, 44), fx = Math.floor((W - fw) / 2);
  if (y + 4 <= H) {
    frame(s, fx, y, fw, 4, P[2], 'NEWS', P[10]);
    s.text(fx + 2, y + 1, 'New door game: TradeWars 2002 on node 2'.slice(0, fw - 4), P[7]);
    s.text(fx + 2, y + 2, 'Upload ratio waived this weekend'.slice(0, fw - 4), P[7]);
  }
  return s;
}

export default {
  title: 'Modem Connect',
  gallery: 'retro',
  category: 'BBS & ANSI Art',
  kind: 'art',
  tags: ['modem', 'dial-up', 'bbs', 'ansi', 'connect', 'hayes', '2400 baud'],
  order: 50,
  description: 'Dialing a BBS: ATZ, ATDT, RINGING, CONNECT 2400 — then the welcome screen paints in at line speed.',
  size: { w: 80, h: 22 },
  minSize: { w: 40, h: 10 },
  loop: 12,
  color: '16',
  params: { colors: { default: 'vga', options: ['vga', 'theme'], label: 'Colors' } },
  setup(ctx) {
    const P = bbsPalette(ctx);
    const b = ctx.buffer;
    const W = ctx.width, H = ctx.height;
    const screen = welcome(W, H - 1, P);
    const total = W * (H - 1);
    const paintDur = PAINT, CPS = total / PAINT;
    const loop = PAINT_AT + PAINT + HOLD + 1;
    const statusBar = (lt, online) => {
      const secs = online ? Math.floor(lt - 4.2) : 0;
      const clock = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
      b.fill(0, H - 1, W, 1, ' ', P[0], P[3]);
      const parts = ['PRiSMTERM 3.51', 'Alt-Z Help', 'ANSI-BBS', '2400 N81', 'FDX', online ? `Online ${clock}` : 'Offline'];
      let x = 1;
      for (const [i, p] of parts.entries()) {
        if (x + p.length >= W) break;
        x = b.text(x, H - 1, p, i === parts.length - 1 && online ? P[15] : P[0], P[3]);
        if (i < parts.length - 1 && x + 3 < W) x = b.text(x, H - 1, ' │ ', P[1], P[3]);
      }
    };
    const dialBox = (lt) => {
      const bw = Math.min(W - 4, 36), bh = 6;
      if (H < bh + 4) return;
      const bx = Math.floor((W - bw) / 2), by = Math.max(SCRIPT.length + 1, Math.floor((H - bh) / 2));
      b.fill(bx, by, bw, bh, ' ', P[15], P[1]);
      frame(b, bx, by, bw, bh, P[11], 'Dialing', P[15]);
      const rows = [['System', 'PRISM BBS'], ['Number', '555-0142'], ['Elapsed', `${Math.floor((lt - 1) * 3)}s`], ['Status', lt < 2.4 ? 'Dialing' : lt < 4.2 ? 'Ringing' : 'CONNECT']];
      rows.forEach(([k, v], i) => {
        b.text(bx + 2, by + 1 + i, `${k}:`.padEnd(9), P[7], P[1]);
        b.text(bx + 11, by + 1 + i, v.slice(0, bw - 13), i === 3 && lt >= 4.2 ? P[10] : P[14], P[1]);
      });
    };
    return (t) => {
      const lt = t % loop;
      b.fill(0, 0, W, H, ' ', P[7], P[0]);
      const blink = Math.floor(t * 3) % 2 === 0;
      if (lt < PAINT_AT) {
        let y = 0;
        for (const [at, text] of SCRIPT) {
          if (lt < at || y >= H - 1) break;
          const isCmd = text.startsWith('AT');
          const shown = isCmd ? text.slice(0, Math.floor((lt - at) * 14)) : text;
          const end = b.text(0, y, shown, isCmd ? P[15] : text.startsWith('CONNECT') ? P[10] : P[7]);
          if (isCmd && shown.length < text.length && blink) b.set(end, y, '█', P[7]);
          y++;
        }
        if (lt >= 1 && lt < PAINT_AT - 0.3) dialBox(lt);
        statusBar(lt, lt >= 4.2);
        return;
      }
      // Paint the welcome screen in transmission order, cursor at the head.
      const n = Math.min(total, Math.floor((lt - PAINT_AT) * CPS));
      for (let i = 0; i < n; i++) {
        const x = i % W, y = (i / W) | 0;
        const c = screen.get(x, y);
        b.set(x, y, c.ch, c.fg, c.bg, c.attr);
      }
      if (n < total) b.set(n % W, (n / W) | 0, '█', P[7]);
      if (lt > PAINT_AT + paintDur + HOLD) {
        b.fill(0, H - 2, W, 1, ' ', P[7], P[0]);
        b.text(0, H - 2, 'NO CARRIER', P[12]);
      }
      statusBar(lt, lt <= PAINT_AT + paintDur + HOLD);
    };
  },
};
