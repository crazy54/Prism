// Local fixture server for the browser tests: pages from ./pages, a generated 30 s WAV tone (with
// HTTP Range support so seeking works) and a generated PNG. Binds 127.0.0.1 on a free port (never 8799).
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));

export function makeWav(seconds = 30, rate = 8000, hz = 440) {
  const n = seconds * rate;
  const b = Buffer.alloc(44 + n);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate, 28); b.writeUInt16LE(1, 32); b.writeUInt16LE(8, 34); b.write('data', 36); b.writeUInt32LE(n, 40);
  for (let i = 0; i < n; i++) b[44 + i] = 128 + Math.round(20 * Math.sin((2 * Math.PI * hz * i) / rate));
  return b;
}

const CRC = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
function crc32(buf) { let c = -1; for (const x of buf) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
/** An RGB PNG: night background with a lavender square (fixture art, no marks). */
export function makePng(size = 300) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const inner = x > size / 4 && x < (3 * size) / 4 && y > size / 4 && y < (3 * size) / 4;
      const o = y * (size * 3 + 1) + 1 + x * 3;
      raw[o] = inner ? 0xb8 : 0x0a; raw[o + 1] = inner ? 0xa2 : 0x0c; raw[o + 2] = inner ? 0xf2 : 0x12;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.png': 'image/png', '.wav': 'audio/wav' };

export async function startServer() {
  const wav = makeWav();
  const png = makePng(300);
  const smallPng = makePng(64);
  const icon = makePng(32);
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    let body = null;
    let type = 'application/octet-stream';
    if (url.pathname === '/tone.wav') { body = wav; type = TYPES['.wav']; }
    else if (url.pathname === '/art.png') { body = png; type = TYPES['.png']; }
    else if (url.pathname === '/icon.png' || url.pathname === '/favicon.ico') { body = icon; type = TYPES['.png']; }
    else {
      const file = join(here, 'pages', url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\/+/, ''));
      if (file.startsWith(join(here, 'pages')) && existsSync(file)) {
        type = TYPES[extname(file)] || type;
        body = readFileSync(file);
        if (type.startsWith('text/html')) body = Buffer.from(body.toString('utf8').replaceAll('{{SMALL_PNG_B64}}', smallPng.toString('base64')));
      }
    }
    if (!body) { res.writeHead(404); res.end(); return; }
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (range && type === TYPES['.wav']) {
      const start = range[1] ? Number(range[1]) : 0;
      const end = range[2] ? Math.min(Number(range[2]), body.length - 1) : body.length - 1;
      res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${body.length}`, 'Content-Length': end - start + 1, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' });
      res.end(body.subarray(start, end + 1));
      return;
    }
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': body.length, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' });
    res.end(body);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  let port = server.address().port;
  if (port === 8799) { server.close(); return startServer(); }
  return { server, port, origin: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(r)) };
}
