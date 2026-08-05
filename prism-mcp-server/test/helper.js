// Test helpers: build a server/store from the in-memory fixture (no fs), and a
// direct tool-caller that mirrors what tools/call does.
import { CatalogStore, normalizeCatalog } from '../utils/catalog.js';
import { CollectionStore } from '../utils/collections.js';
import { buildTools, ToolError } from '../tools/index.js';
import { createLogger } from '../utils/logger.js';
import { FIXTURE } from './fixture.js';

const silentLogger = createLogger('silent');

/** A CatalogStore preloaded from the fixture, bypassing file IO. */
export function fixtureStore() {
  const store = new CatalogStore('(fixture)', { watch: false, logger: silentLogger });
  store.catalog = normalizeCatalog(FIXTURE);
  store._reindex();
  return store;
}

export function toolCtx() {
  const store = fixtureStore();
  // In-memory so collection tests never touch disk (and don't leak state between tests).
  const collections = new CollectionStore({ inMemory: true, logger: silentLogger });
  const tools = buildTools();
  const map = new Map(tools.map((t) => [t.name, t]));
  return {
    store,
    collections,
    tools,
    /** Call a tool handler directly; returns its result or throws ToolError. */
    call(name, args = {}) {
      const t = map.get(name);
      if (!t) throw new Error(`no such tool ${name}`);
      return t.handler(args, { store, collections, logger: silentLogger });
    },
    /** Call and capture a ToolError instead of throwing (for negative tests). */
    callSafe(name, args = {}) {
      try { return { ok: true, result: this.call(name, args) }; }
      catch (e) { return { ok: false, error: e, isToolError: e instanceof ToolError }; }
    },
  };
}

export { ToolError };
