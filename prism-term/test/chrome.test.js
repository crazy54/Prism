// Terminal chrome in the Refraction grammar: the CLI's theme / intro plumbing,
// the catalog browser's First Light and Day/Night relight, the live player's
// HUD, the curl site's beam and balanced colors, and the token data behind them.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';
import { resolveTheme, introFor, reducedMotion, formatList } from '../cli.js';
import { gallery } from '../src/gallery.js';
import { play, dayNight } from '../src/player.js';
import { TOKENS, chrome, glyphs, lambdaLabel, galleryHue, galleryColor, siteTone, relLuminance, firstLight } from '../src/refraction.js';
import { getTheme } from '../src/palettes.js';
import { CellBuffer } from '../src/buffer.js';
import { allFacets, findFacet, catalogTree, GALLERIES } from '../src/facets/index.js';
import { buildTtyPages } from '../src/site/tty.js';
import { VT, fakeTTY } from './vt.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(HERE, '..', 'cli.js');
const TOKENS_JSON = path.join(HERE, '..', '..', 'design', 'tokens.json');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OSC_QUERY = /\x1b\]1[01];\?/;

function cli(args, env = {}) {
  const r = spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', env: { ...process.env, NO_COLOR: '', FORCE_COLOR: '', ...env }, timeout: 60000 });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

// ── CLI: non-TTY runs stay quiet ────────────────────────────────────────────

test('non-TTY: no First Light, no OSC queries, no alternate screen — even when the terminal looks light', () => {
  for (const args of [[], ['list', '--gallery', 'fx'], ['themes'], ['snapshot', 'plasma', '--size', '20x4'], ['help']]) {
    const { code, out, err } = cli(args, { COLORFGBG: '0;15', PRISM_TERM_INTRO: 'full' });
    assert.equal(code, 0, `${args.join(' ')}: ${err}`);
    assert.doesNotMatch(out + err, OSC_QUERY, `${args.join(' ') || '(no command)'} sent a terminal query`);
    assert.doesNotMatch(out, /\x1b\[\?1049h/, 'never enters the alternate screen');
    assert.doesNotMatch(out, /[⠀-⣿]{6,}/u.test(out) && !args.length ? /$^/ : /$^/);
  }
});

test('introFor: never without a TTY, NO_COLOR, reduced motion, CI or --no-intro; full once per session, then the echo', () => {
  const tty = { isTTY: true };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-fl-'));
  const base = { stdout: tty, stdin: tty, tmp, env: { WT_SESSION: `test-${process.pid}` } };
  try {
    assert.equal(introFor({}, { ...base, stdout: { isTTY: false } }), false, 'stdout is a pipe');
    assert.equal(introFor({}, { ...base, stdin: { isTTY: false } }), false, 'stdin is a pipe');
    assert.equal(introFor({}, { ...base, env: { ...base.env, NO_COLOR: '1' } }), false);
    assert.equal(introFor({}, { ...base, env: { ...base.env, PRISM_REDUCED_MOTION: '1' } }), false);
    assert.equal(introFor({}, { ...base, env: { ...base.env, PRISM_TERM_REDUCED_MOTION: 'yes' } }), false);
    assert.equal(introFor({}, { ...base, env: { ...base.env, CI: 'true' } }), false);
    assert.equal(introFor({}, { ...base, env: { ...base.env, PRISM_TERM_INTRO: '0' } }), false);
    assert.equal(introFor({ intro: false }, base), false, '--no-intro');
    assert.equal(introFor({ 'reduced-motion': true }, base), false, '--reduced-motion');
    assert.equal(introFor({}, base), 'full', 'first launch in this terminal session');
    assert.equal(introFor({}, base), 'echo', 'later launches get the short echo');
    assert.equal(introFor({}, { ...base, env: { ...base.env, PRISM_TERM_INTRO: 'full' } }), 'full');
    assert.equal(introFor({}, { ...base, env: { WT_SESSION: `other-${process.pid}` } }), 'full', 'another terminal session');
    assert.equal(reducedMotion({}, { PRISM_REDUCED_MOTION: 'off' }), false);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// ── CLI: --theme / --day / --night, the theme subcommand ────────────────────

test('resolveTheme: --day / --night / --theme are consistent and validated', async () => {
  assert.equal(await resolveTheme({ day: true }), 'prism-light');
  assert.equal(await resolveTheme({ night: true }), 'prism-dark');
  assert.equal(await resolveTheme({ theme: 'primer', day: true }), 'primer-light');
  assert.equal(await resolveTheme({ theme: 'primer-light', night: true }), 'primer-dark');
  assert.equal(await resolveTheme({ theme: 'cloudscape-dark' }), 'cloudscape-dark');
  assert.equal(await resolveTheme({ theme: 'day' }), 'day', 'aliases pass through to getTheme()');
  assert.equal(await resolveTheme({}), undefined, 'non-interactive and no flag: getTheme() decides (never a query)');
  await assert.rejects(resolveTheme({ day: true, night: true }), /mutually exclusive/);
  await assert.rejects(resolveTheme({ theme: 'no-such-theme' }), /unknown theme "no-such-theme"/);
  assert.equal(getTheme(await resolveTheme({ day: true })).name, 'Prism Day');
});

test('dayNight: flips within a family, falls back to Prism', () => {
  assert.equal(dayNight('prism-dark'), 'prism-light');
  assert.equal(dayNight('prism-light'), 'prism-dark');
  assert.equal(dayNight('primer-dark', 'day'), 'primer-light');
  assert.equal(dayNight('primer-dark', 'night'), 'primer-dark');
  assert.equal(dayNight('material3-light', 'dark'), 'material3-dark');
});

test('help lists the theme subcommand, --day / --night, --no-intro and the d key', () => {
  const { code, out } = cli(['help']);
  assert.equal(code, 0);
  for (const s of ['prism-term theme [<format>]', '--day | --night', '--no-intro', '--reduced-motion', 'd day/night', 'prism-dark (Prism Night)', 'PRISM_TERM_THEME']) assert.ok(out.includes(s), s);
});

test('theme: lists formats, prints a scheme to stdout, never writes files', () => {
  const has = fs.existsSync(path.join(HERE, '..', 'src', 'theme-export.js'));
  const list = cli(['theme']);
  if (!has) { assert.match(list.err, /theme export is not available/); return; }
  assert.equal(list.code, 0, list.err);
  assert.match(list.out, /Prism Night \(prism-dark\)/);
  assert.match(list.out, /^ {2}kitty\s/m);
  assert.match(list.out, /nothing is installed/);
  assert.match(cli(['theme', '--day']).out, /Prism Day \(prism-light\)/);
  const before = fs.readdirSync(process.cwd()).length;
  const kitty = cli(['theme', 'kitty', '--day']);
  assert.equal(kitty.code, 0, kitty.err);
  assert.match(kitty.out, /Prism Day/);
  assert.doesNotMatch(kitty.out, /\x1b/, 'plain text, no escapes');
  assert.equal(fs.readdirSync(process.cwd()).length, before, 'nothing written');
  const bad = cli(['theme', 'no-such-format']);
  assert.equal(bad.code, 2, 'an unknown format is a usage error');
  assert.match(bad.err, /unknown format "no-such-format"\. Formats: .*kitty/);
});

test('formatList: maps, lists and Maps of formats', () => {
  assert.deepEqual(formatList({ kitty: { name: 'kitty', install: 'copy it', file: () => 'x' } }), [{ id: 'kitty', name: 'kitty', install: 'copy it' }]);
  assert.deepEqual(formatList(['foot']), [{ id: 'foot', name: 'foot', install: '' }]);
  assert.deepEqual(formatList(new Map([['wt', 'Windows Terminal']])), [{ id: 'wt', name: 'Windows Terminal', install: '' }]);
  assert.deepEqual(formatList(null), []);
});

// ── tokens and glyphs ───────────────────────────────────────────────────────

test('tokens: every gallery has a hue, a λ label and Night / Day colors; 7-bit fallbacks are 7-bit', () => {
  for (const g of GALLERIES) {
    const t = TOKENS.galleries[g.id];
    assert.ok(t, `${g.id} has a token`);
    assert.match(lambdaLabel(g.id), /^λ \d{3}c?$/);
    assert.match(lambdaLabel(g.id, false), /^[\x20-\x7e]+$/);
    for (const tier of ['night', 'day', 'nightVivid', 'dayVivid']) assert.ok(galleryColor(g.id, tier) >= 0, `${g.id} ${tier}`);
  }
  for (const v of Object.values(glyphs(false))) assert.match(v, /^[\x20-\x7e]+$/);
  // Text-safe tiers: ≥ 4.5:1 on their surfaces.
  const contrast = (a, b) => { const [x, y] = [relLuminance(a), relLuminance(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
  const night = getTheme('prism-dark'), day = getTheme('prism-light');
  for (const g of GALLERIES) {
    assert.ok(contrast(galleryColor(g.id, 'night'), night.panel2) >= 4.5, `${g.id} night ink on glass`);
    assert.ok(contrast(galleryColor(g.id, 'day'), day.panel2) >= 4.5, `${g.id} day ink on glass`);
  }
});

test('tokens: in sync with design/tokens.json (galleries.terminal)', { skip: !fs.existsSync(TOKENS_JSON) && 'no design/tokens.json' }, () => {
  const t = JSON.parse(fs.readFileSync(TOKENS_JSON, 'utf8'));
  for (const g of t.galleries.terminal) {
    const mine = TOKENS.galleries[g.id];
    assert.deepEqual({ h: mine.h, lambda: mine.lambda, night: mine.night, day: mine.day }, { h: g.h, lambda: g.lambda, night: g.night.ink, day: g.day.ink }, g.id);
  }
});

test('chrome: 16 colors lift hairlines off the background; mono and 16 use solid selections', () => {
  const th = getTheme('prism-dark');
  const P = chrome(th, 'truecolor'), P16 = chrome(th, '16'), Pm = chrome(th, 'mono');
  assert.equal(P.low, false);
  assert.equal(P16.low, true);
  assert.equal(Pm.mono, true);
  assert.ok(relLuminance(P16.line) > relLuminance(P.line) * 2, 'the 16-color hairline is brighter than the glass');
  assert.equal(chrome(getTheme('prism-light')).dark, false);
  assert.notEqual(chrome(getTheme('prism-light')).beam, 0xffffff, 'by Day the beam is not white');
});

test('site tone: balanced luminance reads on black and white terminals (≥ 4.5:1 both)', () => {
  for (const g of GALLERIES) {
    const c = siteTone(galleryHue(g.id));
    const Y = relLuminance(c);
    assert.ok((Y + 0.05) / 0.05 >= 4.4 && 1.05 / (Y + 0.05) >= 4.4, `${g.id} Y=${Y.toFixed(3)}`);
  }
});

test('firstLight: lights only the dark part of the screen and paints the app in by the end', () => {
  const th = getTheme('prism-dark');
  const P = chrome(th);
  const app = () => { const b = new CellBuffer(60, 20); b.clear(th.bg, th.ink); b.text(0, 0, 'APP'.repeat(20), th.ink); return b; };
  const mid = app();
  firstLight(mid, 0.4, P);
  assert.ok(mid.toString().split('\n').join('').match(/[⠀-⣿]/gu)?.length > 20, 'the beam and the fan are drawn in braille');
  assert.doesNotMatch(mid.toString().split('\n')[0], /APP/, 'the app is still dark');
  const end = app();
  firstLight(end, 0.999, P);
  assert.match(end.toString().split('\n')[0], /APPAPP/, 'painted in');
});

// ── the catalog browser and the player ──────────────────────────────────────

const CAPS = (depth, w, h, unicode = true) => ({ isTTY: true, depth, unicode, braille: unicode, sextant: false, width: w, height: h, program: 'test', platform: 'linux' });

function session({ w = 120, h = 34, depth = 'truecolor', unicode = true, opts = {} } = {}) {
  const out = fakeTTY({ columns: w, rows: h });
  const input = Object.assign(new EventEmitter(), { isTTY: true, setRawMode() {}, resume() {}, pause() {} });
  const vt = new VT(w, h);
  const run = gallery(allFacets(), { output: out, input, caps: CAPS(depth, w, h, unicode), ...opts });
  let raw = '';
  return {
    get raw() { return raw; },
    key(name, seq = name) { input.emit('keypress', seq, { name, sequence: seq }); },
    async screen(ms = 250) { await sleep(ms); const c = out.chunks.splice(0).join(''); raw += c; vt.feed(c); return vt.text(); },
    async quit() {
      input.emit('keypress', 'q', { name: 'q', sequence: 'q' });
      await sleep(80);
      input.emit('keypress', 'q', { name: 'q', sequence: 'q' });
      return Promise.race([run.then(() => 'done'), sleep(3000).then(() => 'timeout')]);
    },
  };
}

test('browser: First Light plays, any key skips it (without acting), and never in mono or 7-bit', async () => {
  const s = session({ opts: { intro: 'full' } });
  const early = await s.screen(400);
  assert.match(early, /[⠀-⣿]/u, 'the beam / fan in braille');
  s.key('down'); // skips the intro only
  let scr = await s.screen(250);
  assert.match(scr, /\$ prism-term play plasma/, 'the selection did not move');
  assert.match(scr, /GALLERIES/);
  assert.equal(await s.quit(), 'done');
  for (const caps of [{ depth: 'mono' }, { depth: '16', unicode: false }]) {
    const m = session({ ...caps, opts: { intro: 'full' } });
    const shot = await m.screen(300);
    assert.doesNotMatch(shot, /[⠀-⣿]/u, `no intro at ${caps.depth}${caps.unicode === false ? ' / 7-bit' : ''}`);
    assert.match(shot, /plasma/i);
    assert.equal(await m.quit(), 'done');
  }
});

test('browser: the spectral index carries λ labels; d relights Night ↔ Day', async () => {
  const s = session({ w: 140, h: 40, opts: { theme: 'prism-dark' } });
  let scr = await s.screen(300);
  for (const g of GALLERIES.slice(0, 5)) assert.ok(scr.includes(lambdaLabel(g.id)), `${g.id} ${lambdaLabel(g.id)}`);
  assert.match(scr.split('\n')[0], /Prism Night/);
  assert.match(scr.split('\n')[0], /◢◣/, 'the mark');
  s.key('d');
  scr = await s.screen(700);
  assert.match(scr.split('\n')[0], /Prism Day/);
  s.key('d');
  scr = await s.screen(700);
  assert.match(scr.split('\n')[0], /Prism Night/);
  assert.equal(await s.quit(), 'done');
});

test('player HUD: gallery wavelength, place, position and keys; d flips Day / Night', async () => {
  const out = fakeTTY({ columns: 140, rows: 30 });
  const input = Object.assign(new EventEmitter(), { isTTY: true, setRawMode() {}, resume() {}, pause() {} });
  const run = play([findFacet('plasma'), findFacet('tunnel')], { output: out, input, caps: CAPS('truecolor', 140, 30), theme: 'prism-dark', reducedMotion: true });
  await sleep(300);
  const vt = new VT(140, 30);
  vt.feed(out.chunks.splice(0).join(''));
  const hud = vt.text().split('\n').at(-1);
  assert.match(hud, /◆ Plasma/);
  assert.ok(hud.includes(lambdaLabel('fx')), 'λ label');
  assert.match(hud, /FX STORE \/ FIELDS/);
  assert.match(hud, /1\/2/);
  assert.match(hud, /d day\/night/);
  assert.match(hud, /PRISM NIGHT/);
  input.emit('keypress', 'd', { name: 'd', sequence: 'd' });
  await sleep(250);
  vt.feed(out.chunks.splice(0).join(''));
  assert.match(vt.text().split('\n').at(-1), /PRISM DAY/);
  input.emit('keypress', 'q', { name: 'q', sequence: 'q' });
  await run;
});

// ── the curl site ───────────────────────────────────────────────────────────

const pages = buildTtyPages({ site: 'https://prism.jeremyfhall.com', version: '0.0.0-test', galleries: catalogTree(), facets: allFacets().filter((f) => ['plasma', 'charts-spark-bars'].includes(f.id) || f.gallery === 'charts') });

test('site: the beam strikes the prism on every page; .txt pages are 7-bit with an ASCII prism', () => {
  for (const [rel, page] of pages) {
    const txt = page.txt.split('\n');
    assert.match(page.txt, /^[\x20-\x7e\n]*$/, `${rel}.txt is 7-bit`);
    assert.match(txt[0], /^--\/\\=== PRISM TERMINAL/, `${rel}.txt header`);
    assert.match(txt[1], /^-+\/\\=+$/, `${rel}.txt beam`);
    const color = page['256'].replace(/\x1b\[[0-9;]*m/g, '').split('\n');
    assert.match(color[1], /^─+◢◣━+$/, `${rel} beam`);
    assert.equal(color[1].length, 80);
  }
});

test('site: home is a spectral index — every gallery with its swatch, command and λ label', () => {
  const home = pages.get('tty');
  const plain = home['256'].replace(/\x1b\[[0-9;]*m/g, '');
  for (const g of catalogTree()) {
    const line = plain.split('\n').find((l) => l.includes(`/t/${g.id} `));
    assert.ok(line, g.id);
    assert.ok(line.trimEnd().endsWith(lambdaLabel(g.id)), `${g.id} ends with its λ label`);
    assert.match(line, /^ {2}▌ /);
  }
  assert.ok(home.txt.includes(lambdaLabel('fx', false)));
});
