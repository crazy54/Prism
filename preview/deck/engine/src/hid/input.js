// Input reports (device → host). hidraw read() returns ONE report per call with
// the report id at raw[0]. Layouts: research linux.md §2.4.
//
//   gen1 (orig, mini)  raw[0]=01, raw[1+i] = key i (orig: wire index, right-to-left per row)
//   gen2               raw[0]=01, raw[1]=cmd, raw[2..3]=payload length LE, payload from raw[4]
//     cmd 00  keys      raw[4+i] = key i (Neo: keys 0–7, touch sensors 8 left / 9 right)
//     cmd 02  touch     raw[4] 1 tap / 2 press (long) / 3 flick; x raw[6..7], y raw[8..9]; flick x2/y2 raw[10..13]
//     cmd 03  encoders  raw[4]=00 press state raw[5+i] (edge-detected here); raw[4]=01 rotate int8 raw[5+i] (+ = clockwise)
//     cmd 04  NFC       ascii raw[4 .. 4+len), len = raw[2..3] (Studio)
//
// Events: { type: 'down' | 'up', key, sensor? } · { type: 'rotate', dial, ticks } · { type: 'dialDown' | 'dialUp', dial }
//         { type: 'touch', gesture: 'tap' | 'press' | 'flick', x, y, x2?, y2? } · { type: 'nfc', id }

import { hidKey } from './models.js';

const GESTURES = [null, 'tap', 'press', 'flick'];

/** A stateful parser for one device (it edge-detects keys and dial presses). parse(report) → events[]. */
export function createInputParser(m) {
  const keys = new Uint8Array(m.inputs);
  const dials = new Uint8Array(m.encoders || 0);
  const events = [];
  const key = (k, s) => {
    s = s ? 1 : 0;
    if (s === keys[k]) return;
    keys[k] = s;
    const ev = { type: s ? 'down' : 'up', key: k };
    if (k >= m.keys) ev.sensor = k - m.keys;
    events.push(ev);
  };
  function parse(raw) {
    events.length = 0;
    const r = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
    if (r.length < 2 || r[0] !== 0x01) return [];
    if (m.proto !== 'gen2') {
      for (let k = 0; k < m.keys; k++) key(k, r[1 + hidKey(m, k)]);
      return events.slice();
    }
    if (r.length < 4) return [];
    const v = new DataView(r.buffer, r.byteOffset, r.length);
    const cmd = r[1];
    if (cmd === 0x00) {
      for (let k = 0; k < m.inputs && 4 + k < r.length; k++) key(k, r[4 + k]);
    } else if (cmd === 0x02 && m.touch && r.length >= 10) {
      const gesture = GESTURES[r[4]];
      if (gesture) {
        const ev = { type: 'touch', gesture, x: v.getUint16(6, true), y: v.getUint16(8, true) };
        if (r[4] === 3 && r.length >= 14) { ev.x2 = v.getUint16(10, true); ev.y2 = v.getUint16(12, true); }
        events.push(ev);
      }
    } else if (cmd === 0x03 && dials.length && r.length >= 5 + dials.length) {
      for (let i = 0; i < dials.length; i++) {
        if (r[4] === 0x01) { const d = v.getInt8(5 + i); if (d) events.push({ type: 'rotate', dial: i, ticks: d }); }
        else if (r[4] === 0x00) { const s = r[5 + i] ? 1 : 0; if (s !== dials[i]) { dials[i] = s; events.push({ type: s ? 'dialDown' : 'dialUp', dial: i }); } }
      }
    } else if (cmd === 0x04 && m.nfc) {
      const len = Math.min(v.getUint16(2, true), r.length - 4);
      events.push({ type: 'nfc', id: String.fromCharCode(...r.subarray(4, 4 + len)) });
    }
    return events.slice();
  }
  return { parse, state: () => ({ keys: Array.from(keys), dials: Array.from(dials) }) };
}
