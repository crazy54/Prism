// Minimal TrueType/OpenType cmap reader — answers "does this font have a glyph
// for code point X?" so the terminal fallback map is verified, not guessed.
import { readFileSync, existsSync } from 'node:fs';

export function loadCmap(file) {
  const b = readFileSync(file);
  let base = 0;
  if (b.toString('latin1', 0, 4) === 'ttcf') base = b.readUInt32BE(12);      // first face of a collection
  const n = b.readUInt16BE(base + 4);
  let cmap = -1;
  for (let i = 0; i < n; i++) {
    const rec = base + 12 + i * 16;
    if (b.toString('latin1', rec, rec + 4) === 'cmap') cmap = b.readUInt32BE(rec + 8);
  }
  if (cmap < 0) throw new Error('no cmap in ' + file);
  const subs = [];
  for (let i = 0, nt = b.readUInt16BE(cmap + 2); i < nt; i++) {
    const r = cmap + 4 + i * 8;
    subs.push({ pid: b.readUInt16BE(r), eid: b.readUInt16BE(r + 2), off: cmap + b.readUInt32BE(r + 4) });
  }
  const pick = subs.find(s => b.readUInt16BE(s.off) === 12 && (s.pid === 3 || s.pid === 0))
    || subs.find(s => b.readUInt16BE(s.off) === 4 && s.pid === 3)
    || subs.find(s => b.readUInt16BE(s.off) === 4);
  if (!pick) throw new Error('no usable cmap subtable in ' + file);
  const o = pick.off, fmt = b.readUInt16BE(o);
  if (fmt === 12) {
    const groups = [];
    for (let i = 0, ng = b.readUInt32BE(o + 12); i < ng; i++) {
      const g = o + 16 + i * 12;
      groups.push([b.readUInt32BE(g), b.readUInt32BE(g + 4), b.readUInt32BE(g + 8)]);
    }
    return cp => groups.some(([s, e, g]) => cp >= s && cp <= e && g + cp - s !== 0);
  }
  const segX2 = b.readUInt16BE(o + 6), seg = segX2 / 2;
  const endA = o + 14, startA = endA + segX2 + 2, deltaA = startA + segX2, rangeA = deltaA + segX2;
  return cp => {
    if (cp > 0xffff) return false;
    for (let i = 0; i < seg; i++) {
      const end = b.readUInt16BE(endA + i * 2);
      if (cp > end) continue;
      const start = b.readUInt16BE(startA + i * 2);
      if (cp < start) return false;
      const delta = b.readInt16BE(deltaA + i * 2), ro = b.readUInt16BE(rangeA + i * 2);
      if (ro === 0) return ((cp + delta) & 0xffff) !== 0;
      const gi = b.readUInt16BE(rangeA + i * 2 + ro + (cp - start) * 2);
      return gi !== 0 && ((gi + delta) & 0xffff) !== 0;
    }
    return false;
  };
}

const WIN = 'C:/Windows/Fonts/', USER = 'C:/Users/jerem/AppData/Local/Microsoft/Windows/Fonts/';
export const MONO_FONTS = [
  ['Consolas', WIN + 'consola.ttf'],
  ['Cascadia', USER + 'CaskaydiaCoveNerdFontMono-Regular.ttf'],
  ['Fira Mono', WIN + 'FiraMono-Regular.ttf'],
  ['IBM Plex Mono', USER + 'IBMPlexMono - Regular.ttf'],
  ['Lucida Console', WIN + 'lucon.ttf'],
  ['Courier New', WIN + 'cour.ttf'],
];
export const FALLBACK_FONTS = [['Segoe UI Symbol', WIN + 'seguisym.ttf']];

export function loadFonts(list) {
  return list.filter(([, f]) => existsSync(f)).map(([name, f]) => {
    try { return [name, loadCmap(f)]; } catch (e) { return null; }
  }).filter(Boolean);
}
