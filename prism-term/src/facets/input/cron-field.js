// A cron field that explains itself: a plain-English line and the next runs update as each part is typed.
import { ATTR, uni, glyphs, phase, stringWidth } from './_input.js';
import { sub, fitText } from './_kit6.js';

const LOOP = 12, NOW = [2, 14, 7];   // Tue 14:07 (weekday, hour, minute)
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SLOTS = [['min', 'm'], ['hour', 'h'], ['day', 'd'], ['month', 'M'], ['weekday', 'w']];
// [time, key]: a typo "61" first, two backspaces, the rest of "*/15 9-17 * * 1-5", Enter, then the field clears.
const KEYS = (() => {
  const out = [];
  let t = 0.6;
  for (const c of '*/61') { out.push([t, c]); t += 0.18; }
  t += 0.7; out.push([t, 'BS']); t += 0.2; out.push([t, 'BS']); t += 0.4;
  for (const c of '15 9-17 * * 1-5') { out.push([t, c]); t += 0.17; }
  out.push([t + 0.7, 'ENTER']); out.push([10.4, 'CLEAR']);
  return out;
})();

function valueAt(p) {
  let v = '', saved = -Infinity;
  for (const [t, k] of KEYS) {
    if (t > p) break;
    if (k === 'BS') v = v.slice(0, -1); else if (k === 'ENTER') saved = t; else if (k === 'CLEAR') { v = ''; saved = -Infinity; } else v += k;
  }
  return { v, since: p - saved };
}
// one part: [ok, matcher, words]; minute and hour carry ranges
function part(i, s) {
  const lim = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 6]][i];
  if (s === '*') return [true, () => true, ''];
  let m = /^\*\/(\d+)$/.exec(s);
  if (m) { const n = +m[1]; if (n < 1 || n > lim[1]) return [false]; return [true, (x) => x % n === 0, i === 0 ? `every ${n} minutes` : `every ${n} hours`]; }
  m = /^(\d+)-(\d+)$/.exec(s);
  if (m) {
    const a = +m[1], z = +m[2];
    if (a < lim[0] || z > lim[1] || a > z) return [false];
    const words = i === 1 ? `${String(a).padStart(2, '0')}:00–${String(z).padStart(2, '0')}:59` : i === 4 ? `${LONG[a]}–${LONG[z]}` : `${a}–${z}`;
    return [true, (x) => x >= a && x <= z, words];
  }
  m = /^(\d+)$/.exec(s);
  if (m) { const n = +m[1]; if (n < lim[0] || n > lim[1]) return [false]; return [true, (x) => x === n, i === 0 ? `at minute ${n}` : `${n}`]; }
  return [false];
}
const ERR = ['minute must be 0–59', 'hour must be 0–23', 'day must be 1–31', 'month must be 1–12', 'weekday must be 0–6'];
const cache = new Map();
function explain(v) {
  if (cache.has(v)) return cache.get(v);
  const parts = v.split(' '), done = parts.length - (v.endsWith(' ') ? 0 : 1);
  const res = { parts, words: [], short: [], bad: -1, runs: [] };
  for (let i = 0; i < parts.length && i < 5; i++) {
    const s = parts[i]; if (!s) continue;
    const ok = part(i, s), complete = i < done || (parts.length === 5 && i === 4);
    if (!ok[0] && (complete || /\d\d/.test(s))) { res.bad = i; break; }
    if (ok[0] && complete && ok[2]) res.words.push(ok[2]);
  }
  if (res.bad < 0 && parts.length === 5 && parts.every((s) => s && part(parts.indexOf(s), s)[0])) {
    const m = parts.map((s, i) => part(i, s)[1]);
    for (let k = 1; k < 7 * 1440 && res.runs.length < 3; k++) {
      const tot = NOW[1] * 60 + NOW[2] + k, d = (NOW[0] + Math.floor(tot / 1440)) % 7, hh = Math.floor((tot % 1440) / 60), mm = tot % 60;
      if (m[0](mm) && m[1](hh) && m[4](d)) res.runs.push([d, `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`]);
    }
  }
  cache.set(v, res);
  return res;
}

export default {
  id: 'input-cron-field',
  since: '0.3.0',
  title: 'Cron Expression Field',
  category: 'Text Fields',
  description: 'A schedule field that explains itself: as a cron expression is typed, a plain-English line and the next run times update, and a bad value is flagged at its position.',
  tags: ['cron', 'schedule', 'text field', 'validation', 'explain', 'form'],
  kind: 'tui',
  size: { w: 60, h: 9 },
  minSize: { w: 40, h: 6 },
  loop: LOOP,
  color: '16',
  order: 200,
  setup(ctx) {
    const th = ctx.theme;
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height, u = uni(ctx), g = glyphs(ctx);
      const { v, since } = valueAt(phase(t, LOOP)), ex = explain(v), MID = u ? '·' : '-', tall = H >= 9;
      b.text(0, 0, 'Schedule (cron)', th.ink, undefined, ATTR.BOLD);
      // the field: the bad part underlined, a block cursor at the end
      const fw = Math.min(W, 40);
      b.text(0, 1, '[', th.accent, undefined, ATTR.BOLD); b.text(fw - 1, 1, ']', th.accent, undefined, ATTR.BOLD);
      if (!v) b.text(2, 1, 'e.g. */15 9-17 * * 1-5', th.mode === 'light' ? th.accent : th.muted, undefined, ATTR.ITALIC);
      let x = 2;
      ex.parts.forEach((s, i) => { x = b.text(x, 1, s, th.ink, undefined, i === ex.bad ? ATTR.UNDERLINE | ATTR.BOLD : 0); if (i < ex.parts.length - 1) x++; });
      if (since < 0) b.text(x, 1, u ? '▏' : '_', th.ink, undefined, ATTR.BOLD);
      // slot guides: the slot being typed is bold and underlined; words drop to letters when narrow
      const cur = Math.min(4, ex.parts.length - 1), long = SLOTS.map((s) => s[0]).join(` ${MID} `);
      const guide = stringWidth(long) + 2 <= W && W >= 48 ? SLOTS.map((s) => s[0]) : SLOTS.map((s) => s[1]);
      let gx = 2;
      guide.forEach((w, i) => { gx = b.text(gx, 2, w, sub(th), undefined, v && i === cur ? ATTR.UNDERLINE | ATTR.BOLD : 0); if (i < 4) gx = b.text(gx, 2, ` ${MID} `, sub(th)); });
      // the explanation, then the next runs (3 → 1 when space is short)
      const ey = tall ? 4 : 3, ny = ey + 1;
      if (ex.words.length) fitText(b, 0, ey, W, [ex.words.join(', '), ex.words.map((w) => w.replace('minutes', 'min').replace(/:00|:59/g, '').replace(/day/g, '').replace('Mon–Fri', 'Mon–Fri')).join(` ${MID} `)], th.ink);
      if (ex.runs.length && ny < H) {
        const [d0, t0] = ex.runs[0], rest = ex.runs.slice(1).filter(([d]) => d === d0).map(([, tt]) => tt);
        fitText(b, 0, ny, W, [`next: ${DAYS[d0]} ${[t0, ...rest].join(` ${MID} `)}`, `next: ${DAYS[d0]} ${t0}`], th.ink);
      }
      // the status: the bad part's rule, or saved
      const sy = tall ? 7 : H - 1;
      if (ex.bad >= 0) { const c = b.text(0, sy, g.cross, th.neg, undefined, ATTR.BOLD); fitText(b, c + 1, sy, W - c - 1, [ERR[ex.bad], 'out of range'], th.ink); }
      else if (since >= 0 && since < 3.5) { const c = b.text(0, sy, g.check, th.pos, undefined, ATTR.BOLD); b.text(c + 1, sy, 'saved', th.ink); }
      if (tall) fitText(b, 0, H - 1, W, [`Enter save ${MID} Esc clear ${MID} Tab next part`, `Enter save ${MID} Esc clear`], sub(th));
    };
  },
};
