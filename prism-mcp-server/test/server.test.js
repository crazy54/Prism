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

test('tools/list returns 29 tools with schemas', async () => {
  const s = fixtureServer();
  const res = await s.handleMessage({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  assert.equal(res.result.tools.length, 29);
  for (const t of res.result.tools) {
    assert.ok(t.name && t.description && t.inputSchema, `tool ${t.name} well-formed`);
    assert.equal(t.inputSchema.type, 'object');
  }
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
  assert.ok(res.error.data.availableTools.length === 29);
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
