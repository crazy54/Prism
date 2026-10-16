// A small, zero-dependency ES-module bundler for the site build (website/build.mjs).
//
//   const b = bundleModules({ root, entries, external })
//     root      directory the module paths are relative to (e.g. prism-deck/)
//     entries   ['src/web/index.js', …]: every module statically reachable from them is bundled
//     external  Map(path → { from, base }) — modules already in another bundle (shared registry)
//   b.modules   [{ path, id, exports: [names], hasDefault }] in definition order
//   b.code(…)   the bundle source (see writeBundle below)
//
// How it keeps ES-module semantics: each module becomes a function that fills its own namespace object
// (getters, so exports stay live) and runs only when first required — dependencies first, in import order,
// exactly like ESM evaluation. Imports become `const { a, b: c } = __m(7)` at the top of the module
// function. That copy is safe because the bundler refuses what would make it observable: import cycles,
// `export let/var` (re-assignable exports), `import.meta`, top-level await and static-string dynamic
// imports all fail the build. Comments and indentation are dropped; nothing is renamed.
//
// writeBundle() also replaces every bundled module file of a copied engine with a two-line facade that
// re-exports it from the bundle, so pages, the adapter and on-demand facet modules keep importing the
// same URLs — they just share the bundled instances (one request instead of hundreds).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

// ── lexer ────────────────────────────────────────────────────────────────────
// Tokens: ws, nl, comment, str, tpl (whole template, nested ${} included), regex, num, name, punct.
const KW_EXPR = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await', 'extends']);
const ID = /[\w$\u0080-￿]/;
const PUNCT3 = ['>>>=', '...', '===', '!==', '**=', '<<=', '>>=', '>>>', '&&=', '||=', '??='];
const PUNCT2 = ['=>', '==', '!=', '<=', '>=', '&&', '||', '??', '?.', '++', '--', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '**', '<<', '>>'];

export function lex(src, start = 0, untilBrace = false) {
  const out = [];
  let i = start, depth = 0, prev = null;   // prev: last significant token
  const regexOk = () => !prev || (prev.type === 'punct' ? !/^[)\]]$/.test(prev.value) && !/^(\+\+|--)$/.test(prev.value) : prev.type === 'name' ? KW_EXPR.has(prev.value) : false);
  const push = (type, s, e) => { const t = { type, value: src.slice(s, e), start: s, end: e }; out.push(t); if (type !== 'ws' && type !== 'nl' && type !== 'comment') prev = t; return t; };
  while (i < src.length) {
    const c = src[i];
    if (c === '\n' || c === '\r') { let j = i; while (j < src.length && (src[j] === '\n' || src[j] === '\r' || src[j] === ' ' || src[j] === '\t')) j++; push('nl', i, j); i = j; continue; }
    if (c === ' ' || c === '\t' || c === '\f' || c === '\v' || c === '﻿' || c === ' ') { let j = i + 1; while (j < src.length && /[ \t\f\v﻿ ]/.test(src[j])) j++; push('ws', i, j); i = j; continue; }
    if (c === '/' && src[i + 1] === '/') { let j = i; while (j < src.length && src[j] !== '\n' && src[j] !== '\r') j++; push('comment', i, j); i = j; continue; }
    if (c === '/' && src[i + 1] === '*') { const j = src.indexOf('*/', i + 2); if (j < 0) throw new Error('unterminated comment'); push('comment', i, j + 2); i = j + 2; continue; }
    if (c === '"' || c === "'") { let j = i + 1; while (j < src.length && src[j] !== c) { if (src[j] === '\\') j++; else if (src[j] === '\n') throw new Error('unterminated string'); j++; } push('str', i, j + 1); i = j + 1; continue; }
    if (c === '`') { const j = skipTemplate(src, i); push('tpl', i, j); i = j; continue; }
    if (c === '/' && regexOk()) {
      let j = i + 1, cls = false;
      while (j < src.length) { const d = src[j]; if (d === '\\') { j += 2; continue; } if (d === '\n') throw new Error(`unterminated regex at ${i}`); if (cls) { if (d === ']') cls = false; } else if (d === '[') cls = true; else if (d === '/') break; j++; }
      j++; while (j < src.length && ID.test(src[j])) j++;
      push('regex', i, j); i = j; continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1]))) { let j = i + 1; while (j < src.length && /[\w.]/.test(src[j])) { if ((src[j] === 'e' || src[j] === 'E') && /[+-]/.test(src[j + 1])) j++; j++; } push('num', i, j); i = j; continue; }
    if (ID.test(c) || c === '\\' || c === '#') { let j = i + 1; while (j < src.length && (ID.test(src[j]) || src[j] === '\\')) j++; push('name', i, j); i = j; continue; }
    if (untilBrace) { if (c === '{') depth++; else if (c === '}') { if (!depth) return { tokens: out, end: i }; depth--; } }
    const p = PUNCT3.find((x) => src.startsWith(x, i)) || PUNCT2.find((x) => src.startsWith(x, i)) || c;
    if (p === '?.' && /[0-9]/.test(src[i + 2])) { push('punct', i, i + 1); i++; continue; }   // a ? .5 : b
    push('punct', i, i + p.length); i += p.length;
  }
  if (untilBrace) throw new Error('unterminated ${ in template');
  return { tokens: out, end: i };
}
function skipTemplate(src, i) {
  let j = i + 1;
  while (j < src.length) {
    const d = src[j];
    if (d === '\\') { j += 2; continue; }
    if (d === '`') return j + 1;
    if (d === '$' && src[j + 1] === '{') { j = lex(src, j + 2, true).end + 1; continue; }
    j++;
  }
  throw new Error('unterminated template');
}

// ── one module: imports, exports, transformed body ──────────────────────────
const sig = (t) => t.type !== 'ws' && t.type !== 'nl' && t.type !== 'comment';
const unq = (s) => s.slice(1, -1);

export function parseModule(src, file) {
  const toks = lex(src).tokens;
  const S = toks.map((t, i) => (sig(t) ? i : -1)).filter((i) => i >= 0);   // significant token indices
  const at = (k) => toks[S[k]];
  const fail = (msg) => { throw new Error(`${file}: ${msg}`); };
  const imports = [];          // { spec, kind: 'named'|'ns'|'side', names: [[imported, local]], ns, defaultLocal, order }
  const reexports = [];        // { spec, names: [[imported, exported]] } | { spec, star: true } | { spec, starAs: name }
  const own = new Map();       // exported → local
  const cut = [];              // [startTokIdx, endTokIdx] ranges (token indices) to drop
  const edits = new Map();     // token index → replacement text
  let depth = 0, hasDefault = false, defaultLocal = null, lastParen = null;
  const stack = [];
  const deps = [];             // specs in evaluation order (imports + re-exports)
  const statementStart = (k) => k === 0 || /^[;})]$/.test(at(k - 1).value) || toks.slice(S[k - 1] + 1, S[k]).some((t) => t.type === 'nl');
  for (let k = 0; k < S.length; k++) {
    const t = at(k);
    if (t.type === 'punct') {
      // brackets, and whether each { opens a function body (after => or after the ) of a parameter list)
      if (t.value === '(' || t.value === '[') { depth++; stack.push({ v: t.value, before: k > 0 ? at(k - 1).value : '' }); }
      else if (t.value === '{') {
        const p = k > 0 ? at(k - 1).value : '';
        const fn = p === '=>' || (p === ')' && lastParen && !/^(if|for|while|switch|catch|with)$/.test(lastParen.before));
        depth++; stack.push({ v: '{', fn });
      } else if (')]}'.includes(t.value)) { depth--; const o = stack.pop(); lastParen = t.value === ')' ? o : null; }
      continue;
    }
    if (t.type === 'name' && (t.value === 'import' || t.value === 'export') && k > 0 && at(k - 1).value === '.') continue;
    if (t.type === 'name' && t.value === 'import') {
      const next = at(k + 1);
      if (next && (next.value === '(' || next.value === '.')) {
        if (next.value === '.') fail('import.meta is not supported by the site bundler');
        if (at(k + 2)?.type === 'str' && /^['"]\.\.?\//.test(at(k + 2).value) && at(k + 3)?.value === ')') fail(`dynamic import of a literal specifier (${at(k + 2).value}) — import it statically or by URL`);
        continue;
      }
      if (depth !== 0 || !statementStart(k)) continue;
      // import 'x' | import X from 'x' | import * as ns from 'x' | import { a, b as c } from 'x' | import X, {…} | import X, * as ns
      let j = k + 1; const imp = { names: [], ns: null, defaultLocal: null };
      if (at(j).type === 'str') { imp.spec = unq(at(j).value); j++; }
      else {
        if (at(j).type === 'name' && at(j).value !== 'from') { imp.defaultLocal = at(j).value; j++; if (at(j).value === ',') j++; }
        if (at(j).value === '*') { if (at(j + 1).value !== 'as') fail('bad import *'); imp.ns = at(j + 2).value; j += 3; }
        else if (at(j).value === '{') { j++; while (at(j).value !== '}') { const a = at(j).value; let b = a; j++; if (at(j).value === 'as') { b = at(j + 1).value; j += 2; } imp.names.push([a, b]); if (at(j).value === ',') j++; } j++; }
        if (at(j).value !== 'from' || at(j + 1).type !== 'str') fail('bad import declaration');
        imp.spec = unq(at(j + 1).value); j += 2;
      }
      if (at(j)?.value === 'with' || at(j)?.value === 'assert') fail('import attributes are not supported by the site bundler');
      if (at(j)?.value === ';') j++;
      imp.range = [toks[S[k]].start, toks[S[j - 1]].end];
      imports.push(imp); deps.push(imp.spec);
      cut.push([S[k], S[j - 1]]); k = j - 1; continue;
    }
    if (t.type === 'name' && t.value === 'export') {
      if (depth !== 0) fail('export inside a block');
      const n1 = at(k + 1);
      if (n1.value === 'default') {
        const n2 = at(k + 2), n3 = at(k + 3);
        hasDefault = true;
        const named = (kw) => n2.value === kw && at(k + 3)?.type === 'name' && at(k + 3).value !== 'extends';
        if (n2.value === 'async' && at(k + 3)?.value === 'function') {
          const star = at(k + 4).value === '*', nm = at(k + (star ? 5 : 4));
          if (nm.type === 'name') { defaultLocal = nm.value; cut.push([S[k], S[k + 1]]); }
          else { defaultLocal = '__default'; cut.push([S[k], S[k + 1]]); edits.set(S[k + (star ? 4 : 3)], star ? '* __default' : 'function __default'); }
        } else if (n2.value === 'function' || n2.value === 'class') {
          const star = n2.value === 'function' && n3.value === '*', nm = at(k + (star ? 4 : 3));
          if (named(n2.value) || (star && nm.type === 'name')) { defaultLocal = nm.value; cut.push([S[k], S[k + 1]]); }
          else { defaultLocal = '__default'; cut.push([S[k], S[k + 1]]); edits.set(S[k + (star ? 3 : 2)], at(k + (star ? 3 : 2)).value + ' __default'); }
        } else { defaultLocal = '__default'; cut.push([S[k], S[k]]); edits.set(S[k + 1], 'const __default ='); }
        own.set('default', defaultLocal); k += 1; continue;
      }
      if (n1.value === '*') {   // export * from 'x' | export * as ns from 'x'
        let j = k + 2, starAs = null;
        if (at(j).value === 'as') { starAs = at(j + 1).value; j += 2; }
        if (at(j).value !== 'from' || at(j + 1).type !== 'str') fail('bad export *');
        const spec = unq(at(j + 1).value); j += 2; if (at(j)?.value === ';') j++;
        reexports.push(starAs ? { spec, starAs } : { spec, star: true }); deps.push(spec);
        cut.push([S[k], S[j - 1]]); k = j - 1; continue;
      }
      if (n1.value === '{') {
        let j = k + 2; const names = [];
        while (at(j).value !== '}') { const a = at(j).value; let b = a; j++; if (at(j).value === 'as') { b = at(j + 1).value; j += 2; } names.push([a, b]); if (at(j).value === ',') j++; }
        j++;
        if (at(j)?.value === 'from') { const spec = unq(at(j + 1).value); j += 2; reexports.push({ spec, names }); deps.push(spec); }
        else for (const [a, b] of names) own.set(b, a);
        if (at(j)?.value === ';') j++;
        cut.push([S[k], S[j - 1]]); k = j - 1; continue;
      }
      if (n1.value === 'let' || n1.value === 'var') fail(`export ${n1.value} (a re-assignable export) — use const or a getter function`);
      if (n1.value === 'const') {
        if (at(k + 2).type !== 'name') fail('destructuring export const is not supported by the site bundler');
        own.set(at(k + 2).value, at(k + 2).value); cut.push([S[k], S[k]]); continue;
      }
      if (n1.value === 'function' || n1.value === 'class' || n1.value === 'async') {
        let j = k + 1; if (at(j).value === 'async') j++; j++; if (at(j).value === '*') j++;
        own.set(at(j).value, at(j).value); cut.push([S[k], S[k]]); continue;
      }
      fail(`unsupported export form: export ${n1.value}`);
    }
    if (t.type === 'name' && t.value === 'await' && !stack.some((x) => x.fn)) fail('top-level await is not supported by the site bundler');
  }
  for (const n of ['__ns', '__m', '__e', '__default']) if (n !== defaultLocal && toks.some((t) => t.type === 'name' && t.value === n)) fail(`uses the reserved name ${n}`);
  return { toks, cut, edits, imports, reexports, own, deps, hasDefault };
}

/** Re-emit tokens without comments, indentation or blank lines (newlines kept for ASI); drop cut ranges, apply edits. */
function emit(toks, cut = [], edits = new Map()) {
  const drop = new Uint8Array(toks.length);
  for (const [a, b] of cut) for (let x = a; x <= b; x++) drop[x] = 1;
  let out = '', lastNl = true;
  for (let x = 0; x < toks.length; x++) {
    const t = toks[x];
    if (drop[x]) continue;
    if (edits.has(x)) { out += edits.get(x); lastNl = false; continue; }
    if (t.type === 'comment') { if (/[\n\r]/.test(t.value) && !lastNl) { out += '\n'; lastNl = true; } else if (!lastNl && out[out.length - 1] !== ' ') out += ' '; continue; }
    if (t.type === 'nl') { if (!lastNl) { out += '\n'; lastNl = true; } continue; }
    if (t.type === 'ws') { if (!lastNl && out[out.length - 1] !== ' ') out += ' '; continue; }
    out += t.value; lastNl = false;
  }
  return out.trim();
}

// ── the graph ────────────────────────────────────────────────────────────────
export function bundleModules({ root, entries, external = new Map() }) {
  const mods = new Map();   // path → record
  const order = [];
  const resolve = (from, spec) => {
    if (!spec.startsWith('.')) throw new Error(`${from}: bare import "${spec}" — the site bundler resolves relative paths only`);
    const p = path.posix.normalize(path.posix.join(path.posix.dirname(from), spec));
    if (!existsSync(path.join(root, p))) throw new Error(`${from}: cannot resolve ${spec}`);
    return p;
  };
  const visiting = new Set();
  function visit(p, chain) {
    if (external.has(p) || mods.has(p)) return;
    if (visiting.has(p)) throw new Error(`import cycle: ${[...chain, p].join(' → ')} — the site bundler needs an acyclic graph`);
    visiting.add(p);
    const rec = { path: p, ...parseModule(readFileSync(path.join(root, p), 'utf8'), p) };
    rec.depPaths = rec.deps.map((s) => resolve(p, s));
    for (const d of rec.depPaths) visit(d, [...chain, p]);
    visiting.delete(p);
    rec.id = external.size + order.length;
    mods.set(p, rec); order.push(rec);
  }
  for (const e of entries) visit(e, []);
  // export names (own ∪ named re-exports ∪ star re-exports minus 'default' and ambiguous ones), as ESM does
  const namesOf = (p) => (external.has(p) ? external.get(p).exports : exportNames(mods.get(p)));
  const memo = new Map();
  function exportNames(rec) {
    if (memo.has(rec.path)) return memo.get(rec.path);
    const names = new Set(rec.own.keys());
    for (const r of rec.reexports) { if (r.names) for (const [, b] of r.names) names.add(b); else if (r.starAs) names.add(r.starAs); }
    const starSeen = new Map();
    for (const r of rec.reexports) if (r.star) for (const n of namesOf(resolve(rec.path, r.spec))) { if (n === 'default' || names.has(n)) continue; starSeen.set(n, (starSeen.get(n) || 0) + 1); }
    for (const [n, c] of starSeen) if (c === 1) names.add(n);
    const list = [...names].sort(); memo.set(rec.path, list); return list;
  }
  const idOf = (p) => (external.has(p) ? external.get(p).id : mods.get(p).id);
  for (const rec of order) rec.exports = exportNames(rec);
  function moduleCode(rec) {
    const head = [];
    const depAt = (spec) => idOf(resolve(rec.path, spec));
    for (const imp of rec.imports) {
      const id = depAt(imp.spec);
      if (!imp.names.length && !imp.ns && !imp.defaultLocal) { head.push(`__m(${id});`); continue; }
      const parts = [];
      if (imp.defaultLocal) parts.push(`default: ${imp.defaultLocal}`);
      for (const [a, b] of imp.names) parts.push(a === b ? a : `${a}: ${b}`);
      if (parts.length) head.push(`const { ${parts.join(', ')} } = __m(${id});`);
      if (imp.ns) head.push(`const ${imp.ns} = __m(${id});`);
    }
    const getters = [...rec.own].map(([e, l]) => `${JSON.stringify(e)}: () => ${l}`);
    const stars = [];
    rec.reexports.forEach((r, i) => {
      const id = depAt(r.spec);
      if (r.names) { head.push(`const __r${i} = __m(${id});`); for (const [a, b] of r.names) getters.push(`${JSON.stringify(b)}: () => __r${i}.${a}`); }
      else if (r.starAs) getters.push(`${JSON.stringify(r.starAs)}: () => __m(${id})`);
      else { head.push(`__m(${id});`); stars.push(id); }
    });
    // ambiguous star names stay out, as in ESM
    const keep = JSON.stringify(rec.exports);
    return `__d[${rec.id}] = function (__ns) {\n${head.join('\n')}\n__e(__ns, { ${getters.join(', ')} }, [${stars.join(', ')}], ${keep});\n${emit(rec.toks, rec.cut, rec.edits)}\n};`;
  }
  return { modules: order, code: () => order.map(moduleCode).join('\n'), idOf };
}

/**
 * A module left out of the bundles (e.g. a facet a page imports on demand): its static imports of bundled
 * modules read the bundle directly instead of going through a facade (one request each). Only the import
 * declarations change; the rest of the file is byte-for-byte the same. → new source, or null (nothing to do).
 *   lookup(path) → { id, file } for a bundled module, else null      file: this module's path (posix, from root)
 */
export function rewireImports(src, file, lookup) {
  let mod;
  try { mod = parseModule(src, file); } catch { return null; }   // unsupported syntax: keep it on the facades
  if (/\b__bm\b/.test(src)) return null;
  const hits = [];
  let bundle = null;
  for (const imp of mod.imports) {
    if (!imp.spec.startsWith('.')) continue;
    const p = path.posix.normalize(path.posix.join(path.posix.dirname(file), imp.spec));
    const b = lookup(p);
    if (!b) continue;
    if (!bundle || b.rank > bundle.rank) bundle = b;
    const parts = [];
    if (imp.defaultLocal) parts.push(`default: ${imp.defaultLocal}`);
    for (const [x, y] of imp.names) parts.push(x === y ? x : `${x}: ${y}`);
    const code = [];
    if (parts.length) code.push(`const { ${parts.join(', ')} } = __bm(${b.id});`);
    if (imp.ns) code.push(`const ${imp.ns} = __bm(${b.id});`);
    if (!code.length) code.push(`__bm(${b.id});`);
    hits.push([imp.range, code.join(' ')]);
  }
  if (!hits.length) return null;
  let out = src;
  for (const [[s0, s1], code] of hits.sort((x, y) => y[0][0] - x[0][0])) out = out.slice(0, s0) + code + out.slice(s1);
  const rel = path.posix.relative(path.posix.dirname(file), bundle.file);
  return `import { __m as __bm } from '${rel.startsWith('.') ? rel : './' + rel}';\n${out}`;
}

const RUNTIME = `const __d = [], __c = [];
function __m(id) {
  let ns = __c[id];
  if (ns) return ns;
  ns = __c[id] = Object.create(null);
  Object.defineProperty(ns, Symbol.toStringTag, { value: 'Module' });
  __d[id](ns);
  return ns;
}
function __e(ns, own, stars, keep) {
  const get = Object.assign(Object.create(null), own);
  for (const id of stars) { const from = __m(id); for (const k of Object.keys(from)) if (!(k in get)) get[k] = () => from[k]; }
  for (const k of keep) Object.defineProperty(ns, k, { enumerable: true, get: get[k] });
  Object.preventExtensions(ns);
}`;

/**
 * Bundle an engine copied to outRoot (same layout as root) and swap its bundled modules for facades.
 * groups: [{ file: 'core.bundle.js', entries: [...] }, { file: 'facets.bundle.js', entries: [...] }] — later
 * groups share the first group's registry and skip what it already carries.
 * → [{ file, modules, bytes }]
 */
export function writeBundle({ root, outRoot, groups, banner = '' }) {
  const external = new Map();
  const written = [];
  groups.forEach((g, gi) => {
    const b = bundleModules({ root, entries: g.entries, external });
    const first = gi === 0;
    const head = first ? RUNTIME : `import { __m, __d, __e } from './${groups[0].file}';`;
    const tail = first ? 'export { __m, __d, __e };' : 'export { __m };';
    const code = `${banner}${head}\n${b.code()}\n${tail}\n`;
    writeFileSync(path.join(outRoot, g.file), code);
    for (const m of b.modules) {
      external.set(m.path, { id: m.id, exports: m.exports });
      const rel = path.posix.relative(path.posix.dirname(m.path), g.file);
      const named = m.exports.filter((n) => n !== 'default');
      const facade = `// Bundled into ${g.file} by website/build.mjs (the module itself is in the repository).\n`
        + `import { __m } from '${rel.startsWith('.') ? rel : './' + rel}';\nconst __n = __m(${m.id});\n`
        + (named.length ? `export const ${named.map((n) => `${n} = __n.${n}`).join(', ')};\n` : '')
        + (m.exports.includes('default') ? 'export default __n.default;\n' : '');
      writeFileSync(path.join(outRoot, m.path), facade);
    }
    written.push({ file: g.file, modules: b.modules, bytes: Buffer.byteLength(code) });
  });
  return written;
}

/** Every module statically reachable from `files` (paths from root), not counting the files themselves → Map(path → number of files that reach it). */
export function sharedDeps(root, files) {
  const reach = new Map();
  const depsOf = new Map();
  const deps = (p) => {
    if (!depsOf.has(p)) {
      let list = [];
      try { list = parseModule(readFileSync(path.join(root, p), 'utf8'), p).deps.filter((s) => s.startsWith('.')).map((s) => path.posix.normalize(path.posix.join(path.posix.dirname(p), s))); } catch { /* not bundleable: skip */ }
      depsOf.set(p, list);
    }
    return depsOf.get(p);
  };
  for (const f of files) {
    const seen = new Set();
    const walk = (p) => { for (const d of deps(p)) if (!seen.has(d)) { seen.add(d); walk(d); } };
    walk(f);
    seen.delete(f);
    for (const d of seen) reach.set(d, (reach.get(d) || 0) + 1);
  }
  return reach;
}

/** Can `p` (and everything it imports) go into a bundle? (no TLA, cycles, import.meta, …) */
export function bundleable(root, p) {
  try { bundleModules({ root, entries: [p] }); return true; } catch { return false; }
}
