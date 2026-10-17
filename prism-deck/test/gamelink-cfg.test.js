// Game Link · "Connect CS2" / "Disconnect" (src/apps/sources/gamelink.js connectCs2 / disconnectCs2) on TEMPORARY fake
// Steam trees only: a Windows layout found through an injected registry reader, a Linux ~/.local/share/Steam layout,
// and this PC's real situation (a leftover CS2 folder, no install). Never the user's Steam or game folders.
// Checks: only gamestate_integration_prism.cfg is written (atomically, ASCII, no BOM) and only into the verified
// cfg/ folder; another vendor's cfg is byte-identical afterwards; Disconnect removes exactly our file and rotates the
// CS2 token; a port change makes the cfg "out of date"; a leftover folder is "CS2 not found" and nothing is written.
//
//   node --test test/gamelink-cfg.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createGameLink } from '../src/apps/sources/gamelink.js';
import { cs2Cfg, CFG_NAME, isPrismCfg } from '../src/apps/sources/gamelink-cs2.js';

const CS2 = 'ab'.repeat(32), COMP = 'cd'.repeat(32);
const tmpdir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'prism-gamelink-steam-'));
const STEELSERIES = '"SteelSeries Engine 3 v1.0 (fictional test copy)"\n{\n "uri" "http://127.0.0.1:50999/csgo_game_event"\n "timeout" "5.0"\n}\n';
const GAME = 'Counter-Strike Global Offensive';

/** Every file under dir → { relPath: { size, mtimeMs, sha } } (to prove nothing else changed). */
function snapshot(dir) {
  const out = {};
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else { const st = fs.statSync(p); out[path.relative(dir, p)] = { size: st.size, mtimeMs: st.mtimeMs, text: fs.readFileSync(p, 'latin1') }; } } };
  walk(dir);
  return out;
}

/** A fake Steam install: root (registry SteamPath) + one extra library that holds CS2 (or only a leftover folder). */
function steamTree({ installed = true, layout = 'win32' } = {}) {
  const tmp = tmpdir();
  const root = layout === 'win32' ? path.join(tmp, 'Steam') : path.join(tmp, 'home', '.local', 'share', 'Steam');
  const lib = layout === 'win32' ? path.join(tmp, 'ExampleLibrary') : root;
  const game = path.join(lib, 'steamapps', 'common', GAME);
  const cfgDir = path.join(game, 'game', 'csgo', 'cfg');
  fs.mkdirSync(cfgDir, { recursive: true });
  fs.mkdirSync(path.join(root, 'steamapps'), { recursive: true });
  const esc = (p) => p.replace(/\\/g, '\\\\');
  const apps = installed ? '"730" "35000000000"' : '"228980" "1234"';
  fs.writeFileSync(path.join(root, 'steamapps', 'libraryfolders.vdf'), `"libraryfolders"\n{\n "0" { "path" "${esc(root)}" "apps" { "228980" "1" } }\n "1" { "path" "${esc(lib)}" "apps" { ${apps} } }\n}\n`);
  fs.writeFileSync(path.join(cfgDir, 'gamestate_integration_steelseries.cfg'), STEELSERIES);
  fs.writeFileSync(path.join(cfgDir, 'boot.vcfg'), '"boot" {}\n');
  if (installed) {
    fs.writeFileSync(path.join(lib, 'steamapps', 'appmanifest_730.acf'), `"AppState"\n{\n "appid" "730"\n "installdir" "${GAME}"\n}\n`);
    const bin = layout === 'win32' ? path.join(game, 'game', 'bin', 'win64', 'cs2.exe') : path.join(game, 'game', 'bin', 'linuxsteamrt64', 'cs2');
    fs.mkdirSync(path.dirname(bin), { recursive: true });
    fs.writeFileSync(bin, 'fictional');
  }
  const state = path.join(tmp, 'state');
  const steam = layout === 'win32'
    ? { platform: 'win32', env: {}, readRegistry: async (k) => (k.startsWith('HKCU') ? root.replace(/\\/g, '/').toLowerCase() : null) }
    : { platform: 'linux', env: {}, home: path.join(tmp, 'home'), readRegistry: null };
  return { tmp, root, lib, cfgDir, ours: path.join(cfgDir, CFG_NAME), state, steam, close: () => fs.rmSync(tmp, { recursive: true, force: true }) };
}

const client = (tree, extra = {}) => createGameLink({ dir: tree.state, port: 0, tokens: { cs2: CS2, companion: COMP }, platform: tree.steam.platform, steam: tree.steam, ...extra });

test('cfg (Windows layout): Connect writes only gamestate_integration_prism.cfg; SteelSeries is untouched; Disconnect removes only ours', { skip: process.platform !== 'win32' && 'Windows paths' }, async () => {
  const tree = steamTree();
  const gl = client(tree);
  try {
    assert.deepEqual(await gl.connectCs2(), { ok: false, reason: 'not-listening' }, 'never writes while Game Link is off');
    assert.ok(!fs.existsSync(tree.ours));
    await gl.configure({ enabled: true });
    const before = snapshot(tree.tmp);
    const st0 = await gl.cs2Status(true);
    assert.deepEqual([st0.found, st0.cfg, st0.path], [true, 'absent', tree.ours]);
    const r = await gl.connectCs2();
    assert.deepEqual(r, { ok: true, path: tree.ours, restartNeeded: true });
    const after = snapshot(tree.tmp);
    const added = Object.keys(after).filter((k) => !(k in before));
    assert.deepEqual(added.filter((k) => !k.startsWith('state')), [path.relative(tree.tmp, tree.ours)], 'exactly one new file in the game tree');
    for (const [k, v] of Object.entries(before)) if (!k.startsWith('state')) assert.deepEqual(after[k], v, `${k} unchanged (content and mtime)`);
    const text = fs.readFileSync(tree.ours);
    assert.equal(text.toString('latin1'), cs2Cfg({ port: gl.port, token: CS2, eol: '\r\n' }));
    assert.ok(text[0] !== 0xef && [...text].every((b) => b === 10 || b === 13 || (b >= 32 && b < 127)), 'ASCII, no BOM');
    assert.ok(!fs.readdirSync(tree.cfgDir).some((f) => f.endsWith('.tmp')), 'no temp file left');
    assert.equal((await gl.cs2Status(true)).cfg, 'current');
    // Disconnect: only our file goes; the CS2 token rotates (a stale copy stops working)
    const d = await gl.disconnectCs2();
    assert.deepEqual(d, { ok: true, removed: true });
    assert.ok(!fs.existsSync(tree.ours));
    assert.equal(fs.readFileSync(path.join(tree.cfgDir, 'gamestate_integration_steelseries.cfg'), 'utf8'), STEELSERIES);
    assert.ok(fs.existsSync(path.join(tree.cfgDir, 'boot.vcfg')));
    const disc = JSON.parse(fs.readFileSync(gl.file, 'utf8'));
    assert.notEqual(disc.tokens.cs2, CS2, 'new CS2 token'); assert.equal(disc.tokens.companion, COMP, 'the companion keeps its token');
    assert.equal((await gl.cs2Status(true)).cfg, 'absent');
  } finally { await gl.stop(); tree.close(); }
});

test('cfg: a port change makes the installed cfg "out of date" until Connect again', { skip: process.platform !== 'win32' && 'Windows paths' }, async () => {
  const tree = steamTree();
  const gl = client(tree, { port: undefined });
  const free = async () => { const s = http.createServer(); await new Promise((r) => s.listen(0, '127.0.0.1', r)); const p = s.address().port; await new Promise((r) => s.close(r)); return p; };
  try {
    await gl.configure({ enabled: true, port: await free() });
    assert.equal((await gl.connectCs2()).ok, true);
    assert.equal((await gl.cs2Status(true)).cfg, 'current');
    await gl.configure({ enabled: true, port: await free() });
    assert.equal((await gl.cs2Status(true)).cfg, 'outdated', 'the cfg still points at the old port');
    assert.equal((await gl.connectCs2()).ok, true, 'one click re-Connects');
    assert.equal((await gl.cs2Status(true)).cfg, 'current');
    assert.match(fs.readFileSync(tree.ours, 'utf8'), new RegExp(`127\\.0\\.0\\.1:${gl.port}/v1/cs2`));
  } finally { await gl.stop(); tree.close(); }
});

test('cfg: this PC\'s case — a leftover CS2 folder, no install: "CS2 not found", nothing written anywhere', async () => {
  for (const layout of process.platform === 'win32' ? ['win32', 'linux'] : ['linux']) {
    const tree = steamTree({ installed: false, layout });
    const gl = client(tree);
    try {
      await gl.configure({ enabled: true });
      const before = snapshot(tree.tmp);
      const r = await gl.connectCs2();
      assert.deepEqual(r, { ok: false, reason: 'not-installed', leftover: true }, layout);
      const st = await gl.cs2Status(true);
      assert.deepEqual([st.found, st.reason, st.leftover, st.path], [false, 'not-installed', true, null]);
      const after = snapshot(tree.tmp);
      for (const k of Object.keys(after)) if (!k.startsWith('state')) assert.deepEqual(after[k], before[k], `${layout}: ${k} untouched`);
      assert.ok(!fs.existsSync(tree.ours));
      assert.deepEqual((await gl.disconnectCs2()).removed, false);
    } finally { await gl.stop(); tree.close(); }
  }
});

test('cfg (Linux layout): ~/.local/share/Steam is found; connect / disconnect', async () => {
  const tree = steamTree({ layout: 'linux' });
  const gl = client(tree);
  try {
    await gl.configure({ enabled: true });
    const r = await gl.connectCs2();
    assert.equal(r.ok, true);
    assert.equal(path.resolve(r.path), path.resolve(tree.ours));
    const text = fs.readFileSync(tree.ours, 'utf8');
    assert.ok(isPrismCfg(text) && !text.includes('\r'), 'LF on Linux');
    assert.equal(fs.readFileSync(path.join(tree.cfgDir, 'gamestate_integration_steelseries.cfg'), 'utf8'), STEELSERIES);
    assert.equal((await gl.disconnectCs2()).removed, true);
    assert.ok(!fs.existsSync(tree.ours));
  } finally { await gl.stop(); tree.close(); }
});

test('cfg: a file that isn\'t ours under our name is never overwritten or removed', async () => {
  const tree = steamTree({ layout: 'linux' });
  const gl = client(tree);
  try {
    await gl.configure({ enabled: true });
    fs.writeFileSync(tree.ours, '"Somebody Else"\n{\n}\n');
    const r = await gl.connectCs2();
    assert.equal(r.ok, false); assert.equal(r.reason, 'foreign-file');
    assert.equal(fs.readFileSync(tree.ours, 'utf8'), '"Somebody Else"\n{\n}\n');
    assert.equal((await gl.cs2Status(true)).cfg, 'foreign');
    assert.equal((await gl.disconnectCs2()).removed, false);
    assert.ok(fs.existsSync(tree.ours));
  } finally { await gl.stop(); tree.close(); }
});
