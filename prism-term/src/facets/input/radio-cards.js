// Radio cards: a plan picker where each option is a card with a price and features; the pick gets a heavy border.
import { ATTR, uni, glyphs, phase, stepAt, panel, stringWidth } from './_input.js';

// [name, $/month, features as [long, short, included]]
const PLANS = [
  ['Starter', 9, [['3 seats', '3 seats', true], ['email support', 'email', true], ['SSO', 'SSO', false]]],
  ['Team', 29, [['10 seats', '10 seats', true], ['chat support', 'chat', true], ['SSO', 'SSO', true]]],
  ['Scale', 99, [['unlimited seats', 'unlimited', true], ['24/7 phone', 'phone', true], ['SSO + audit log', 'SSO+audit', true]]],
];
const RECOMMENDED = 1, LOOP = 10;
// [time, key]. Focus walks the cards, Space picks Team, Continue enables and takes focus; Esc clears it and focus goes home.
const SCRIPT = [[1.2, 'right'], [2.0, 'right'], [2.8, 'left'], [3.6, 'pick'], [4.6, 'tab'], [7.2, 'backtab'], [7.9, 'esc'], [8.6, 'left']];

function stateAt(p) {
  let focus = 0, picked = -1, onBtn = false, at = -Infinity;
  const n = stepAt(p, SCRIPT.map((s) => s[0]));
  for (let k = 0; k <= n; k++) {
    const key = SCRIPT[k][1];
    if (key === 'right') focus = Math.min(PLANS.length - 1, focus + 1);
    else if (key === 'left') focus = Math.max(0, focus - 1);
    else if (key === 'pick') { picked = focus; at = SCRIPT[k][0]; }
    else if (key === 'tab' && picked >= 0) onBtn = true;
    else if (key === 'backtab') onBtn = false;
    else if (key === 'esc') picked = -1;
  }
  return { focus, picked, onBtn, since: p - at };
}

export default {
  id: 'input-radio-cards',
  since: '0.3.0',
  title: 'Plan Picker Cards',
  category: 'Selects & Lists',
  description: 'Radio cards for choosing a support plan, each with a price and its features: the chosen card gets a heavy border and a filled radio, and Continue enables once a plan is picked.',
  tags: ['radio cards', 'plan picker', 'pricing', 'select', 'cards', 'radio'],
  kind: 'tui',
  size: { w: 72, h: 11 },
  minSize: { w: 44, h: 9 },
  loop: LOOP,
  color: '16',
  order: 240,
  setup(ctx) {
    const th = ctx.theme;
    const sub = th.mode === 'light' ? th.ink : th.muted;
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height, u = uni(ctx), g = glyphs(ctx);
      const st = stateAt(phase(t, LOOP)), gap = W >= 60 ? 2 : 1, cw = Math.floor((W - 2 * gap) / 3), ch = H - 2;
      const ON = u ? '(●)' : '(*)', OFF = '( )', OK = u ? '✓' : '+', NO = u ? '–' : '-';
      PLANS.forEach(([name, price, feats], i) => {
        const x = i * (cw + gap), chosen = st.picked === i, focused = !st.onBtn && st.focus === i;
        const inner = panel(ctx, b, x, 0, cw, ch, {
          style: chosen ? 'heavy' : 'round', color: focused ? th.accent : chosen ? th.ink : th.line,
          title: i === RECOMMENDED && cw >= 20 ? `${g.star} recommended` : undefined, titleColor: th.ink,
        });
        if (i === RECOMMENDED && cw >= 20) b.text(x + 2, 0, g.star, th.accent, undefined, ATTR.BOLD);
        let y = 0;
        if (focused) inner.text(0, y, g.caret, th.accent, undefined, ATTR.BOLD);
        inner.text(1, y, chosen ? ON : OFF, chosen ? th.accent : sub, undefined, ATTR.BOLD);
        const nx = inner.text(5, y++, name, th.ink, undefined, ATTR.BOLD | (focused ? ATTR.UNDERLINE : 0));
        if (i === RECOMMENDED && cw < 20 && nx + 2 <= inner.width) inner.text(nx + 1, y - 1, g.star, th.accent, undefined, ATTR.BOLD);
        const money = [`$${price}/mo`, `$${price}`].find((m) => stringWidth(m) + 1 <= inner.width) ?? `$${price}`;
        inner.text(1, y++, money, th.ink, undefined, ATTR.BOLD);
        // feature lines drop first (3 → 1), the same count on every card; long forms only where all fit
        const long = PLANS.every(([, , fs]) => fs.every(([f]) => stringWidth(f) + 3 <= inner.width));
        const room = inner.height - y - (inner.height - y > 3 ? 1 : 0), count = room >= 3 && long ? 3 : room >= 1 ? 1 : 0;
        if (inner.height - y > 3) y++;
        feats.slice(0, count).forEach(([f, sf, has]) => {
          const txt = long ? f : sf;
          if (stringWidth(txt) + 3 > inner.width) return;
          inner.text(1, y, has ? OK : NO, has ? th.pos : th.muted, undefined, ATTR.BOLD);
          inner.text(3, y++, txt, th.ink);
        });
      });
      // Continue enables once a card is picked
      const enabled = st.picked >= 0, label = `[ Continue ${u ? '→' : '->'} ]`, by = H - 1;
      if (st.onBtn) b.text(0, by, g.caret, th.accent, undefined, ATTR.BOLD);
      b.text(2, by, label, enabled ? th.ink : sub, undefined, st.onBtn ? ATTR.INVERSE | ATTR.BOLD : enabled ? ATTR.BOLD : 0);
      const note = enabled ? `${PLANS[st.picked][0]} ${u ? '·' : '-'} $${PLANS[st.picked][1]} per month` : 'pick a plan to continue';
      if (2 + stringWidth(label) + 2 + stringWidth(note) <= W) b.text(2 + stringWidth(label) + 2, by, note, sub);
    };
  },
};
