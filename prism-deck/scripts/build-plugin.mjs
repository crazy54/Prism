#!/usr/bin/env node
// Build the Prism Deck Stream Deck plugin:
//   plugin/com.jeremyfhall.prism.sdPlugin/        the plugin folder (linkable with `streamdeck link`)
//   plugin/dist/com.jeremyfhall.prism.streamDeckPlugin   the double-click installer (a ZIP of that folder)
//   plugin/dist/com.jeremyfhall.prism.opendeck.streamDeckPlugin   the same plugin for OpenDeck on Linux (+ manifest.linux.json)
// and rewrites the counts / versions in README.md and docs/plugin.md (scripts/doc-counts.mjs),
// then validate the manifest + layouts against Elgato's official schemas (research/schemas,
// or PRISM_SD_SCHEMAS), every image, the bundled profiles, and smoke-test the entry:
// the built plugin is launched like the Stream Deck app would, against a fake app.
//
//   node scripts/build-plugin.mjs [--min-software 7.1] [--no-pack] [--no-smoke] [--no-docs] [--node <path to node 20>]
//
// Nothing is installed anywhere: install by double-clicking the .streamDeckPlugin (docs/plugin.md).

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildPluginFolder, validatePluginFolder, packPlugin, checkPluginPackage } from '../src/export/plugin.js';
import { findSchemas } from '../src/export/plugin-schema.js';
import { buildOpenDeckPlugin } from '../src/export/linux-opendeck.js';
import { syncDocs } from './doc-counts.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name, d) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : d; };
const has = (name) => args.includes(name);

/** Launch the built plugin with `node` against a fake Stream Deck; resolve with what it sent. */
export async function smokeTest(dir, { node = process.execPath, timeoutMs = 15000 } = {}) {
  const { startFakeStreamDeck } = await import('../src/plugin/dev/fake-streamdeck.js');
  const sd = await startFakeStreamDeck();
  const child = spawn(node, [path.join(dir, 'bin', 'plugin.js'), ...sd.argv()], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PRISM_DECK_CONTROL: path.join(dir, '..', '.smoke-control.json'), PRISM_DECK_AUDIO: 'off' } });
  let stderr = '';
  child.stderr.on('data', (c) => { stderr += c; });
  const kill = () => { try { child.kill(); } catch { /* gone */ } };
  try {
    await sd.whenRegistered(timeoutMs);
    sd.connectDevices();
    const g = sd.devices.find((d) => d.type === 12) || sd.devices[0];
    const key = sd.appear({ device: g.id, col: 0, row: 0, settings: { facet: 'icon-mic' } });
    const dial = sd.appear({ device: g.id, controller: 'Encoder', col: 0, row: 0, settings: {} });
    // the boot sequence plays on a physical deck at start; a key press skips it and the key's facet takes over
    const img = await sd.waitFor((m) => m.event === 'setImage' && m.context === key, { timeoutMs });
    const before = sd.received.length;
    sd.keyDown(key); sd.keyUp(key);
    await sd.waitFor((m) => m.event === 'setImage' && m.context === key, { timeoutMs, from: before });
    const fb = await sd.waitFor((m) => m.event === 'setFeedback' && m.context === dial, { timeoutMs });
    // a game (API 1.5): one press rolls the dice and streams its transition frames
    const dice = sd.appear({ device: g.id, col: 1, row: 0, settings: { facet: 'game-dice' } });
    await sd.waitFor((m) => m.event === 'setImage' && m.context === dice, { timeoutMs });
    const mark = sd.received.length;
    sd.keyDown(dice); sd.keyUp(dice);
    await sd.waitFor((m) => m.event === 'setSettings' && m.context === dice && m.payload.game, { timeoutMs, from: mark });
    const gameFrames = sd.received.slice(mark).filter((m) => m.event === 'setImage' && m.context === dice).length;
    if (gameFrames < 2) throw new Error(`dice roll drew ${gameFrames} frames`);
    const version = /node (\S+)\)/.exec(stderr)?.[1] || '?';
    return { ok: true, node: version, image: img.payload.image.slice(0, 40), feedbackKeys: Object.keys(fb.payload), gameFrames };
  } catch (e) {
    return { ok: false, error: e.message, stderr: stderr.slice(-2000) };
  } finally {
    await sd.close();
    await new Promise((r) => { const t = setTimeout(() => { kill(); r(); }, 3000); child.once('exit', () => { clearTimeout(t); r(); }); });
    kill();
    fs.rmSync(path.join(dir, '..', '.smoke-control.json'), { force: true });
  }
}

/** The Stream Deck app's own Node 20 (read-only use, to prove the plugin runs on it), if present. */
export function findNode20() {
  if (process.env.PRISM_NODE20 && fs.existsSync(process.env.PRISM_NODE20)) return process.env.PRISM_NODE20;
  const base = process.env.APPDATA && path.join(process.env.APPDATA, 'Elgato', 'StreamDeck', 'NodeJS');
  if (!base || !fs.existsSync(base)) return null;
  const v = fs.readdirSync(base).filter((d) => /^20\./.test(d)).sort().pop();
  const exe = v && path.join(base, v, process.platform === 'win32' ? 'node.exe' : 'bin/node');
  return exe && fs.existsSync(exe) ? exe : null;
}

async function main() {
  const t0 = Date.now();
  const minSoftware = opt('--min-software', '7.6');
  const built = buildPluginFolder({ root: ROOT, minSoftware });
  console.log(`built ${path.relative(ROOT, built.dir)} (${built.files.length} files, ${built.profiles.length} profiles, Software ≥ ${minSoftware})`);
  const schemas = findSchemas();
  const problems = validatePluginFolder(built.dir, schemas);
  if (problems.length) { console.error(`validation: ${problems.length} problem(s)\n  ${problems.join('\n  ')}`); if (schemas || problems.length > 1) process.exitCode = 1; }
  else console.log(`validation: manifest + layouts pass the official schemas (${schemas.dir}); images, profiles OK`);
  if (!has('--no-smoke')) {
    const nodes = [process.execPath, opt('--node') || findNode20()].filter(Boolean);
    for (const node of [...new Set(nodes)]) {
      const r = await smokeTest(built.dir, { node });
      if (r.ok) console.log(`smoke: registered, drew a key + a Galleon widget, rolled a game die (${r.gameFrames} frames, snapshot persisted) on node ${r.node} (${path.basename(path.dirname(node))})`);
      else { console.error(`smoke FAILED on ${node}: ${r.error}\n${r.stderr}`); process.exitCode = 1; }
    }
  }
  if (!has('--no-pack')) {
    const zip = packPlugin(built.dir);
    const out = path.join(ROOT, 'plugin', 'dist', `${built.manifest.UUID}.streamDeckPlugin`);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, zip);
    const chk = checkPluginPackage(zip);
    if (chk.problems.length) { console.error(`package: ${chk.problems.join('; ')}`); process.exitCode = 1; }
    console.log(`packed ${path.relative(ROOT, out)} (${(zip.length / 1024).toFixed(0)} KB, ${chk.entries} entries, read back OK)`);
    // the OpenDeck build the README links (docs/linux.md): this plugin + manifest.linux.json
    const od = buildOpenDeckPlugin(zip);
    const odOut = path.join(ROOT, 'plugin', 'dist', od.fileName);
    fs.writeFileSync(odOut, od.zip);
    const odChk = checkPluginPackage(od.zip);
    if (odChk.problems.length) { console.error(`opendeck package: ${odChk.problems.join('; ')}`); process.exitCode = 1; }
    console.log(`packed ${path.relative(ROOT, odOut)} (${(od.zip.length / 1024).toFixed(0)} KB, ${odChk.entries} entries, read back OK)`);
  }
  if (!has('--no-docs')) {
    const stale = syncDocs();
    console.log(stale.length ? `docs: updated ${stale.map((x) => `${x.file} ${x.key} ${x.was}→${x.now}`).join(', ')}` : 'docs: counts and versions already current');
  }
  console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
