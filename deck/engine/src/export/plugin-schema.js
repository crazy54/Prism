// A tiny zero-dependency JSON Schema (draft-07) validator for the subset Elgato's
// official schemas use (schemas.elgato.com/streamdeck/plugins/{manifest,layout}.json,
// @elgato/schemas 0.5.2): $ref (local, URL-encoded pointers), type, enum, const,
// pattern, min/maxLength, minimum/maximum, min/maxItems, uniqueItems, items (schema
// or tuple), properties, required, additionalProperties, patternProperties,
// allOf / anyOf / oneOf / not, if / then / else — plus Elgato's custom keywords that
// `streamdeck validate` checks against the plugin folder:
//   filePath: true | { extensions, includeExtension }   the referenced file exists
//   imageDimensions: [w, h]                              the image is w×h (PNG IHDR / SVG width·height), PNG @2x is 2w×2h
// Elgato's `errorMessage` replaces the generic message for a failed keyword.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v);
const typeMatches = (t, v) => { const a = typeOf(v); return t === a || (t === 'number' && a === 'integer'); };
const deepEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function resolveRef(root, ref) {
  if (!ref.startsWith('#')) throw new Error(`only local $ref is supported: ${ref}`);
  let node = root;
  for (const raw of ref.slice(1).split('/').filter(Boolean)) {
    const key = decodeURIComponent(raw).replace(/~1/g, '/').replace(/~0/g, '~');
    node = node?.[key];
    if (node === undefined) throw new Error(`unresolvable $ref ${ref}`);
  }
  return node;
}

/** Image size of a PNG or SVG file → { w, h } | null. */
export function imageSize(file) {
  const buf = fs.readFileSync(file);
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  const s = buf.toString('utf8', 0, Math.min(buf.length, 4096));
  const tag = /<svg\b[^>]*>/i.exec(s)?.[0];
  if (tag) {
    const w = Number(/\swidth="([\d.]+)(px)?"/.exec(tag)?.[1]), h = Number(/\sheight="([\d.]+)(px)?"/.exec(tag)?.[1]);
    if (w > 0 && h > 0) return { w, h };
    const vb = /viewBox="[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)"/.exec(tag);
    if (vb) return { w: Number(vb[1]), h: Number(vb[2]) };
  }
  return null;
}

/**
 * validate(schema, data, { baseDir }) → [{ path, keyword, message }]
 * With baseDir, filePath / imageDimensions are checked against files in it.
 */
export function validate(schema, data, { baseDir = null, root = schema } = {}) {
  const errors = [];
  check(schema, data, '$', errors, { baseDir, root });
  return errors;
}

function fail(errors, s, p, keyword, message) { errors.push({ path: p, keyword, message: s.errorMessage && ['pattern', 'filePath', 'type'].includes(keyword) ? `${s.errorMessage}` : message }); }

function check(s, v, p, errors, o) {
  if (s === true || s === undefined) return;
  if (s === false) { errors.push({ path: p, keyword: 'false', message: 'not allowed' }); return; }
  if (s.$ref) { check(resolveRef(o.root, s.$ref), v, p, errors, o); }
  if (s.type !== undefined) {
    const types = Array.isArray(s.type) ? s.type : [s.type];
    if (!types.some((t) => typeMatches(t, v))) { fail(errors, s, p, 'type', `must be ${types.join(' | ')}, got ${typeOf(v)}`); return; }
  }
  if (s.enum && !s.enum.some((e) => deepEqual(e, v))) fail(errors, s, p, 'enum', `must be one of ${s.enum.map((e) => JSON.stringify(e)).join(', ')}`);
  if (s.const !== undefined && !deepEqual(s.const, v)) fail(errors, s, p, 'const', `must be ${JSON.stringify(s.const)}`);
  if (typeof v === 'string') {
    if (s.pattern && !new RegExp(s.pattern, 'u').test(v)) fail(errors, s, p, 'pattern', `must match ${s.pattern}`);
    if (s.minLength !== undefined && [...v].length < s.minLength) fail(errors, s, p, 'minLength', `must be at least ${s.minLength} chars`);
    if (s.maxLength !== undefined && [...v].length > s.maxLength) fail(errors, s, p, 'maxLength', `must be at most ${s.maxLength} chars`);
    if (o.baseDir && s.filePath) checkFile(s, v, p, errors, o.baseDir);
  }
  if (typeof v === 'number') {
    if (s.minimum !== undefined && v < s.minimum) fail(errors, s, p, 'minimum', `must be ≥ ${s.minimum}`);
    if (s.maximum !== undefined && v > s.maximum) fail(errors, s, p, 'maximum', `must be ≤ ${s.maximum}`);
    if (s.exclusiveMinimum !== undefined && v <= s.exclusiveMinimum) fail(errors, s, p, 'exclusiveMinimum', `must be > ${s.exclusiveMinimum}`);
    if (s.exclusiveMaximum !== undefined && v >= s.exclusiveMaximum) fail(errors, s, p, 'exclusiveMaximum', `must be < ${s.exclusiveMaximum}`);
  }
  if (Array.isArray(v)) {
    if (s.minItems !== undefined && v.length < s.minItems) fail(errors, s, p, 'minItems', `needs at least ${s.minItems} items`);
    if (s.maxItems !== undefined && v.length > s.maxItems) fail(errors, s, p, 'maxItems', `allows at most ${s.maxItems} items`);
    if (s.uniqueItems && new Set(v.map((x) => JSON.stringify(x))).size !== v.length) fail(errors, s, p, 'uniqueItems', 'items must be unique');
    if (Array.isArray(s.items)) {
      v.forEach((x, i) => { if (i < s.items.length) check(s.items[i], x, `${p}[${i}]`, errors, o); else if (s.additionalItems !== undefined) check(s.additionalItems, x, `${p}[${i}]`, errors, o); });
    } else if (s.items) v.forEach((x, i) => check(s.items, x, `${p}[${i}]`, errors, o));
  }
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    for (const r of s.required || []) if (!Object.hasOwn(v, r)) fail(errors, s, `${p}.${r}`, 'required', 'is required');
    const props = s.properties || {};
    const pats = Object.entries(s.patternProperties || {}).map(([k, sc]) => [new RegExp(k, 'u'), sc]);
    for (const [k, x] of Object.entries(v)) {
      let matched = false;
      if (Object.hasOwn(props, k)) { matched = true; check(props[k], x, `${p}.${k}`, errors, o); }
      for (const [re, sc] of pats) if (re.test(k)) { matched = true; check(sc, x, `${p}.${k}`, errors, o); }
      if (!matched && s.additionalProperties !== undefined) {
        if (s.additionalProperties === false) fail(errors, s, `${p}.${k}`, 'additionalProperties', 'is not an allowed property');
        else check(s.additionalProperties, x, `${p}.${k}`, errors, o);
      }
    }
  }
  if (s.allOf) for (const sub of s.allOf) check(sub, v, p, errors, o);
  if (s.anyOf && !s.anyOf.some((sub) => validate(sub, v, { ...o }).length === 0)) {
    // Report the closest branch (fewest errors) so messages stay useful.
    const best = s.anyOf.map((sub) => validate(sub, v, { ...o })).sort((a, b) => a.length - b.length)[0];
    errors.push(...(best.length ? best : [{ path: p, keyword: 'anyOf', message: 'matches no allowed shape' }]));
  }
  if (s.oneOf) { const n = s.oneOf.filter((sub) => validate(sub, v, { ...o }).length === 0).length; if (n !== 1) fail(errors, s, p, 'oneOf', `must match exactly one shape (matched ${n})`); }
  if (s.not && validate(s.not, v, { ...o }).length === 0) fail(errors, s, p, 'not', 'matches a forbidden shape');
  if (s.if) {
    const ok = validate(s.if, v, { ...o, baseDir: null }).length === 0;
    if (ok && s.then) check(s.then, v, p, errors, o);
    if (!ok && s.else) check(s.else, v, p, errors, o);
  }
}

function checkFile(s, v, p, errors, baseDir) {
  const fp = s.filePath === true ? { includeExtension: true } : s.filePath;
  const exts = fp.extensions || [''];
  const candidates = fp.includeExtension === false ? exts.map((e) => `${v}${e}`) : [v];
  const found = candidates.find((c) => fs.existsSync(path.join(baseDir, c)));
  if (!found) { errors.push({ path: p, keyword: 'filePath', message: `file not found: ${candidates.join(' | ')}` }); return; }
  if (fp.includeExtension !== false && fp.extensions && !fp.extensions.some((e) => v.toLowerCase().endsWith(e))) errors.push({ path: p, keyword: 'filePath', message: `must end with ${fp.extensions.join(' | ')}` });
  if (s.imageDimensions) {
    const [w, h] = s.imageDimensions;
    for (const c of candidates.filter((x) => fs.existsSync(path.join(baseDir, x)))) {
      const sz = imageSize(path.join(baseDir, c));
      if (!sz) { errors.push({ path: p, keyword: 'imageDimensions', message: `${c}: unreadable image size` }); continue; }
      if (sz.w !== w || sz.h !== h) errors.push({ path: p, keyword: 'imageDimensions', message: `${c} is ${sz.w}×${sz.h}, expected ${w}×${h}` });
      if (c.endsWith('.png')) {
        const hi = path.join(baseDir, c.replace(/\.png$/, '@2x.png'));
        if (!fs.existsSync(hi)) errors.push({ path: p, keyword: 'imageDimensions', message: `${c}: missing @2x variant` });
        else { const s2 = imageSize(hi); if (s2.w !== w * 2 || s2.h !== h * 2) errors.push({ path: p, keyword: 'imageDimensions', message: `${path.basename(hi)} is ${s2.w}×${s2.h}, expected ${w * 2}×${h * 2}` }); }
      }
    }
  }
}

/** The official schemas (research handoff), or null when not on this machine. */
export function findSchemas(start = path.dirname(fileURLToPath(import.meta.url))) {
  const candidates = [process.env.PRISM_SD_SCHEMAS, path.resolve(start, '..', '..', '..', '..', 'aaa-prism-ds', 'handoff-from-prism-e0', 'research', 'schemas')].filter(Boolean);
  for (const dir of candidates) {
    const m = path.join(dir, 'plugin-manifest.schema.json'), l = path.join(dir, 'plugin-layout.schema.json');
    if (fs.existsSync(m) && fs.existsSync(l)) return { dir, manifest: JSON.parse(fs.readFileSync(m, 'utf8')), layout: JSON.parse(fs.readFileSync(l, 'utf8')) };
  }
  return null;
}
