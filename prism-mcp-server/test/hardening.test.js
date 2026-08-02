// Regression tests for the 5 security/stability fixes from the PR #2 review (JFH-10):
//   1+2. JSON.parse guarded in parseIsland + loadCatalogFile (no unhandled crash)
//   3.   _reindex() null-guards a failed/incomplete catalog load
//   4.   StdioTransport bounds buffer growth (DoS via newline-less flood)
//   5.   export_collection neutralizes </style>/</script> in the generated document
import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { EventEmitter } from 'node:events';
import { parseIsland, loadCatalogFile, CatalogStore } from '../utils/catalog.js';
import { StdioTransport } from '../index.js';
import { toolCtx } from './helper.js';

// -------- Fixes #1 & #2: guarded JSON.parse --------

test('parseIsland throws a clear, catchable error on malformed island JSON', () => {
  const html = '<script type="application/json" id="prism-catalog">{ not: valid json }</script>';
  assert.throws(() => parseIsland(html), /Failed to parse prism-catalog JSON island/);
});

test('parseIsland still parses a well-formed island', () => {
  const html = '<script type="application/json" id="prism-catalog">{"effects":[],"galleries":[]}</script>';
  const cat = parseIsland(html);
  assert.deepEqual(cat.effects, []);
});

test('loadCatalogFile throws a clear error (with path) on malformed JSON file', async () => {
  const tmp = path.join(os.tmpdir(), `prism-bad-${process.pid}.json`);
  fs.writeFileSync(tmp, '{ "effects": [ ');
  try {
    await assert.rejects(() => loadCatalogFile(tmp), /Failed to parse catalog JSON from .*prism-bad-/);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
});

// -------- Fix #3: _reindex null-guard --------

test('_reindex does not crash when catalog is null (failed load)', () => {
  const store = new CatalogStore('(none)', { watch: false });
  store.catalog = null;
  assert.doesNotThrow(() => store._reindex());
  assert.equal(store.all().length, 0);
  // meta() must also be safe to call after a failed load
  assert.equal(store.meta().effectCount, 0);
});

test('_reindex tolerates a catalog missing its effects array, still layers runtime facets', () => {
  const store = new CatalogStore('(none)', { watch: false });
  store.catalog = { galleries: [] }; // no effects[]
  assert.doesNotThrow(() => store._reindex());
  const created = store.addRuntimeFacet({ id: 'x-runtime', name: 'X', gallery: 'x', html: '<i></i>' });
  assert.equal(created.id, 'x-runtime');
  assert.ok(store.has('x-runtime'), 'runtime facet discoverable even with a degraded catalog');
});

// -------- Fix #4: StdioTransport buffer cap --------

test('StdioTransport rejects an oversized newline-less message and resets the buffer', () => {
  const input = new EventEmitter();
  input.setEncoding = () => {};
  const sent = [];
  const output = { write: (s) => sent.push(s) };
  const t = new StdioTransport({ input, output, maxBufferSize: 1024 });
  let delivered = 0;
  t.onMessage(() => { delivered++; });
  t.start();

  input.emit('data', 'x'.repeat(2048)); // no newline -> should be rejected, not buffered

  assert.equal(delivered, 0, 'no message delivered');
  assert.equal(t.buffer, '', 'buffer reset after rejection');
  const err = JSON.parse(sent[0]);
  assert.equal(err.error.code, -32600);
  assert.match(err.error.data.detail, /limit/);
});

test('StdioTransport still delivers normal newline-delimited messages under the cap', () => {
  const input = new EventEmitter();
  input.setEncoding = () => {};
  const output = { write: () => {} };
  const t = new StdioTransport({ input, output, maxBufferSize: 1024 });
  const got = [];
  t.onMessage((m) => got.push(m));
  t.start();
  input.emit('data', '{"jsonrpc":"2.0","id":1,"method":"ping"}\n');
  assert.equal(got.length, 1);
  assert.equal(got[0].method, 'ping');
});

// -------- Fix #5: export_collection document neutralization --------

test('export_collection asDocument neutralizes a </style> injection in composed CSS', () => {
  const ctx = toolCtx();
  // Register a facet whose CSS smuggles a </style> breakout + script.
  ctx.call('create_facet', {
    id: 'charts-evil', name: 'Evil', gallery: 'charts',
    description: 'malicious css breakout test facet',
    html: '<div class="evil"></div>',
    css: '.evil{color:red}</style><script>window.__pwned=1</script>',
  });
  const b = ctx.call('export_collection', { ids: ['charts-evil'], asDocument: true });
  // The raw closing sequence must not survive verbatim inside the <style> block.
  assert.ok(!b.document.includes('</style><script>'), 'style breakout neutralized');
  assert.ok(!/<script>window\.__pwned/.test(b.document), 'injected script tag neutralized');
  assert.equal(b.sanitized, true);
  assert.ok(b.warnings.some((w) => /Neutralized/.test(w)));
});

test('export_collection asDocument neutralizes a <script> in composed HTML body', () => {
  const ctx = toolCtx();
  ctx.call('create_facet', {
    id: 'charts-evil2', name: 'Evil2', gallery: 'charts',
    description: 'malicious html breakout test facet',
    html: '<div class="evil2"></div><script>window.__pwned=2</script>',
    css: '.evil2{color:blue}',
  });
  const b = ctx.call('export_collection', { ids: ['charts-evil2'], asDocument: true });
  assert.ok(!/<script>window\.__pwned=2/.test(b.document), 'body script neutralized');
  assert.equal(b.sanitized, true);
});

test('export_collection asDocument leaves clean content unflagged', () => {
  const ctx = toolCtx();
  const b = ctx.call('export_collection', { ids: ['charts-kpi-pulse'], asDocument: true });
  assert.ok(b.document.startsWith('<!DOCTYPE html>'));
  assert.notEqual(b.sanitized, true);
});
