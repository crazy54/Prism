// Shell completion: a fish-style ghost suggestion from history, then a
// zsh-style completion menu that Tab cycles through, then the command runs.
import { ATTR, glyphs, uni, phase, typed, blink, tint, mix, fit } from './_input.js';

const PS1 = '~/infra $ ';
const HISTORY = [
  ['kubectl get deploy -n checkout', 0],
  ['NAME           READY   UP-TO-DATE   AVAILABLE', 1],
  ['checkout-api   2/3     3            2', 1],
];
const SUGGEST = 'kubectl rollout status deploy/checkout-api';
const SUBS = [
  ['history', 'view rollout history'],
  ['pause', 'mark as paused'],
  ['restart', 'restart a resource'],
  ['resume', 'resume a paused resource'],
  ['status', 'show rollout status'],
  ['undo', 'undo a previous rollout'],
];
// Script (seconds into the loop).
const T = { type1: 0.3, tab1: 1.8, cycle: [2.4, 2.9, 3.4], type2: 3.8, accept: 5.2, enter: 5.8 };

export default {
  id: 'input-autocomplete',
  title: 'Shell Autocomplete',
  category: 'Command Palettes',
  description: 'A shell prompt with a fish-style ghost suggestion from history, a zsh-style completion menu that Tab cycles, then → accepts and the command runs.',
  tags: ['autocomplete', 'completion', 'shell', 'zsh', 'fish'],
  kind: 'tui',
  size: { w: 64, h: 12 },
  minSize: { w: 40, h: 8 },
  loop: 8,
  color: '16',
  order: 20,
  setup(ctx) {
    const th = ctx.theme;
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height, g = glyphs(ctx), u = uni(ctx);
      const p = phase(t, 8);
      // Line, ghost text and menu state for this moment (menu: -2 hidden, -1 open, n highlighted).
      let line = typed('kubectl ro', p, T.type1, 7), ghost = '', menu = -2, hint = '';
      if (line && SUGGEST.startsWith(line) && p < T.tab1) {
        ghost = SUGGEST.slice(line.length);
        hint = `${g.right} accept suggestion ${g.mid} tab complete`;
      }
      if (p >= T.tab1) {
        line = 'kubectl rollout ';
        menu = -1;
        T.cycle.forEach((at, i) => { if (p >= at) menu = i; });
        if (menu >= 0) line += SUBS[menu][0];
        hint = menu < 0 ? `tab cycle ${g.mid} ${SUBS.length} completions` : `tab next ${g.mid} enter accept ${g.mid} esc cancel`;
      }
      if (p >= T.type2) {
        menu = -2;
        const arg = typed('deploy/ch', p, T.type2, 9);
        line = 'kubectl rollout restart ' + arg;
        hint = '';
        if (arg.length >= 7) { ghost = 'deploy/checkout-api'.slice(arg.length); hint = `${g.right} accept completion`; }
      }
      if (p >= T.accept) { line = 'kubectl rollout restart deploy/checkout-api'; ghost = ''; hint = `enter run`; }
      const ran = p >= T.enter;

      // History above the prompt, as much as fits with the menu open.
      const room = H - (menu > -2 ? Math.min(SUBS.length, H - 3) + 2 : 3);
      const keep = Math.max(0, Math.min(HISTORY.length, room - 1));
      const hist = keep ? HISTORY.slice(-keep) : [];
      if (keep === HISTORY.length) hist[0] = [PS1 + HISTORY[0][0], 0];
      let y = 0;
      for (const [txt, out] of hist) b.text(0, y++, fit(txt, W, undefined, ctx), out ? th.muted : th.dim);
      if (keep) y++;
      const py = y;

      // The command line scrolls left when it no longer fits.
      const room2 = W - PS1.length - 1;
      const off = Math.max(0, line.length - room2);
      const lx = PS1.length - off;
      const [cmd, ...rest] = line.split(' ');
      let x = b.text(lx, py, cmd, th.pos, undefined, ATTR.BOLD);
      if (rest.length) x = b.text(x, py, ' ' + rest.join(' '), th.ink);
      if (ghost) b.text(x, py, fit(ghost, Math.max(0, W - x), undefined, ctx).trimEnd(), mix(th.bg, th.muted, 0.6));
      // Block cursor over the ghost text (inverse, so it survives NO_COLOR); a bar otherwise.
      if (!ran && blink(t, 0.9)) {
        if (ghost) b.set(x, py, undefined, undefined, undefined, ATTR.INVERSE);
        else b.set(x, py, u ? '▏' : '_', th.ink);
      }
      b.fill(0, py, PS1.length, 1, ' ');
      let px = b.text(0, py, '~/infra', th.info, undefined, ATTR.BOLD);
      b.text(px + 1, py, '$', th.pos, undefined, ATTR.BOLD);
      if (off) b.text(PS1.length - 1, py, u ? '…' : '<', th.dim);

      if (menu > -2) {
        // Menu aligned under the word being completed, as far as the width allows.
        const mw = Math.min(W, 40);
        const mx = Math.max(0, Math.min(W - mw, PS1.length + 'kubectl rollout '.length - 1));
        const rows = Math.min(SUBS.length, H - py - 2);
        const first = Math.max(0, Math.min(SUBS.length - rows, menu - rows + 1));
        for (let r = 0; r < rows; r++) {
          const i = first + r, [name, desc] = SUBS[i];
          const on = i === menu;
          const bg = on ? th.accent : tint(ctx, th.panel2, 0.9);
          b.fill(mx, py + 1 + r, mw, 1, ' ', undefined, bg);
          b.text(mx + 1, py + 1 + r, name.padEnd(9), on ? th.bg : th.ink, bg, ATTR.BOLD);
          b.text(mx + 10, py + 1 + r, fit(`-- ${desc}`, mw - 11, undefined, ctx), on ? th.bg : th.dim, bg);
        }
      } else if (ran) {
        b.text(0, py + 1, fit('deployment.apps/checkout-api restarted', W, undefined, ctx), th.ink);
        if (py + 2 < H) {
          px = b.text(0, py + 2, '~/infra', th.info, undefined, ATTR.BOLD);
          px = b.text(px + 1, py + 2, '$', th.pos, undefined, ATTR.BOLD) + 1;
          if (blink(t, 0.9)) b.set(px, py + 2, u ? '▏' : '_', th.ink);
        }
      }
      if (hint && !ran) b.text(0, H - 1, fit(hint, W, undefined, ctx), th.dim);
    };
  },
};
