// Protocol-level tests: drive PrismMCPServer.handleMessage() directly (no real stdio),
// and prove the loader parses the real Prism.html island.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { PrismMCPServer, PROTOCOL_VERSION } from '../index.js';
import { normalizeCatalog } from '../utils/catalog.js';
import { FIXTURE } from './fixture.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PRISM_HTML = path.resolve(HERE, '..', '..', 'Prism.html');

/** Build a server whose store is preloaded from the fixture (no file IO). */
function fixtureServer() {
  const server = new PrismMCPServer('(fixture)', { watch: false, logLevel: 'silent', collectionsInMemory: true });
  server.store.catalog = normalizeCatalog(FIXTURE);
  server.store._reindex();
  return server;
}

test('initialize returns protocol version + serverInfo', async () => {
  const s = fixtureServer();
  const res = await s.handleMessage({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: PROTOCOL_VERSION, capabilities: {} } });
  assert.equal(res.result.protocolVersion, PROTOCOL_VERSION);
  assert.equal(res.result.serverInfo.name, 'prism-mcp-server');
  assert.ok(res.result.capabilities.tools);
});

test('notification (no id) yields no response', async () => {
  const s = fixtureServer();
  const res = await s.handleMessage({ jsonrpc: '2.0', method: 'notifications/initialized' });
  assert.equal(res, null);
  assert.equal(s.initialized, true);
});

test('tools/list returns 58 tools with schemas (34 web/terminal + 16 deck design + 8 deck live)', async () => {
  const s = fixtureServer();
  const res = await s.handleMessage({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  assert.equal(res.result.tools.length, 58);
  assert.equal(new Set(res.result.tools.map((t) => t.name)).size, 58, 'tool names are unique');
  for (const t of res.result.tools) {
    assert.ok(t.name && t.description && t.inputSchema, `tool ${t.name} well-formed`);
    assert.equal(t.inputSchema.type, 'object');
  }
  const deck = res.result.tools.filter((t) => t.name.startsWith('deck_'));
  assert.equal(deck.length, 24);
  assert.ok(deck.every((t) => t.annotations && typeof t.annotations.readOnlyHint === 'boolean'), 'deck tools carry MCP annotations');
  assert.equal(res.result.tools.find((t) => t.name === 'deck_live_apply_layout').annotations.destructiveHint, true);
  assert.ok(!res.result.tools.some((t) => /^streamdeck__|^bridge_status$/.test(t.name)), 'names never collide with Elgato\'s MCP');
});

test('tools/call wraps result in MCP content', async () => {
  const s = fixtureServer();
  const res = await s.handleMessage({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'get_catalog_stats', arguments: {} } });
  assert.equal(res.result.isError, false);
  const payload = JSON.parse(res.result.content[0].text);
  assert.equal(payload.totalEffects, 3);
});

test('tools/call on ToolError returns isError:true (not a protocol error)', async () => {
  const s = fixtureServer();
  const res = await s.handleMessage({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'get_effect', arguments: { id: 'ghost' } } });
  assert.equal(res.result.isError, true);
  const payload = JSON.parse(res.result.content[0].text);
  assert.equal(payload.code, 'not_found');
});

test('unknown method yields -32601', async () => {
  const s = fixtureServer();
  const res = await s.handleMessage({ jsonrpc: '2.0', id: 5, method: 'does/not/exist' });
  assert.equal(res.error.code, -32601);
});

test('unknown tool yields -32602 with available tools', async () => {
  const s = fixtureServer();
  const res = await s.handleMessage({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'nope' } });
  assert.equal(res.error.code, -32602);
  assert.ok(res.error.data.availableTools.length === 58);
});

test('ping responds', async () => {
  const s = fixtureServer();
  const res = await s.handleMessage({ jsonrpc: '2.0', id: 7, method: 'ping' });
  assert.deepEqual(res.result, {});
});

// --- real catalog loader against the production island ---
test('loads the real Prism.html island (authoritative catalog)', async (t) => {
  if (!fs.existsSync(PRISM_HTML)) return t.skip('Prism.html not found');
  const server = new PrismMCPServer(PRISM_HTML, { watch: false, logLevel: 'silent' });
  await server.load();
  const meta = server.store.meta();
  assert.ok(meta.effectCount > 1000, `expected >1000 effects, got ${meta.effectCount}`);
  assert.ok(meta.galleryCount >= 12);
  // a known effect from the charts gallery should resolve with html+css
  const list = server.store.gallery('charts');
  assert.ok(list.length > 0);
  const e = server.store.get(list[0].id);
  assert.ok(e.html.length > 0);
  server.close();
});

test('real catalog: composed bundles define every var() they read (theme tokens + gallery-level :root tokens)', async (t) => {
  if (!fs.existsSync(PRISM_HTML)) return t.skip('Prism.html not found');
  const { CatalogStore } = await import('../utils/catalog.js');
  const { compose } = await import('../utils/compose.js');
  const store = new CatalogStore(PRISM_HTML, { watch: false });
  await store.load();
  assert.match(store.galleryTokens('spectrums')['--glm-accent-rgb'] || '', /var\(--accent-rgb/, 'gallery :root tokens are harvested from the gallery templates');
  // a whole gallery (the bulk of the catalog uses only theme tokens) composes with no undefined var()
  const charts = compose(store.gallery('charts').map((x) => x.id), store, { theme: 'prism-light' });
  assert.deepEqual(charts.tokens.unresolved, []);
  const glass = store.all().find((x) => /--glm-/.test(x.css));
  if (glass) {
    const r = compose([glass.id], store, {});
    assert.deepEqual(r.tokens.unresolved, [], glass.id);
    assert.match(r.css, /--glm-accent-rgb:var\(--accent-rgb, 255,153,0\)/);
    assert.match(r.css, /--accent-rgb:184,162,242/, 'and the theme token it refers to (Prism Night)');
  }
  const misses = store.all().filter((x) => compose([x.id], store, {}).tokens.unresolved.length);
  assert.ok(misses.length / store.all().length < 0.05, `${misses.length} effects still read undefined vars (record-extraction gaps): ${misses.slice(0, 5).map((x) => x.id).join(', ')}`);
  store.close();
});
