// Collections store (JFH-7): persist named sets of effect ids ("collections" /
// favorites) so an agent can save, grow, prune, and export component sets across
// sessions.
//
// Design notes:
//   - Disk-backed JSON by default (a single file — collections.json — next to the
//     server). Collections must survive process restarts and be referable "by name",
//     unlike the ephemeral runtime facets. An in-memory mode (no fs) is provided for
//     tests and for callers that don't want persistence.
//   - The store is intentionally catalog-agnostic: it stores component records
//     {id, name, gallery} that the tool layer resolves from the catalog before
//     handing them in. This keeps the store independently unit-testable.
//   - The on-disk shape is pragmatic (one index file). The cross-surface bridge to the
//     Prism.html UI is the export schema ("prism-collection-1.0"), NOT this file layout,
//     so the UI's localStorage split-file scheme and this file can evolve independently.
//   - Validation mirrors the JFH-7 spec constraints: name <=50 chars & unique,
//     description <=200 chars, <=5 tags, <=50 components, duplicate components collapsed.

import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const COLLECTION_SCHEMA = 'prism-collection-1.0';
export const LIMITS = Object.freeze({
  maxComponents: 50,
  maxNameLength: 50,
  maxDescriptionLength: 200,
  maxTags: 5,
});

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PATH = path.resolve(HERE, '..', 'collections.json');

/** Structured, catchable error carrying a machine code + data (translated to ToolError). */
export class CollectionError extends Error {
  constructor(message, { code = 'collection_error', data = null } = {}) {
    super(message);
    this.name = 'CollectionError';
    this.code = code;
    this.data = data;
  }
}

/** A now() that is safe to stub in tests; ISO strings are what the export schema uses. */
function nowIso() {
  return new Date().toISOString();
}

function normalizeName(name) {
  return String(name == null ? '' : name).trim();
}

/** Case/space-insensitive key for uniqueness checks. */
function nameKey(name) {
  return normalizeName(name).toLowerCase().replace(/\s+/g, ' ');
}

/** Coerce an arbitrary component input into a stored {id, name, gallery} record. */
function normalizeComponent(c) {
  if (typeof c === 'string') return { id: c, name: c, gallery: null };
  if (!c || typeof c !== 'object' || !c.id) return null;
  return { id: String(c.id), name: c.name || String(c.id), gallery: c.gallery || null };
}

export class CollectionStore {
  /**
   * @param {object} opts
   *   - filePath: where to persist (default: ../collections.json). Ignored if inMemory.
   *   - inMemory: keep collections in memory only (no fs). Default false.
   *   - logger: optional { info, warn, error, debug }
   */
  constructor({ filePath = DEFAULT_PATH, inMemory = false, logger = null } = {}) {
    this.inMemory = !!inMemory;
    this.filePath = this.inMemory ? null : path.resolve(filePath);
    this.logger = logger;
    // id -> collection record
    this.collections = new Map();
    if (!this.inMemory) this._loadFromDisk();
  }

  // ---------------------------------------------------------------- persistence
  _loadFromDisk() {
    try {
      if (!fs.existsSync(this.filePath)) return;
      const raw = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      const list = Array.isArray(raw) ? raw : Array.isArray(raw.collections) ? raw.collections : [];
      for (const c of list) {
        if (c && c.id) this.collections.set(String(c.id), c);
      }
      this._log('info', `Loaded ${this.collections.size} collection(s) from ${this.filePath}`);
    } catch (err) {
      // A corrupt/partially-written file must not crash the server — start empty and warn.
      this._log('warn', `Could not read collections file (starting empty): ${err.message}`);
    }
  }

  _persist() {
    if (this.inMemory) return;
    const payload = {
      version: '1.0',
      collections: Array.from(this.collections.values()),
      lastSynced: nowIso(),
    };
    try {
      // Atomic-ish write: write to a temp file then rename, so a crash mid-write can't
      // truncate the real file and lose every collection.
      const tmp = `${this.filePath}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(payload, null, 2));
      fs.renameSync(tmp, this.filePath);
    } catch (err) {
      this._log('error', `Failed to persist collections: ${err.message}`);
      throw new CollectionError(`Failed to persist collections: ${err.message}`, { code: 'persist_failed' });
    }
  }

  _log(level, msg) {
    if (this.logger) (this.logger[level] || this.logger.info)?.call(this.logger, msg);
  }

  // ---------------------------------------------------------------- queries
  /** Lightweight summaries for listing (no component payloads beyond counts). */
  list() {
    return Array.from(this.collections.values())
      .map(summarize)
      .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  }

  /** Full record (throws if unknown). */
  get(id) {
    const c = this.collections.get(String(id));
    if (!c) throw new CollectionError(`No collection with id "${id}"`, { code: 'not_found', data: { id } });
    return clone(c);
  }

  has(id) {
    return this.collections.has(String(id));
  }

  // ---------------------------------------------------------------- mutations
  /**
   * Create a collection. `components` is an array of {id,name,gallery} (or bare id
   * strings); duplicates are collapsed, order preserved.
   */
  create({ name, description = '', components = [], color = null, icon = null, tags = [] } = {}) {
    const cleanName = normalizeName(name);
    this._validateName(cleanName, null);
    const cleanDesc = this._validateDescription(description);
    const cleanTags = this._validateTags(tags);
    const comps = this._prepareComponents(components);

    const ts = nowIso();
    const record = {
      id: randomUUID(),
      name: cleanName,
      description: cleanDesc,
      version: '1.0',
      color: color || null,
      icon: icon || null,
      tags: cleanTags,
      components: comps,
      createdAt: ts,
      updatedAt: ts,
    };
    this.collections.set(record.id, record);
    // Roll back the in-memory insert if the disk write fails, so a persist error
    // never leaves a "ghost" collection that is visible via list()/get() and shadows
    // its name, yet is absent from disk (and so vanishes on the next restart).
    try {
      this._persist();
    } catch (err) {
      this.collections.delete(record.id);
      throw err;
    }
    return clone(record);
  }

  /** Add components (dedup against existing, enforce max size). Returns the updated record. */
  addComponents(id, components) {
    const record = this._getRaw(id);
    const incoming = this._prepareComponents(components, /* allowEmpty */ false);
    const byId = new Map(record.components.map((c) => [c.id, c]));
    let added = 0;
    for (const c of incoming) {
      if (byId.has(c.id)) continue; // duplicate prevention
      byId.set(c.id, c);
      added++;
    }
    const merged = Array.from(byId.values());
    if (merged.length > LIMITS.maxComponents) {
      throw new CollectionError(
        `Collection would exceed the ${LIMITS.maxComponents}-component limit (${merged.length})`,
        { code: 'limit_exceeded', data: { limit: LIMITS.maxComponents, resulting: merged.length } },
      );
    }
    // Snapshot so we can undo the in-memory mutation if persistence fails.
    const prevComponents = record.components;
    const prevUpdatedAt = record.updatedAt;
    record.components = merged;
    record.updatedAt = nowIso();
    try {
      this._persist();
    } catch (err) {
      record.components = prevComponents;
      record.updatedAt = prevUpdatedAt;
      throw err;
    }
    return { collection: clone(record), added, skipped: incoming.length - added };
  }

  /** Remove components by effect id. Returns the updated record + count removed. */
  removeComponents(id, effectIds) {
    const record = this._getRaw(id);
    const drop = new Set(toIdList(effectIds));
    if (!drop.size) throw new CollectionError('Provide at least one component id to remove', { code: 'invalid_argument' });
    // Snapshot so we can undo the in-memory mutation if persistence fails.
    const prevComponents = record.components;
    const prevUpdatedAt = record.updatedAt;
    const kept = record.components.filter((c) => !drop.has(c.id));
    const removed = prevComponents.length - kept.length;
    record.components = kept;
    record.updatedAt = nowIso();
    try {
      this._persist();
    } catch (err) {
      record.components = prevComponents;
      record.updatedAt = prevUpdatedAt;
      throw err;
    }
    return { collection: clone(record), removed };
  }

  /** Delete a collection entirely. */
  delete(id) {
    const key = String(id);
    if (!this.collections.has(key)) {
      throw new CollectionError(`No collection with id "${id}"`, { code: 'not_found', data: { id } });
    }
    // Roll back the in-memory delete if the disk write fails, so a persist error
    // never removes a collection from the running server that is still on disk (and
    // so reappears on the next restart), contradicting the thrown error.
    const removed = this.collections.get(key);
    this.collections.delete(key);
    try {
      this._persist();
    } catch (err) {
      this.collections.set(key, removed);
      throw err;
    }
    return { deleted: key };
  }

  // ---------------------------------------------------------------- helpers
  _getRaw(id) {
    const c = this.collections.get(String(id));
    if (!c) throw new CollectionError(`No collection with id "${id}"`, { code: 'not_found', data: { id } });
    return c;
  }

  _validateName(cleanName, exceptId) {
    if (!cleanName) throw new CollectionError('Collection name is required', { code: 'invalid_argument' });
    if (cleanName.length > LIMITS.maxNameLength) {
      throw new CollectionError(
        `Collection name must be <= ${LIMITS.maxNameLength} characters (got ${cleanName.length})`,
        { code: 'invalid_argument', data: { limit: LIMITS.maxNameLength } },
      );
    }
    const key = nameKey(cleanName);
    for (const c of this.collections.values()) {
      if (c.id === exceptId) continue;
      if (nameKey(c.name) === key) {
        throw new CollectionError(`A collection named "${c.name}" already exists`, { code: 'duplicate_name', data: { existingId: c.id } });
      }
    }
  }

  _validateDescription(description) {
    const d = String(description == null ? '' : description);
    if (d.length > LIMITS.maxDescriptionLength) {
      throw new CollectionError(
        `Description must be <= ${LIMITS.maxDescriptionLength} characters (got ${d.length})`,
        { code: 'invalid_argument', data: { limit: LIMITS.maxDescriptionLength } },
      );
    }
    return d;
  }

  _validateTags(tags) {
    const arr = toArray(tags).map((t) => String(t).trim()).filter(Boolean);
    const deduped = Array.from(new Set(arr));
    if (deduped.length > LIMITS.maxTags) {
      throw new CollectionError(
        `A collection may have at most ${LIMITS.maxTags} tags (got ${deduped.length})`,
        { code: 'invalid_argument', data: { limit: LIMITS.maxTags } },
      );
    }
    return deduped;
  }

  /** Normalize + dedupe component inputs and enforce the size cap. */
  _prepareComponents(components, allowEmpty = true) {
    const arr = toArray(components);
    if (!allowEmpty && !arr.length) {
      throw new CollectionError('Provide at least one component', { code: 'invalid_argument' });
    }
    const seen = new Set();
    const out = [];
    for (const raw of arr) {
      const c = normalizeComponent(raw);
      if (!c) throw new CollectionError('Each component must have an id', { code: 'invalid_argument' });
      if (seen.has(c.id)) continue; // collapse duplicates in the input
      seen.add(c.id);
      out.push(c);
    }
    if (out.length > LIMITS.maxComponents) {
      throw new CollectionError(
        `A collection may have at most ${LIMITS.maxComponents} components (got ${out.length})`,
        { code: 'limit_exceeded', data: { limit: LIMITS.maxComponents, resulting: out.length } },
      );
    }
    return out;
  }
}

/** Build the portable "prism-collection-1.0" export object (the cross-surface bridge). */
export function toExportSchema(collection, { totalSize = null } = {}) {
  const components = (collection.components || []).map((c) => ({ id: c.id, name: c.name, gallery: c.gallery }));
  return {
    __schema: COLLECTION_SCHEMA,
    name: collection.name,
    description: collection.description || '',
    version: collection.version || '1.0',
    exportedAt: nowIso(),
    color: collection.color || null,
    icon: collection.icon || null,
    tags: collection.tags || [],
    components,
    componentCount: components.length,
    totalSize: totalSize == null ? null : totalSize,
  };
}

function summarize(c) {
  return {
    id: c.id,
    name: c.name,
    description: c.description || '',
    componentCount: (c.components || []).length,
    color: c.color || null,
    icon: c.icon || null,
    tags: c.tags || [],
    createdAt: c.createdAt || null,
    updatedAt: c.updatedAt || null,
  };
}

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

function toArray(v) {
  if (Array.isArray(v)) return v;
  if (v == null) return [];
  return [v];
}

/** Accept ["a","b"] or [{id:"a"},...] or a single id; return a flat id string list. */
function toIdList(v) {
  return toArray(v)
    .map((x) => (typeof x === 'string' ? x : x && x.id ? String(x.id) : null))
    .filter(Boolean);
}
