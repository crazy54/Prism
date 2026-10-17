// Stateful facets (API 1.5): the game host (scene/game.js), the exemplar games, the tick budget,
// and the runtime hooks — web player input routing (DOM-free part) and the hid runner.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findFacet } from '../src/facets/index.js';
import { normalizeFacet, validateFacet, GAME_TICK_MAX_HZ } from '../src/facets/schema.js';
import { render } from '../src/render.js';
import { FAMILY_DEVICES, getDevice } from '../src/devices.js';
import {
  createGameHost, replayGame, rngSeed, rngNext, rngInt, rngShuffle, mix32, isPlainJson,
  TICK_MAX_HZ, GAME_FPS, GAME_STATE_MAX,
} from '../src/scene/game.js';
import { toggle } from '../src/facets/games/lights-out.js';
import { gameInput, gameFps } from '../src/web/player.js';
import { createRunner, resolveLayout, MODEL_BY_ID } from '../src/hid/index.js';

const lightsOut = findFacet('game-lights-out');
const dice = findFacet('game-dice');

/** GF(2) elimination: the presses that clear a Lights Out board, or null if none exist. */
function solve(lights, cols, rows) {
  const N = cols * rows, A = [];
  for (let i = 0; i < N; i++) {
    const row = new Array(N + 1).fill(0), c = i % cols, r = Math.floor(i / cols);
    for (const [dc, dr] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) { const x = c + dc, y = r + dr; if (x >= 0 && x < cols && y >= 0 && y < rows) row[y * cols + x] = 1; }
    row[N] = lights[i] === '1' ? 1 : 0;
    A.push(row);
  }
  let r = 0; const piv = [];
  for (let c = 0; c < N && r < N; c++) {
    let p = -1;
    for (let i = r; i < N; i++) if (A[i][c]) { p = i; break; }
    if (p < 0) continue;
    [A[r], A[p]] = [A[p], A[r]];
    for (let i = 0; i < N; i++) if (i !== r && A[i][c]) for (let j = c; j <= N; j++) A[i][j] ^= A[r][j];
    piv.push(c); r++;
  }
  for (let i = r; i < N; i++) if (A[i][N]) return null;
  const x = new Array(N).fill(0);
  piv.forEach((c, i) => { x[c] = A[i][N]; });
  return x.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
}

/** A test-only game that ticks while running: press starts, ticks count, press again stops. */
const ticker = normalizeFacet({
  id: 'game-test-ticker', title: 'Ticker', category: 'Reflex', description: 'A test game: ticks only while it runs; the count of ticks is the score.', tags: ['test'],
  surface: 'key', animated: false,
  game: {
    tickHz: 9,   // asks for more than the host allows
    ticking: (s) => s.running,
    init: () => ({ running: false, count: 0 }),
    reduce: (s, ev) => (ev.type === 'press' ? { ...s, running: !s.running } : ev.type === 'tick' && s.running ? { ...s, count: s.count + 1 } : s),
  },
  render: () => '<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 72 72"><rect width="72" height="72" fill="#000000"/></svg>',
}, 'games/ticker.js');

test('seeded randomness lives in the state: rngNext / rngInt / rngShuffle are pure and reproducible', () => {
  const r0 = rngSeed(42);
  assert.equal(rngSeed(42), r0);
  assert.notEqual(rngSeed(43), r0);
  const [a, r1] = rngNext(r0), [b] = rngNext(r0);
  assert.equal(a, b, 'same state → same draw');
  assert.ok(a >= 0 && a < 1 && r1 !== r0);
  const counts = new Array(6).fill(0);
  let r = r0;
  for (let i = 0; i < 6000; i++) { let k; [k, r] = rngInt(r, 6); counts[k]++; }
  assert.ok(counts.every((c) => c > 850 && c < 1150), `rngInt is roughly uniform: ${counts}`);
  const [sh] = rngShuffle(r0, [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual([...sh].sort(), [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(rngShuffle(r0, [1, 2, 3, 4, 5, 6, 7])[0], sh);
  assert.notEqual(mix32(1, 2), mix32(2, 1));
  assert.ok(isPlainJson({ a: [1, 'x', null, true, { b: 2 }] }) && !isPlainJson({ a: undefined }) && !isPlainJson({ d: new Date(0) }) && !isPlainJson({ n: NaN }));
});

test('schema: the game block is validated (functions, tick rate, surfaces, games gallery)', () => {
  assert.equal(TICK_MAX_HZ, GAME_TICK_MAX_HZ);
  const base = { id: 'game-x', title: 'X', category: 'Puzzles', description: 'A game facet used to exercise the schema rules.', tags: ['x'], render: () => '' };
  const errs = (raw, file = 'games/x.js') => validateFacet(normalizeFacet(raw, file));
  assert.deepEqual(errs({ ...base, game: { init: () => ({}), reduce: (s) => s } }), []);
  assert.match(errs({ ...base }).join(), /declare a `game`/);
  assert.match(errs({ ...base, game: { init: () => ({}) } }).join(), /reduce/);
  assert.match(errs({ ...base, game: { init: () => ({}), reduce: (s) => s, tickHz: 8, ticking: () => true } }).join(), /tickHz/);
  assert.match(errs({ ...base, game: { init: () => ({}), reduce: (s) => s, tickHz: 2 } }).join(), /ticking/);
  assert.match(errs({ ...base, surface: 'strip', game: { init: () => ({}), reduce: (s) => s } }).join(), /games live on/);
});

test('Lights Out: every board on every device is solvable, solving wins, the next press deals a harder level', () => {
  for (const id of FAMILY_DEVICES) {
    const dev = getDevice(id);
    if (!dev.cols || !dev.keyPx) continue;
    for (const difficulty of ['easy', 'normal', 'hard']) for (let seed = 1; seed <= 6; seed++) {
      const h = createGameHost(lightsOut, { device: id, seed, params: { difficulty } });
      const s = h.state;
      assert.equal(s.lights.length, s.cols * s.rows);
      assert.ok(s.lights.includes('1'), `${id}/${seed}: a board starts with lights on`);
      const moves = solve(s.lights, s.cols, s.rows);
      assert.ok(moves, `${id} ${difficulty} seed ${seed}: unsolvable board ${s.lights}`);
      if (difficulty !== 'normal' || seed > 2) continue;
      moves.forEach((cell, i) => h.dispatch({ type: 'press', key: h.grid.cells[cell].i, t: i }));
      assert.equal(h.state.solved, true, `${id}: pressing the solution solves it`);
      assert.equal(h.state.moves, moves.length);
      h.dispatch({ type: 'press', key: h.grid.cells[0].i, t: 50 });
      assert.equal(h.state.level, 2);
      assert.equal(h.state.solved, false);
      assert.ok(solve(h.state.lights, s.cols, s.rows), `${id}: level 2 is solvable`);
      assert.ok(h.state.par >= s.par);
    }
  }
  assert.equal(toggle('000000000', 3, 3, 4), '010111010', 'a press flips the key and its four neighbors');
  assert.equal(toggle('000000000', 3, 3, 0), '110100000');
});

test('host: events carry cell / col / row within the facet, unknown types throw, reset reseeds, log replays', () => {
  // a 3 × 2 span starting at column 1 of an MK.2: device key 1 is the span's cell 0
  const h = createGameHost(lightsOut, { device: 'mk2', span: { col: 1, row: 1, cols: 3, rows: 2 }, seed: 5, log: true });
  assert.deepEqual([h.grid.cols, h.grid.rows], [3, 2]);
  assert.deepEqual(h.grid.cells.map((c) => c.i), [6, 7, 8, 11, 12, 13]);
  const before = h.state.lights;
  const r = h.dispatch({ type: 'press', key: 12, t: 1 });
  assert.deepEqual([r.event.cell, r.event.col, r.event.row, r.event.n], [4, 1, 1, 1]);
  assert.ok(r.changed);
  assert.equal(h.state.lights, toggle(before, 3, 2, 4));
  const outside = h.dispatch({ type: 'press', key: 0, t: 2 });
  assert.equal(outside.event.cell, null);
  assert.equal(outside.changed, false, 'a key outside the span changes nothing');
  assert.throws(() => h.dispatch({ type: 'swipe', t: 3 }), /unknown game event/);
  const reset = h.reset(4);
  assert.ok(reset.changed);
  assert.equal(h.state.moves, 0);
  assert.equal(h.log.length, 3);
  assert.deepEqual(replayGame(lightsOut, { device: 'mk2', span: { col: 1, row: 1, cols: 3, rows: 2 }, seed: 5 }, h.log), h.state);
  // a snapshot for another grid starts fresh (the user resized the span)
  const other = createGameHost(lightsOut, { device: 'mk2', seed: 5, snapshot: h.snapshot() });
  assert.equal(other.state.lights.length, 15);
  assert.ok(JSON.stringify(h.snapshot()).length < GAME_STATE_MAX);
});

test('budget: games render only during transitions or while ticking; ticks ≤ 4 Hz and only while needed', () => {
  // the exemplars never tick and go static after their transition
  for (const [f, opts] of [[lightsOut, { device: 'mk2' }], [dice, {}]]) {
    const h = createGameHost(f, { ...opts, seed: 3 });
    assert.equal(h.needsTick(), false);
    assert.equal(h.fps(0), 0, `${f.id}: idle at start`);
    h.dispatch({ type: 'press', key: 7, t: 10 });
    assert.equal(h.fps(10.1), Math.min(GAME_FPS, f.fps || GAME_FPS), `${f.id}: animates the transition`);
    assert.equal(h.fps(10 + (f.game.animate ?? 0.6) + 0.5), 0, `${f.id}: static once the transition is over`);
    assert.equal(h.pump(20), false, 'no ticks for a game that never needs them');
    assert.equal(h.n, 1);
  }
  // a ticking game: clamped to TICK_MAX_HZ, ticks only while running
  const h = createGameHost(ticker, { seed: 1 });
  assert.equal(h.tickHz, TICK_MAX_HZ);
  const run = (t0, t1) => { let n = 0; for (let t = t0; t <= t1; t += 1 / 60) if (h.pump(t)) n++; return n; };
  assert.equal(run(0, 5), 0, 'not running: no ticks');
  h.dispatch({ type: 'press', t: 5 });
  assert.equal(h.needsTick(), true);
  assert.equal(h.fps(9), TICK_MAX_HZ, 'after the transition it renders at the tick rate');
  const ticks = run(5, 15);
  assert.ok(ticks >= 39 && ticks <= 40, `≈ 4 Hz for 10 s: ${ticks}`);
  assert.equal(h.state.count, ticks);
  h.dispatch({ type: 'press', t: 15.01 });
  assert.equal(run(15.02, 25), 0, 'stopped: no more ticks');
  assert.equal(h.fps(25), 0);
  assert.equal(gameFps(h, 25, { still: true }), 0);
});

test('web player: inputs route to the game (press / release / push / rotate / touch / reset) and only changed keys redraw', () => {
  const h = createGameHost(lightsOut, { device: 'mk2', seed: 9 });
  const opts = { device: 'mk2', seed: 9, idPrefix: 'web' };
  const keysAt = (t) => new Map(render(lightsOut, { ...opts, ...h.renderOpts(t) }).keys.map((k) => [k.i, k.svg]));
  const before = keysAt(0);
  const r = gameInput(h, { type: 'press', key: 7 }, 1);
  assert.equal(r.event.type, 'press');
  assert.equal(r.event.cell, 7);
  assert.ok(gameFps(h, 1.05) > 0, 'the press starts a transition');
  const after = keysAt(5);
  const changed = [...after].filter(([i, svg]) => before.get(i) !== svg).map(([i]) => i).sort((a, b) => a - b);
  assert.deepEqual(changed, [2, 6, 7, 8, 12], 'only the toggled keys changed (the player puts only those)');
  assert.equal(gameInput(h, { type: 'release', key: 7 }, 1.2).changed, false);
  assert.equal(gameInput(h, { type: 'push', dial: 1 }, 2).event.dial, 1);
  assert.equal(gameInput(h, { type: 'rotate', dial: 0, ticks: -2 }, 2).event.ticks, -2);
  const touch = gameInput(h, { type: 'touch', x: 310, y: 40, hold: true }, 3).event;
  assert.deepEqual([touch.x, touch.y, touch.hold], [310, 40, true]);
  const moves = h.state.moves;
  assert.ok(gameInput(h, { type: 'reset' }, 4).changed);
  assert.equal(h.state.moves, 0);
  assert.ok(moves >= 1);
  // dice: a single key, the tumble is drawn from the event age, the result from the state
  const d = createGameHost(dice, { seed: 4 });
  const still = render(dice, { size: 144, ...d.renderOpts(0) }).svg;
  gameInput(d, { type: 'press' }, 1);
  const frames = [0.1, 0.3, 0.5].map((a) => render(dice, { size: 144, ...d.renderOpts(1 + a) }).svg);
  assert.equal(new Set(frames).size, 3, 'the roll animates');
  const settled = render(dice, { size: 144, ...d.renderOpts(5) }).svg;
  assert.equal(render(dice, { size: 144, ...d.renderOpts(9) }).svg, settled, 'static once landed');
  assert.notEqual(settled, still);
});

test('hid runner: a game span takes key presses, holds reset it, and only changed keys are redrawn', async () => {
  let ms = 0; const timers = new Set();
  const clock = { now: () => ms, setTimer: (fn, d) => { const h = { at: ms + Math.max(0, d), fn }; timers.add(h); return h; }, clearTimer: (h) => timers.delete(h) };
  const advance = async (d) => {
    const end = ms + d;
    for (;;) {
      const next = [...timers].sort((a, b) => a.at - b.at)[0];
      if (!next || next.at > end) break;
      timers.delete(next); ms = next.at; next.fn();
      await new Promise((r) => setImmediate(r));
    }
    ms = end;
    await new Promise((r) => setImmediate(r));
  };
  const model = MODEL_BY_ID.mk2;
  const sent = [];
  const deck = { model, on() {}, off() {}, setKey: async (key) => { sent.push(key); }, setLcd: async () => {}, flush: async () => {} };
  const layout = resolveLayout(model, { spans: [{ facet: 'game-lights-out' }] });
  assert.deepEqual(layout.problems, []);
  const games = [];
  const run = createRunner(deck, layout, { ...clock, wallNow: () => Date.UTC(2026, 9, 15, 9, 41), tzOffset: () => 0, rasterize: async (svg, w, h) => ({ width: w, height: h, svg }), gameSeed: () => 17, onGame: (g) => games.push(g) });
  await run.start();
  await advance(10);
  assert.equal(sent.length, 15, 'first frame: every key');
  const slot = layout.slots[0];
  const lights = slot.game.state.lights;
  sent.length = 0;
  run.handle({ type: 'down', key: 7 });
  await advance(100);
  run.handle({ type: 'up', key: 7 });
  await advance(2000);
  assert.equal(slot.game.state.lights, toggle(lights, 5, 3, 7));
  assert.deepEqual([...new Set(sent)].sort((a, b) => a - b), [2, 6, 7, 8, 12], 'only the toggled keys were sent');
  assert.equal(slot.sched.active(), false, 'idle again after the transition');
  assert.deepEqual(games.map((g) => g.event.type), ['press', 'release']);
  run.handle({ type: 'down', key: 0 });
  await advance(1600);
  assert.equal(games.at(-1).event.type, 'reset', 'holding a game key deals a new game');
  run.handle({ type: 'up', key: 0 });
  await advance(2000);
  await run.stop();
});
