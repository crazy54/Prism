// A screen agent working a UI: a wireframe settings page with a crosshair gliding to each target, and the action log
// beside it (screenshot, click at pixel coordinates, type, scroll, save).
import { ATTR, uni, phase, ease } from './_ai.js';
import { sub, inv, mark, runs } from './_kit7.js';

const LOOP = 14, R0 = 12.8, R1 = 13.5;
const TABS = [['General', 2], ['Deploys', 11], ['Team', 20], ['Billing', 26]];
const GENERAL = [['Name', 'checkout-api'], ['Owner', 'payments-team'], ['Language', 'Go']];
const DEPLOYS = [['Environment', null], ['Branch', 'main'], ['Auto-deploy', '[x] on merge'], ['Approvals', '1 reviewer'], ['Notify', '#deploys'],
  ['Timeout', '30 min'], ['Rollback', '[x] on failed checks']];
const SAVE_ROW = 12, PAGE_ROWS = 15, CLICK = 0.25;
// [time, action]; the crosshair glides for 0.8 s before each click
const SHOT = 0.6, TAB = 1.8, FIELD = 3.6, TYPE = 4.4, SCROLL = 6.2, SAVE = 8.0, SAVED = 8.6;
const px = (col, row) => `${col * 8 + 4}, ${row * 16 + 8}`;

export default {
  id: 'ai-screen-agent',
  since: '0.3.0',
  title: 'Screen Agent',
  category: 'Tool Calls',
  description: 'A screen agent working a UI: a crosshair glides over a wireframe settings page to each target while a click and type trace logs every action.',
  tags: ['screen agent', 'ui actions', 'click trace', 'automation', 'screenshot', 'agent'],
  kind: 'tui',
  size: { w: 72, h: 12 },
  minSize: { w: 48, h: 8 },
  loop: LOOP,
  color: '16',
  order: 250,
  setup(ctx) {
    const th = ctx.theme;
    const draw = (b, at) => {
      const kb = at >= R0 && at < R1 ? (at - R0) / (R1 - R0) : -1;
      if (kb >= 0.9) return draw(b, 0);
      const p = kb >= 0 ? R0 : at, pg = kb >= 0.35 ? 0 : p;
      const W = b.width, H = b.height, u = uni(ctx), MID = u ? '·' : '-';
      const pw = Math.max(26, Math.min(40, W - 22)), lx = pw + 2, lw = W - lx, fx = 15, fw = pw - fx - 2;
      const offMax = Math.max(0, PAGE_ROWS - H), off = Math.round(offMax * ease(pg, SCROLL, SCROLL + 0.6));
      // the beat: the crosshair glides home, then the page goes back to its first screen and the log clears
      const deploys = pg >= TAB, focused = pg >= FIELD, typed = 'staging'.slice(0, Math.max(0, Math.floor((pg - TYPE) * 7)));
      // the page, in page rows; screen row = page row - scroll offset
      const put = (row, fn) => { const y = row - off; if (y >= 0 && y < H) fn(y); };
      const V = u ? '│' : '|', Hz = u ? '─' : '-';
      put(0, (y) => { b.text(0, y, (u ? '┌' : '+') + Hz.repeat(pw - 2) + (u ? '┐' : '+'), th.line); b.text(2, y, ' Settings ', th.ink, undefined, ATTR.BOLD); });
      for (let r = 1; r < PAGE_ROWS - 1; r++) put(r, (y) => { b.set(0, y, V, th.line); b.set(pw - 1, y, V, th.line); });
      put(PAGE_ROWS - 1, (y) => b.text(0, y, (u ? '└' : '+') + Hz.repeat(pw - 2) + (u ? '┘' : '+'), th.line));
      put(1, (y) => TABS.forEach(([name, x], i) => {
        if (x + name.length > pw - 2) return;
        const on = deploys ? i === 1 : i === 0, flash = i === 1 && p >= TAB && p < TAB + CLICK;
        if (flash) inv(ctx, b, x, y, name); else b.text(x, y, name, on ? th.ink : sub(th), undefined, on ? ATTR.BOLD | ATTR.UNDERLINE : 0);
      }));
      put(2, (y) => b.text(1, y, Hz.repeat(pw - 2), th.line));
      const form = deploys ? DEPLOYS : GENERAL;
      form.forEach(([label, value], i) => put(3 + i, (y) => {
        b.text(2, y, label, th.ink);
        if (value && value.startsWith('[')) { runs(ctx, b, fx, y, pw - fx - 2, [[value, th.ink]]); return; }
        const isEnv = deploys && i === 0, text = isEnv ? (p >= TYPE ? typed : 'production') : value;
        b.text(fx, y, '[', focused && isEnv ? th.accent : th.line, undefined, ATTR.BOLD); b.text(fx + fw - 1, y, ']', focused && isEnv ? th.accent : th.line, undefined, ATTR.BOLD);
        if (isEnv && focused && p < TYPE) inv(ctx, b, fx + 2, y, text);
        else runs(ctx, b, fx + 2, y, fw - 4, [[text, th.ink]]);
        if (isEnv && p >= TYPE && p < SCROLL) b.set(fx + 2 + text.length, y, u ? '▌' : '_', th.ink, undefined, ATTR.BOLD);
      }));
      const sl = ' Save changes ', sx = pw - 2 - sl.length - 1;
      if (deploys) put(SAVE_ROW, (y) => (p >= SAVE && p < SAVE + CLICK ? inv(ctx, b, sx, y, sl) : b.text(sx, y, `[${sl.slice(1, -1)}]`, th.ink, undefined, ATTR.BOLD)));
      // the crosshair: a glyph over blank or border cells, the cell itself inverted when it holds a letter
      const targets = [[pw / 2, H / 2, 0], [TABS[1][1] + 3, 1, TAB], [fx + 5, 3, FIELD], [fx + 5, 3, SCROLL], [sx + 7, SAVE_ROW - offMax, SAVE]];
      let [cx, cy] = targets[0];
      for (let i = 1; i < targets.length; i++) {
        const [tx, ty, at] = targets[i], k = ease(p, at - 0.8, at);
        if (p >= at - 0.8) { cx += (tx - cx) * k; cy += (ty - (i === 4 ? 0 : off) - cy) * k; }
        if (i === 3 && p >= SCROLL) cy = 3 - off;
      }
      if (kb >= 0) { const e = ease(Math.min(1, kb / 0.35), 0, 1); cx += (targets[0][0] - cx) * e; cy += (targets[0][1] - cy) * e; }
      const X = Math.round(cx), Y = Math.round(cy), under = b.get(X, Y);
      if (under && /[A-Za-z0-9]/.test(under.ch)) b.set(X, Y, undefined, th.ink, undefined, ATTR.INVERSE | ATTR.BOLD);
      else if (under) b.set(X, Y, u ? '✛' : '+', th.accent, undefined, ATTR.BOLD);
      // the action log; coordinates go first when narrow, then older lines
      const coords = lw >= 30;
      const log = [[SHOT, 'screenshot', '', '']];
      if (p >= TAB) log.push([TAB, 'click', px(TABS[1][1] + 3, 1), 'Deploys']);
      if (p >= FIELD) log.push([FIELD, 'click', px(fx + 5, 3), 'Environment']);
      if (p >= TYPE) log.push([TYPE, 'type', '', '"staging"']);
      if (p >= SCROLL) log.push([SCROLL, 'scroll', '', `${u ? '↓' : 'down'} ${offMax}`]);
      if (p >= SAVE) log.push([SAVE, 'click', px(sx + 7, SAVE_ROW - offMax), 'Save']);
      const shown = p >= SHOT ? log : [], room = H - 1 - (p >= SAVED ? 1 : 0);
      b.text(lx, 0, 'actions', sub(th), undefined, ATTR.BOLD);
      const gone = kb >= 0.35 ? Math.ceil(Math.min(1, (kb - 0.35) / 0.5) * (room + 1)) : 0;
      shown.slice(Math.max(0, shown.length - room)).forEach(([at, verb, xy, what], i) => {
        if (i < gone) return;
        const y = 1 + i, cur = p - at < 0.8, n = log.findIndex((e) => e[0] === at) + 1;
        const x = b.text(lx, y, String(n), sub(th));
        runs(ctx, b, x + 1, y, lw - (x - lx) - 1, [[verb, th.ink, cur ? ATTR.BOLD : 0], [coords && xy ? `(${xy})` : '', th.ink], [what ? ` ${what}` : '', th.ink, 0, true]]);
      });
      if (p >= SAVED && gone === 0) { const y = Math.min(H - 1, 1 + Math.min(shown.length, room)), x = mark(ctx, b, lx, y, '✔', '*', th.pos); runs(ctx, b, x + 1, y, W - x - 1, [['saved', th.ink, ATTR.BOLD], [` ${MID} env = staging`, th.ink, 0, true]]); }
    };
    return (t) => { const p = phase(t, LOOP); draw(ctx.buffer, p >= R1 ? 0 : p); };
  },
};
