// CLI + catalog browser: argument parsing, the non-interactive commands
// (list / galleries / info, text and --json, non-TTY behaviour), the layout and
// staging helpers, and scripted browse sessions driven through the VT emulator
// with fake keypresses.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
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
  assert.match(r.usage.npx, /^npx -y --package=https:\/\/prism\.jeremyfhall\.com\/dl\/prism-term-\d+\.\d+\.\d+\.tgz prism-term play plasma$/, 'pinned to this release (SHA256SUMS)');
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
  assert.equal(r.code, 2, 'a usage error');
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
  // No galleries pane (the header's instrument line still counts them).
  assert.doesNotMatch(scr.split('\n').slice(1).join('\n'), /GALLERIES/);
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

// ── input validation, exit codes, spin, man page + completions ───────────
test('usage errors exit 2 with a message that says what works; runtime errors exit 1', () => {
  const cases = [
    [['--dept', '16'], /unknown option --dept \(did you mean --depth\?\)/],
    [['list', '--palette', 'nope'], /unknown palette "nope"/],
    [['snapshot', 'plasma', '--set', 'nonsense=1'], /unknown parameter "nonsense"/],
    [['snapshot', 'plasma', '--set', 'speed=fast'], /speed is a number/],
    [['snapshot', 'plasma', '--set', 'speed'], /--set expects key=value/],
    [['list', '--kind', 'bogus'], /unknown --kind "bogus"\. Kinds: /],
    [['snapshot', 'plasma', '-o', 'frame.png'], /writes text, not images/],
    [['snapshot', 'plasma', '--size', '99999x99999'], /out of range \(1x1 … 1000x500\)/],
    [['snapshot', 'plasma', '--at', '1e9'], /--at expects a number from 0 to 600/],
    [['snapshot', 'plasma', '--fps', '0'], /--fps expects a number/],
    [['list', '--depth', 'lots'], /unknown --depth "lots"/],
    [['list', '--mode', 'pixels'], /unknown --mode "pixels"/],
    [['list', '--theme'], /--theme needs a value/],
    [['theme', 'nope'], /unknown format "nope"/],
    [['-x'], /unknown option -x/],
  ];
  for (const [args, msg] of cases) {
    const r = cli(...args);
    assert.equal(r.code, 2, `${args.join(' ')} → exit 2 (${r.err.trim()})`);
    assert.match(r.err, msg, args.join(' '));
  }
  assert.equal(cli('play', 'plasma').code, 1, 'no TTY is a runtime failure');
  const ok = cli('snapshot', 'plasma', '--size=20x4', '--mode', 'auto', '--set', 'speed=2');
  assert.equal(ok.code, 0, ok.err);
});

test('snapshot -o .ans writes ANSI, -o .txt writes the shaded mono frame, -o= works', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-snap-'));
  try {
    assert.equal(cli('snapshot', 'plasma', '--size', '30x6', `-o=${path.join(dir, 'p.ans')}`).code, 0);
    assert.match(fs.readFileSync(path.join(dir, 'p.ans'), 'utf8'), /\x1b\[38;2;/);
    assert.equal(cli('snapshot', 'plasma', '--size', '30x6', '-o', path.join(dir, 'p.txt')).code, 0);
    const txt = fs.readFileSync(path.join(dir, 'p.txt'), 'utf8');
    assert.doesNotMatch(txt, /\x1b/);
    assert.ok([...txt].filter((c) => '░▒▓█'.includes(c)).length > 60, 'a luminance ramp, not half blocks');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('spin: an argv reaches the program verbatim (no %VAR% expansion) and its stdout passes through', () => {
  const r = spawnSync(process.execPath, [CLI, 'spin', '--', process.execPath, '-e', "console.log(process.argv.slice(1).join('|'))", '%PATH%', 'a b', '!x!', 'q"t'], { encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' }, timeout: 60000 });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, '%PATH%|a b|!x!|q"t\n');
  const quiet = spawnSync(process.execPath, [CLI, 'spin', '--no-passthrough', '--', process.execPath, '-e', 'console.log(1)'], { encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' }, timeout: 60000 });
  assert.equal(quiet.stdout, '');
  const fail = spawnSync(process.execPath, [CLI, 'spin', '--', process.execPath, '-e', 'process.exit(3)'], { encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' }, timeout: 60000 });
  assert.equal(fail.status, 3);
});

test('winQuote: cmd.exe metacharacters are caret-escaped (twice for .cmd / .bat targets)', async () => {
  const { winQuote } = await import('../cli.js');
  assert.equal(winQuote('%PATH%'), '^"^%PATH^%^"');
  assert.equal(winQuote('a b'), '^"a^ b^"');
  assert.equal(winQuote('q"t'), String.raw`^"q\^"t^"`);
  assert.equal(winQuote('%X%', true), '^^^"^^^%X^^^%^^^"');
});

test('man page and bash / zsh / fish completions ship with the package and cover every command', () => {
  const ROOT = path.dirname(CLI);
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.ok(pkg.files.includes('man/') && pkg.files.includes('completions/'));
  assert.deepEqual(pkg.man, ['./man/prism-term.1']);
  const man = fs.readFileSync(path.join(ROOT, 'man', 'prism-term.1'), 'utf8');
  assert.ok(man.startsWith('.TH PRISM-TERM 1 ') && man.split('\n')[0].includes(`"prism-term ${pkg.version}"`), 'man page version = package version');
  const commands = ['play', 'showcase', 'list', 'galleries', 'info', 'snapshot', 'banner', 'spin', 'spinners', 'dashboard', 'demo', 'caps', 'themes', 'theme', 'palettes', 'help'];
  for (const c of commands) assert.ok(man.split('\n').some((l) => l.startsWith(`.B ${c}`) || l.startsWith(`.BI ${c}`) || l.startsWith(`.BI "${c}`)), `man: ${c}`);
  assert.match(man, /EXIT STATUS[\s\S]*usage error[\s\S]*129 for SIGHUP/);
  for (const f of ['prism-term.bash', '_prism-term', 'prism-term.fish']) {
    const s = fs.readFileSync(path.join(ROOT, 'completions', f), 'utf8');
    for (const c of commands) assert.ok(s.includes(c), `${f}: ${c}`);
    assert.match(s, /list --ids|_ids list/, `${f}: facet ids come from prism-term`);
  }
  const bash = spawnSync('bash', ['-n', path.join(ROOT, 'completions', 'prism-term.bash')], { encoding: 'utf8' });
  if (!bash.error) assert.equal(bash.status, 0, bash.stderr);
  const ids = cli('list', '--ids');
  assert.equal(ids.out.trim().split('\n').length, allFacets().length);
  assert.ok(cli('theme', '--ids').out.split('\n').includes('osc'));
});
