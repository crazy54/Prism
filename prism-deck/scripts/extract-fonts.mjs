// Extract Inter glyph outlines from the woff2 fonts already embedded in Prism.html,
// so deck facets can draw text as paths (identical in the Stream Deck app, browsers
// and the raster/hidraw backends — no dependence on installed fonts).
//
//   node scripts/extract-fonts.mjs                    reads aaa-prism-ds/parts/shell-style.html (or Prism-ds/Prism.html)
//   node scripts/extract-fonts.mjs --from <file>      any HTML/CSS with the @font-face data URLs
//   node scripts/extract-fonts.mjs --check            exit 1 if src/scene/fonts/*.js are out of date
//
// Writes src/scene/fonts/inter-400.js and inter-600.js: metrics, outlines for
// printable ASCII + a few symbols (quadratic contours as compact command arrays in
// font units, y up), advance widths, and kerning pairs (GPOS 'kern', PairPos 1 & 2)
// restricted to the extracted characters.
//
// Zero dependencies: WOFF2 = brotli (node:zlib) + the glyf/loca and hmtx transforms,
// decoded here per the W3C WOFF2 spec.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUT_DIR = path.join(ROOT, 'src', 'scene', 'fonts');

// Characters we ship: printable ASCII plus the symbols deck UI needs.
export const CHARSET = [...Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)), '·', '•', '…', '°', '–', '—', '×', '→', '←', '↑', '↓', 'λ', '±', '−', '€', '£', '©', '’', '‘', '“', '”', '▲', '▼', '●', '✓'];

// ── binary helpers ────────────────────────────────────────────────────────────
class Reader {
  constructor(buf, pos = 0) { this.b = buf; this.p = pos; }
  u8() { return this.b[this.p++]; }
  i8() { const v = this.b.readInt8(this.p); this.p += 1; return v; }
  u16() { const v = this.b.readUInt16BE(this.p); this.p += 2; return v; }
  i16() { const v = this.b.readInt16BE(this.p); this.p += 2; return v; }
  u32() { const v = this.b.readUInt32BE(this.p); this.p += 4; return v; }
  tag() { const s = this.b.toString('latin1', this.p, this.p + 4); this.p += 4; return s; }
  base128() {
    let acc = 0;
    for (let i = 0; i < 5; i++) {
      const byte = this.u8();
      if (i === 0 && byte === 0x80) throw new Error('woff2: UIntBase128 with leading zero');
      acc = acc * 128 + (byte & 0x7f);
      if (!(byte & 0x80)) return acc;
    }
    throw new Error('woff2: UIntBase128 too long');
  }
  u255() {
    const code = this.u8();
    if (code === 253) return this.u16();
    if (code === 255) return this.u8() + 253;
    if (code === 254) return this.u8() + 506;
    return code;
  }
}

const KNOWN_TAGS = ['cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca', 'prep', 'CFF ', 'VORG', 'EBDT', 'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT', 'VDMX', 'vhea', 'vmtx', 'BASE', 'GDEF', 'GPOS', 'GSUB', 'EBSC', 'JSTF', 'MATH', 'CBDT', 'CBLC', 'COLR', 'CPAL', 'SVG ', 'sbix', 'acnt', 'avar', 'bdat', 'bloc', 'bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar', 'gvar', 'hsty', 'just', 'lcar', 'mort', 'morx', 'opbd', 'prop', 'trak', 'Zapf', 'Silf', 'Glat', 'Gloc', 'Feat', 'Sill'];

// ── WOFF2 container ───────────────────────────────────────────────────────────
export function decodeWoff2(buf) {
  const r = new Reader(buf);
  if (r.tag() !== 'wOF2') throw new Error('not a woff2 font');
  const flavor = r.u32();
  r.u32(); // length
  const numTables = r.u16();
  r.u16(); // reserved
  r.u32(); // totalSfntSize
  const totalCompressedSize = r.u32();
  r.p += 2 + 2 + 4 + 4 + 4 + 4 + 4; // versions, meta, priv
  if (flavor === 0x74746366) throw new Error('woff2 collections are not supported');
  const dir = [];
  for (let i = 0; i < numTables; i++) {
    const flags = r.u8();
    const tag = (flags & 0x3f) === 63 ? r.tag() : KNOWN_TAGS[flags & 0x3f];
    const version = (flags >> 6) & 3;
    const origLength = r.base128();
    const transformed = tag === 'glyf' || tag === 'loca' ? version === 0 : version !== 0;
    const transformLength = transformed ? r.base128() : origLength;
    dir.push({ tag, version, origLength, transformed, length: transformLength });
  }
  const data = zlib.brotliDecompressSync(buf.subarray(r.p, r.p + totalCompressedSize));
  let off = 0;
  const tables = {};
  for (const t of dir) { tables[t.tag] = { ...t, data: data.subarray(off, off + t.length) }; off += t.length; }
  return tables;
}

// ── glyf transform (version 0) → per-glyph outlines ───────────────────────────
function tripletDecode(flags, glyphStream, nPoints) {
  const pts = [];
  let x = 0, y = 0;
  const withSign = (flag, v) => ((flag & 1) ? v : -v);
  for (let i = 0; i < nPoints; i++) {
    let flag = flags.u8();
    const onCurve = !(flag >> 7);
    flag &= 0x7f;
    const n = flag < 84 ? 1 : flag < 120 ? 2 : flag < 124 ? 3 : 4;
    const d = glyphStream.b, p = glyphStream.p;
    let dx, dy;
    if (flag < 10) { dx = 0; dy = withSign(flag, ((flag & 14) << 7) + d[p]); }
    else if (flag < 20) { dx = withSign(flag, (((flag - 10) & 14) << 7) + d[p]); dy = 0; }
    else if (flag < 84) { const b0 = flag - 20, b1 = d[p]; dx = withSign(flag, 1 + (b0 & 0x30) + (b1 >> 4)); dy = withSign(flag >> 1, 1 + ((b0 & 0x0c) << 2) + (b1 & 0x0f)); }
    else if (flag < 120) { const b0 = flag - 84; dx = withSign(flag, 1 + (Math.floor(b0 / 12) << 8) + d[p]); dy = withSign(flag >> 1, 1 + (((b0 % 12) >> 2) << 8) + d[p + 1]); }
    else if (flag < 124) { const b2 = d[p + 1]; dx = withSign(flag, (d[p] << 4) + (b2 >> 4)); dy = withSign(flag >> 1, ((b2 & 0x0f) << 8) + d[p + 2]); }
    else { dx = withSign(flag, (d[p] << 8) + d[p + 1]); dy = withSign(flag >> 1, (d[p + 2] << 8) + d[p + 3]); }
    glyphStream.p += n;
    x += dx; y += dy;
    pts.push({ x, y, on: onCurve });
  }
  return pts;
}

/** → array per glyph: { contours: [[{x,y,on}]] } | { components: [{ glyph, dx, dy, a,b,c,d }] } | null (empty) */
export function decodeGlyf(t) {
  const r = new Reader(t.data);
  r.u16(); // reserved
  const optionFlags = r.u16();
  const numGlyphs = r.u16();
  r.u16(); // indexFormat
  const sizes = Array.from({ length: 7 }, () => r.u32());
  let off = r.p;
  const stream = (n) => { const s = new Reader(t.data.subarray(off, off + n)); off += n; return s; };
  const nContour = stream(sizes[0]), nPointsS = stream(sizes[1]), flagS = stream(sizes[2]), glyphS = stream(sizes[3]), compS = stream(sizes[4]), bboxS = stream(sizes[5]), instrS = stream(sizes[6]);
  void optionFlags; void instrS;
  const bboxBitmapLen = ((numGlyphs + 31) >> 5) << 2;
  bboxS.p = bboxBitmapLen; // explicit bboxes follow the bitmap; we recompute bounds, so skip them
  const glyphs = [];
  for (let g = 0; g < numGlyphs; g++) {
    const nc = nContour.i16();
    if (nc === 0) { glyphs.push(null); continue; }
    if (nc === -1) {
      const components = [];
      let flags, haveInstr = false;
      do {
        flags = compS.u16();
        const glyph = compS.u16();
        let dx, dy;
        if (flags & 0x0001) { dx = compS.i16(); dy = compS.i16(); } else { dx = compS.i8(); dy = compS.i8(); }
        if (!(flags & 0x0002)) throw new Error('woff2: point-matched composite components are not supported');
        let a = 1, b = 0, c = 0, d = 1;
        const f2 = () => compS.i16() / 16384;
        if (flags & 0x0008) { a = d = f2(); } else if (flags & 0x0040) { a = f2(); d = f2(); } else if (flags & 0x0080) { a = f2(); b = f2(); c = f2(); d = f2(); }
        if (flags & 0x0100) haveInstr = true;
        components.push({ glyph, dx, dy, a, b, c, d });
      } while (flags & 0x0020);
      if (haveInstr) { const len = glyphS.u255(); instrS.p += len; }
      glyphs.push({ components });
      continue;
    }
    const counts = Array.from({ length: nc }, () => nPointsS.u255());
    const total = counts.reduce((s, v) => s + v, 0);
    const pts = tripletDecode(flagS, glyphS, total);
    const ilen = glyphS.u255();
    instrS.p += ilen;
    const contours = [];
    let k = 0;
    for (const c of counts) { contours.push(pts.slice(k, k + c)); k += c; }
    glyphs.push({ contours });
  }
  return glyphs;
}

// ── plain sfnt tables ─────────────────────────────────────────────────────────
function parseHead(d) { const r = new Reader(d, 18); return { unitsPerEm: r.u16() }; }
function parseHhea(d) { const r = new Reader(d, 4); const ascender = r.i16(), descender = r.i16(), lineGap = r.i16(); r.p = 34; return { ascender, descender, lineGap, numberOfHMetrics: r.u16() }; }
function parseMaxp(d) { return { numGlyphs: new Reader(d, 4).u16() }; }
function parseOS2(d) { const r = new Reader(d); const version = r.u16(); if (version < 2) return {}; r.p = 86; return { xHeight: r.i16(), capHeight: r.i16() }; }

function parseHmtx(t, numGlyphs, numberOfHMetrics) {
  const r = new Reader(t.data);
  const adv = new Array(numGlyphs);
  if (t.transformed) {
    // WOFF2 hmtx transform: flags, then advanceWidth[numberOfHMetrics], then optional lsb arrays (unused here)
    r.u8();
    for (let i = 0; i < numberOfHMetrics; i++) adv[i] = r.u16();
  } else {
    for (let i = 0; i < numberOfHMetrics; i++) { adv[i] = r.u16(); r.i16(); }
  }
  for (let i = numberOfHMetrics; i < numGlyphs; i++) adv[i] = adv[numberOfHMetrics - 1];
  return adv;
}

function parseCmap(d) {
  const r = new Reader(d);
  r.u16();
  const n = r.u16();
  const subs = [];
  for (let i = 0; i < n; i++) subs.push({ platform: r.u16(), encoding: r.u16(), offset: r.u32() });
  const map = new Map();
  const pick = subs.find((s) => s.platform === 3 && s.encoding === 10) || subs.find((s) => s.platform === 3 && s.encoding === 1) || subs.find((s) => s.platform === 0);
  if (!pick) throw new Error('no unicode cmap');
  const s = new Reader(d, pick.offset);
  const format = s.u16();
  if (format === 4) {
    s.u16(); s.u16();
    const segX2 = s.u16(); s.p += 6;
    const segs = segX2 / 2;
    const base = s.p;
    const ends = Array.from({ length: segs }, (_, i) => d.readUInt16BE(base + i * 2));
    const startsAt = base + segX2 + 2;
    const deltasAt = startsAt + segX2, rangesAt = deltasAt + segX2;
    for (let i = 0; i < segs; i++) {
      const start = d.readUInt16BE(startsAt + i * 2), end = ends[i], delta = d.readInt16BE(deltasAt + i * 2), ro = d.readUInt16BE(rangesAt + i * 2);
      for (let c = start; c <= end && c !== 0xffff; c++) {
        let gid;
        if (!ro) gid = (c + delta) & 0xffff;
        else { const at = rangesAt + i * 2 + ro + (c - start) * 2; gid = d.readUInt16BE(at); if (gid) gid = (gid + delta) & 0xffff; }
        if (gid) map.set(c, gid);
      }
    }
  } else if (format === 12) {
    s.u16(); s.u32(); s.u32();
    const groups = s.u32();
    for (let i = 0; i < groups; i++) { const a = s.u32(), b = s.u32(), g = s.u32(); for (let c = a; c <= b; c++) map.set(c, g + (c - a)); }
  } else throw new Error(`cmap format ${format} not supported`);
  return map;
}

/** Coverage table → glyph ids (array, coverage index order). */
function coverage(d, off) {
  const r = new Reader(d, off);
  const fmt = r.u16();
  const out = [];
  if (fmt === 1) { const n = r.u16(); for (let i = 0; i < n; i++) out.push(r.u16()); }
  else { const n = r.u16(); for (let i = 0; i < n; i++) { const s = r.u16(), e = r.u16(); r.u16(); for (let g = s; g <= e; g++) out.push(g); } }
  return out;
}
function classDef(d, off) {
  const r = new Reader(d, off);
  const fmt = r.u16();
  const m = new Map();
  if (fmt === 1) { const start = r.u16(), n = r.u16(); for (let i = 0; i < n; i++) m.set(start + i, r.u16()); }
  else { const n = r.u16(); for (let i = 0; i < n; i++) { const s = r.u16(), e = r.u16(), c = r.u16(); for (let g = s; g <= e; g++) m.set(g, c); } }
  return m;
}
const VR_SIZE = (f) => [0x1, 0x2, 0x4, 0x8, 0x10, 0x20, 0x40, 0x80].reduce((n, b) => n + (f & b ? 2 : 0), 0);
const xAdvanceOf = (d, at, f) => { if (!(f & 0x4)) return 0; let o = at; if (f & 0x1) o += 2; if (f & 0x2) o += 2; return d.readInt16BE(o); };

/** GPOS 'kern' pair adjustments (x advance of the first glyph) for the given glyph set. → Map("g1,g2" → value) */
function parseGposKern(d, wanted) {
  const out = new Map();
  if (!d) return out;
  const r = new Reader(d);
  r.u32();
  const scriptList = r.u16(), featureList = r.u16(), lookupList = r.u16();
  void scriptList;
  const fl = new Reader(d, featureList);
  const nf = fl.u16();
  const lookups = new Set();
  for (let i = 0; i < nf; i++) {
    const tag = fl.tag(), off = fl.u16();
    if (tag !== 'kern') continue;
    const fr = new Reader(d, featureList + off);
    fr.u16();
    const n = fr.u16();
    for (let k = 0; k < n; k++) lookups.add(fr.u16());
  }
  const ll = new Reader(d, lookupList);
  const nl = ll.u16();
  const lookupOffsets = Array.from({ length: nl }, () => ll.u16());
  for (const li of [...lookups].sort((a, b) => a - b)) {
    const base = lookupList + lookupOffsets[li];
    const lr = new Reader(d, base);
    let type = lr.u16();
    lr.u16();
    const ns = lr.u16();
    for (let s = 0; s < ns; s++) {
      let sub = base + d.readUInt16BE(base + 6 + s * 2);
      let t = type;
      if (t === 9) { const er = new Reader(d, sub); er.u16(); t = er.u16(); sub += er.u32(); }
      if (t !== 2) continue;
      const sr = new Reader(d, sub);
      const fmt = sr.u16();
      const cov = coverage(d, sub + sr.u16());
      const vf1 = sr.u16(), vf2 = sr.u16();
      const s1 = VR_SIZE(vf1), s2 = VR_SIZE(vf2);
      if (fmt === 1) {
        const nsets = sr.u16();
        for (let i = 0; i < nsets; i++) {
          const g1 = cov[i];
          const ps = sub + d.readUInt16BE(sr.p + i * 2);
          if (!wanted.has(g1)) continue;
          const pr = new Reader(d, ps);
          const npv = pr.u16();
          for (let k = 0; k < npv; k++) {
            const at = ps + 2 + k * (2 + s1 + s2);
            const g2 = d.readUInt16BE(at);
            if (!wanted.has(g2)) continue;
            const v = xAdvanceOf(d, at + 2, vf1);
            const key = `${g1},${g2}`;
            if (v && !out.has(key)) out.set(key, v);
          }
        }
      } else if (fmt === 2) {
        const cd1 = classDef(d, sub + sr.u16()), cd2 = classDef(d, sub + sr.u16());
        const c1n = sr.u16(), c2n = sr.u16();
        const recAt = sr.p, recSize = s1 + s2;
        const covSet = new Set(cov);
        for (const g1 of wanted) {
          if (!covSet.has(g1)) continue;
          const c1 = cd1.get(g1) || 0;
          if (c1 >= c1n) continue;
          for (const g2 of wanted) {
            const c2 = cd2.get(g2) || 0;
            if (c2 >= c2n) continue;
            const at = recAt + (c1 * c2n + c2) * recSize;
            const v = xAdvanceOf(d, at, vf1);
            const key = `${g1},${g2}`;
            if (v && !out.has(key)) out.set(key, v);
          }
        }
      }
    }
  }
  return out;
}

// ── outlines → compact commands ──────────────────────────────────────────────
/** TrueType quadratic contours → [cmd, ...] with cmd = 'M' x y | 'L' x y | 'Q' cx cy x y | 'Z' (font units, y up). */
function contoursToCommands(contours) {
  const out = [];
  for (const c of contours) {
    if (!c.length) continue;
    const pts = c.map((p) => ({ ...p }));
    // start on an on-curve point (or the midpoint of two off-curve points)
    let start = pts.findIndex((p) => p.on);
    let first;
    if (start < 0) { first = { x: (pts[0].x + pts[1 % pts.length].x) / 2, y: (pts[0].y + pts[1 % pts.length].y) / 2, on: true }; start = 0; pts.splice(1, 0, first); start = 1; }
    const ring = [...pts.slice(start), ...pts.slice(0, start)];
    out.push('M', ring[0].x, ring[0].y);
    let ctrl = null;
    for (let i = 1; i <= ring.length; i++) {
      const p = ring[i % ring.length];
      if (p.on) {
        if (ctrl) { out.push('Q', ctrl.x, ctrl.y, p.x, p.y); ctrl = null; } else if (i < ring.length) out.push('L', p.x, p.y);
      } else if (ctrl) {
        const mid = { x: (ctrl.x + p.x) / 2, y: (ctrl.y + p.y) / 2 };
        out.push('Q', ctrl.x, ctrl.y, mid.x, mid.y);
        ctrl = p;
      } else ctrl = p;
    }
    if (ctrl) out.push('Q', ctrl.x, ctrl.y, ring[0].x, ring[0].y);
    out.push('Z');
  }
  return out;
}

function flattenGlyph(glyphs, gid, m = [1, 0, 0, 1, 0, 0], depth = 0) {
  const g = glyphs[gid];
  if (!g || depth > 8) return [];
  if (g.contours) {
    const [a, b, c, d, e, f] = m;
    return g.contours.map((ct) => ct.map((p) => ({ x: Math.round(a * p.x + c * p.y + e), y: Math.round(b * p.x + d * p.y + f), on: p.on })));
  }
  const out = [];
  for (const k of g.components) {
    const [a, b, c, d, e, f] = m;
    // child transform = parent × [k.a k.b k.c k.d k.dx k.dy]
    const cm = [a * k.a + c * k.b, b * k.a + d * k.b, a * k.c + c * k.d, b * k.c + d * k.d, a * k.dx + c * k.dy + e, b * k.dx + d * k.dy + f];
    out.push(...flattenGlyph(glyphs, k.glyph, cm, depth + 1));
  }
  return out;
}

export function extractFont(woff2) {
  const T = decodeWoff2(woff2);
  const head = parseHead(T.head.data), hhea = parseHhea(T.hhea.data), maxp = parseMaxp(T.maxp.data), os2 = T['OS/2'] ? parseOS2(T['OS/2'].data) : {};
  const glyphs = decodeGlyf(T.glyf);
  const adv = parseHmtx(T.hmtx, maxp.numGlyphs, hhea.numberOfHMetrics);
  const cmap = parseCmap(T.cmap.data);
  const chars = {}, gidOf = new Map(), missing = [];
  for (const ch of CHARSET) {
    const gid = cmap.get(ch.codePointAt(0));
    if (!gid) { missing.push(ch); continue; }
    gidOf.set(gid, ch);
    chars[ch] = [adv[gid], contoursToCommands(flattenGlyph(glyphs, gid))];
  }
  const kernMap = parseGposKern(T.GPOS?.data, new Set(gidOf.keys()));
  const kern = {};
  for (const [k, v] of kernMap) { const [a, b] = k.split(',').map(Number); kern[gidOf.get(a) + gidOf.get(b)] = v; }
  return { unitsPerEm: head.unitsPerEm, ascender: hhea.ascender, descender: hhea.descender, capHeight: os2.capHeight, xHeight: os2.xHeight, chars, kern, missing };
}

/** Find the Inter @font-face data URLs: { weight: Buffer }. */
export function findInterFaces(html) {
  const re = /font-family:\s*'Inter';\s*font-style:\s*normal;\s*font-weight:\s*(\d+);[^}]*?src:\s*url\(data:font\/woff2;base64,([A-Za-z0-9+/=]+)\)/g;
  const out = {};
  for (const m of html.matchAll(re)) out[m[1]] = Buffer.from(m[2], 'base64');
  return out;
}

function moduleText(weight, f) {
  const enc = (cmds) => cmds.map((v) => (typeof v === 'number' ? v : v)).join(' ');
  const chars = Object.entries(f.chars).map(([ch, [a, cmds]]) => `  ${JSON.stringify(ch)}: [${a}, ${JSON.stringify(enc(cmds))}],`).join('\n');
  return `// GENERATED by scripts/extract-fonts.mjs from the Inter ${weight} woff2 embedded in Prism.html — do not edit.
// Inter is © The Inter Project Authors, SIL Open Font License 1.1 (https://rsms.me/inter/).
// Outlines are TrueType quadratic contours in font units (y up): "M x y", "L x y", "Q cx cy x y", "Z".
export default {
  family: 'Inter',
  weight: ${weight},
  unitsPerEm: ${f.unitsPerEm},
  ascender: ${f.ascender},
  descender: ${f.descender},
  capHeight: ${f.capHeight ?? Math.round(f.unitsPerEm * 0.727)},
  xHeight: ${f.xHeight ?? Math.round(f.unitsPerEm * 0.546)},
  chars: {
${chars}
  },
  kern: ${JSON.stringify(f.kern)},
};
`;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const i = args.indexOf('--from');
  const candidates = i >= 0 ? [path.resolve(args[i + 1])] : [path.resolve(ROOT, '..', '..', 'aaa-prism-ds', 'parts', 'shell-style.html'), path.resolve(ROOT, '..', 'Prism.html')];
  const src = candidates.find((p) => fs.existsSync(p));
  if (!src) { console.error(`no font source found (tried ${candidates.join(', ')})`); process.exit(1); }
  const faces = findInterFaces(fs.readFileSync(src, 'utf8'));
  const weights = Object.keys(faces);
  if (!weights.length) { console.error(`no Inter @font-face data URLs in ${src}`); process.exit(1); }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  let stale = false;
  for (const w of weights) {
    const f = extractFont(faces[w]);
    const text = moduleText(w, f);
    const file = path.join(OUT_DIR, `inter-${w}.js`);
    if (args.includes('--check')) { if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== text) { console.error(`${path.relative(ROOT, file)} is out of date`); stale = true; } continue; }
    fs.writeFileSync(file, text);
    console.log(`wrote ${path.relative(ROOT, file)}: ${Object.keys(f.chars).length} glyphs, ${Object.keys(f.kern).length} kern pairs, upm ${f.unitsPerEm}${f.missing.length ? `, missing ${f.missing.join(' ')}` : ''} (${(text.length / 1024).toFixed(0)} KB)`);
  }
  // fonts/index.js: the faces that exist (font.js picks the nearest and synthesizes the rest)
  const ws = weights.map(Number).sort((a, b) => a - b);
  const index = `// GENERATED by scripts/extract-fonts.mjs — do not edit. The Inter faces extracted from Prism.html.
${ws.map((w) => `import inter${w} from './inter-${w}.js';`).join(String.fromCharCode(10))}

export const FACES = { ${ws.map((w) => `${w}: inter${w}`).join(', ')} };
`;
  const indexFile = path.join(OUT_DIR, 'index.js');
  if (args.includes('--check')) { if (!fs.existsSync(indexFile) || fs.readFileSync(indexFile, 'utf8') !== index) { console.error('src/scene/fonts/index.js is out of date'); stale = true; } }
  else { fs.writeFileSync(indexFile, index); console.log(`wrote src/scene/fonts/index.js (weights ${ws.join(', ')})`); }
  if (stale) process.exit(1);
}
