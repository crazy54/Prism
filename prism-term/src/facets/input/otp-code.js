// A one-time code in six boxes: digits auto-advance, Backspace steps back, a paste fills all six, then it verifies.
import { ATTR, uni, glyphs, phase, spin, stringWidth } from './_input.js';
import { sub, fitText, inv } from './_kit6.js';

const LOOP = 12, CODE = '482713';
// [time, key]: three digits, a wrong 4th that is backspaced, then a paste of the whole code; verify; a new code at 10.
const KEYS = [[0.8, '4'], [1.3, '8'], [1.8, '2'], [2.4, '9'], [3.1, 'BS'], [3.9, 'PASTE'], [10.0, 'NEW']];

function stateAt(p) {
  let d = '', pasted = -Infinity;
  for (const [t, k] of KEYS) {
    if (t > p) break;
    if (k === 'BS') d = d.slice(0, -1); else if (k === 'PASTE') { d = CODE; pasted = t; } else if (k === 'NEW') { d = ''; pasted = -Infinity; } else d += k;
  }
  const since = p - pasted, has = pasted > -Infinity, verifying = has && since < 1.6, verified = has && since >= 1.6;
  const resend = Math.max(0, Math.ceil(30 - ((p - 10 + LOOP) % LOOP)));   // a new code is sent at 10 s; the wrap is mid-countdown
  return { d, verifying, verified, resend };
}

export default {
  id: 'input-otp-code',
  since: '0.3.0',
  title: 'One-Time Code',
  category: 'Text Fields',
  description: 'A 6-digit verification code in separate boxes: digits auto-advance, Backspace steps back, a paste fills all six at once, and the code verifies while a resend timer runs.',
  tags: ['otp', 'verification code', '2fa', 'pin', 'text field', 'auto advance'],
  kind: 'tui',
  size: { w: 52, h: 8 },
  minSize: { w: 36, h: 6 },
  loop: LOOP,
  color: '16',
  order: 220,
  setup(ctx) {
    const th = ctx.theme;
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height, u = uni(ctx), g = glyphs(ctx);
      const p = phase(t, LOOP), st = stateAt(p), boxed = H >= 8 && W >= 46;
      const MASK = u ? '•••• 4821' : '**** 4821';
      fitText(b, 0, 0, W, [`Enter the 6-digit code sent to ${MASK}`, 'Enter the 6-digit code'], th.ink, undefined, ATTR.BOLD);
      // six boxes: the active one is ink-inverse; boxes lose their padding when narrow
      const active = st.verified || st.verifying ? -1 : Math.min(5, st.d.length), y0 = boxed ? 2 : 2;
      for (let i = 0; i < 6; i++) {
        const ch = st.d[i] ?? ' ', on = i === active;
        if (boxed) {
          const x = i * 7;
          b.text(x, y0, u ? '╭───╮' : '+---+', on ? th.accent : th.line);
          b.text(x, y0 + 1, u ? '│' : '|', on ? th.accent : th.line); b.text(x + 4, y0 + 1, u ? '│' : '|', on ? th.accent : th.line);
          if (on) inv(ctx, b, x + 1, y0 + 1, ` ${ch} `); else b.text(x + 1, y0 + 1, ` ${ch} `, th.ink, undefined, ATTR.BOLD);
          b.text(x, y0 + 2, u ? '╰───╯' : '+---+', on ? th.accent : th.line);
        } else {
          const x = i * 4 + (W >= 30 ? 0 : 0);
          b.text(x, y0, '[', on ? th.accent : th.line, undefined, ATTR.BOLD); b.text(x + 2, y0, ']', on ? th.accent : th.line, undefined, ATTR.BOLD);
          if (on) inv(ctx, b, x + 1, y0, ch); else b.text(x + 1, y0, ch, th.ink, undefined, ATTR.BOLD);
        }
      }
      // the resend timer drops after the destination; the status line stays
      const ty = boxed ? 5 : 3, sy = boxed ? 7 : 4;
      if (H > ty) fitText(b, 0, ty, W, [`resend in 0:${String(st.resend).padStart(2, '0')}`], sub(th));
      if (sy < H) {
        if (st.verifying) { const c = b.text(0, sy, spin(ctx, p), th.accent, undefined, ATTR.BOLD); b.text(c + 1, sy, `verifying${u ? '…' : '...'}`, th.ink); }
        else if (st.verified) { const c = b.text(0, sy, g.check, th.pos, undefined, ATTR.BOLD); b.text(c + 1, sy, 'verified', th.ink, undefined, ATTR.BOLD); }
        else fitText(b, 0, sy, W, [`${6 - st.d.length} digit${6 - st.d.length === 1 ? '' : 's'} to go ${u ? '·' : '-'} paste works too`, `${6 - st.d.length} to go`], sub(th));
      }
    };
  },
};
