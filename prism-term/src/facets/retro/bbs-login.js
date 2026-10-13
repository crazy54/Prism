// A BBS login screen, 1993: block-letter board logo, caller stats in a double
// frame, and a login that types itself — handle, password, credential check,
// welcome — then hangs up and does it again. VGA colors (or --set colors=theme).
import { textMask, bbsPalette } from './_kit.js';
import { blockLogo, frame } from './_bbs.js';

const HANDLE = 'LIGHTMAN';
const SPIN = '|/-\\';

export default {
  title: 'BBS Login',
  gallery: 'retro',
  category: 'BBS & ANSI Art',
  kind: 'art',
  tags: ['bbs', 'ansi', 'login', 'dial-up', '1993', 'sysop'],
  order: 10,
  description: 'A 1993 BBS login: block-letter board logo, caller stats in a double frame and a login that types itself.',
  size: { w: 80, h: 24 },
  minSize: { w: 40, h: 12 },
  loop: 12,
  color: '16',
  params: { colors: { default: 'vga', options: ['vga', 'theme'], label: 'Colors' } },
  setup(ctx) {
    const P = bbsPalette(ctx);
    const b = ctx.buffer;
    const W = ctx.width, H = ctx.height;
    const logo = textMask('PRISM', { font: 'bold' });
    const sx = logo.w * 2 + 2 <= W ? 2 : 1;
    const showLogo = H >= 18 && logo.w * sx + 2 <= W;
    const ramp = (v) => (v < 0.2 ? P[15] : v < 0.45 ? P[11] : v < 0.75 ? P[3] : P[9]);
    return (t) => {
      const lt = t % 12;
      b.fill(0, 0, W, H, ' ', P[7], P[0]);
      // Status bar.
      const mins = 41 + Math.floor(t / 60);
      const clock = `${String((23 + Math.floor(mins / 60)) % 24).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
      b.fill(0, 0, W, 1, ' ', P[15], P[1]);
      b.text(1, 0, (W >= 56 ? ' PRISM BBS · Node 3 of 8 · 2400 bps · ANSI ' : ' PRISM BBS · Node 3 · 2400 bps ').slice(0, W - 2), P[15], P[1]);
      if (W > 56) b.text(W - 7, 0, clock, P[14], P[1]);
      let y = 2;
      if (showLogo) {
        const lx = Math.floor((W - logo.w * sx) / 2);
        blockLogo(b, lx, y, logo, { sx, ramp, shadow: P[8] });
        y += 5;
        const tag = 'THE TERMINAL ART UNDERGROUND · EST. 1991';
        if (tag.length < W) b.text(Math.floor((W - tag.length) / 2), y, tag, P[6]);
        y += 2;
      } else {
        b.text(2, y, 'P R I S M   B B S', P[11]);
        y += 2;
      }
      // Caller stats.
      const fw = Math.min(W - 4, 46), fx = Math.floor((W - fw) / 2);
      const stats = [['Last caller', 'CRASH OVERRIDE'], ['Calls today', '42'], ['Your node', '3 of 8'], ['Software', 'PRISM/BBS 0.42']];
      const rows = H - y >= 13 ? stats : stats.slice(0, Math.max(0, H - y - 8));
      if (rows.length) {
        frame(b, fx, y, fw, rows.length + 2, P[1], 'SYSTEM', P[14]);
        rows.forEach(([k, v], i) => {
          const dots = '.'.repeat(Math.max(2, 16 - k.length));
          b.text(fx + 2, y + 1 + i, `${k} ${dots} `, P[7]);
          b.text(fx + 2 + k.length + dots.length + 2, y + 1 + i, v.slice(0, fw - k.length - dots.length - 6), P[15]);
        });
        y += rows.length + 3;
      }
      // The login, scripted on a 12-second loop.
      const px = Math.max(1, fx);
      const blink = Math.floor(t * 2.5) % 2 === 0;
      const typed = (from, text, cps) => text.slice(0, Math.max(0, Math.min(text.length, Math.floor((lt - from) * cps))));
      const line = (text, color, cursor) => {
        if (y >= H - 1) return;
        const end = b.text(px, y, text, color);
        if (cursor && blink) b.set(end, y, '█', P[7]);
        y++;
      };
      const handle = lt >= 1.4 ? typed(1.4, HANDLE, 6) : '';
      const ask = W - px >= 46 ? 'Enter your handle (NEW to apply): ' : 'Handle: ';
      line(ask, P[11], false);
      if (y - 1 < H - 1) {
        const end = b.text(px + ask.length, y - 1, handle, P[15]);
        if (lt < 3.3 && blink) b.set(end, y - 1, '█', P[7]);
      }
      if (lt >= 3.3) {
        const stars = '*'.repeat(typed(3.8, 'xxxxxxxx', 7).length);
        line(`Password: ${stars}`, P[11], lt < 5.2);
      }
      if (lt >= 5.2 && lt < 6.8) line(`Checking credentials... ${SPIN[Math.floor(t * 8) % 4]}`, P[7], false);
      if (lt >= 6.8) {
        line(`Welcome back, ${HANDLE}!`, P[10], false);
        if (lt >= 7.4) line(W - px > 62 ? 'You have 3 new messages and 12 new files since your last call.' : '3 new messages, 12 new files.', P[7], lt > 10.8);
      }
      // Footer.
      if (H > 12) {
        const foot = '[ESC] hang up   [?] help   SysOp is AVAILABLE';
        b.text(Math.max(0, Math.floor((W - foot.length) / 2)), H - 1, foot.slice(0, W), P[8]);
      }
    };
  },
};
