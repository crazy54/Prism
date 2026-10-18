// `prism-deck export opendeck | streamcontroller | linux-paths` and `prism-deck audio …` —
// command handlers for the architect's cli.js (which owns argument parsing). Each takes the
// parsed option object cli.js already builds (`--key value` → opt.key, flags → true) and
// returns an exit code. Dispatch (two cases in cli.js):
//
//   case 'export': if (['opendeck', 'streamcontroller', 'linux-paths'].includes(pos[0])) {
//     const { runLinuxExport } = await import('./src/export/linux-cli.js');
//     process.exitCode = await runLinuxExport(pos[0], opt, { log: out }); break; }   // else: plugin/iconpack/profile exporters
//   case 'audio': { const { runAudioCommand } = await import('./src/export/linux-cli.js');
//     process.exitCode = await runAudioCommand(pos[0], opt, { log: out }); break; }
//
//   prism-deck export opendeck         [--sample plus | --layout setup.json] [--device plus] [--device-id sd-SERIAL] [--profile Prism]
//                                      [--images svg|png|none] [--plugin plugin/dist/com.jeremyfhall.prism.streamDeckPlugin] [--out dir] [--force]
//   prism-deck export streamcontroller [--sample plus | --layout setup.json] [--device plus] [--format svg|png] [--animate] [--fps 12] [--out dir] [--force]
//   prism-deck export linux-paths      [--home /home/you] [--json]
//   prism-deck audio detect            [--input monitor|mic] [--json]       probes only — never captures
//   prism-deck audio meter             [--backend synthetic|auto|…] [--seconds 5] [--input monitor|mic]   a live terminal meter
//
// Nothing here installs into an app: exports land in --out (default ./prism-linux-export) with the
// copy commands printed for the user to run.

import fs from 'node:fs';
import path from 'node:path';
import { SAMPLE_LAYOUTS } from './profile.js';
import { loadRaster, resolveDevice } from './linux.js';
import { buildOpenDeckProfiles, buildOpenDeckPlugin, openDeckPaths, OD_FLATPAK_ID, PLUGIN_DIR } from './linux-opendeck.js';
import { buildStreamControllerBundle, streamControllerPaths, SC_FLATPAK_ID } from './linux-streamcontroller.js';

const write = (file, data) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, data); return file; };

/** The setup to export: --layout file, else --sample <device> (or --device) from the sample profiles. */
export function loadSetup(opt = {}) {
  if (opt.layout) {
    const raw = JSON.parse(fs.readFileSync(path.resolve(String(opt.layout)), 'utf8'));
    return { ...raw, device: opt.device || raw.device };
  }
  const want = String(opt.sample === true || !opt.sample ? opt.device || 'plus' : opt.sample);
  const d = resolveDevice(want);
  const key = SAMPLE_LAYOUTS[d.id] ? d.id : Object.keys(SAMPLE_LAYOUTS).find((k) => resolveDevice(k).family === d.family && resolveDevice(k).cols === d.cols && resolveDevice(k).rows === d.rows);
  if (!key) throw new Error(`no sample layout for ${d.name}; pass --layout setup.json (samples: ${Object.keys(SAMPLE_LAYOUTS).join(', ')})`);
  return { device: d.id, ...SAMPLE_LAYOUTS[key] };
}

/** Exit codes: 0 ok, 1 runtime failure, 2 usage error (unknown target / subcommand). */
export async function runLinuxExport(target, opt = {}, { log = console.log, err = (m) => process.stderr.write(`prism-deck: ${m}\n`), env = process.env } = {}) {
  if (!['opendeck', 'streamcontroller', 'linux-paths'].includes(target)) {
    err(`unknown export target "${target ?? ''}" (opendeck | streamcontroller | linux-paths)`);
    return 2;
  }
  try {
    const outDir = path.resolve(String(opt.out && opt.out !== true ? opt.out : 'prism-linux-export'));
    if (target === 'linux-paths') {
      // --home describes another account, so this shell's XDG_* only apply without it
      const own = !(opt.home && opt.home !== true);
      const home = own ? '~' : String(opt.home);
      const xdg = own ? { XDG_CONFIG_HOME: env.XDG_CONFIG_HOME, XDG_DATA_HOME: env.XDG_DATA_HOME } : {};
      const paths = { opendeck: openDeckPaths({ home, env: xdg }), opendeckFlatpak: openDeckPaths({ home, flatpak: true }), streamcontroller: streamControllerPaths({ home }) };
      if (opt.json) log(JSON.stringify(paths, null, 2));
      else {
        log(`OpenDeck (native)   plugins ${paths.opendeck.plugins}\n                    profiles ${paths.opendeck.profiles}\n                    plugin log ${paths.opendeck.pluginLog}`);
        log(`OpenDeck (Flatpak ${OD_FLATPAK_ID})\n                    plugins ${paths.opendeckFlatpak.plugins}\n                    profiles ${paths.opendeckFlatpak.profiles}`);
        log(`StreamController (${SC_FLATPAK_ID}; same path for native installs)\n                    data ${paths.streamcontroller.data}`);
      }
      return 0;
    }
    const setup = loadSetup(opt);
    const raster = opt.images === 'png' || opt.format === 'png' || opt.animate ? await loadRaster() : null;
    if (target === 'opendeck') {
      let manifest = null, files = null;
      const dir = path.resolve('plugin', PLUGIN_DIR);
      if (fs.existsSync(path.join(dir, 'manifest.json'))) {
        manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
        files = new Set(listFiles(dir).map((f) => path.relative(dir, f).split(path.sep).join('/')));
      }
      const profiles = buildOpenDeckProfiles(setup, { deviceId: opt['device-id'], profile: opt.profile !== true ? opt.profile : undefined, images: opt.images, raster, manifest, files, force: !!opt.force });
      const written = profiles.map((p) => write(path.join(outDir, 'opendeck', p.path), p.text));
      for (const p of profiles) for (const d of p.dropped) log(`  skipped ${d.slot}: ${d.reason}`);
      let pluginOut = null;
      if (opt.plugin && opt.plugin !== true) {
        const b = buildOpenDeckPlugin(fs.readFileSync(path.resolve(String(opt.plugin))));
        pluginOut = write(path.join(outDir, 'opendeck', b.fileName), b.zip);
      }
      const p0 = profiles[0];
      log(`OpenDeck export for ${p0.device}: ${written.length} profile(s)${pluginOut ? ' + plugin' : ''} in ${path.join(outDir, 'opendeck')}`);
      log(`Install (on the Linux machine):\n  1. OpenDeck → Plugins → Install from file → ${pluginOut ? path.basename(pluginOut) : `${PLUGIN_DIR.replace('.sdPlugin', '')}.streamDeckPlugin`}\n     (needs Node ≥ 20 on the host, also for the Flatpak)\n  2. Quit OpenDeck, find your device id: ls "\${XDG_CONFIG_HOME:-$HOME/.config}/opendeck/profiles/"   (e.g. sd-A1B2C3…)\n  3. cp -r ${(() => { const r = (path.relative(process.cwd(), outDir) || ".").split(path.sep).join("/"); return /\s/.test(r) ? JSON.stringify(r) : r; })()}/opendeck/profiles/${p0.deviceId}/* "\${XDG_CONFIG_HOME:-$HOME/.config}/opendeck/profiles/<your device id>/"\n     (Flatpak: ~/.var/app/${OD_FLATPAK_ID}/config/opendeck/profiles/…)\n  4. Start OpenDeck and pick the "${p0.profile}" profile.`);
      return 0;
    }
    if (target === 'streamcontroller') {
      const b = buildStreamControllerBundle(setup, { raster, format: opt.format, animate: !!opt.animate, fps: opt.fps ? Number(opt.fps) : undefined, force: !!opt.force });
      const file = write(path.join(outDir, 'streamcontroller', b.fileName), b.zip);
      for (const d of b.dropped) log(`  skipped ${d.page} ${d.slot}: ${d.reason}`);
      log(`StreamController export for ${b.device}: ${Object.keys(b.pages).length} page(s), ${b.assets.length} image(s) → ${file}`);
      log('Install: StreamController → page menu → Import, and pick the file. Key art is static; live Prism apps need the OpenDeck route.');
      return 0;
    }
    return 2;
  } catch (e) { err(e.message); return 1; }
}

function listFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) out.push(...listFiles(p)); else out.push(p); }
  return out;
}

export async function runAudioCommand(sub, opt = {}, { log = console.log, err = (m) => process.stderr.write(`prism-deck: ${m}\n`) } = {}) {
  const audio = await import('../audio/index.js');
  const input = opt.input === 'mic' ? 'mic' : 'monitor';
  try {
    if (sub === 'detect') {
      const sys = await audio.nodeSystem();
      const d = await audio.detectBackends(sys, { input, bridge: 'auto' });
      if (opt.json) { log(JSON.stringify({ platform: d.platform, best: d.best, candidates: d.candidates.map(({ id, ok, reason, plan, probe }) => ({ id, ok, reason, command: audio.commandLine(plan), version: probe?.version })) }, null, 2)); return 0; }
      log(`platform ${d.platform} (${d.ms} ms) — best: ${d.best}`);
      for (const c of d.candidates) log(`  ${c.ok ? 'ok ' : '-- '} ${c.id.padEnd(9)} ${c.ok ? audio.commandLine(c.plan) || c.title : c.reason}`);
      log('  ok  synthetic  always available (simulated fallback)');
      return 0;
    }
    if (sub === 'meter') {
      const seconds = Math.max(1, Math.min(600, Number(opt.seconds) || 5));
      const backend = opt.backend && opt.backend !== true ? String(opt.backend) : 'auto';
      const src = audio.createAudioSource({ backend: backend === 'synthetic' ? [] : backend, input, bridge: backend === 'bridge' || backend === 'auto' ? 'auto' : false, retryMs: 0 });
      const info = await src.start();
      log(`${info.backend} (${info.state})${info.command ? ` — ${info.command}` : ''}${info.bridge ? ` — open ${info.bridge.url}` : ''}`);
      const blocks = ' ▁▂▃▄▅▆▇█';
      await new Promise((resolve) => {
        const t = setInterval(() => {
          const d = src.data();
          if (!d) return;
          const bars = d.spectrum.bands.map((v) => blocks[Math.round(v * 8)]).join('');
          process.stdout.write(`\r${'█'.repeat(Math.round(d.audio.level * 24)).padEnd(24, '·')} ${bars} `);
        }, 100);
        setTimeout(() => { clearInterval(t); resolve(); }, seconds * 1000);
      });
      process.stdout.write('\n');
      await src.stop();
      return 0;
    }
    err(`unknown audio command "${sub ?? ''}" (detect | meter)`);
    return 2;
  } catch (e) { err(e.message); return 1; }
}
