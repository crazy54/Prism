// Prism Deck Live — the plugin's local control channel, API v1 (elgato-mcp DESIGN.md §6.3).
//
// It exists only while the user has switched "Allow AI editing" on in the property
// inspector (global setting `aiEditing`, default off). Switching it off closes the
// listener, deletes the discovery file, revokes the pairing and removes every live
// edit. While on:
//   - HTTP on 127.0.0.1 only, a random port; discovery file control.json (paths.js)
//     with { v, port, token, pid, plugin, version, startedAt }, rewritten (new port +
//     256-bit token) on every start
//   - every request: exact Host 127.0.0.1:<port> (421), no Origin header (403), Bearer
//     token compared in constant time (401), JSON bodies only (415), ≤ 2 MB (413)
//   - writes also need a pairing the user approved by HOLDING the glowing Prism key (1.5 s, runtime.js onPromptPress)
//     on a physical deck (never the MCP Deck / Virtual Stream Deck / Mobile, which an
//     AI could press); nothing over HTTP can approve a pairing
//   - token buckets per token, per device, per key and per full-surface apply (429 + retryAfterMs)
//   - only SAFE behaviors go live (live-validate.js); every write is undoable (50 deep) and audited
// It changes what Prism's OWN keys and dials show. It never runs programs, sends keys,
// opens URLs or touches other plugins' actions.

import http from 'node:http';
import crypto from 'node:crypto';
import path from 'node:path';
import { nextState } from '../render.js';
import { findFacet } from '../facets/index.js';
import { TokenBucket } from './budget.js';
import { controlPath as defaultControlPath, writePrivateJson, removeFile, appendJsonl } from './paths.js';
import { planOps, validateLayout, LIMITS } from './live-validate.js';
import { PLUGIN_UUID } from './runtime.js';

export const API_VERSION = 1;
export const CHANNEL_LIMITS = Object.freeze({
  perKeyPerSec: 10, perDevicePerSec: 30, appliesPerSec: 1, requestsPerSec: 50, requestBurst: 100,
  pairRequestsPerSec: 0.34, bodyBytes: 2 * 1024 * 1024, historyDepth: 50, pairingTtlMs: 120_000, auditMemory: 200,
});

const clone = (o) => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));
const mapToObj = (m) => Object.fromEntries([...m].map(([k, v]) => [k, clone(v)]));
const objToMap = (o) => new Map(Object.entries(o || {}).map(([k, v]) => [k, clone(v)]));

export function tokensEqual(a, b) {
  const x = Buffer.from(String(a ?? '')), y = Buffer.from(String(b ?? ''));
  if (x.length !== y.length) { crypto.timingSafeEqual(x, x); return false; }
  return crypto.timingSafeEqual(x, y);
}

/** A public look/feedback for snapshots (no internal fields, images reduced to their size). */
function publicOverlay(ov) {
  if (!ov) return null;
  const o = { ...(ov.facet ? { facet: ov.facet } : {}), ...(Object.keys(ov.params || {}).length ? { params: ov.params } : {}) };
  if (ov.theme) o.theme = ov.mode ? `${ov.theme}:${ov.mode}` : ov.theme;
  if (ov.state) o.state = ov.state;
  if (ov.data?.title) o.title = ov.data.title;
  if (ov.data?.value != null) o.value = ov.data.value;
  if (ov.image) o.image = { bytes: ov.image.length };
  if (ov.sys === 'layout') o.layout = { items: (ov.data?.items || []).length };
  return o;
}

export class LiveController {
  /**
   * opts: { runtime, controlFile, version, now, wallNow, limits, log, env }
   */
  constructor({ runtime, controlFile, version = '0.0.0', now = () => performance.now(), wallNow = () => Date.now(), limits = {}, log = () => {}, env = process.env } = {}) {
    this.runtime = runtime;
    this.controlFile = controlFile || defaultControlPath({ env });
    this.auditFile = path.join(path.dirname(this.controlFile), 'audit.jsonl');
    this.version = version;
    this.now = now;
    this.wallNow = wallNow;
    this.limits = { ...CHANNEL_LIMITS, ...limits };
    this.log = log;
    this.server = null;
    this.token = null;
    this.port = null;
    this.host = '';
    this.paired = false;
    this.pairedClient = null;
    this.pairings = new Map();
    this.surfaces = new Map(); // deviceId → { keys: Map, dials: Map, revision, history: [], layout }
    this.audit = [];
    this.buckets = { request: null, pair: null, device: new Map(), key: new Map(), apply: new Map() };
    this.starting = null;
    runtime.liveStatus = () => this.piStatus();
    runtime.on('globals', (g) => { (g.aiEditing ? this.start() : this.stop('ai editing switched off')).catch((e) => this.log('error', `live: ${e.message}`)); });
    runtime.on('pair-press', (e) => this.onPairPress(e));
    runtime.on('pi-live', (p) => { if (p.action === 'deny') this.denyPending('denied in the property inspector'); if (p.action === 'revoke') this.revoke('revoked in the property inspector'); });
    runtime.on('prompt-lost', () => { const p = this.pendingPairing(); if (p) this.runtime.setPrompt({ code: p.code, client: p.client }); });
    runtime.on('behavior', (e) => this.onBehavior(e));
  }

  get running() { return !!this.server; }

  // ── lifecycle ────────────────────────────────────────────────────────────────
  async start() {
    if (this.server) return this;
    if (this.starting) return this.starting;
    this.starting = (async () => {
      this.token = crypto.randomBytes(32).toString('hex');
      this.paired = false;
      this.pairedClient = null;
      const L = this.limits;
      this.buckets.request = new TokenBucket(L.requestsPerSec, L.requestBurst, this.now);
      this.buckets.pair = new TokenBucket(L.pairRequestsPerSec, 1, this.now);
      const server = http.createServer((req, res) => this.handle(req, res));
      server.headersTimeout = 10_000;
      server.requestTimeout = 15_000;
      await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
      server.unref?.();
      this.server = server;
      this.port = server.address().port;
      this.host = `127.0.0.1:${this.port}`;
      writePrivateJson(this.controlFile, { v: API_VERSION, port: this.port, token: this.token, pid: process.pid, plugin: PLUGIN_UUID, version: this.version, startedAt: new Date(this.wallNow()).toISOString() });
      this.record(null, 'channel', { state: 'started', port: this.port });
      this.log('info', `live control channel on ${this.host}`);
      this.runtime.sendPiState?.();
      return this;
    })();
    try { return await this.starting; } finally { this.starting = null; }
  }

  async stop(reason = 'stopped') {
    if (this.starting) await this.starting.catch(() => {});
    const server = this.server;
    this.server = null;
    removeFile(this.controlFile);
    this.denyPending(reason);
    this.paired = false;
    this.pairedClient = null;
    this.token = null;
    if (this.surfaces.size) { this.surfaces.clear(); this.runtime.clearAllOverlays(); }
    if (server) {
      await new Promise((r) => { server.close(() => r()); server.closeAllConnections?.(); });
      this.record(null, 'channel', { state: 'stopped', reason });
    }
    this.runtime.sendPiState?.();
  }

  // ── pairing ──────────────────────────────────────────────────────────────────
  pendingPairing() {
    for (const p of this.pairings.values()) if (p.status === 'pending') {
      if (this.wallNow() > p.expiresAt) { this.expire(p); continue; }
      return p;
    }
    return null;
  }

  expire(p) { if (p.status !== 'pending') return; p.status = 'expired'; clearTimeout(p.timer); this.runtime.setPrompt(null); this.record(null, 'pair', { status: 'expired', client: p.client }); }

  denyPending(reason) {
    const p = this.pendingPairing();
    if (!p) return;
    p.status = 'denied'; clearTimeout(p.timer);
    this.runtime.setPrompt(null);
    this.record(null, 'pair', { status: 'denied', client: p.client, reason });
  }

  revoke(reason) {
    if (!this.paired) return;
    this.paired = false;
    this.record(null, 'pair', { status: 'revoked', client: this.pairedClient, reason });
    this.pairedClient = null;
    this.runtime.sendPiState?.();
  }

  onPairPress() {
    const p = this.pendingPairing();
    if (!p) return;
    p.status = 'approved'; clearTimeout(p.timer);
    this.paired = true;
    this.pairedClient = p.client;
    this.runtime.setPrompt(null);
    this.record(null, 'pair', { status: 'approved', client: p.client });
    this.runtime.sendPiState?.();
  }

  piStatus() {
    const p = this.server ? this.pendingPairing() : null;
    return { running: this.running, aiEditing: this.runtime.globals.aiEditing, paired: this.paired, client: this.pairedClient, pending: p ? { code: p.code, client: p.client, expiresAt: new Date(p.expiresAt).toISOString() } : null, edits: [...this.surfaces.values()].reduce((s, x) => s + x.keys.size + x.dials.size, 0), audit: this.audit.slice(-8) };
  }

  // ── state ────────────────────────────────────────────────────────────────────
  surface(deviceId) {
    if (!this.surfaces.has(deviceId)) this.surfaces.set(deviceId, { keys: new Map(), dials: new Map(), revision: 0, history: [], layout: null });
    return this.surfaces.get(deviceId);
  }

  push(deviceId, s) {
    this.runtime.setOverlays(deviceId, { keys: s.keys, dials: s.dials });
    if (!s.keys.size && !s.dials.size && !s.history.length) this.surfaces.delete(deviceId);
  }

  snapshotState(s) { return { keys: mapToObj(s.keys), dials: mapToObj(s.dials), layout: s.layout ? { ...s.layout } : null }; }

  commit(deviceId, s, kind, detail) {
    s.history.push(this.snapshotState(s));
    if (s.history.length > this.limits.historyDepth) s.history.shift();
    s.revision++;
    this.record(deviceId, kind, { ...detail, revision: s.revision });
  }

  record(deviceId, kind, detail) {
    const e = { at: new Date(this.wallNow()).toISOString(), ...(deviceId ? { deviceId } : {}), kind, ...(this.pairedClient ? { client: this.pairedClient } : {}), detail };
    this.audit.push(e);
    if (this.audit.length > this.limits.auditMemory) this.audit.shift();
    appendJsonl(this.auditFile, e);
  }

  /** A press on a live key: safe behaviors only (toggle / page / app state). Not an AI edit: no history. */
  onBehavior({ device, controller, col, row, overlay }) {
    const s = this.surfaces.get(device);
    if (!s) return;
    const id = `${col},${row}`;
    const map = controller === 'Keypad' ? s.keys : s.dials;
    const ov = map.get(id);
    if (!ov || ov !== overlay) return;
    const kind = ov.behavior?.kind;
    if (kind === 'prism.toggle') map.set(id, { ...ov, state: ov.state ? 0 : 1 });
    else if (kind === 'prism.app' || (kind !== 'prism.page' && ov.facet)) { const f = ov.facet && findFacet(ov.facet); if (f) map.set(id, { ...ov, state: nextState(f, ov.state || 0) }); }
    else if (kind === 'prism.page' && s.layout?.pages?.[ov.behavior.page]) {
      const page = s.layout.pages[ov.behavior.page];
      s.keys = objToMap(page.keys); s.dials = objToMap(page.dials); s.layout.current = ov.behavior.page;
      this.record(device, 'page', { page: ov.behavior.page, by: 'press' });
    } else return;
    this.push(device, s);
  }

  // ── HTTP ─────────────────────────────────────────────────────────────────────
  send(res, status, body, headers = {}) {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...headers });
    res.end(JSON.stringify(body));
  }
  fail(res, status, code, message, data) { this.send(res, status, { error: { code, message, ...(data ? { data } : {}) } }, status === 429 && data?.retryAfterMs ? { 'retry-after': String(Math.max(1, Math.ceil(data.retryAfterMs / 1000))) } : {}); }

  handle(req, res) {
    // 1. DNS-rebinding defence: Host must be exactly our loopback address.
    if (req.headers.host !== this.host) return this.fail(res, 421, 'bad_host', 'Host header must be the loopback address of this channel');
    // 2. No browsers: any Origin header means a web page is calling.
    if (req.headers.origin !== undefined) return this.fail(res, 403, 'origin_refused', 'Browser requests are not allowed');
    // 3. Bearer token, constant time.
    const auth = String(req.headers.authorization || '');
    if (!this.token || !auth.startsWith('Bearer ') || !tokensEqual(auth.slice(7), this.token)) return this.fail(res, 401, 'unauthorized', 'Missing or wrong bearer token');
    // 4. Per-token request rate.
    if (!this.buckets.request.has(1)) return this.fail(res, 429, 'rate_limited', 'Too many requests', { retryAfterMs: this.buckets.request.waitMs(1) });
    this.buckets.request.take(1);
    const url = new URL(req.url, `http://${this.host}`);
    const route = `${req.method} ${url.pathname}`;
    const routes = { 'GET /v1/status': 'status', 'GET /v1/snapshot': 'snapshot', 'POST /v1/pair': 'pair', 'POST /v1/ops': 'ops', 'POST /v1/apply': 'apply', 'POST /v1/undo': 'undo' };
    const name = routes[route];
    if (!name) return this.fail(res, 404, 'not_found', `No route ${route}`);
    if (req.method === 'GET') return this.run(name, res, null, url);
    if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) { req.resume(); return this.fail(res, 415, 'unsupported_media_type', 'Use Content-Type: application/json'); }
    const declared = Number(req.headers['content-length']);
    if (declared > this.limits.bodyBytes) { req.resume(); return this.fail(res, 413, 'too_large', `Body exceeds ${this.limits.bodyBytes} bytes`); }
    let size = 0, aborted = false;
    const chunks = [];
    req.on('data', (c) => {
      if (aborted) return;
      size += c.length;
      if (size > this.limits.bodyBytes) { aborted = true; this.fail(res, 413, 'too_large', `Body exceeds ${this.limits.bodyBytes} bytes`); req.resume(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (aborted) return;
      let body;
      try { body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}; } catch { return this.fail(res, 400, 'bad_json', 'Body is not valid JSON'); }
      if (!body || typeof body !== 'object' || Array.isArray(body)) return this.fail(res, 400, 'bad_json', 'Body must be a JSON object');
      this.run(name, res, body, url);
    });
  }

  run(name, res, body, url) {
    try { this[`r_${name}`](res, body, url); } catch (e) { this.log('error', `live ${name}: ${e.stack || e.message}`); this.fail(res, 500, 'internal', 'Internal error'); }
  }

  requireWrite(res) {
    if (!this.runtime.globals.aiEditing) { this.fail(res, 403, 'ai_editing_off', 'AI editing is switched off in the Prism Deck plugin settings. Ask the user to enable it.'); return false; }
    if (!this.paired) { this.fail(res, 403, 'not_paired', 'Not paired. Call POST /v1/pair, then the user approves by pressing and holding the glowing Prism key on their deck for 1.5 s.'); return false; }
    return true;
  }

  device(res, deviceId) {
    const d = this.runtime.devices.get(deviceId);
    if (!d) { this.fail(res, 404, 'unknown_device', 'Unknown deviceId', { devices: [...this.runtime.devices.keys()] }); return null; }
    return d;
  }

  bucket(map, id, rate, burst = rate) { if (!map.has(id)) map.set(id, new TokenBucket(rate, burst, this.now)); return map.get(id); }

  r_status(res) {
    const p = this.pendingPairing();
    const devices = this.runtime.liveDevices().map((d) => {
      const s = this.surfaces.get(d.id);
      return { ...d, revision: s?.revision || 0, surface: { keys: s?.keys.size || 0, dials: s?.dials.size || 0, page: s?.layout?.current || null } };
    });
    const L = this.limits;
    this.send(res, 200, {
      api: API_VERSION, plugin: PLUGIN_UUID, version: this.version, aiEditing: this.runtime.globals.aiEditing, paired: this.paired,
      pendingPrompt: p ? { pairingId: p.id, code: p.code, client: p.client, expiresAt: new Date(p.expiresAt).toISOString() } : null,
      devices,
      limits: { perKeyPerSec: L.perKeyPerSec, perDevicePerSec: L.perDevicePerSec, appliesPerSec: L.appliesPerSec, requestsPerSec: L.requestsPerSec, bodyBytes: L.bodyBytes, imageBytes: LIMITS.imageBytes, opsPerRequest: LIMITS.opsPerRequest },
    });
  }

  r_pair(res, body) {
    if (!this.runtime.globals.aiEditing) return this.fail(res, 403, 'ai_editing_off', 'AI editing is switched off in the Prism Deck plugin settings.');
    if (body.pairingId !== undefined) {
      const p = this.pairings.get(String(body.pairingId));
      if (!p) return this.fail(res, 404, 'unknown_pairing', 'No such pairing');
      if (p.status === 'pending' && this.wallNow() > p.expiresAt) this.expire(p);
      return this.send(res, 200, { pairingId: p.id, status: p.status, code: p.code, expiresAt: new Date(p.expiresAt).toISOString() });
    }
    if (this.paired) return this.send(res, 200, { status: 'approved', note: 'already paired' });
    if (!this.buckets.pair.has(1)) return this.fail(res, 429, 'rate_limited', 'One pairing request every few seconds', { retryAfterMs: this.buckets.pair.waitMs(1) });
    const client = String(body.client ?? 'AI assistant').replace(/[^\x20-\x7e]/g, '').trim().slice(0, 64) || 'AI assistant';
    const code = crypto.randomInt(0, 10000).toString().padStart(4, '0');
    const prev = this.pendingPairing();
    if (prev) { prev.status = 'expired'; clearTimeout(prev.timer); }
    const shown = this.runtime.setPrompt({ code, client });
    if (!shown) return this.fail(res, 409, 'no_physical_key', 'No Prism key is visible on a physical deck. Ask the user to show a page with a Prism Display key (the MCP Deck and Virtual Stream Deck cannot approve).');
    this.buckets.pair.take(1);
    const p = { id: crypto.randomUUID(), code, client, status: 'pending', expiresAt: this.wallNow() + this.limits.pairingTtlMs };
    p.timer = setTimeout(() => this.expire(p), this.limits.pairingTtlMs);
    p.timer.unref?.();
    this.pairings.set(p.id, p);
    if (this.pairings.size > 32) this.pairings.delete(this.pairings.keys().next().value);
    this.record(null, 'pair', { status: 'pending', client, keys: shown });
    this.runtime.sendPiState?.();
    this.send(res, 202, { pairingId: p.id, status: 'pending', code, expiresAt: new Date(p.expiresAt).toISOString(), instructions: `Ask the user to press and hold (1.5 s, until its ring is full) the glowing Prism key that shows ${code} on their deck within ${Math.round(this.limits.pairingTtlMs / 1000)} s. Then poll with { pairingId }.` });
  }

  r_snapshot(res, body, url) {
    const dev = this.device(res, url.searchParams.get('deviceId'));
    if (!dev) return;
    const s = this.surfaces.get(dev.id);
    const render = url.searchParams.get('render') === '1';
    const live = this.runtime.liveDevices().find((d) => d.id === dev.id);
    const keys = live.prismKeys.map(({ col, row }) => {
      const ov = s?.keys.get(`${col},${row}`);
      return { col, row, live: !!ov, look: publicOverlay(ov), behavior: ov?.behavior || null, ...(render ? { svg: this.runtime.currentSvg(dev.id, 'Keypad', col, row) } : {}) };
    });
    const dials = live.prismDials.map(({ dial, layer }) => {
      const ov = s?.dials.get(`${dial},${layer}`);
      return { dial, layer, live: !!ov, feedback: publicOverlay(ov), behavior: ov?.behavior || null, ...(render ? { svg: this.runtime.currentSvg(dev.id, 'Encoder', dial, layer) } : {}) };
    });
    this.send(res, 200, { deviceId: dev.id, revision: s?.revision || 0, page: s?.layout?.current || null, keys, dials, pending: { keys: [...(s?.keys.keys() || [])].filter((id) => !keys.some((k) => `${k.col},${k.row}` === id)) } });
  }

  r_ops(res, body) {
    if (!this.requireWrite(res)) return;
    const dev = this.device(res, body.deviceId);
    if (!dev) return;
    const { errors, warnings, plan } = planOps(dev, body.ops);
    if (errors.length) {
      const blocked = errors.some((e) => e.code === 'requires_export' || e.code === 'forbidden_behavior');
      return this.fail(res, blocked ? 403 : 400, blocked ? 'behavior_not_allowed' : 'invalid_ops', 'Rejected; nothing was applied', { errors, warnings });
    }
    // Rate limits: check every bucket, then consume (all or nothing).
    const L = this.limits;
    const db = this.bucket(this.buckets.device, dev.id, L.perDevicePerSec);
    const perKey = new Map();
    for (const st of plan) perKey.set(`${st.kind}:${st.id}`, (perKey.get(`${st.kind}:${st.id}`) || 0) + 1);
    let retry = db.has(plan.length) ? 0 : db.waitMs(plan.length);
    for (const [id, n] of perKey) { const b = this.bucket(this.buckets.key, `${dev.id}|${id}`, L.perKeyPerSec); if (!b.has(n)) retry = Math.max(retry, b.waitMs(n)); }
    if (retry) return this.fail(res, 429, 'rate_limited', 'Too many updates; slow down or batch them', { retryAfterMs: retry });
    const live = this.runtime.liveDevices().find((d) => d.id === dev.id);
    for (const st of plan) {
      const present = st.kind === 'key' ? live.prismKeys.some((k) => `${k.col},${k.row}` === st.id) : live.prismDials.some((d) => `${d.dial},${d.layer}` === st.id);
      if (!present && st.set) warnings.push({ path: `$.${st.kind}s.${st.id}`, code: 'no_prism_action', message: `no Prism action at ${st.kind} ${st.id} right now; it shows when one appears there` });
    }
    if (body.dryRun) return this.send(res, 200, { dryRun: true, wouldApply: plan.length, warnings });
    db.take(plan.length);
    for (const [id, n] of perKey) this.bucket(this.buckets.key, `${dev.id}|${id}`, L.perKeyPerSec).take(n);
    const s = this.surface(dev.id);
    this.commit(dev.id, s, 'ops', { count: plan.length });
    for (const st of plan) { const m = st.kind === 'key' ? s.keys : s.dials; if (st.set) m.set(st.id, st.set); else m.delete(st.id); }
    this.push(dev.id, s);
    this.send(res, 200, { applied: plan.length, revision: s.revision, warnings });
  }

  r_apply(res, body) {
    if (!this.requireWrite(res)) return;
    const dev = this.device(res, body.deviceId);
    if (!dev) return;
    const v = validateLayout(body.layout, dev);
    if (!v.ok) {
      const blocked = v.errors.some((e) => e.code === 'requires_export' || e.code === 'forbidden_behavior');
      const mismatch = v.errors.find((e) => e.code === 'device_mismatch');
      if (mismatch && !blocked) return this.fail(res, 400, 'device_mismatch', mismatch.message, { errors: v.errors });
      return this.fail(res, blocked ? 403 : 400, blocked ? 'behavior_not_allowed' : 'invalid_layout', 'Rejected; nothing was applied', { errors: v.errors, warnings: v.warnings });
    }
    const pageId = body.page ?? v.order[0];
    const page = v.pages.get(pageId);
    if (!page) return this.fail(res, 400, 'unknown_page', `no page "${pageId}"`);
    const ab = this.bucket(this.buckets.apply, dev.id, this.limits.appliesPerSec, 1);
    if (!ab.has(1)) return this.fail(res, 429, 'rate_limited', 'Only one full-surface apply per second per device', { retryAfterMs: ab.waitMs(1) });
    const s = this.surface(dev.id);
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const diff = {
      keysSet: [...page.keys].filter(([id, ov]) => !same(s.keys.get(id), ov)).length,
      keysCleared: [...s.keys.keys()].filter((id) => !page.keys.has(id)).length,
      dialsSet: [...page.dials].filter(([id, ov]) => !same(s.dials.get(id), ov)).length,
      dialsCleared: [...s.dials.keys()].filter((id) => !page.dials.has(id)).length,
    };
    if (body.dryRun) return this.send(res, 200, { dryRun: true, page: pageId, diff, warnings: v.warnings });
    ab.take(1);
    this.commit(dev.id, s, 'apply', { page: pageId, ...diff });
    s.keys = new Map(page.keys); s.dials = new Map(page.dials);
    s.layout = { current: pageId, pages: Object.fromEntries([...v.pages].map(([id, p]) => [id, { keys: mapToObj(p.keys), dials: mapToObj(p.dials) }])) };
    this.push(dev.id, s);
    this.send(res, 200, { applied: true, page: pageId, diff, revision: s.revision, warnings: v.warnings });
  }

  r_undo(res, body) {
    if (!this.requireWrite(res)) return;
    const dev = this.device(res, body.deviceId);
    if (!dev) return;
    const s = this.surfaces.get(dev.id);
    const depth = s?.history.length || 0;
    if (!depth) return this.fail(res, 409, 'nothing_to_undo', 'No history for this device');
    const steps = Math.min(Math.max(1, Math.trunc(Number(body.steps) || 1)), depth);
    let snap;
    for (let i = 0; i < steps; i++) snap = s.history.pop();
    s.keys = objToMap(snap.keys); s.dials = objToMap(snap.dials); s.layout = snap.layout;
    s.revision++;
    this.record(dev.id, 'undo', { steps, revision: s.revision });
    const revision = s.revision, remaining = s.history.length;
    this.push(dev.id, s);
    this.send(res, 200, { undone: steps, revision, remaining });
  }
}
