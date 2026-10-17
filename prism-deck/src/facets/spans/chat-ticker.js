// span-chat-ticker — chat, one message at a time, across a row of keys. The first key is the
// speaker (an avatar disc in their own hue, their initial, their name); the message flows word by
// word through the other keys — laid out per key, so no word is ever cut by a bezel. Each new
// message cascades in key by key (0.7 s), then holds still for the rest of its 4 s turn: ~8 frames
// per key per message, nothing in between. A message that mentions you lights the speaker key.
// Messages are fictional (a runtime can pass its own through the `messages` param, "name: text | …").

import { surface, circle, n } from '../../scene/index.js';
import { clamp, outExpo } from '../../scene/easing.js';
import { measureText } from '../../scene/text.js';
import { materials, inCell, middleRow, rowCells } from './_d3-span.js';
import { text, strHash } from '../apps/_d7-kit.js';

const TURN = 4, IN = 0.7;
const CHAT = [
  ['nova_k', 'that transition was so clean'],
  ['pixelmoth', 'first time here and loving the vibes'],
  ['dr_lumen', 'can you show the settings again?'],
  ['quietfox', 'hydrate check, everyone'],
  ['atlas.v', 'GG that was close'],
  ['mira_codes', '@you what keyboard is that?'],
  ['ember77', 'the new overlay looks great'],
  ['tess', 'just joined, hi everyone'],
  ['bytewren', 'the cat cameo was perfect'],
  ['solstice', 'can we get a replay of that?'],
  ['kitekid', 'been here since the start, keep it up'],
  ['owlbert', '@you how long have you been live?'],
];

/** Flow words into per-key lines: slots[k] = [line, line?]. */
function flow(words, keys, lines, room, opts) {
  const slots = Array.from({ length: keys }, () => []);
  let k = 0, cur = '';
  const fits = (s) => measureText(s, opts) <= room;
  for (let wi = 0; wi < words.length && k < keys; wi++) {
    const w = words[wi];
    const next = cur ? `${cur} ${w}` : w;
    if (fits(next)) { cur = next; continue; }
    if (cur) { slots[k].push(cur); cur = ''; if (slots[k].length >= lines) k++; }
    if (k >= keys) break;
    cur = w;                                   // a word wider than a slot is fitted when drawn
  }
  if (cur && k < keys) slots[k].push(cur);
  return slots;
}

export default {
  id: 'span-chat-ticker',
  title: 'Chat Ticker',
  category: 'Text & Marquee',
  description: 'Chat across a row of keys: the speaker on the first key, the message flowing word by word through the rest — never cut by a bezel. Mentions light up.',
  tags: ['chat', 'ticker', 'messages', 'stream', 'creator', 'community', 'marquee', 'span'],
  surface: 'span',
  span: { cols: 'all', rows: 1 },
  fps: 10,
  loop: TURN * CHAT.length,
  params: {
    messages: { type: 'text', default: '', maxLength: 48, label: 'Messages (name: text | …; blank = demo chat)' },
    you: { type: 'text', default: '@you', maxLength: 16, label: 'Your handle (highlights mentions)' },
  },
  order: 25,
  render(ctx) {
    const k = surface(ctx);
    const { grid, theme: T } = ctx;
    const cells = rowCells(grid, middleRow(grid));
    const custom = String(ctx.params.messages || '').split('|').map((s) => s.split(':')).filter((p) => p.length > 1 && p[1].trim()).map(([a, ...b]) => [a.trim(), b.join(':').trim()]);
    const list = custom.length ? custom : CHAT;
    const turn = ctx.reduced ? 5 : Math.floor(ctx.t / TURN);
    const into = ctx.reduced ? 9 : ctx.t - Math.floor(ctx.t / TURN) * TURN;
    const [name, msg] = list[((turn % list.length) + list.length) % list.length];
    const mention = ctx.params.you && msg.toLowerCase().includes(String(ctx.params.you).toLowerCase());
    const hue = (strHash(name) % 360);
    materials(k, { toneOf: (c) => (c === cells[0] && mention ? 'active' : 'idle') });
    const u = Math.min(grid.key.w, grid.key.h) / 72;
    const base = (Math.min(grid.key.w, grid.key.h) >= 110 ? 12.5 : 11) * u;
    const room = grid.key.w - 8 * u * 1.6;
    const words = msg.split(/\s+/).filter(Boolean);
    // the biggest layout that places every word: 2 lines per key, then 3, then 4 (small)
    let slots, size, lines;
    for (const [L, z] of [[2, 1.06], [3, 0.86], [4, 0.74]]) {
      size = base * z; lines = L;
      slots = flow(words, Math.max(1, cells.length - 1), L, room, { size, weight: 600 });
      if (slots.flat().join(' ').split(' ').filter(Boolean).length >= words.length) break;
    }
    const lineH = size * 1.3;
    cells.forEach((cell, i) => {
      inCell(k, cell, (kk) => {
        const ku = kk.m.u;
        const delay = i * 0.07;
        const a = clamp((into - delay) / (IN - 0.2));
        const e = outExpo(a);
        const lift = (1 - e) * 6 * ku;
        if (i === 0) {
          // the speaker: avatar disc in their own hue, the initial, the name
          const r = Math.min(kk.w, kk.h) * 0.2;
          const cx = kk.w / 2, cy = kk.h * 0.4 + lift;
          const col = T.spectral(hue), deep = T.spectral(hue, { tier: 'ink' });
          kk.add(circle({ cx: n(cx), cy: n(cy), r: n(r * (0.6 + 0.4 * e)), fill: kk.dark ? col : deep, fillOpacity: n(e, 3) }));
          text(kk, name[0].toUpperCase(), { x: cx, cy, size: r * 1.05, weight: 700, color: kk.dark ? '#000000' : '#ffffff', opacity: e });
          text(kk, name, { x: cx, y: kk.h - kk.m.safe - 3.5 * ku, size: 9 * ku, weight: 700, color: kk.dark ? col : deep, maxWidth: kk.w - kk.m.text * 1.6, minSize: 7 * ku, opacity: Math.max(0.2, e) });
          if (mention) kk.eyebrow('@', { color: 'ink' });
          return;
        }
        const s = slots[i - 1] || [];
        if (!s.length) return;
        const block = s.length * lineH;
        const top = (kk.h - block) / 2 + size * 0.95 + lift;
        s.forEach((ln, li) => {
          const isMention = mention && ln.toLowerCase().includes(String(ctx.params.you).toLowerCase());
          text(kk, ln, { x: kk.m.text * 0.8, y: top + li * lineH, size, weight: 600, anchor: 'start', color: isMention ? (kk.dark ? T.spectral(ctx.hue) : T.spectral(ctx.hue, { tier: 'ink' })) : 'ink', maxWidth: kk.w - kk.m.text * 1.6, minSize: size * 0.7, opacity: Math.max(0.05, e) });
        });
      }, `ct${cell.i}`);
    });
    return k.svg();
  },
};
