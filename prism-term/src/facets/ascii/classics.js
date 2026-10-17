// Pure ASCII — the classics: cowsay, banner(1), figlet, clocks, Life, a maze,
// and two self-playing arcade games. Original art and code throughout.
import { sprite, line, center, box, hash, figlet, blockText } from './_ascii.js';

const shared = { gallery: 'ascii', category: 'Classics', glyphs: 'ascii', color: '16', kind: 'art' };

// ── cowsay ──────────────────────────────────────────────────────────────────
const COW = [
  '        \\',
  '         \\   __     __',
  '          \\  \\ \\___/ /',
  '             |  {E}  |',
  '             |       |____________________',
  '              \\     /     .-.       _      \\',
  '               (o_o)|    (   )     ( )      |\\',
  "                `-' |____`-'_______'-'______| ~",
  '                     ||  ||           ||  ||',
  '                     ^^  ^^           ^^  ^^',
];
const SAYINGS = [
  'It works on my machine.',
  "There's no place like 127.0.0.1",
  'Have you tried turning it off and on again?',
  'Moo. Your build is green.',
  'rm -rf is not a backup strategy.',
  'Always read the logs before the dashboards.',
  'The cache was it. It is always the cache.',
];

function bubble(text, max) {
  const words = text.split(' '), lines = [];
  let cur = '';
  for (const w of words) {
    if (cur && (cur + ' ' + w).length > max) { lines.push(cur); cur = w; } else cur = cur ? cur + ' ' + w : w;
  }
  if (cur || !lines.length) lines.push(cur);
  const width = Math.max(...lines.map((l) => l.length));
  const out = [' ' + '_'.repeat(width + 2)];
  lines.forEach((l, i) => {
    const [a, z] = lines.length === 1 ? ['<', '>'] : i === 0 ? ['/', '\\'] : i === lines.length - 1 ? ['\\', '/'] : ['|', '|'];
    out.push(`${a} ${l.padEnd(width)} ${z}`);
  });
  out.push(' ' + '-'.repeat(width + 2));
  return out;
}

const cowsay = {
  ...shared,
  id: 'ascii-cowsay',
  title: 'Cow Says',
  tags: ['cowsay', 'fortune', 'speech bubble', 'cow', 'classic'],
  order: 10,
  loop: 21,
  size: { w: 60, h: 16 },
  minSize: { w: 48, h: 14 },
  description: 'A cowsay-style speech bubble over an original ASCII cow that blinks — cycling through operator wisdom one fortune at a time.',
  setup(ctx) {
    const { width: W, height: H, theme: th } = ctx;
    return (t) => {
      const b = ctx.buffer;
      const i = Math.floor(t / 3) % SAYINGS.length;
      const full = SAYINGS[i];
      const typed = full.slice(0, Math.min(full.length, Math.floor((t % 3) * 24)));
      const lines = bubble(typed, Math.max(12, Math.min(36, W - 6)));
      const top = Math.max(0, H - COW.length - lines.length);
      sprite(b, 1, top, lines, th.ink, { opaque: true });
      const blink = (t % 4) > 3.75;
      const cow = COW.map((l) => l.replace('{E}', blink ? '- -' : 'o o'));
      sprite(b, 1, top + lines.length, cow, (ch, c, r) => {
        if (r < 3 && c <= 10) return th.muted; // bubble tail
        if (r === 3 && c >= 16 && c <= 18) return th.accent; // eyes
        if (ch === '^' || (r >= 5 && r <= 7 && c >= 25 && c <= 39 && ch !== '_')) return th.muted; // hooves, patches
        return th.ink;
      });
    };
  },
};

// ── banner(1) ───────────────────────────────────────────────────────────────
const bannerSign = {
  ...shared,
  id: 'ascii-banner',
  title: 'banner(1) Sign',
  tags: ['banner', 'big letters', 'hash', 'unix', 'marquee'],
  order: 20,
  loop: 12,
  size: { w: 80, h: 12 },
  minSize: { w: 30, h: 9 },
  description: 'Huge letters built from # like the Unix banner command, scrolling past as a marquee with a dotted rule above and below.',
  setup(ctx) {
    const { width: W, height: H, theme: th } = ctx;
    const msg = String(ctx.param('text', 'PRISM  TERMINAL  FACETS  ')).toUpperCase();
    const art = blockText(msg + msg.slice(0, 12), 'standard');
    const aw = blockText(msg, 'standard')[0].length;
    const top = Math.max(1, Math.floor((H - art.length) / 2));
    return (t) => {
      const b = ctx.buffer;
      const off = Math.floor((t * 18) % Math.max(1, aw));
      const rule = ''.padEnd(W, '. ');
      b.text(0, top - 1, rule, th.dim);
      if (top + art.length < H) b.text(0, top + art.length, rule, th.dim);
      for (let r = 0; r < art.length; r++) {
        const row = (art[r] + art[r]).slice(off, off + W);
        for (let x = 0; x < row.length; x++) if (row[x] !== ' ') b.set(x, top + r, '#', r < 2 ? th.ink : r < 5 ? th.accent : th.info);
      }
    };
  },
};

// ── figlet ──────────────────────────────────────────────────────────────────
const WORDS = ['PRISM', 'ASCII', 'Hello', 'shell', '1977'];

const figletBanner = {
  ...shared,
  id: 'ascii-figlet',
  title: 'Figlet-Style Banner',
  tags: ['figlet', 'banner', 'outline', 'big text', 'classic'],
  order: 30,
  loop: 15,
  size: { w: 72, h: 12 },
  minSize: { w: 34, h: 10 },
  description: 'Outlined big letters traced from Prism\'s bitmap fonts with | and _ — the figlet look — typed in one letter at a time.',
  setup(ctx) {
    const { width: W, height: H, theme: th } = ctx;
    const custom = ctx.param('text', '');
    const words = custom ? [String(custom)] : WORDS;
    const renders = words.map((w) => {
      for (const font of ['standard', 'tiny']) {
        const full = figlet(w, font);
        if (full[0].length <= W) return { w, font };
      }
      return { w, font: 'tiny' };
    });
    return (t) => {
      const b = ctx.buffer;
      const i = Math.floor(t / 3) % renders.length;
      const { w, font } = renders[i];
      const n = Math.min(w.length, 1 + Math.floor((t % 3) * 4));
      const art = figlet(w.slice(0, n), font);
      const full = figlet(w, font);
      const x = Math.max(0, Math.floor((W - full[0].length) / 2));
      const y = Math.max(0, Math.floor((H - art.length) / 2));
      sprite(b, x, y, art, (ch, c, r) => (r <= 1 ? th.ink : r < art.length - 2 ? th.accent : th.info));
      if (H > art.length + 2) b.text(x, y + art.length, `$ figlet ${w}`, th.dim);
    };
  },
};

const figletClock = {
  ...shared,
  id: 'ascii-figlet-clock',
  title: 'Figlet Clock',
  tags: ['clock', 'figlet', 'time', 'digits', 'tmux'],
  order: 40,
  loop: 10,
  size: { w: 72, h: 10 },
  minSize: { w: 40, h: 8 },
  description: 'HH:MM:SS in outlined figlet digits with a blinking colon — the tmux clock-mode idea in pure ASCII.',
  setup(ctx) {
    const { width: W, height: H, theme: th } = ctx;
    const start = 9 * 3600 + 41 * 60 + 7;
    return (t) => {
      const b = ctx.buffer;
      const s = Math.floor(start + t);
      const hh = String(Math.floor(s / 3600) % 24).padStart(2, '0'), mm = String(Math.floor(s / 60) % 60).padStart(2, '0'), ss = String(s % 60).padStart(2, '0');
      const colon = t % 1 < 0.5 ? ':' : ' ';
      let art = figlet(`${hh}${colon}${mm}${colon}${ss}`, 'standard');
      if (art[0].length > W) art = figlet(`${hh}${colon}${mm}${colon}${ss}`, 'tiny');
      const x = Math.max(0, Math.floor((W - art[0].length) / 2)), y = Math.max(0, Math.floor((H - art.length) / 2));
      sprite(b, x, y, art, th.accent);
      if (H > art.length + 1) center(b, y + art.length, 'Tue 13 Oct 2026  UTC', th.dim);
    };
  },
};

// ── analog clock ────────────────────────────────────────────────────────────
const analog = {
  ...shared,
  id: 'ascii-clock',
  title: 'ASCII Wall Clock',
  tags: ['clock', 'analog', 'time', 'hands'],
  order: 50,
  loop: 60,
  size: { w: 44, h: 22 },
  minSize: { w: 24, h: 12 },
  description: 'A round wall clock in dots and digits; hour, minute and sweeping second hands drawn with slope-matched - | / \\ glyphs.',
  setup(ctx) {
    const { width: W, height: H, theme: th } = ctx;
    const ry = Math.floor((H - 2) / 2), rx = Math.min(Math.floor((W - 2) / 2), ry * 2);
    const cx = Math.floor(W / 2), cy = Math.floor(H / 2);
    const start = 10 * 3600 + 8 * 60 + 30;
    return (t) => {
      const b = ctx.buffer;
      for (let a = 0; a < 360; a += 3) {
        const r = (a * Math.PI) / 180;
        b.set(Math.round(cx + Math.cos(r) * rx), Math.round(cy + Math.sin(r) * ry), '.', th.dim);
      }
      for (let hNum = 1; hNum <= 12; hNum++) {
        const r = (hNum / 12) * Math.PI * 2 - Math.PI / 2;
        const label = String(hNum);
        b.text(Math.round(cx + Math.cos(r) * (rx - 2.5)) - (label.length > 1 ? 1 : 0), Math.round(cy + Math.sin(r) * (ry - 1.2)), label, hNum % 3 === 0 ? th.ink : th.muted);
      }
      const s = start + t;
      const hand = (frac, len, color, ch) => {
        const r = frac * Math.PI * 2 - Math.PI / 2;
        line(b, cx, cy, cx + Math.cos(r) * rx * len, cy + Math.sin(r) * ry * len, color, ch);
      };
      hand(((s / 3600) % 12) / 12, 0.5, th.ink);
      hand(((s / 60) % 60) / 60, 0.78, th.accent);
      hand((Math.floor(s) % 60) / 60, 0.86, th.neg);
      b.set(cx, cy, 'O', th.ink);
    };
  },
};

// ── Life ────────────────────────────────────────────────────────────────────
const life = {
  ...shared,
  id: 'ascii-life',
  title: 'Life in # and .',
  tags: ['game of life', 'conway', 'cellular automata', 'classic'],
  order: 60,
  loop: 12,
  size: { w: 80, h: 24 },
  minSize: { w: 24, h: 8 },
  description: "Conway's Game of Life the way it first ran on terminals — # for live cells, . for the dead — reseeding when it settles.",
  setup(ctx) {
    const { width: W, height: H, theme: th, rng } = ctx;
    const GH = H - 1;
    let cur = new Uint8Array(W * GH), nxt = new Uint8Array(W * GH);
    let gen = 0, still = 0, acc = 0;
    const seed = () => { for (let i = 0; i < cur.length; i++) cur[i] = rng() < 0.3 ? 1 : 0; gen = 0; still = 0; };
    seed();
    const step = () => {
      let changes = 0, pop = 0;
      for (let y = 0; y < GH; y++) for (let x = 0; x < W; x++) {
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) n += cur[((y + dy + GH) % GH) * W + ((x + dx + W) % W)];
        const i = y * W + x, v = n === 3 || (n === 2 && cur[i]) ? 1 : 0;
        nxt[i] = v; pop += v;
        if (v !== cur[i]) changes++;
      }
      [cur, nxt] = [nxt, cur];
      gen++;
      still = changes < W * GH * 0.004 ? still + 1 : 0;
      if (still > 30 || pop < W * GH * 0.02 || gen > 600) seed();
    };
    return (t, dt) => {
      acc += Math.min(0.25, dt || 0.05);
      while (acc > 0.1) { step(); acc -= 0.1; }
      const b = ctx.buffer;
      for (let y = 0; y < GH; y++) for (let x = 0; x < W; x++) {
        const live = cur[y * W + x];
        b.set(x, y + 1, live ? '#' : '.', live ? th.pos : th.dim);
      }
      b.text(0, 0, `gen ${String(gen).padStart(4)}  `, th.muted);
    };
  },
};

// ── maze ────────────────────────────────────────────────────────────────────
const maze = {
  ...shared,
  id: 'ascii-maze',
  title: 'Maze Builder',
  tags: ['maze', 'backtracker', 'bfs', 'pathfinding', 'algorithm'],
  order: 70,
  loop: 20,
  size: { w: 61, h: 21 },
  minSize: { w: 25, h: 11 },
  description: 'A depth-first backtracker carves a +--+ maze cell by cell, then breadth-first search lights the solution path.',
  setup(ctx) {
    const { width: W, height: H, theme: th, rng } = ctx;
    const C = Math.max(2, Math.floor((W - 1) / 3)), R = Math.max(2, Math.floor((H - 1) / 2));
    let open, seen, stack, path, phase, hold, acc, head;
    const reset = () => {
      open = new Uint8Array(C * R); // bit 1 = east open, bit 2 = south open
      seen = new Uint8Array(C * R);
      stack = [0]; seen[0] = 1; path = []; phase = 'carve'; hold = 0; acc = 0; head = 0;
    };
    reset();
    const carve = () => {
      const c = stack[stack.length - 1];
      const x = c % C, y = (c / C) | 0;
      const opts = [];
      if (x > 0 && !seen[c - 1]) opts.push(c - 1);
      if (x < C - 1 && !seen[c + 1]) opts.push(c + 1);
      if (y > 0 && !seen[c - C]) opts.push(c - C);
      if (y < R - 1 && !seen[c + C]) opts.push(c + C);
      if (!opts.length) { stack.pop(); if (!stack.length) solve(); return; }
      const n = opts[Math.floor(rng() * opts.length)];
      if (n === c + 1) open[c] |= 1; else if (n === c - 1) open[n] |= 1; else if (n === c + C) open[c] |= 2; else open[n] |= 2;
      seen[n] = 1; stack.push(n);
    };
    const solve = () => {
      const prev = new Int32Array(C * R).fill(-1), goal = C * R - 1;
      const q = [0]; prev[0] = 0;
      while (q.length) {
        const c = q.shift(); if (c === goal) break;
        const x = c % C;
        const nb = [];
        if (open[c] & 1) nb.push(c + 1);
        if (x > 0 && open[c - 1] & 1) nb.push(c - 1);
        if (open[c] & 2) nb.push(c + C);
        if (c - C >= 0 && open[c - C] & 2) nb.push(c - C);
        for (const n of nb) if (prev[n] < 0) { prev[n] = c; q.push(n); }
      }
      path = []; for (let c = goal; c !== 0; c = prev[c]) path.unshift(c);
      path.unshift(0);
      phase = 'solve';
    };
    return (t, dt) => {
      acc += Math.min(0.25, dt || 0.05);
      const rate = phase === 'carve' ? 1 / Math.max(40, C * R / 6) : 1 / 30;
      while (acc > rate) {
        acc -= rate;
        if (phase === 'carve') carve();
        else if (phase === 'solve') { head++; if (head >= path.length) phase = 'hold'; }
        else if ((hold += rate) > 2.5) reset();
      }
      const b = ctx.buffer;
      for (let y = 0; y <= R; y++) for (let x = 0; x <= C; x++) b.set(x * 3, y * 2, '+', th.muted);
      for (let y = 0; y < R; y++) for (let x = 0; x < C; x++) {
        const c = y * C + x, X = x * 3, Y = y * 2;
        if (y === 0) b.text(X + 1, Y, '--', th.muted);
        if (x === 0 && c !== 0) b.set(X, Y + 1, '|', th.muted);
        if (!(open[c] & 1) && !(x === C - 1 && y === R - 1)) b.set(X + 3, Y + 1, '|', th.muted);
        if (!(open[c] & 2)) b.text(X + 1, Y + 2, '--', th.muted);
        if (!seen[c]) b.text(X + 1, Y + 1, '::', th.dim);
      }
      if (phase === 'carve' && stack.length) { const c = stack[stack.length - 1]; b.text((c % C) * 3 + 1, ((c / C) | 0) * 2 + 1, '@@', th.warn); }
      for (let k = 0; k < Math.min(head, path.length); k++) { const c = path[k]; b.text((c % C) * 3 + 1, ((c / C) | 0) * 2 + 1, 'oo', th.pos); }
    };
  },
};

// ── snake ───────────────────────────────────────────────────────────────────
const snake = {
  ...shared,
  id: 'ascii-snake',
  title: 'Self-Playing Snake',
  tags: ['snake', 'game', 'arcade', 'ai', 'bfs'],
  order: 80,
  loop: 20,
  size: { w: 48, h: 20 },
  minSize: { w: 20, h: 10 },
  description: 'Snake plays itself: breadth-first search steers @ to the * while the o tail grows, until it boxes itself in and starts over.',
  setup(ctx) {
    const { width: W, height: H, theme: th, rng } = ctx;
    const GW = W - 2, GH = H - 3;
    let body, dir, food, score, best = 0, acc = 0, dead = 0, grow = 0;
    const key = (x, y) => y * GW + x;
    const placeFood = () => {
      for (let k = 0; k < 500; k++) {
        const x = Math.floor(rng() * GW), y = Math.floor(rng() * GH);
        if (!body.some(([bx, by]) => bx === x && by === y)) { food = [x, y]; return; }
      }
    };
    const reset = () => { body = [[Math.floor(GW / 2), Math.floor(GH / 2)]]; dir = [1, 0]; score = 0; dead = 0; grow = 2; placeFood(); };
    reset();
    const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const step = () => {
      if (dead) { if ((dead += 1) > 25) reset(); return; }
      const [hx, hy] = body[0];
      const blocked = new Set(body.slice(0, -1).map(([x, y]) => key(x, y)));
      // BFS to food
      const prev = new Map([[key(hx, hy), null]]);
      const q = [[hx, hy]];
      let found = null;
      while (q.length && !found) {
        const [x, y] = q.shift();
        for (const [dx, dy] of DIRS) {
          const nx = x + dx, ny = y + dy, k = key(nx, ny);
          if (nx < 0 || ny < 0 || nx >= GW || ny >= GH || blocked.has(k) || prev.has(k)) continue;
          prev.set(k, [x, y]); q.push([nx, ny]);
          if (nx === food[0] && ny === food[1]) { found = [nx, ny]; break; }
        }
      }
      if (found) {
        let c = found;
        while (prev.get(key(c[0], c[1])) && (prev.get(key(c[0], c[1]))[0] !== hx || prev.get(key(c[0], c[1]))[1] !== hy)) c = prev.get(key(c[0], c[1]));
        dir = [c[0] - hx, c[1] - hy];
      } else {
        const safe = DIRS.filter(([dx, dy]) => { const nx = hx + dx, ny = hy + dy; return nx >= 0 && ny >= 0 && nx < GW && ny < GH && !blocked.has(key(nx, ny)); });
        if (safe.length) dir = safe[0];
      }
      const nx = hx + dir[0], ny = hy + dir[1];
      if (nx < 0 || ny < 0 || nx >= GW || ny >= GH || blocked.has(key(nx, ny))) { dead = 1; best = Math.max(best, score); return; }
      body.unshift([nx, ny]);
      if (nx === food[0] && ny === food[1]) { score++; grow += 3; placeFood(); }
      if (grow > 0) grow--; else body.pop();
    };
    return (t, dt) => {
      acc += Math.min(0.25, dt || 0.05);
      while (acc > 1 / 20) { step(); acc -= 1 / 20; }
      const b = ctx.buffer;
      box(b, 0, 1, W, H - 1, th.muted);
      b.text(1, 0, `score ${score}  best ${Math.max(best, score)}`, th.ink);
      b.set(food[0] + 1, food[1] + 2, '*', th.warn);
      body.forEach(([x, y], i) => b.set(x + 1, y + 2, i === 0 ? '@' : 'o', i === 0 ? th.pos : th.accent));
      if (dead) center(b, Math.floor(H / 2), ' GAME OVER ', th.neg);
    };
  },
};

// ── pong ────────────────────────────────────────────────────────────────────
const pong = {
  ...shared,
  id: 'ascii-pong',
  title: 'Self-Playing Pong',
  tags: ['pong', 'game', 'arcade', '1972', 'ai'],
  order: 90,
  loop: 20,
  size: { w: 64, h: 20 },
  minSize: { w: 30, h: 10 },
  description: 'Two imperfect AI paddles rally an o across a dotted net; misses score, and the ball serves again from the center.',
  setup(ctx) {
    const { width: W, height: H, theme: th } = ctx;
    const top = 2, bottom = H - 1, ph = Math.max(2, Math.floor((bottom - top) / 4));
    let bx, by, vx, vy, lp, rp, ls = 0, rs = 0, acc = 0, serve = 0, rallies = 0;
    const reset = (dirX) => { bx = W / 2; by = (top + bottom) / 2; vx = 22 * dirX; vy = 9 * (hash(rallies, 3) < 0.5 ? -1 : 1); serve = 0.6; };
    lp = rp = (top + bottom) / 2;
    reset(1);
    const tick = (dt) => {
      if (serve > 0) { serve -= dt; return; }
      bx += vx * dt; by += vy * dt;
      if (by <= top) { by = top + (top - by); vy = Math.abs(vy); }
      if (by >= bottom - 1) { by = bottom - 1 - (by - (bottom - 1)); vy = -Math.abs(vy); }
      const err = (side) => (hash(rallies, side) - 0.5) * ph * 2.2;
      const follow = (p, side) => { const target = by + err(side); return p + Math.max(-14 * dt, Math.min(14 * dt, target - p)); };
      const clamp = (p) => Math.max(top + ph / 2, Math.min(bottom - ph / 2, p));
      lp = clamp(follow(lp, 1)); rp = clamp(follow(rp, 2));
      if (bx <= 3 && vx < 0) {
        if (Math.abs(by - lp) <= ph / 2 + 0.5) { vx = Math.abs(vx) * 1.03; vy += (by - lp) * 3; rallies++; } else if (bx < 0) { rs++; rallies++; reset(1); }
      }
      if (bx >= W - 4 && vx > 0) {
        if (Math.abs(by - rp) <= ph / 2 + 0.5) { vx = -Math.abs(vx) * 1.03; vy += (by - rp) * 3; rallies++; } else if (bx > W - 1) { ls++; rallies++; reset(-1); }
      }
      vx = Math.sign(vx) * Math.min(40, Math.abs(vx));
      vy = Math.max(-16, Math.min(16, vy));
    };
    return (t, dt) => {
      acc += Math.min(0.25, dt || 0.05);
      while (acc > 1 / 60) { tick(1 / 60); acc -= 1 / 60; }
      const b = ctx.buffer;
      b.text(0, top - 1, '-'.repeat(W), th.muted);
      b.text(0, bottom, '-'.repeat(W), th.muted);
      for (let y = top; y < bottom; y += 2) b.set(Math.floor(W / 2), y, ':', th.dim);
      center(b, 0, `${String(ls).padStart(2)}   ${String(rs).padEnd(2)}`, th.ink);
      for (let k = 0; k < ph; k++) {
        b.set(2, Math.round(lp - ph / 2 + k), '|', th.accent);
        b.set(W - 3, Math.round(rp - ph / 2 + k), '|', th.crit);
      }
      if (serve <= 0) b.set(Math.round(bx), Math.round(by), 'o', th.ink);
    };
  },
};

export default [cowsay, bannerSign, figletBanner, figletClock, analog, life, maze, snake, pong];
