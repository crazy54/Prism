// CLI + catalog browser: argument parsing, the non-interactive commands
// (list / galleries / info, text and --json, non-TTY behaviour), the layout and
// staging helpers, and scripted browse sessions driven through the VT emulator
// with fake keypresses.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';
import { parseArgs, selectFacets, facetRecord, countOf } from '../cli.js';
import { gallery, layoutFor, buildModel, glyphsFor } from '../src/gallery.js';
import { play, stageRect, durationFor, asciify, facetPlace } from '../src/player.js';
import { allFacets, findFacet, GALLERIES } from '../src/facets/index.js';
import { VT, fakeTTY } from './vt.js';

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'cli.js');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Run the CLI with stdout as a pipe (i.e. not a TTY). */
function cli(...args) {
  const r = spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' }, timeout: 60000 });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

// ── parsing ───────────────────────────────────────────────────────────────

test('parseArgs: commands, ids, value and boolean flags', () => {
  const a = parseArgs(['play', 'plasma', 'tunnel', '--gallery', 'fx', '--category', 'Fields', '--duration', '5', '--json', '--no-hud']);
  assert.deepEqual(a._, ['play', 'plasma', 'tunnel']);
  assert.equal(a.gallery, 'fx');
  assert.equal(a.category, 'Fields');
  assert.equal(a.duration, '5');
  assert.equal(a.json, true);
  assert.equal(a.hud, false);
});

test('parseArgs: --set (repeatable, = in values), --key=value, -o and --', () => {
  const a = parseArgs(['snapshot', 'plasma', '--set', 'text=A=B', '--set=speed=2', '--theme=primer-dark', '-o', 'x.html', '--', 'echo', '--hi']);
  assert.deepEqual(a.set, { text: 'A=B', speed: '2' });
  assert.equal(a.theme, 'primer-dark');
  assert.equal(a.out, 'x.html');
  assert.deepEqual(a.rest, ['echo', '--hi']);
  assert.deepEqual(a._, ['snapshot', 'plasma']);
});

test('parseArgs: a boolean flag does not swallow the next positional', () => {
  const a = parseArgs(['list', '--json', 'extra']);
  assert.equal(a.json, true);
  assert.deepEqual(a._, ['list', 'extra']);
});

// ── selection + records ───────────────────────────────────────────────────

test('selectFacets: ids, --gallery (id or title), --category, --kind', async () => {
  const all = allFacets();
  assert.equal((await selectFacets({ _: [] })).length, all.length);
  const fx = await selectFacets({ _: [], gallery: 'fx' });
  assert.ok(fx.length > 0 && fx.every((f) => f.gallery === 'fx'));
  const byTitle = await selectFacets({ _: [], gallery: GALLERIES.find((g) => g.id === 'fx').title });
  assert.deepEqual(byTitle.map((f) => f.id), fx.map((f) => f.id));
  const plasma = findFacet('plasma');
  const cat = await selectFacets({ _: [], gallery: 'fx', category: plasma.category.toUpperCase() });
  assert.ok(cat.includes(plasma) && cat.every((f) => f.category === plasma.category));
  const kind = await selectFacets({ _: [], kind: 'spinner' });
  assert.ok(kind.every((f) => f.kind === 'spinner'));
  assert.deepEqual((await selectFacets({ _: ['plasma', 'tunnel'] })).map((f) => f.id), ['plasma', 'tunnel']);
});

test('selectFacets: helpful errors', async () => {
  await assert.rejects(selectFacets({ _: [], gallery: 'nope' }), /unknown gallery "nope"\. Galleries: fx, /);
  await assert.rejects(selectFacets({ _: [], category: 'No Such Category' }), /no facets in category/);
  await assert.rejects(selectFacets({ _: ['plasm-x'] }), /unknown facet "plasm-x"/);
  await assert.rejects(selectFacets({ _: ['tunnel-zz'] }), /Did you mean: .*tunnel/);
});

test('facetRecord: plain data with usage commands', () => {
  const r = facetRecord(findFacet('plasma'));
  assert.equal(r.setup, undefined);
  assert.deepEqual(JSON.parse(JSON.stringify(r)), r);
  assert.equal(r.usage.cli, 'prism-term play plasma');
  assert.match(r.usage.snapshot, /^prism-term snapshot plasma --size \d+x\d+$/);
  assert.match(r.usage.npx, /^npx -y --package=https:\/\/prism\.jeremyfhall\.com\/dl\/prism-term\.tgz prism-term play plasma$/);
  assert.equal(r.usage.curl, 'curl -sL https://prism.jeremyfhall.com/f/plasma');
});

// ── non-interactive commands (stdout is a pipe) ───────────────────────────

test('list --json: every facet, unique ids, no functions', () => {
  const { code, out } = cli('list', '--json');
  assert.equal(code, 0);
  const rows = JSON.parse(out);
  assert.equal(rows.length, allFacets().length);
  assert.equal(new Set(rows.map((r) => r.id)).size, rows.length);
  for (const r of rows) {
    for (const k of ['id', 'title', 'gallery', 'category', 'kind', 'size', 'minSize', 'animated', 'glyphs', 'color', 'usage']) assert.ok(k in r, `${r.id} has ${k}`);
  }
  const fx = JSON.parse(cli('list', '--gallery', 'fx', '--json').out);
  assert.ok(fx.length && fx.every((r) => r.gallery === 'fx'));
});

test('list: grouped by gallery and category with counts, untruncated when piped', () => {
  const { code, out } = cli('list', '--gallery', 'fx');
  assert.equal(code, 0);
  const fx = allFacets().filter((f) => f.gallery === 'fx');
  assert.match(out, new RegExp(`^FX STORE · ${fx.length}`, 'm'));
  const plasma = findFacet('plasma');
  assert.match(out, new RegExp(`^  ${plasma.category} \\(\\d+\\)$`, 'm'));
  assert.ok(out.includes(`plasma`) && out.includes(plasma.description), 'full description, not truncated');
  for (const g of GALLERIES) if (g.id !== 'fx') assert.ok(!out.includes(`\n${g.title.toUpperCase()} · `), `no ${g.id} section`);
  assert.match(out, new RegExp(`${fx.length} facets in 1 gallery · `));
});

test('galleries: one line per non-empty gallery, plus categories', () => {
  const { code, out } = cli('galleries');
  assert.equal(code, 0);
  const used = new Set(allFacets().map((f) => f.gallery));
  for (const id of used) assert.match(out, new RegExp(`^${id}\\s`, 'm'));
  const json = JSON.parse(cli('galleries', '--json').out);
  assert.ok(json.every((g) => typeof g.count === 'number' && Array.isArray(g.categories)));
});

test('info: human and --json', () => {
  const f = findFacet('plasma');
  const { code, out } = cli('info', 'plasma');
  assert.equal(code, 0);
  assert.match(out, /^Plasma\s+\(plasma\)/);
  assert.match(out, new RegExp(`size\\s+${f.size.w}×${f.size.h} \\(min ${f.minSize.w}×${f.minSize.h}\\)`));
  assert.match(out, /play\s+prism-term play plasma/);
  assert.match(out, /npx\s+npx -y --package=/);
  const j = JSON.parse(cli('info', 'plasma', '--json').out);
  assert.equal(j.id, 'plasma');
  assert.equal(j.usage.cli, 'prism-term play plasma');
});

test('errors: unknown facet, missing args, play without a TTY', () => {
  let r = cli('info', 'no-such-facet-zz');
  assert.equal(r.code, 1);
  assert.match(r.err, /^prism-term: unknown facet "no-such-facet-zz"/);
  r = cli('info');
  assert.match(r.err, /usage: prism-term info <id>/);
  r = cli('play');
  assert.match(r.err, /usage: prism-term play <id…> \| --gallery/);
  r = cli('play', 'plasma');
  assert.match(r.err, /needs an interactive terminal/);
  r = cli('play', '--gallery', 'nope');
  assert.match(r.err, /unknown gallery "nope"/);
});

test('no command and no TTY: prints the catalog list instead of opening the browser', () => {
  const { code, out } = cli();
  assert.equal(code, 0);
  assert.match(out, new RegExp(`${allFacets().length} facets in \\d+ galleries`));
  assert.ok(!out.includes('\x1b[?1049h'), 'never enters the alternate screen');
});

test('help documents the browser, commands and keys', () => {
  const { code, out } = cli('help');
  assert.equal(code, 0);
  assert.match(out, /^prism-term \d+\.\d+\.\d+ — Prism's terminal catalog: animated facets for any terminal\n/);
  for (const s of [
    'prism-term galleries', 'prism-term info <id>', 'play --gallery', 'showcase', 'snapshot', '/ search',
    'Keys in the catalog browser', 'Keys in the live player', 'Live player without installing',
    '  (under 110 columns: ←→ hl / Tab change gallery, g opens a gallery picker)',
    'AI triage demo (needs 100×34)',
  ]) assert.ok(out.includes(s), s);
});

test('UI copy uses US spelling ("color")', () => {
  assert.doesNotMatch(cli('help').out, /colour/i);
  // info's own labels — facet descriptions are the authors' data, so they're left out
  const f = findFacet('plasma');
  const labels = cli('info', 'plasma').out.split('\n').filter((l) => l !== f.description).join('\n');
  assert.match(labels, /needs\s+\S+ glyphs · (truecolor|mono|\d+ colors)$/m);
  assert.doesNotMatch(labels, /colour/i);
});

test('list footer: singular and plural', () => {
  assert.match(cli('list', 'plasma').out, /\n1 facet in 1 gallery · /);
  assert.match(cli('list', 'plasma', 'tunnel').out, /\n2 facets in 1 gallery · /);
  const two = allFacets().find((f) => f.gallery !== 'fx');
  assert.match(cli('list', 'plasma', 'tunnel', two.id).out, /\n3 facets in 2 galleries · /);
  assert.equal(countOf(1, 'gallery'), '1 gallery');
  assert.equal(countOf(0, 'facet'), '0 facets');
});

// `prism-term list | head`: the reader goes away early; that must be a quiet exit 0.
function pipeClosedEarly(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let err = '';
    child.stderr.on('data', (d) => { err += d; });
    child.stdout.once('data', () => child.stdout.destroy());
    child.on('close', (code) => resolve({ code, err }));
  });
}

test('pipe-safe: stdout closed early exits 0 without a stack trace', async () => {
  for (const args of [['list'], [], ['list', '--json'], ['galleries'], ['help'], ['snapshot', 'plasma']]) {
    const { code, err } = await pipeClosedEarly(args);
    assert.equal(code, 0, `${args.join(' ') || '(no command)'} exit code`);
    assert.equal(err, '', `${args.join(' ') || '(no command)'} stderr`);
  }
});

// ── layout + staging ──────────────────────────────────────────────────────

test('layoutFor: three panes wide, two at 80×24, one when narrow, tiny below that', () => {
  assert.equal(layoutFor(140, 40).kind, 'three');
  assert.equal(layoutFor(80, 24).kind, 'two');
  assert.equal(layoutFor(60, 20).kind, 'one');
  assert.equal(layoutFor(20, 5).kind, 'tiny');
  for (const W of [110, 140, 200, 400]) {
    const L = layoutFor(W, 50);
    assert.equal(L.gal.w + L.list.w + L.prev.w, W);
    assert.ok(L.prev.w >= 40);
  }
  const two = layoutFor(80, 24);
  assert.equal(two.list.w + two.prev.w, 80);
});

test('buildModel: taxonomy order, category headers, kind filter', () => {
  const facets = allFacets();
  const m = buildModel(facets);
  const order = GALLERIES.map((g) => g.id).filter((id) => m.some((g) => g.id === id));
  assert.deepEqual(m.map((g) => g.id), order);
  assert.equal(m.reduce((n, g) => n + g.facets.length, 0), facets.length);
  for (const g of m) assert.ok(g.rows[0].header, `${g.id} starts with a category header`);
  const spin = buildModel(facets, 'spinner');
  assert.equal(spin.length, m.length, 'galleries stay put; only their lists shrink');
  assert.ok(spin.every((g) => g.facets.every((f) => f.kind === 'spinner')));
});

test('stageRect: scenes fill, small facets stay at designed size, never below minSize', () => {
  const scene = { kind: 'scene', size: { w: 80, h: 24 }, minSize: { w: 20, h: 8 } };
  assert.deepEqual(stageRect(scene, 120, 40), { x: 0, y: 0, w: 120, h: 40, fill: true, tooSmall: false });
  const spin = { kind: 'spinner', size: { w: 44, h: 5 }, minSize: { w: 20, h: 1 } };
  assert.deepEqual(stageRect(spin, 100, 31, { grow: 1 }), { x: 28, y: 13, w: 44, h: 5, fill: false, tooSmall: false });
  const chart = { kind: 'chart', size: { w: 52, h: 5 }, minSize: { w: 30, h: 4 } };
  const grown = stageRect(chart, 200, 60, { grow: 1.5 });
  assert.deepEqual([grown.w, grown.h], [78, 8]);
  const shrunk = stageRect(chart, 40, 10, { grow: 1.5 });
  assert.deepEqual([shrunk.w, shrunk.h, shrunk.tooSmall], [40, 5, false]);
  const cramped = stageRect(chart, 20, 3);
  assert.equal(cramped.tooSmall, true);
  assert.ok(cramped.w >= 30 && cramped.h >= 4);
});

test('durationFor: explicit, per-facet function, stills, loop length clamp', () => {
  assert.equal(durationFor({ animated: true, loop: 30 }, 5), 5);
  assert.equal(durationFor({ animated: true, id: 'a' }, (f) => (f.id === 'a' ? 2 : 9)), 2);
  assert.equal(durationFor({ animated: false }), 4);
  assert.equal(durationFor({ animated: true, loop: 2 }), 6);
  assert.equal(durationFor({ animated: true, loop: 30 }), 12);
});

test('ASCII fallbacks: UI glyphs and catalog typography are 7-bit', () => {
  for (const v of Object.values(glyphsFor(false))) assert.match(v, /^[\x20-\x7e]+$/);
  assert.equal(asciify('a — b × c … d · e ≥ f'), 'a - b x c ... d - e >= f');
  assert.equal(asciify('Café naïve é █'), 'Cafe naive e #', 'accents and blocks fold like facet output');
  for (const f of allFacets()) assert.match(asciify(`${f.title} ${f.description} ${facetPlace(f, ' - ')}`), /^[\x20-\x7e]*$/, f.id);
});

// ── scripted browse sessions through the VT emulator ──────────────────────

const CAPS = {
  unicode: (w, h) => ({ isTTY: true, depth: 'truecolor', unicode: true, braille: true, sextant: true, width: w, height: h, program: 'test', platform: 'linux' }),
  ascii: (w, h) => ({ isTTY: true, depth: '16', unicode: false, braille: false, sextant: false, width: w, height: h, program: 'linux-console', platform: 'linux' }),
  mono: (w, h) => ({ isTTY: true, depth: 'mono', unicode: true, braille: true, sextant: false, width: w, height: h, program: 'no-color', platform: 'linux' }),
};

function session({ w = 140, h = 40, caps = 'unicode', opts = {} } = {}) {
  const out = fakeTTY({ columns: w, rows: h });
  const input = Object.assign(new EventEmitter(), { isTTY: true, setRawMode() {}, resume() {}, pause() {} });
  let vt = new VT(w, h);
  const run = gallery(allFacets(), { output: out, input, caps: CAPS[caps](w, h), ...opts });
  const s = {
    raw: '',
    get vt() { return vt; },
    key(name, seq = name, extra = {}) { input.emit('keypress', seq, { name, sequence: seq, ...extra }); },
    type(str) { for (const c of str) s.key(/[a-z0-9]/.test(c) ? c : undefined, c); },
    async screen(ms = 250) {
      await sleep(ms);
      const chunk = out.chunks.splice(0).join('');
      s.raw += chunk;
      vt.feed(chunk);
      return vt.text();
    },
    async resize(w2, h2) {
      out.columns = w2; out.rows = h2;
      await s.screen(50);
      vt = new VT(w2, h2);
      out.emit('resize');
    },
    async quit() {
      s.key('q', 'q');
      await sleep(80);
      s.key('q', 'q'); // in case a player was still up
      const r = await Promise.race([run.then(() => 'done'), sleep(3000).then(() => 'timeout')]);
      s.raw += out.chunks.splice(0).join('');
      vt.feed(s.raw.slice(s.raw.lastIndexOf('\x1b[?1049l')));
      return r;
    },
  };
  return s;
}

test('browse 140×40: three panes, search, help, gallery picker, play and back, clean exit', async () => {
  const s = session({ w: 140, h: 40 });
  let scr = await s.screen(300);
  const fx = GALLERIES.find((g) => g.id === 'fx');
  assert.match(scr, /GALLERIES/);
  assert.match(scr, new RegExp(`${fx.title.toUpperCase()} · \\d+`));
  assert.match(scr, /\$ prism-term play plasma/, 'info strip shows the exact command');
  assert.match(scr, /▸ Plasma/);
  assert.match(scr, /\? help {2}q quit/);

  s.key('down');
  scr = await s.screen();
  assert.match(scr, /\$ prism-term play tunnel/);

  // Incremental search across the whole catalog.
  s.key(undefined, '/');
  s.type('spark');
  scr = await s.screen();
  assert.match(scr, /SEARCH/);
  assert.match(scr, /\/ spark/);
  const n = Number(scr.match(/(\d+) match/)[1]);
  assert.ok(n > 0 && n < allFacets().length);
  s.key('return', '\r');
  scr = await s.screen();
  assert.doesNotMatch(scr, /SEARCH/);
  assert.match(scr, /CHARTS|SPINNERS|PROGRESS|STATUS/i);
  assert.match(scr, /\$ prism-term play \S*spark/);

  s.key(undefined, '?');
  scr = await s.screen();
  assert.match(scr, /KEYS/);
  assert.match(scr, /Search everything/);
  s.key('x', 'x');
  scr = await s.screen();
  assert.doesNotMatch(scr, /Search everything/);

  s.key('g', 'g');
  scr = await s.screen();
  assert.match(scr, /GO TO GALLERY/);
  s.key('escape', '\x1b');
  s.key('home');
  scr = await s.screen();

  // Kind filter shows up in the header.
  s.key('f', 'f');
  scr = await s.screen();
  assert.match(scr.split('\n')[0], /kind: scene/);
  s.key('f', 'F', { shift: true });
  scr = await s.screen();
  assert.match(scr.split('\n')[0], /kind: all/);

  // Play fullscreen, then come back to the browser.
  s.key('return', '\r');
  scr = await s.screen(400);
  const hud = scr.split('\n').at(-1);
  assert.match(hud, /◆ /);
  assert.match(hud, /\d+\/\d+/, 'playlist position');
  assert.doesNotMatch(scr, /GALLERIES/);
  s.key('escape', '\x1b');
  scr = await s.screen(300);
  assert.match(scr, /GALLERIES/);

  assert.equal(await s.quit(), 'done');
  assert.equal(s.vt.modes.get(1049), false, 'left the alternate screen');
  assert.equal(s.vt.modes.get(25), true, 'cursor visible again');
});

test('browse 80×24: two panes with a gallery switcher; resize to wide brings back three', async () => {
  const s = session({ w: 80, h: 24 });
  let scr = await s.screen(300);
  assert.doesNotMatch(scr, /GALLERIES/);
  assert.match(scr, /◀ FX Store · \d+ ▶/);
  for (const line of scr.split('\n')) assert.ok(line.length <= 80);
  assert.match(scr.split('\n').at(-1), /q quit/, 'key bar fits');
  s.key('right');
  scr = await s.screen();
  const second = buildModel(allFacets())[1];
  assert.match(scr, new RegExp(`◀ ${second.title} · ${second.facets.length} ▶`));
  await s.resize(140, 40);
  scr = await s.screen(300);
  assert.match(scr, /GALLERIES/);
  assert.equal(await s.quit(), 'done');
});

test('browse in an ASCII-only terminal: nothing outside 7-bit on screen, browse and play', async () => {
  const s = session({ w: 100, h: 30, caps: 'ascii' });
  let scr = await s.screen(300);
  assert.match(scr, /^[\x00-\x7e]*$/);
  assert.match(scr, /\+- < FX Store - \d+ > -/);
  s.key('return', '\r');
  scr = await s.screen(400);
  assert.match(scr, /^[\x00-\x7e]*$/, 'player HUD and facet are ASCII too');
  s.key('escape', '\x1b');
  s.key(undefined, '/');
  s.type('do');
  scr = await s.screen();
  assert.match(scr, /^[\x00-\x7e]*$/);
  assert.equal(await s.quit(), 'done');
});

test('browse with NO_COLOR (mono): no color SGR, selection shown with inverse video', async () => {
  const s = session({ w: 120, h: 34, caps: 'mono' });
  await s.screen(300);
  assert.doesNotMatch(s.raw, /\x1b\[[0-9;]*(?:38|48);[25];/, 'no 256/truecolor sequences');
  assert.doesNotMatch(s.raw, /\x1b\[(?:3|4|9|10)[0-7]m/, 'no 16-color sequences');
  assert.match(s.raw, /\x1b\[(?:[0-9;]*;)?7[;m]/, 'inverse video for highlights');
  assert.equal(await s.quit(), 'done');
});

// OSC 0/1/2 = set title; CSI 22/23 t = push/pop the terminal's own title.
const SETS_TITLE = /\x1b\][012];/;

test('window title: the catalog browser and live player leave it alone by default', async () => {
  const s = session({ w: 120, h: 34 });
  await s.screen(300);
  s.key('return', '\r');
  await s.screen(300);
  assert.equal(await s.quit(), 'done');
  assert.doesNotMatch(s.raw, SETS_TITLE);
  assert.doesNotMatch(s.raw, /\x1b\[2[23];0t/);
});

async function playOnce(opts) {
  const out = fakeTTY({ columns: 100, rows: 30 });
  const input = Object.assign(new EventEmitter(), { isTTY: true, setRawMode() {}, resume() {}, pause() {} });
  const run = play([findFacet('plasma')], { output: out, input, caps: CAPS.unicode(100, 30), ...opts });
  await sleep(200);
  input.emit('keypress', 'q', { name: 'q', sequence: 'q' });
  await run;
  return out.output;
}

test('window title: an explicit title is pushed first and popped after the screen is restored', async () => {
  assert.doesNotMatch(await playOnce({}), SETS_TITLE);
  const raw = await playOnce({ title: 'Release demo' });
  const push = raw.indexOf('\x1b[22;0t'), set = raw.indexOf('\x1b]0;Release demo\x07');
  const altOff = raw.lastIndexOf('\x1b[?1049l'), pop = raw.lastIndexOf('\x1b[23;0t');
  assert.ok(push >= 0 && set > push, 'push before set');
  assert.ok(altOff > set && pop > altOff, 'pop after leaving the alternate screen');
  assert.equal(raw.split('\x1b[23;0t').length - 1, 1, 'popped exactly once');
  assert.equal(process.listenerCount('exit') <= 1, true, 'exit hook removed');
});

test('browse at a huge size and at a tiny one', async () => {
  const big = session({ w: 320, h: 100 });
  const scr = await big.screen(300);
  assert.match(scr, /GALLERIES/);
  assert.equal(await big.quit(), 'done');
  const tiny = session({ w: 24, h: 6 });
  assert.match(await tiny.screen(200), /too small/);
  assert.equal(await tiny.quit(), 'done');
});

test('browse --gallery opens at that gallery', async () => {
  const s = session({ w: 140, h: 40, opts: { gallery: 'loaders' } });
  const scr = await s.screen(300);
  const g = GALLERIES.find((x) => x.id === 'loaders');
  if (allFacets().some((f) => f.gallery === 'loaders')) assert.match(scr, new RegExp(`${g.title.toUpperCase()} · \\d+`));
  assert.equal(await s.quit(), 'done');
});
