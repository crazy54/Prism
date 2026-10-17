// Game Link facets through the real plugin runtime: gamelink-cs2-deck on a whole Galleon 100 SD (12 keys + both dials ×
// both layers) and a whole Stream Deck + (8 keys + 4 dials), against the fake Stream Deck app and a fake CS2 (raw HTTP
// to a port-0 Game Link listener) replaying the fixture flashbang at its recorded pace. Measures what reaches the
// device: the whiteout lands on every surface within one priority frame, and the whole burst costs ≤ 8 sends per
// surface (≤ 128 on the Galleon).
//
//   node --test test/gamelink-facets-plugin.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { main } from '../src/plugin/index.js';
import { startFakeStreamDeck } from '../src/plugin/dev/fake-streamdeck.js';
import { decodeSvgDataUrl } from '../src/plugin/system-facets.js';
import { createHub } from '../src/apps/sources/hub.js';
import { createGameLink } from '../src/apps/sources/gamelink.js';
import { simulatedGameLink } from '../src/apps/sources/gamelink-sim.js';

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'gamelink', 'cs2');
const SEQ = JSON.parse(fs.readFileSync(path.join(FIX, 'sequence.json'), 'utf8'));
const frame = (f) => JSON.parse(fs.readFileSync(path.join(FIX, f), 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CS2 = 'ef'.repeat(32), COMP = '12'.repeat(32);   // fictional
const FACET = 'gamelink-cs2-deck';
const DEVICES = {
  galleon: { sd: { id: 'gal', name: 'Galleon 100 SD', size: { columns: 3, rows: 4 }, type: 12 }, dials: [[0, 0], [1, 0], [0, 1], [1, 1]] },
  plus: { sd: { id: 'plus', name: 'Stream Deck +', size: { columns: 4, rows: 2 }, type: 7 }, dials: [[0, 0], [1, 0], [2, 0], [3, 0]] },
};

function post(port, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ ...body, auth: { token: CS2 } });
    const r = http.request({ host: '127.0.0.1', port, method: 'POST', path: '/v1/cs2', agent: false, headers: { host: `127.0.0.1:${port}`, 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
    r.on('error', reject);
    r.end(data);
  });
}
async function waitFor(fn, { timeoutMs = 5000, what = 'condition' } = {}) {
  const end = Date.now() + timeoutMs;
  for (;;) { let v; try { v = fn(); } catch { v = undefined; } if (v) return v; if (Date.now() > end) throw new Error(`timed out waiting for ${what}`); await sleep(5); }
}

async function plugin(dev) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-gamelink-facets-'));
  const gl = createGameLink({ dir: path.join(dir, 'state'), port: 0, tokens: { cs2: CS2, companion: COMP }, steam: { platform: 'linux', home: path.join(dir, 'nohome'), env: {}, readRegistry: null } });
  const data = createHub({ sources: [gl.source, simulatedGameLink()] });
  const sd = await startFakeStreamDeck({ devices: [dev.sd], globals: { boot: false, gamelink: { enabled: true } } });
  const p = await main({ argv: sd.argv(), exit: () => {}, handleProcess: false, log: () => {}, controlFile: path.join(dir, 'control.json'), audio: null, data, gamelink: gl });
  await sd.whenRegistered();
  sd.connectDevices();
  const keys = [];
  for (let r = 0; r < dev.sd.size.rows; r++) for (let c = 0; c < dev.sd.size.columns; c++) keys.push(sd.appear({ device: dev.sd.id, col: c, row: r, settings: { facet: FACET } }));
  const dials = dev.dials.map(([c, r]) => sd.appear({ device: dev.sd.id, controller: 'Encoder', col: c, row: r, settings: { facet: FACET } }));
  return { sd, p, gl, keys, dials, all: [...keys, ...dials], close: async () => { await p.stop(); await sd.close(); await gl.stop(); fs.rmSync(dir, { recursive: true, force: true }); } };
}
const imageOf = (m) => decodeSvgDataUrl(m.event === 'setImage' ? m.payload.image : m.payload.canvas);
const framesTo = (sd, ctx) => sd.received.filter((m) => (m.event === 'setImage' || m.event === 'setFeedback') && m.context === ctx);
const lastSvg = (sd, ctx) => { const f = framesTo(sd, ctx).at(-1); return f ? imageOf(f) : ''; };
const white = (svg) => Math.max(0, ...[...svg.matchAll(/id="[^"]*-glflash\d*"[^>]*fill-opacity="([\d.]+)"/g)].map((m) => +m[1]));   // the whiteout rect
const at = (name) => SEQ.frames.find((f) => f.file.startsWith(name)).atMs;

for (const [name, dev] of Object.entries(DEVICES)) {
  test(`plugin: the fixture flashbang on a whole ${dev.sd.name} — onset on every surface at once, ≤ 8 sends per surface`, async (tc) => {
    const t = await plugin(dev);
    try {
      await waitFor(() => t.gl.status().listening, { what: 'listening' });
      const rt = t.p.runtime;
      const u = await waitFor(() => { const x = rt.unitOf(rt.instances.get(t.keys[0])); return x && x.members.length === t.all.length && x; }, { what: 'one deck unit' });
      assert.equal(u.mode, 'deck');
      for (const f of ['06-round-live.json', '07-hurt.json']) await post(t.gl.port, frame(f));
      await waitFor(() => rt.frameOpts(u).data.gamelink?.player?.health === 73, { what: 'live' });
      await t.sd.settle(1500);   // the hurt splash and its trailing frames are over
      const ctxs = new Set(t.all);
      const sends = () => t.sd.received.filter((m) => (m.event === 'setImage' || m.event === 'setFeedback') && ctxs.has(m.context)).length;
      const before = sends();
      const fade = ['08-flash-onset', '09-flash-fade-1', '10-flash-fade-2', '11-flash-fade-3', '12-flash-fade-4', '13-flash-fade-5', '14-flash-clear'];
      // what the onset push paints inside runtime.dataChanged (gamelink-fix L10: structure, not milliseconds)
      const budget = rt.devices.get(dev.sd.id).budget;
      let prio = 0;
      const submit = budget.submit.bind(budget);
      budget.submit = (ctx, kind, payload, o = {}) => { if (o.priority) prio++; return submit(ctx, kind, payload, o); };
      const pushes = [];
      const dataChanged = rt.dataChanged.bind(rt);
      rt.dataChanged = (keys, o = {}) => { const s0 = budget.stats.submitted, p0 = prio; const r = dataChanged(keys, o); pushes.push({ urgent: !!o.urgent, offered: budget.stats.submitted - s0, priority: prio - p0 }); return r; };
      const firstAfter = new Map(t.all.map((c) => [c, framesTo(t.sd, c).length]));
      const t0 = performance.now();
      await post(t.gl.port, frame(`${fade[0]}.json`));
      await waitFor(() => t.all.every((c) => white(lastSvg(t.sd, c)) > 0.2), { what: 'every surface whitening' });
      const onsetMs = performance.now() - t0;
      assert.deepEqual([pushes[0].urgent, pushes[0].offered, pushes[0].priority], [true, t.all.length, t.all.length], 'the onset push painted every surface itself, with priority');
      for (const c of t.all) assert.ok(white(imageOf(framesTo(t.sd, c)[firstAfter.get(c)])) > 0.2, 'each surface\'s first frame after the post is already white');
      const first = Math.max(...t.all.map((c) => white(lastSvg(t.sd, c))));
      // the rest of the fade at the recorded pace (the hold, then a post every 500 ms), then the clear
      for (const f of fade.slice(1)) { const wait = at(f) - at(fade[fade.indexOf(f) - 1]); await sleep(Math.min(wait, 2400)); await post(t.gl.port, frame(`${f}.json`)); }
      await waitFor(() => t.all.every((c) => white(lastSvg(t.sd, c)) === 0), { timeoutMs: 3000, what: 'cleared' });
      await t.sd.settle(500);
      const n = sends() - before;
      const levels = new Set(t.keys.flatMap((c) => framesTo(t.sd, c).slice(-12).map(imageOf).map(white)));
      tc.diagnostic(`${dev.sd.name}: onset on all ${t.all.length} surfaces in ${onsetMs.toFixed(0)} ms (informational; first frame white ${first}) · ${n} sends for the whole flashbang (cap ${8 * t.all.length}) · white levels ${[...levels].sort().join(' ')}`);
      assert.ok(n >= t.all.length, `every surface whitened (${n} sends)`);
      assert.ok(n <= 8 * t.all.length, `${n} sends ≤ 8 × ${t.all.length}`);
      if (name === 'galleon') assert.ok(n <= 128, `Galleon: ${n} sends ≤ 128`);
      const b = rt.stats().devices[dev.sd.id].budget;
      assert.equal(b.failed, 0);
    } finally { await t.close(); }
  });
}
