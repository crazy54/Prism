// A clack-style prompt flow: text, select, confirm and multiselect prompts
// chained down one gutter, each collapsing to its answer, then a spinner.
import { ATTR, glyphs, uni, phase, typed, blink, spin, clip, stringWidth } from './_input.js';

const T = { tag: 0.3, tagDone: 1.5, envDown: 2.1, envDone: 2.7, migNo: 3.4, migDone: 3.9, n1: 4.5, n2: 4.9, nDone: 5.5, deployed: 7.6 };
const ENVS = ['staging', 'production', 'canary'];
const NOTIFY = ['#checkout-oncall', '#releases', 'release-notes email'];

export default {
  id: 'input-prompt-flow',
  title: 'Prompt Flow',
  category: 'Dialogs & Prompts',
  description: 'A clack-style CLI wizard: text, select, yes/no and multiselect prompts chain down one gutter, each collapsing to its answer before a deploy spinner.',
  tags: ['prompts', 'clack', 'cli wizard', 'confirm', 'yes no'],
  kind: 'tui',
  size: { w: 56, h: 16 },
  minSize: { w: 36, h: 8 },
  loop: 10,
  color: '16',
  order: 20,
  setup(ctx) {
    const th = ctx.theme;
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height, g = glyphs(ctx), u = uni(ctx);
      const p = phase(t, 10);
      const G = u
        ? { top: '┌', bar: '│', end: '└', done: '◇', act: '◆', on: '●', off: '○', mOn: '◼', mOff: '◻' }
        : { top: '+', bar: '|', end: '+', done: 'o', act: '*', on: '(*)', off: '( )', mOn: '[x]', mOff: '[ ]' };
      const lines = [];
      const L = (...segs) => lines.push(segs);
      const gut = (c = th.dim) => [`${G.bar}  `, c];
      const done = (q, a) => { L([`${G.done}  `, th.pos], [q, th.ink]); L(gut(), [a, th.dim]); L(gut()); };
      const active = (q) => L([`${G.act}  `, th.accent, ATTR.BOLD], [q, th.ink, ATTR.BOLD]);

      L([`${G.top}  `, th.dim], [' deploy ', th.bg, ATTR.BOLD, th.accent], ['  checkout-api', th.muted]);
      L(gut());
      // 1. Release tag (text).
      if (p < T.tagDone) {
        active('Release tag');
        const v = typed('v2.14.1', p, T.tag, 8);
        const caret = blink(t, 0.9) ? (u ? '▏' : '_') : ' ';
        L(gut(th.accent), v ? [v, th.ink] : ['v1.2.3', th.dim, ATTR.ITALIC], [caret, th.ink]);
        L([G.end, th.accent]);
      } else done('Release tag', 'v2.14.1');
      // 2. Environment (select).
      if (p >= T.tagDone && p < T.envDone) {
        active('Environment');
        const cur = p >= T.envDown ? 1 : 0;
        ENVS.forEach((e, i) => L(gut(th.accent), [i === cur ? G.on : G.off, i === cur ? th.pos : th.dim], [` ${e}`, i === cur ? th.ink : th.muted], i === 1 ? ['  (12 hosts)', th.dim] : ['']));
        L([G.end, th.accent]);
      } else if (p >= T.envDone) done('Environment', 'production');
      // 3. Migrations (confirm).
      if (p >= T.envDone && p < T.migDone) {
        active('Run database migrations?');
        const yes = p < T.migNo;
        L(gut(th.accent), [yes ? G.on : G.off, yes ? th.pos : th.dim], [' Yes', yes ? th.ink : th.muted], [' / ', th.dim], [yes ? G.off : G.on, yes ? th.dim : th.pos], [' No', yes ? th.muted : th.ink]);
        L([G.end, th.accent]);
      } else if (p >= T.migDone) done('Run database migrations?', 'No');
      // 4. Notify (multiselect).
      if (p >= T.migDone && p < T.nDone) {
        active('Notify');
        const sel = [p >= T.n1, false, p >= T.n2];
        const cur = p >= T.n2 - 0.12 ? 2 : p >= T.n1 + 0.15 ? 1 : 0;
        NOTIFY.forEach((n, i) => L(gut(th.accent), [i === cur ? g.pointer : ' ', th.accent], [' '], [sel[i] ? G.mOn : G.mOff, sel[i] ? th.pos : th.dim], [` ${n}`, i === cur ? th.ink : th.muted]));
        L([G.end, th.accent], [`  space select ${g.mid} enter confirm`, th.dim]);
      } else if (p >= T.nDone) done('Notify', '#checkout-oncall, release-notes email');
      // 5. Deploy.
      if (p >= T.nDone && p < T.deployed) {
        const k = Math.min(12, Math.floor((p - T.nDone) / (T.deployed - T.nDone) * 12));
        L([`${spin(ctx, t)}  `, th.warn], [`Deploying v2.14.1 to production ${g.mid} ${k}/12 hosts`, th.ink]);
      } else if (p >= T.deployed) {
        L([`${G.done}  `, th.pos], ['Deployed v2.14.1 to 12 hosts in 41s', th.ink]);
        L(gut());
        L([`${G.end}  `, th.dim], ['Done. ', th.ink, ATTR.BOLD], ['https://deploy.example/r/8841', th.info, ATTR.UNDERLINE]);
      }

      // The flow scrolls like a real terminal: show the newest lines.
      const first = Math.max(0, lines.length - H);
      for (let r = 0; r < Math.min(H, lines.length); r++) {
        let x = 0;
        for (const [text, fg, attr, bg] of lines[first + r]) {
          if (!text) continue;
          const room = Math.max(0, W - x);
          x = b.text(x, r, stringWidth(text) <= room ? text : clip(ctx, text, room), fg, bg, attr);
        }
      }
    };
  },
};
