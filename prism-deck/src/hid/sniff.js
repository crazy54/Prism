// The inverse of packets.js: reassemble captured output reports into the images
// they carry. Used by the loopback tests (encode → packets → sniff → decode →
// compare) and for looking at what a device was sent (memory transport, or a
// usbmon capture split into reports).
//
//   sniffReports(reports, model) → [{ cmd, target: 'key:3' | 'lcd:x,y,w,h' | 'infobar' | 'full' | 'reset', key?, rect?, bytes }]

import { hidKey } from './models.js';

const u16 = (p, o) => p[o] | (p[o + 1] << 8);

export function sniffReports(reports, model) {
  const out = [], open = new Map();
  const finish = (k, cmd, meta) => { const parts = open.get(k) || []; open.delete(k); const len = parts.reduce((n, p) => n + p.length, 0); const bytes = new Uint8Array(len); let o = 0; for (const p of parts) { bytes.set(p, o); o += p.length; } out.push({ cmd, target: k, ...meta, bytes }); };
  const add = (k, page, data) => { const parts = open.get(k) || []; if (page === 0 || !open.has(k)) parts.length = 0; parts.push(data); open.set(k, parts); };
  for (const p of reports) {
    if (p[0] !== 0x02) continue;
    const cmd = p[1];
    if (cmd === 0x00) { out.push({ cmd, target: 'reset' }); continue; }
    if (cmd === 0x01 && model.proto === 'orig') {
      const wire = p[5] - 1, key = hidKey(model, wire); // the rtl mapping is its own inverse
      const k = `key:${key}`;
      const bmpLen = 54 + model.key.w * model.key.h * 3, half = Math.ceil(bmpLen / 2);
      add(k, p[2] - 1, p.subarray(16, 16 + (p[4] ? bmpLen - half : half)));
      if (p[4]) finish(k, cmd, { key });
    } else if (cmd === 0x01) {
      const key = p[5] - 1, k = `key:${key}`;
      const bmpLen = 54 + model.key.w * model.key.h * 3;
      const got = (open.get(k) || []).reduce((n, x) => n + x.length, 0);
      add(k, p[2], p.subarray(16, 16 + Math.min(1008, bmpLen - (p[2] === 0 ? 0 : got))));
      if (p[4]) finish(k, cmd, { key });
    } else if (cmd === 0x07) {
      const key = p[2], k = `key:${key}`;
      add(k, u16(p, 6), p.subarray(8, 8 + u16(p, 4)));
      if (p[3]) finish(k, cmd, { key });
    } else if (cmd === 0x08 || cmd === 0x0b) {
      const k = cmd === 0x08 ? 'full' : 'infobar';
      add(k, u16(p, 6), p.subarray(8, 8 + u16(p, 4)));
      if (p[3]) finish(k, cmd, {});
    } else if (cmd === 0x0c) {
      const rect = { x: u16(p, 2), y: u16(p, 4), w: u16(p, 6), h: u16(p, 8) };
      const k = `lcd:${rect.x},${rect.y},${rect.w},${rect.h}`;
      add(k, u16(p, 11), p.subarray(16, 16 + u16(p, 13)));
      if (p[10]) finish(k, cmd, { rect });
    }
  }
  return out;
}
