// Field-level diffs between what the plugin last received and what it should see now.
import { same } from '../shared/util.js';

/**
 * Partial object holding the id field plus every field of `next` that differs from `prev`.
 * Fields missing from `next` are sent as null. Returns null when nothing changed.
 * `ignore(key, prev, next)` may veto a field (used for extrapolated media positions).
 */
export function diffObject(prev, next, idField, ignore) {
  let out = null;
  for (const k of Object.keys(next)) {
    if (k === idField) continue;
    if (same(prev[k], next[k])) continue;
    if (ignore && ignore(k, prev, next)) continue;
    (out ||= { [idField]: next[idField] })[k] = next[k];
  }
  for (const k of Object.keys(prev)) {
    if (k in next || k === idField) continue;
    (out ||= { [idField]: next[idField] })[k] = null;
  }
  return out;
}

/** {upsert, remove} between two Maps of wire objects. New ids are sent whole. */
export function diffMaps(prev, next, idField = 'id', ignore) {
  const upsert = [];
  const remove = [];
  for (const [id, obj] of next) {
    const p = prev.get(id);
    if (!p) { upsert.push(obj); continue; }
    const d = diffObject(p, obj, idField, ignore);
    if (d) upsert.push(d);
  }
  for (const id of prev.keys()) if (!next.has(id)) remove.push(id);
  return { upsert, remove };
}

/** Where the plugin will extrapolate a media position to at time `at`. */
export function extrapolate(m, at) {
  if (m.positionMs == null || m.positionAt == null) return m.positionMs;
  if (m.state !== 'playing') return m.positionMs;
  return m.positionMs + (at - m.positionAt) * (m.rate || 1);
}

/** Position drift (ms) below which a new position report is not worth sending. */
export const POSITION_TOLERANCE_MS = 750;

/**
 * Media fields `positionMs`/`positionAt` are skipped when the plugin's extrapolation of the last sent
 * value is still within tolerance, and nothing that drives extrapolation (state, rate) changed.
 */
export function ignoreMediaPosition(key, prev, next) {
  if (key !== 'positionMs' && key !== 'positionAt') return false;
  if (prev.state !== next.state || prev.rate !== next.rate) return false;
  if (prev.positionMs == null || next.positionMs == null || next.positionAt == null) return false;
  const predicted = extrapolate(prev, next.positionAt);
  return Math.abs(predicted - next.positionMs) < POSITION_TOLERANCE_MS;
}
