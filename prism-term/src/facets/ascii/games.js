// Pure ASCII — three classics that played themselves into history: a falling-
// block game in its Elektronika 60 text-mode well, a roguelike descent that ends
// at the tombstone, and a 1971 BASIC starship session at the short-range scan.
// 7-bit glyphs only; original code and art, after the games credited below.
import { hash } from './_ascii.js';
import { mix } from '../../color.js';

const shared = { gallery: 'ascii', category: 'Classics', glyphs: 'ascii', color: '16', kind: 'art' };
/** Time within the loop, quantized so t and t + loop draw identical frames (flicker keys included). */
const phase = (t, loop) => Math.round((((t % loop) + loop) % loop) * 1e6) / 1e6;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// ── block stacker ───────────────────────────────────────────────────────────────────
const SHAPES = { I: [[0, 1], [1, 1], [2, 1], [3, 1]], O: [[1, 0], [2, 0], [1, 1], [2, 1]], T: [[1, 0], [0, 1], [1, 1], [2, 1]], S: [[1, 0], [2, 0], [0, 1], [1, 1]], Z: [[0, 0], [1, 0], [1, 1], [2, 1]], J: [[0, 0], [0, 1], [1, 1], [2, 1]], L: [[2, 0], [0, 1], [1, 1], [2, 1]] };
const NAMES = Object.keys(SHAPES);
const ROT = NAMES.map((n) => {                              // four rotation states per piece
  const size = n === 'I' ? 4 : 3, out = [SHAPES[n]];
  for (let r = 1; r < 4; r++) out.push(n === 'O' ? SHAPES.O : out[r - 1].map(([x, y]) => [size - 1 - y, x]));
  return out;
});
const COLS = 10;

/** Precompute one game: a list of placed pieces with their timing, until the stack tops out. */
function playStacker(rows) {
  const board = Array.from({ length: rows }, () => new Int8Array(COLS).fill(-1));
  const fits = (cells, px, py) => cells.every(([x, y]) => x + px >= 0 && x + px < COLS && y + py < rows && (y + py < 0 || board[y + py][x + px] < 0));
  const land = (cells, px) => { let py = -1; while (fits(cells, px, py + 1)) py++; return py; };
  const seq = [];
  for (let bag = 0; seq.length < 200; bag++) {
    const ids = [0, 1, 2, 3, 4, 5, 6].map((i) => [hash(bag, i, 77), i]).sort((a, b) => a[0] - b[0]).map(([, i]) => i);
    seq.push(...ids);
  }
  const events = [];
  let tm = 0.4, lines = 0, score = 0;
  for (let n = 0; n < seq.length; n++) {
    const id = seq[n], level = 1 + Math.floor(lines / 4), grav = Math.max(0.035, 0.12 - 0.018 * (level - 1));
    const panic = tm > 28;                                  // late game: speed and nerves fail
    let best = null;
    for (let r = 0; r < 4; r++) for (let px = -2; px < COLS; px++) {
      const cells = ROT[id][r];
      if (!fits(cells, px, 0)) continue;
      const py = land(cells, px);
      if (py < 0) continue;
      // score the board after this placement (aggregate height, holes, bumpiness, lines)
      const tmp = board.map((row) => row.slice());
      cells.forEach(([x, y]) => { tmp[y + py][x + px] = id; });
      const full = tmp.filter((row) => row.every((c) => c >= 0)).length;
      const hts = Array.from({ length: COLS }, (_, x) => { const y = tmp.findIndex((row) => row[x] >= 0); return y < 0 ? 0 : rows - y; });
      let holes = 0;
      for (let x = 0; x < COLS; x++) { let seen = false; for (let y = 0; y < rows; y++) { if (tmp[y][x] >= 0) seen = true; else if (seen) holes++; } }
      const bump = hts.slice(1).reduce((s, h, i) => s + Math.abs(h - hts[i]), 0);
      let v = -0.51 * hts.reduce((a, b) => a + b, 0) + 0.76 * full - 0.36 * holes - 0.18 * bump + (hash(n, r, px + 9) - 0.5) * 0.4;
      if (panic) v = -Math.abs(px - 3) - holes * 0.01 + hash(n, r, px) * 2;   // panicking: piles up near the middle
      if (!best || v > best.v) best = { v, r, px, py };
    }
    if (!best) { events.push({ over: tm }); break; }
    const actions = best.r + Math.abs(best.px - 3), drop = !panic && hash(n, 5) < 0.7;   // SPACE: DROP once lined up
    const fall = drop ? actions * 0.06 + 0.08 : Math.max(actions * 0.06, (best.py + 1) * grav);
    ROT[id][best.r].forEach(([x, y]) => { board[y + best.py][x + best.px] = id; });
    const cleared = [];
    board.forEach((row, y) => { if (row.every((c) => c >= 0)) cleared.push(y); });
    events.push({ id, r: best.r, px: best.px, py: best.py, t0: tm, t1: tm + fall, grav, drop, actions, cleared, next: seq[n + 1], level, lines, score });
    tm += fall;
    if (cleared.length) {
      lines += cleared.length; score += [0, 40, 100, 300, 1200][cleared.length] * level;
      for (const y of cleared) { board.splice(y, 1); board.unshift(new Int8Array(COLS).fill(-1)); }
      tm += 0.35;
    }
    tm += 0.05;
    if (tm > 37) { events.push({ over: tm }); break; }
  }
  return events;
}

const blockStacker = {
  ...shared,
  id: 'ascii-block-stacker',
  since: '0.3.0',
  title: 'Block Stacker',
  tags: ['block stacker', 'falling blocks', 'puzzle', 'elektronika 60', 'autoplay', 'retro game', 'text mode'],
  order: 300,
  loop: 40,
  size: { w: 64, h: 22 },
  minSize: { w: 40, h: 14 },
  description: 'A falling-block game in its original text-mode well: [] blocks drop between <! and !>, a so-so autoplayer clears lines as speed rises, then tops out.',
  credits: "after Alexey Pajitnov's 1984 falling-block game on the Elektronika 60",
  setup(ctx) {
    const { width: W, height: H, theme: th } = ctx;
    const rows = Math.max(12, Math.min(20, H - 4)), y0 = Math.max(0, Math.floor((H - rows - 2) / 2));
    const panels = W >= 60, wx = panels ? 20 : 0, rx = wx + 26;
    const events = playStacker(rows), overAt = (events.at(-1).over ?? 37);
    const tint = [th.info, th.warn, th.accent, th.pos, th.neg, th.accent2, th.crit];
    return (t) => {
      const b = ctx.buffer;
      const tau = phase(t, 40);
      const board = Array.from({ length: rows }, () => new Int8Array(COLS).fill(-1));
      let cur = null, flash = null, stats = { lines: 0, score: 0, level: 1, next: events[0].id };
      for (const e of events) {
        if (e.over !== undefined || e.t0 > tau) break;
        if (tau < e.t1) { cur = e; stats = { lines: e.lines, score: e.score, level: e.level, next: e.next }; break; }
        ROT[e.id][e.r].forEach(([x, y]) => { if (y + e.py >= 0) board[y + e.py][x + e.px] = e.id; });
        stats = { lines: e.lines + e.cleared.length, score: e.score + [0, 40, 100, 300, 1200][e.cleared.length] * e.level, level: e.level, next: e.next };
        if (e.cleared.length) {
          if (tau < e.t1 + 0.35) { flash = e.cleared; break; }  // the full rows flash, then collapse
          for (const y of e.cleared) { board.splice(y, 1); board.unshift(new Int8Array(COLS).fill(-1)); }
        }
      }
      // game over: the well fills with [] bottom-up, then clears before the wrap
      const fill = tau >= overAt ? Math.min(rows, Math.floor((tau - overAt) / 0.08)) : 0, gone = tau >= 39.3;
      for (let y = 0; y < rows; y++) {
        b.text(wx, y0 + y, '<!', th.muted); b.text(wx + 22, y0 + y, '!>', th.muted);
        for (let x = 0; x < COLS; x++) {
          const c = board[y][x], filled = !gone && rows - 1 - y < fill;
          if (flash && flash.includes(y)) b.text(wx + 2 + x * 2, y0 + y, '==', th.ink, undefined, 1);
          else if (filled) b.text(wx + 2 + x * 2, y0 + y, '[]', th.dim);
          else if (c >= 0 && !gone) b.text(wx + 2 + x * 2, y0 + y, '[]', tint[c]);
          else b.text(wx + 2 + x * 2, y0 + y, ' .', th.dim);
        }
      }
      if (cur && !gone && fill === 0) {                       // the falling piece
        const u = (tau - cur.t0) / Math.max(1e-6, cur.t1 - cur.t0);
        const moved = clamp01((tau - cur.t0) / Math.max(1e-6, cur.actions * 0.06));
        const px = Math.round(3 + (cur.px - 3) * moved), r = Math.round(cur.r * moved);
        const py = cur.drop ? (moved < 1 ? 0 : cur.py) : Math.min(cur.py, Math.floor(u * (cur.py + 1)));
        ROT[cur.id][r].forEach(([x, y]) => { const Y = y + py, X = x + px; if (Y >= 0 && Y < rows && X >= 0 && X < COLS) b.text(wx + 2 + X * 2, y0 + Y, '[]', tint[cur.id], undefined, 1); });
      }
      if (fill >= rows && !gone && Math.floor(tau * 2) % 2 === 0) {          // GAME OVER over the filled well until it clears
        b.text(wx + 6, y0 + Math.floor(rows / 2), ' GAME OVER ', th.bg, th.neg, 1);
      }
      b.text(wx, y0 + rows, '<!' + '='.repeat(20) + '!>', th.muted);
      if (y0 + rows + 1 < H) b.text(wx + 2, y0 + rows + 1, '\\/'.repeat(10), th.muted);
      const sx = panels ? 1 : rx, sy = panels ? y0 + 2 : y0;
      b.text(sx, sy, `LINES: ${stats.lines}`, th.ink); b.text(sx, sy + 1, `LEVEL: ${stats.level}`, th.ink); b.text(sx, sy + 2, `SCORE: ${stats.score}`, th.ink);
      if (panels) ['7: LEFT   9: RIGHT', '   8: ROTATE', '4: SPEED UP', '5: SHOW NEXT', 'SPACE: DROP'].forEach((s, i) => b.text(rx, y0 + 1 + i, s, th.muted));
      if (W - rx >= 10 && !gone) {                            // SHOW NEXT
        const ny = panels ? y0 + 8 : y0 + 4;
        b.text(rx, ny, 'NEXT:', th.ink);
        ROT[stats.next][0].forEach(([x, y]) => b.text(rx + 1 + x * 2, ny + 1 + y, '[]', tint[stats.next]));
      }
    };
  },
};

// ── dungeon crawl ────────────────────────────────────────────────────────────────────
const TOMB = ['     ___________', '    /           \\', '   /   REST IN   \\', '  /     PEACE     \\', ' |                 |', ' |      Arlo       |', ' |     214 Au      |', ' |   killed by a   |', ' |    hobgoblin    |', ' |      2026       |', ' |                 |', '_|_________________|_'];

/** A roguelike level: a 3×3 grid of rooms, L-shaped corridors, items, monsters and @'s scripted route. */
function rogueLevel(W, H) {
  const MH = H - 2, grid = Array.from({ length: MH }, () => new Array(W).fill(' '));
  const cw = Math.floor(W / 3), ch = Math.floor(MH / 3), rooms = [];
  for (let gy = 0; gy < 3; gy++) for (let gx = 0; gx < 3; gx++) {
    const k = gy * 3 + gx, rw = Math.max(6, Math.floor(cw * (0.55 + hash(k, 1) * 0.3))), rh = Math.max(4, Math.floor(ch * (0.6 + hash(k, 2) * 0.35)));
    const x = gx * cw + 1 + Math.floor(hash(k, 3) * Math.max(1, cw - rw - 2)), y = gy * ch + Math.floor(hash(k, 4) * Math.max(1, ch - rh));
    rooms.push({ x, y, w: Math.min(rw, cw - 2), h: Math.min(rh, ch) });
  }
  for (const r of rooms) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
    grid[y][x] = y === r.y || y === r.y + r.h - 1 ? '-' : x === r.x || x === r.x + r.w - 1 ? '|' : '.';
  }
  const dig = (x, y) => { if (grid[y][x] === ' ') grid[y][x] = '#'; else if (grid[y][x] === '-' || grid[y][x] === '|') grid[y][x] = '+'; };
  const link = (a, b, horiz) => {                         // door to door with one bend
    const A = rooms[a], B = rooms[b];
    const ax = horiz ? A.x + A.w - 1 : A.x + Math.floor(A.w / 2), ay = horiz ? A.y + Math.floor(A.h / 2) : A.y + A.h - 1;
    const bx = horiz ? B.x : B.x + Math.floor(B.w / 2), by = horiz ? B.y + Math.floor(B.h / 2) : B.y;
    if (horiz) { const mx = Math.floor((ax + bx) / 2); for (let x = ax; x <= mx; x++) dig(x, ay); for (let y = Math.min(ay, by); y <= Math.max(ay, by); y++) dig(mx, y); for (let x = mx; x <= bx; x++) dig(x, by); }
    else { const my = Math.floor((ay + by) / 2); for (let y = ay; y <= my; y++) dig(ax, y); for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++) dig(x, my); for (let y = my; y <= by; y++) dig(bx, y); }
  };
  [[0, 1, 1], [1, 2, 1], [0, 3, 0], [3, 4, 1], [2, 5, 0], [4, 7, 0], [5, 8, 0], [7, 8, 1], [6, 7, 1]].forEach(([a, b, h]) => link(a, b, h));
  const center = (k) => [rooms[k].x + Math.floor(rooms[k].w / 2), rooms[k].y + Math.floor(rooms[k].h / 2)];
  const spot = (k, fx, fy) => [rooms[k].x + 1 + Math.floor((rooms[k].w - 2) * fx), rooms[k].y + 1 + Math.floor((rooms[k].h - 2) * fy)];
  const items = [{ at: spot(0, 0.8, 0.3), ch: '*', name: 'gold' }, { at: spot(1, 0.3, 0.6), ch: '!', name: 'potion' }, { at: spot(4, 0.7, 0.7), ch: '?', name: 'scroll' }, { at: spot(8, 0.8, 0.8), ch: '%', name: 'stairs' }];
  // BFS walk between waypoints over floor, doors and corridors
  const walk = (from, to) => {
    const key = ([x, y]) => y * W + x, prev = new Map([[key(from), null]]), q = [from];
    while (q.length) {
      const [x, y] = q.shift();
      if (x === to[0] && y === to[1]) break;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= MH || prev.has(ny * W + nx) || !'.+#'.includes(grid[ny][nx])) continue;
        prev.set(ny * W + nx, [x, y]); q.push([nx, ny]);
      }
    }
    const path = [];
    for (let p = to; p && prev.has(key(p)); p = prev.get(key(p))) path.unshift(p);
    return path.length ? path : [from];
  };
  const way = [center(0), items[0].at, center(1), items[1].at, center(4), center(5), spot(8, 0.3, 0.5)];
  let route = [way[0]];
  for (let i = 1; i < way.length; i++) route = route.concat(walk(route.at(-1), way[i]).slice(1));
  return { grid, rooms, items, route, MH, bat: spot(4, 0.2, 0.3), kobold: spot(5, 0.5, 0.5), hob: spot(8, 0.55, 0.5) };
}

const dungeonCrawl = {
  ...shared,
  id: 'ascii-dungeon-crawl',
  since: '0.3.0',
  title: 'Dungeon Crawl',
  tags: ['roguelike', 'dungeon', 'crawl', 'tombstone', 'kobold', 'hobgoblin', 'retro game'],
  order: 310,
  loop: 40,
  size: { w: 80, h: 24 },
  minSize: { w: 48, h: 16 },
  description: 'A roguelike descent: rooms light up as @ enters, corridors appear as walked, a bat flits, a kobold falls, then a hobgoblin wins and the tombstone rises.',
  credits: 'after Rogue (1980) by Michael Toy, Glenn Wichman and Ken Arnold',
  setup(ctx) {
    const { width: W, height: H, theme: th } = ctx;
    const L = rogueLevel(W, H), R = L.route, deathAt = 35, steps = R.length - 1;
    // the status line: Rogue's own spacing when it fits, else single spaces, then whole fields drop from the right
    const status = (gold, hp) => ['Level: 3', `Gold: ${gold}`, `Hp: ${hp}(12)`, 'Str: 16(16)', 'Arm: 4', 'Exp: 3/27'];
    const widest = status(214, 12), stSep = widest.join('  ').length <= W ? '  ' : ' ';
    let stN = widest.length;
    while (stN > 1 && widest.slice(0, stN).join(stSep).length > W) stN--;
    const pace = (deathAt - 6) / Math.max(1, steps);         // seconds per step, leaving time to fight
    const near = (a, b, d = 1) => Math.abs(a[0] - b[0]) <= d && Math.abs(a[1] - b[1]) <= d;
    const koboldStep = R.findIndex((p) => near(p, L.kobold)), fightAt = 1 + Math.max(0, koboldStep) * pace;
    const posAt = (tau) => {                                  // the kobold fight holds @ in place for 3 s
      const s = tau < fightAt ? (tau - 1) / pace : tau < fightAt + 3 ? koboldStep : koboldStep + (tau - fightAt - 3) / pace;
      return R[Math.max(0, Math.min(steps, Math.floor(s)))];
    };
    const roomOf = ([x, y]) => L.rooms.findIndex((r) => x > r.x && x < r.x + r.w - 1 && y > r.y && y < r.y + r.h - 1);
    const seen = new Uint8Array(W * L.MH), lit = new Set();
    return (t) => {
      const b = ctx.buffer;
      let tau = phase(t, 40);
      if (tau >= 36 && tau < 39.4) {                          // REST IN PEACE ...
        TOMB.forEach((s, i) => b.text(Math.floor((W - 21) / 2), Math.floor((H - TOMB.length) / 2) + i, s, i > 4 && i < 10 ? th.ink : th.muted));
        return;
      }
      if (tau >= 39.4) tau = 0;                               // ... then a fresh game on the same seed, already at its first frame
      seen.fill(0); lit.clear();
      const me = posAt(tau);
      // memory: every lit room entered so far, and corridor squares next to the path walked
      const walked = Math.max(0, Math.min(steps, Math.floor(tau < fightAt ? (tau - 1) / pace : tau < fightAt + 3 ? koboldStep : koboldStep + (tau - fightAt - 3) / pace)));
      for (let i = 0; i <= walked; i++) {
        const p = R[i], k = roomOf(p);
        if (k >= 0) lit.add(k);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const x = p[0] + dx, y = p[1] + dy; if (x >= 0 && y >= 0 && x < W && y < L.MH) seen[y * W + x] = 1; }
      }
      for (let y = 0; y < L.MH; y++) for (let x = 0; x < W; x++) {
        const c = L.grid[y][x];
        if (c === ' ') continue;
        const inLit = [...lit].some((k) => { const r = L.rooms[k]; return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h; });
        if (!inLit && !(c === '#' && seen[y * W + x]) && !(c === '+' && seen[y * W + x])) continue;
        b.set(x, y + 1, c, c === '#' ? th.dim : c === '.' ? mix(th.muted, th.bg, 0.4) : th.muted);
      }
      let gold = 160, msg = 'Hello Arlo, welcome to the dungeon!', hp = 12;
      for (const it of L.items) {
        const k = roomOf(it.at), taken = it.ch !== '%' && R.slice(0, walked + 1).some((p) => p[0] === it.at[0] && p[1] === it.at[1]);
        if (taken && it.ch === '*') { gold = 214; if (msg.startsWith('Hello')) msg = 'You found 54 gold pieces.'; }
        if (taken && it.ch === '!') msg = 'You now have a potion of healing (p).';
        if (!taken && k >= 0 && lit.has(k)) b.set(it.at[0], it.at[1] + 1, it.ch, it.ch === '*' ? th.warn : th.accent);
      }
      // the bat: erratic, in the room it haunts, while @ crosses it
      if (lit.has(roomOf(L.bat))) {
        const r = L.rooms[roomOf(L.bat)], k = Math.floor(tau * 5);
        const bx = r.x + 1 + Math.floor(hash(k, 3) * (r.w - 2)), by = r.y + 1 + Math.floor(hash(k, 4) * (r.h - 2));
        b.set(bx, by + 1, 'B', th.neg);
        if (near([bx, by], me)) { msg = 'The bat bites you.'; hp = 11; }
      }
      if (tau >= fightAt + 3) hp = Math.min(hp, 9);
      if (tau < fightAt + 3 && lit.has(roomOf(L.kobold))) b.set(L.kobold[0], L.kobold[1] + 1, 'K', th.neg);
      if (tau >= fightAt && tau < fightAt + 3) msg = ['You hit the kobold.', 'The kobold hits you.', 'You hit the kobold.', 'You have defeated the kobold.'][Math.min(3, Math.floor((tau - fightAt) / 0.75))];
      if (tau >= fightAt + 1) hp = Math.min(hp, 10);
      const hobRoom = roomOf(L.hob);
      if (lit.has(hobRoom)) {
        b.set(L.hob[0], L.hob[1] + 1, 'H', th.neg);
        if (near(me, L.hob, 3) || tau >= deathAt - 2) { msg = tau >= deathAt - 0.8 ? 'You die...  --More--' : tau >= deathAt - 1.6 ? 'The hobgoblin hits you.' : 'The hobgoblin hits you.'; hp = tau >= deathAt - 0.8 ? 0 : tau >= deathAt - 1.6 ? 2 : 5; }
      }
      b.set(me[0], me[1] + 1, '@', th.warn, undefined, 1);
      b.text(0, 0, msg.slice(0, W), th.ink);
      b.text(0, H - 1, status(gold, hp).slice(0, stN).join(stSep).slice(0, W), th.ink);
    };
  },
};

// ── starship command (1971 BASIC style) ─────────────────────────────────────────────────────────
const SCAN0 = { E: [2, 6], K: [[4, 2], [6, 2]], stars: [[1, 1], [7, 3], [5, 5], [3, 8], [8, 7]], base: [7, 6] };
const TRACK = [[3, 5], [3, 4], [3, 3], [4, 2]];

const starship = {
  ...shared,
  id: 'ascii-starship-command',
  since: '0.3.0',
  title: 'Starship Command',
  tags: ['starship', 'basic', 'strategy', 'teletype', 'retro game', 'space', 'short range scan'],
  order: 320,
  loop: 36,
  size: { w: 72, h: 22 },
  minSize: { w: 48, h: 14 },
  description: 'A 1971-style BASIC starship game at its short-range scan: a torpedo steps cell by cell into a raider, lasers finish another, then the drive returns home.',
  credits: "after Mike Mayfield's 1971 STTR1",
  setup(ctx) {
    const { width: W, height: H, theme: th } = ctx;
    const wide = W >= 66;
    // the session: [time, text]; typed commands reveal one character per 0.12 s
    const K = 1.45;                                          // session pace: the warp lands near 32.5 s
    const type = (at, prompt, ans) => ({ at: at * K, f: (tau) => prompt + ans.slice(0, Math.max(0, Math.floor((tau - at * K - 0.5) / 0.17))) });
    const say = (at, s) => ({ at: at * K, f: () => s });
    const S = [type(1, 'COMMAND? ', 'TOR'), type(2.2, 'TORPEDO COURSE (1-9)? ', '2.7'), say(3.4, 'TORPEDO TRACK:'),
      ...TRACK.map((p, i) => say(3.8 + i * 0.5, `               ${p[0]},${p[1]}`)), say(6, '*** RAIDER DESTROYED ***'),
      say(7.2, '214 UNIT HIT ON YOUR SHIP FROM SECTOR 6,2'), say(7.6, '      <SHIELDS DOWN TO 186 UNITS>'),
      type(9.4, 'COMMAND? ', 'LAS'), say(10.6, W >= 49 ? 'LASERS LOCKED ON TARGET;  ENERGY AVAILABLE = 2860' : 'LASERS LOCKED; ENERGY = 2860'), type(11.2, 'NUMBER OF UNITS TO FIRE? ', '500'),
      say(12.8, '312 UNIT HIT ON RAIDER AT SECTOR 6,2'), say(13.2, '   (SENSORS SHOW 0 UNITS REMAINING)'), say(13.8, '*** RAIDER DESTROYED ***'),
      type(16.5, 'COMMAND? ', 'NAV'), type(17.6, 'COURSE (0-9)? ', '7'), type(18.6, 'DRIVE FACTOR (0-8)? ', '1'), say(20, 'NOW ENTERING QUADRANT 4,7 ...')];
    const warpAt = 20.4 * K, arriveAt = 22.4 * K;
    const scanX = 0, scanY = 0, statX = wide ? 36 : 34;      // a column clear of the 33-column scan
    return (t) => {
      const b = ctx.buffer;
      const tau = phase(t, 36);
      const reset = tau >= arriveAt;                          // back at the start scan, as at t = 0
      const k1 = !reset && tau >= 6 * K, k2 = !reset && tau >= 13.8 * K, hitE = !reset && tau >= 7.2 * K;
      const line = '-'.repeat(33);
      b.text(scanX, scanY, line, th.muted);
      b.text(scanX, scanY + 9, line, th.muted);
      const warping = tau >= warpAt && tau < arriveAt;
      for (let r = 1; r <= 8; r++) {
        if (warping) {                                        // the drive streak
          for (let x = 0; x < 33; x++) if (hash(x, r, Math.floor(tau * 20)) < 0.2) b.set(scanX + (x + Math.floor(tau * 40)) % 33, scanY + r, '-', th.info);
          continue;
        }
        for (let c = 1; c <= 8; c++) {
          const sx = scanX + 1 + (c - 1) * 4, sy = scanY + r;
          let g = null, col = th.dim;
          if (SCAN0.E[0] === c && SCAN0.E[1] === r) { g = '<*>'; col = th.info; }
          else if ((SCAN0.K[0][0] === c && SCAN0.K[0][1] === r && !k1) || (SCAN0.K[1][0] === c && SCAN0.K[1][1] === r && !k2)) { g = '+R+'; col = th.neg; }
          else if (SCAN0.base[0] === c && SCAN0.base[1] === r) { g = '>!<'; col = th.pos; }
          else if (SCAN0.stars.some(([x, y]) => x === c && y === r)) { g = ' * '; col = th.dim; }
          if (g) b.text(sx, sy, g, col, undefined, g === '<*>' ? 1 : 0);
        }
      }
      if (tau >= 3.8 * K && tau < 6 * K) {                    // the torpedo, one sector per step
        const [c, r] = TRACK[Math.min(TRACK.length - 1, Math.floor((tau - 3.8 * K) / (0.5 * K)))];
        b.text(scanX + 1 + (c - 1) * 4, scanY + r, ' + ', th.warn, undefined, 1);
      }
      if (tau >= 12.8 * K && tau < 13.4 * K) for (let x = 1; x < 22; x++) if ((x + Math.floor(tau * 30)) % 3 === 0) b.set(scanX + 4 + x, scanY + 6 - Math.round(x * 4 / 21), '.', th.warn);
      const red = !reset && !k2, energy = !reset && tau >= 12.8 * K ? 2360 : 2860, shields = hitE ? 186 : 400;
      const stat = wide
        ? [['CYCLE', '2306.4'], ['CONDITION', red || reset ? '*RED*' : 'GREEN'], ['QUADRANT', '4,7'], ['SECTOR', '2,6'], ['TORPEDOES', k1 ? '8' : '9'], ['TOTAL ENERGY', String(energy)], ['SHIELDS', String(shields)], ['RAIDERS REMAINING', String(14 - (k1 ? 1 : 0) - (k2 ? 1 : 0))]]
        : [['CYCL', '2306.4'], ['COND', red || reset ? '*RED*' : 'GREEN'], ['QUAD', '4,7'], ['SECT', '2,6'], ['TORP', k1 ? '8' : '9'], ['ENGY', String(energy)], ['SHLD', String(shields)], ['RAID', String(14 - (k1 ? 1 : 0) - (k2 ? 1 : 0))]];
      stat.forEach(([k, v], i) => { b.text(statX, scanY + 1 + i, k, th.muted); b.text(statX + (wide ? 20 : 6), scanY + 1 + i, v, k.startsWith('COND') ? (v === 'GREEN' ? th.pos : th.neg) : th.ink); });
      // the transcript under the scan, newest last
      const ty = scanY + 10, rows = H - ty;
      const shown = reset ? [] : S.filter((l) => l.at <= tau);
      const lines = shown.map((l) => l.f(tau)).slice(-Math.max(1, rows));
      if (!lines.length || tau >= arriveAt) lines.push(`COMMAND? ${Math.floor(tau * 2) % 2 ? '_' : ''}`);   // the prompt, cursor blinking
      lines.slice(-rows).forEach((s, i) => b.text(0, ty + i, s.slice(0, W), s.startsWith('***') ? th.neg : s.includes('?') ? th.warn : th.ink));
    };
  },
};

export default [blockStacker, dungeonCrawl, starship];
