// Test helpers for the Prism Deck tools: a tool caller over the real-catalog fixture,
// the real prism-deck engine (loaded once), an in-memory layout store and a control
// client pointed at a scratch path (tests never read the user's real control.json).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildTools, ToolError } from '../tools/index.js';
import { DeckCatalogStore } from '../utils/deck-catalog.js';
import { DeckEngine } from '../utils/deck-engine.js';
import { DeckLayoutStore } from '../utils/deck-layouts.js';
import { DeckControlClient } from '../utils/deck-control-client.js';
import { createLogger } from '../utils/logger.js';
import { DECK_FIXTURE } from './deck-fixture.js';

export const silent = createLogger('silent');
let ENGINE = null;
/** The real prism-deck engine next to this server (shared by all tests in a file). */
export async function engine() {
  if (!ENGINE) ENGINE = await new DeckEngine({ logger: silent }).load();
  return ENGINE;
}

/** A scratch directory under the OS temp dir, removed by cleanup(). */
export function scratch(prefix = 'prism-mcp-deck-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return { dir, file: (n) => path.join(dir, n), cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

export async function deckCtx({ controlPath, layouts, deck, clientName = null, timeoutMs = 3000 } = {}) {
  const e = await engine();
  const ctx = {
    deck: deck || new DeckCatalogStore({ raw: DECK_FIXTURE, logger: silent }),
    deckEngine: e,
    deckLayouts: layouts || new DeckLayoutStore({ inMemory: true, logger: silent }),
    // a path that never exists unless a test creates it
    deckControl: new DeckControlClient({ controlPath: controlPath || path.join(os.tmpdir(), `prism-mcp-no-such-dir-${process.pid}`, 'control.json'), timeoutMs }),
    clientName,
    logger: silent,
  };
  const map = new Map(buildTools().map((t) => [t.name, t]));
  return {
    ...ctx,
    ctx,
    async call(name, args = {}) {
      const t = map.get(name);
      if (!t) throw new Error(`no such tool ${name}`);
      return t.handler(args, ctx);
    },
    async callSafe(name, args = {}) {
      try { return { ok: true, result: await this.call(name, args) }; } catch (e) { return { ok: false, error: e, isToolError: e instanceof ToolError }; }
    },
  };
}

export { ToolError, DECK_FIXTURE };
