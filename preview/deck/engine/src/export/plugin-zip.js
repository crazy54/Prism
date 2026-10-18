// Minimal ZIP (PKWARE APPNOTE 6.3) writer + reader, zero dependencies (node:zlib).
// Used for .streamDeckPlugin, .streamDeckIconPack and .streamDeckProfile files —
// all three are plain ZIPs (formats.md §1.10, §4.1, §5.2). Deflate when it helps,
// store otherwise; UTF-8 names (flag bit 11); forward slashes; directory entries end
// in '/'; a fixed mtime keeps builds byte-reproducible. No ZIP64 (archives < 4 GB).

import zlib from 'node:zlib';

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();

export function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** MS-DOS date/time for a Date (local fields, 2-second resolution). */
export function dosDateTime(d) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const date = ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

export const DEFAULT_MTIME = new Date(2026, 9, 15, 12, 0, 0);

/**
 * entries: [{ name, data?: Buffer | string }] — no data (or a name ending in '/') = a directory.
 * Parent directories are added automatically. → Buffer
 */
export function writeZip(entries, { mtime = DEFAULT_MTIME, level = 9 } = {}) {
  const all = new Map();
  for (const e of entries) {
    const name = String(e.name).replace(/\\/g, '/').replace(/^\/+/, '');
    if (!name || name.split('/').some((p) => p === '..')) throw new Error(`bad zip entry name "${e.name}"`);
    const parts = name.split('/');
    for (let i = 1; i < parts.length; i++) { const dir = `${parts.slice(0, i).join('/')}/`; if (!all.has(dir)) all.set(dir, { name: dir, dir: true }); }
    const isDir = name.endsWith('/') || e.data === undefined;
    all.set(isDir && !name.endsWith('/') ? `${name}/` : name, isDir ? { name: name.endsWith('/') ? name : `${name}/`, dir: true } : { name, data: Buffer.isBuffer(e.data) ? e.data : Buffer.from(String(e.data), 'utf8') });
  }
  const { time, date } = dosDateTime(mtime);
  const locals = [], centrals = [];
  let offset = 0;
  for (const e of all.values()) {
    const nameBuf = Buffer.from(e.name, 'utf8');
    const raw = e.dir ? Buffer.alloc(0) : e.data;
    const crc = e.dir ? 0 : crc32(raw);
    let method = 0, body = raw;
    if (!e.dir && raw.length > 0) { const d = zlib.deflateRawSync(raw, { level }); if (d.length < raw.length) { method = 8; body = d; } }
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(method, 8);
    lh.writeUInt16LE(time, 10); lh.writeUInt16LE(date, 12); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(body.length, 18); lh.writeUInt32LE(raw.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26); lh.writeUInt16LE(0, 28);
    locals.push(lh, nameBuf, body);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(0x0314, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(method, 10);
    ch.writeUInt16LE(time, 12); ch.writeUInt16LE(date, 14); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(body.length, 20); ch.writeUInt32LE(raw.length, 24);
    ch.writeUInt16LE(nameBuf.length, 28); ch.writeUInt16LE(0, 30); ch.writeUInt16LE(0, 32); ch.writeUInt16LE(0, 34); ch.writeUInt16LE(0, 36);
    ch.writeUInt32LE(e.dir ? ((0o40755 << 16) | 0x10) >>> 0 : (0o100644 << 16) >>> 0, 38); ch.writeUInt32LE(offset, 42);
    centrals.push(ch, nameBuf);
    offset += 30 + nameBuf.length + body.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(0, 4); end.writeUInt16LE(0, 6); end.writeUInt16LE(all.size, 8); end.writeUInt16LE(all.size, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16); end.writeUInt16LE(0, 20);
  return Buffer.concat([...locals, cd, end]);
}

/** Read a ZIP → [{ name, dir, data }] (inflated, CRC-checked). Throws on corruption. */
export function readZip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('not a zip (no end of central directory)');
  const count = buf.readUInt16LE(eocd + 10), cdOff = buf.readUInt32LE(eocd + 16);
  const out = [];
  let p = cdOff;
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('bad central directory entry');
    const method = buf.readUInt16LE(p + 10), crc = buf.readUInt32LE(p + 16), csize = buf.readUInt32LE(p + 20), usize = buf.readUInt32LE(p + 24);
    const nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32), lho = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nlen).toString('utf8');
    p += 46 + nlen + xlen + clen;
    if (buf.readUInt32LE(lho) !== 0x04034b50) throw new Error(`bad local header for ${name}`);
    const start = lho + 30 + buf.readUInt16LE(lho + 26) + buf.readUInt16LE(lho + 28);
    const body = buf.subarray(start, start + csize);
    const data = method === 8 ? zlib.inflateRawSync(body) : method === 0 ? Buffer.from(body) : null;
    if (!data) throw new Error(`unsupported method ${method} for ${name}`);
    if (data.length !== usize || crc32(data) !== crc) throw new Error(`CRC/size mismatch for ${name}`);
    out.push({ name, dir: name.endsWith('/'), data });
  }
  return out;
}
