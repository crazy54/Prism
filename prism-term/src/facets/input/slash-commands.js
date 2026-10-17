// A chat composer with a "/" command menu: the list filters as you type,
// Tab completes, an argument hint appears, Enter sends a pending-approval card.
import { ATTR, glyphs, uni, phase, typed, blink, tint, mix, fit, panel } from './_input.js';

const CMDS = [
  ['/status', 'service health and open incidents'],
  ['/logs', 'tail logs for a service'],
  ['/restart', 'restart a deployment'],
  ['/rollback', 'roll back to a previous revision'],
  ['/runbook', 'open the runbook for an alert'],
  ['/page', 'page the on-call engineer'],
];
const ARG_HINT = '<service> [revision]';
const T = { slash: 0.5, filter: 0.9, tab: 2.0, arg: 2.5, send: 4.6 };

export default {
  id: 'input-slash-commands',
  title: 'Slash Command Menu',
  category: 'Command Palettes',
  description: 'A chat composer where typing "/" opens a command menu that filters as you type; Tab completes, an argument hint appears, and Enter posts it for approval.',
  tags: ['slash command', 'chat', 'composer', 'menu', 'chatops'],
  kind: 'tui',
  size: { w: 64, h: 14 },
  minSize: { w: 40, h: 9 },
  loop: 8,
  color: '256',
  order: 30,
  setup(ctx) {
    const th = ctx.theme;
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height, g = glyphs(ctx), u = uni(ctx);
      const p = phase(t, 8);
      // Transcript above the composer.
      let ty = 0;
      const say = (who, c, msg) => {
        if (ty >= H - 4) return;
        const x = b.text(0, ty, who, c, undefined, ATTR.BOLD);
        b.text(x + 1, ty++, fit(msg, Math.max(0, W - x - 1), undefined, ctx), th.muted);
      };
      say('mainbrain', th.accent, 'checkout-api p99 is 2.4s since v2.14.1 (11 min).');
      say('mainbrain', th.accent, 'Likely cause: DB pool 20/20 in use. Suggest rollback.');

      let input = '';
      if (p >= T.slash) input = '/';
      if (p >= T.filter) input = '/' + typed('ro', p, T.filter, 3);
      if (p >= T.tab) input = '/rollback ';
      if (p >= T.arg) input = '/rollback ' + typed('checkout-api', p, T.arg, 9);
      const sent = p >= T.send;

      if (sent) {
        // The sent command renders as a card awaiting a human.
        const cy = ty + (H - 3 - ty >= 5 ? 1 : 0);
        if (cy + 4 <= H - 3) {
          const cw = Math.min(W, 46);
          const inner = panel(ctx, b, 0, cy, cw, 4, { title: 'you', color: th.line });
          inner.text(1, 0, fit('/rollback checkout-api', inner.width - 2, undefined, ctx), th.ink, undefined, ATTR.BOLD);
          const pill = ` ${g.ring} awaiting approval `;
          const blinkOn = phase(p - T.send, 1.2) < 0.9;
          inner.text(1, 1, pill, blinkOn ? th.bg : th.warn, blinkOn ? th.warn : undefined, ATTR.BOLD);
          // mainbrain answers with the plan; nothing runs until a human approves.
          if (p > T.send + 0.9 && cy + 4 < H - 3) {
            const x0 = b.text(0, cy + 4, 'mainbrain', th.accent, undefined, ATTR.BOLD);
            b.text(x0 + 1, cy + 4, fit(`Plan: v2.14.1 ${g.right} v2.14.0 on 3 pods. Approve in Fixes.`, Math.max(0, W - x0 - 1), undefined, ctx), th.muted);
          }
        }
        input = '';
      }

      // Composer.
      const ch = 3, cy = H - ch;
      const inner = panel(ctx, b, 0, cy, W, ch, { color: sent ? th.line : th.accent, footer: sent ? '' : 'enter send', footerAlign: 'right' });
      const iw = inner.width;
      if (!input) inner.text(1, 0, fit('Message mainbrain, or / for commands', iw - 2, undefined, ctx), mix(th.bg, th.muted, 0.6), undefined, ATTR.ITALIC);
      const [cmd, ...rest] = input.split(' ');
      let x = inner.text(1, 0, cmd, th.accent, undefined, ATTR.BOLD);
      if (rest.length) x = inner.text(x, 0, ' ' + rest.join(' '), th.ink);
      // Argument hint after the completed command, until the argument is typed.
      if (input === '/rollback ') inner.text(x, 0, ARG_HINT, mix(th.bg, th.muted, 0.6));
      if (blink(t, 0.9)) inner.set(input ? x : 1, 0, undefined, undefined, undefined, ATTR.INVERSE);

      // Command menu, opening upwards from the composer.
      if (input.startsWith('/') && !input.includes(' ')) {
        const q = input.slice(1);
        const hits = CMDS.filter(([c]) => c.slice(1).startsWith(q));
        const rows = Math.min(hits.length, cy - 1);
        const mw = Math.min(W, 46);
        hits.slice(0, rows).forEach(([c, d], i) => {
          const y = cy - rows + i;
          const on = i === 0;
          const bg = on ? tint(ctx, th.accent, 0.25) : th.panel2;
          b.fill(0, y, mw, 1, ' ', undefined, bg);
          if (on) b.set(0, y, u ? '▌' : '>', th.accent, bg, ATTR.BOLD);
          b.text(2, y, c.slice(0, q.length + 1), th.accent, bg, ATTR.BOLD);
          b.text(2 + q.length + 1, y, c.slice(q.length + 1), on ? th.ink : th.muted, bg, on ? ATTR.BOLD : 0);
          const dx = 2 + 10;
          b.text(dx, y, fit(d, Math.max(0, mw - dx - 1), undefined, ctx), on ? th.muted : th.dim, bg);
        });
        if (rows && cy - rows - 1 >= ty) b.text(0, cy - rows - 1, fit(`tab complete ${g.mid} ${g.up}/${g.down} choose`, mw, undefined, ctx), th.dim);
      }
    };
  },
};
