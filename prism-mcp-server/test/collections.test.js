// Tests for the Collections & Favorites feature (JFH-7): the CollectionStore unit
// behavior, the 6 collection tools, and the overloaded export_collection.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toolCtx } from './helper.js';
import { CollectionStore, toExportSchema, COLLECTION_SCHEMA, LIMITS } from '../utils/collections.js';

// -------------------- CollectionStore unit tests (no fs) --------------------

test('CollectionStore create/get/list roundtrip', () => {
  const s = new CollectionStore({ inMemory: true });
  const c = s.create({ name: 'Dashboards', components: [{ id: 'a', name: 'A', gallery: 'charts' }] });
  assert.ok(c.id, 'assigns an id');
  assert.equal(c.name, 'Dashboards');
  assert.equal(c.components.length, 1);
  assert.equal(s.list().length, 1);
  assert.equal(s.get(c.id).name, 'Dashboards');
});

test('CollectionStore rejects duplicate names (case/space-insensitive)', () => {
  const s = new CollectionStore({ inMemory: true });
  s.create({ name: 'My Set' });
  assert.throws(() => s.create({ name: '  my   set ' }), (e) => e.code === 'duplicate_name');
});

test('CollectionStore enforces name/description/tag limits', () => {
  const s = new CollectionStore({ inMemory: true });
  assert.throws(() => s.create({ name: 'x'.repeat(LIMITS.maxNameLength + 1) }), (e) => e.code === 'invalid_argument');
  assert.throws(() => s.create({ name: 'ok', description: 'd'.repeat(LIMITS.maxDescriptionLength + 1) }), (e) => e.code === 'invalid_argument');
  assert.throws(() => s.create({ name: 'ok2', tags: ['1', '2', '3', '4', '5', '6'] }), (e) => e.code === 'invalid_argument');
});

test('CollectionStore requires a name', () => {
  const s = new CollectionStore({ inMemory: true });
  assert.throws(() => s.create({ name: '   ' }), (e) => e.code === 'invalid_argument');
});

test('CollectionStore collapses duplicate components on create', () => {
  const s = new CollectionStore({ inMemory: true });
  const c = s.create({ name: 'dups', components: ['a', 'a', 'b', { id: 'b' }] });
  assert.deepEqual(c.components.map((x) => x.id), ['a', 'b']);
});

test('CollectionStore addComponents dedupes and reports counts', () => {
  const s = new CollectionStore({ inMemory: true });
  const c = s.create({ name: 'grow', components: ['a'] });
  const r = s.addComponents(c.id, ['a', 'b', 'c']);
  assert.equal(r.added, 2);
  assert.equal(r.skipped, 1);
  assert.deepEqual(r.collection.components.map((x) => x.id), ['a', 'b', 'c']);
});

test('CollectionStore enforces 50-component cap on add', () => {
  const s = new CollectionStore({ inMemory: true });
  const many = Array.from({ length: 50 }, (_, i) => `e${i}`);
  const c = s.create({ name: 'full', components: many });
  assert.throws(() => s.addComponents(c.id, ['overflow']), (e) => e.code === 'limit_exceeded');
});

test('CollectionStore removeComponents removes by id', () => {
  const s = new CollectionStore({ inMemory: true });
  const c = s.create({ name: 'prune', components: ['a', 'b', 'c'] });
  const r = s.removeComponents(c.id, ['b', 'zzz']);
  assert.equal(r.removed, 1);
  assert.deepEqual(r.collection.components.map((x) => x.id), ['a', 'c']);
});

test('CollectionStore delete removes it', () => {
  const s = new CollectionStore({ inMemory: true });
  const c = s.create({ name: 'temp' });
  s.delete(c.id);
  assert.equal(s.has(c.id), false);
  assert.throws(() => s.get(c.id), (e) => e.code === 'not_found');
});

test('CollectionStore unknown id ops throw not_found', () => {
  const s = new CollectionStore({ inMemory: true });
  assert.throws(() => s.get('nope'), (e) => e.code === 'not_found');
  assert.throws(() => s.addComponents('nope', ['a']), (e) => e.code === 'not_found');
  assert.throws(() => s.delete('nope'), (e) => e.code === 'not_found');
});

test('toExportSchema shapes a portable prism-collection-1.0 object', () => {
  const s = new CollectionStore({ inMemory: true });
  const c = s.create({ name: 'Export Me', description: 'desc', tags: ['t'], components: [{ id: 'a', name: 'A', gallery: 'charts' }] });
  const ex = toExportSchema(c, { totalSize: 123 });
  assert.equal(ex.__schema, COLLECTION_SCHEMA);
  assert.equal(ex.name, 'Export Me');
  assert.equal(ex.componentCount, 1);
  assert.equal(ex.components[0].gallery, 'charts');
  assert.equal(ex.totalSize, 123);
  assert.ok(ex.exportedAt);
});

// -------------------- Tool-level integration tests --------------------

test('create_collection validates effect ids against the catalog', () => {
  const ctx = toolCtx();
  const c = ctx.call('create_collection', { name: 'Dash', effectIds: ['charts-kpi-pulse', 'charts-kpi-delta'] });
  assert.equal(c.name, 'Dash');
  assert.equal(c.components.length, 2);
  // stored records are enriched from the catalog
  assert.equal(c.components[0].name, 'Pulsing KPI Card');
  assert.equal(c.components[0].gallery, 'charts');
});

test('create_collection rejects unknown effect ids', () => {
  const ctx = toolCtx();
  const r = ctx.callSafe('create_collection', { name: 'Bad', effectIds: ['charts-kpi-pulse', 'ghost'] });
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'not_found');
  assert.deepEqual(r.error.data.missing, ['ghost']);
});

test('list_collections + get_collection reflect created state', () => {
  const ctx = toolCtx();
  const c = ctx.call('create_collection', { name: 'Set A', effectIds: ['charts-kpi-pulse'] });
  const listed = ctx.call('list_collections', {});
  assert.equal(listed.total, 1);
  assert.equal(listed.items[0].componentCount, 1);
  const got = ctx.call('get_collection', { collectionId: c.id });
  assert.equal(got.id, c.id);
  assert.equal(got.components[0].id, 'charts-kpi-pulse');
});

test('add_to_collection / remove_from_collection mutate and validate', () => {
  const ctx = toolCtx();
  const c = ctx.call('create_collection', { name: 'Mut', effectIds: ['charts-kpi-pulse'] });
  const added = ctx.call('add_to_collection', { collectionId: c.id, effectIds: ['charts-kpi-delta', 'charts-kpi-pulse'] });
  assert.equal(added.added, 1); // pulse already present -> skipped
  assert.equal(added.skipped, 1);
  assert.equal(added.collection.components.length, 2);

  const badAdd = ctx.callSafe('add_to_collection', { collectionId: c.id, effectIds: ['ghost'] });
  assert.equal(badAdd.ok, false);
  assert.equal(badAdd.error.code, 'not_found');

  const removed = ctx.call('remove_from_collection', { collectionId: c.id, effectIds: ['charts-kpi-pulse'] });
  assert.equal(removed.removed, 1);
  assert.equal(removed.collection.components.length, 1);
});

test('delete_collection removes it', () => {
  const ctx = toolCtx();
  const c = ctx.call('create_collection', { name: 'Bye' });
  const r = ctx.call('delete_collection', { collectionId: c.id });
  assert.equal(r.deleted, c.id);
  assert.equal(ctx.call('list_collections', {}).total, 0);
});

test('get_collection unknown id yields structured not_found', () => {
  const ctx = toolCtx();
  const r = ctx.callSafe('get_collection', { collectionId: 'nope' });
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'not_found');
});

test('export_collection by collectionId returns a bundle with collectionId', () => {
  const ctx = toolCtx();
  const c = ctx.call('create_collection', { name: 'Dash', effectIds: ['charts-kpi-pulse', 'charts-kpi-delta'] });
  const b = ctx.call('export_collection', { collectionId: c.id });
  assert.equal(b.title, 'Dash'); // falls back to collection name
  assert.equal(b.collectionId, c.id);
  assert.equal(b.effects.length, 2);
  assert.ok(b.css.length > 0);
});

test('export_collection format=schema yields prism-collection-1.0', () => {
  const ctx = toolCtx();
  const c = ctx.call('create_collection', { name: 'Portable', effectIds: ['charts-kpi-pulse'] });
  const ex = ctx.call('export_collection', { collectionId: c.id, format: 'schema' });
  assert.equal(ex.__schema, COLLECTION_SCHEMA);
  assert.equal(ex.componentCount, 1);
  assert.ok(typeof ex.totalSize === 'number' && ex.totalSize > 0);
});

test('export_collection format=schema requires a saved collection', () => {
  const ctx = toolCtx();
  const r = ctx.callSafe('export_collection', { ids: ['charts-kpi-pulse'], format: 'schema' });
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'invalid_argument');
});

test('export_collection format=document still works (back-compat)', () => {
  const ctx = toolCtx();
  const b = ctx.call('export_collection', { ids: ['charts-kpi-pulse'], format: 'document' });
  assert.ok(b.document.startsWith('<!DOCTYPE html>'));
  // legacy asDocument alias still honored
  const b2 = ctx.call('export_collection', { ids: ['charts-kpi-pulse'], asDocument: true });
  assert.ok(b2.document.includes('<style>'));
});

test('export_collection empty saved collection errors clearly', () => {
  const ctx = toolCtx();
  const c = ctx.call('create_collection', { name: 'Empty' });
  const r = ctx.callSafe('export_collection', { collectionId: c.id });
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'invalid_argument');
});
