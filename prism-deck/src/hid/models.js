// HID model table — USB vendor/product id → wire protocol for every deck Prism
// Deck can drive directly over Linux hidraw.
//
// Source: aaa-prism-ds/handoff-from-prism-e0/research/linux.md §2.1–§2.6 (byte
// layouts cross-checked against python-elgato-streamdeck 0.10.0 and
// node-elgato-stream-deck 7.8.0) and research/devices.json (USB ids, image
// formats, rotations). Grid and key px are taken from src/devices.js so the
// renderer and the wire always agree; test/hid.test.js checks the two tables.
//
// proto   'orig'  2017 Stream Deck (0060): BMP, 8191-byte reports, 2 halves per image, keys right-to-left
//         'mini'  Mini family: BMP, 1024-byte reports, 16-byte header
//         'gen2'  everything else: JPEG, 1024-byte reports, 8-byte key header, 0x0C regions
// xf      pixel transform applied before encoding (pixels.js): none | rot180 | mirrorX | ccw90
// lcd     the non-key display: strip (+, + XL), infobar (Neo), screen (Galleon)
// feature feature-report flavour + byte lengths to try (ioctl via linux/prism-deck-hidfeature.py)

import { getDevice } from '../devices.js';

export const VENDOR = Object.freeze({ ELGATO: 0x0fd9, CORSAIR: 0x1b1c });

/** Output-report commands this driver may send (byte 1 after report id 0x02). Anything else is refused. */
export const OUTPUT_COMMANDS = Object.freeze({
  0x00: 'reset key stream (zero-filled report)',
  0x01: 'gen1 key image (orig / mini)',
  0x07: 'gen2 key image',
  0x08: 'gen2 full-LCD image (documented by Elgato, not used by the libraries — experimental)',
  0x0b: 'Neo info bar image',
  0x0c: 'LCD region image (+ / + XL strip, Galleon screen)',
  0x0f: 'Studio encoder ring LEDs',
  0x10: 'Studio knob LED',
});

const BUDGET = 1500;     // reports/s — conservative default; measure with `prism-deck hid bench`
const GALLEON_BUDGET = 3000; // half of the only community measurement (~500 key images/s)

const G15 = { proto: 'gen2', keyFmt: 'jpeg', keyXf: 'rot180', fullLcd: { w: 480, h: 272 } };
const G32 = { proto: 'gen2', keyFmt: 'jpeg', keyXf: 'rot180', fullLcd: { w: 1024, h: 600 } };
const MINI = { proto: 'mini', keyFmt: 'bmp', keyXf: 'ccw90', ppm: 2835, outLen: 1024, feature: { kind: 'gen1', lens: [32, 17] } };

// usb id (vvvv:pppp, lower-case hex) → devices.js id + protocol
const TABLE = [
  ['0fd9:0060', 'original', { proto: 'orig', keyFmt: 'bmp', keyXf: 'mirrorX', ppm: 3780, rtl: true, outLen: 8191, feature: { kind: 'gen1', lens: [17] }, minKernel: '5.6' }],
  ['0fd9:006d', 'original-v2', G15],
  ['0fd9:0080', 'mk2', G15],
  ['0fd9:00a5', 'scissor', G15],
  ['0fd9:00b9', 'module-15', G15],
  ['0fd9:00e4', 'module-15-scissor', G15],
  ['0fd9:0063', 'mini', { ...MINI, feature: { kind: 'gen1', lens: [17, 32] } }],
  ['0fd9:0090', 'mini-2022', MINI],
  ['0fd9:00b3', 'mini-discord', MINI],
  ['0fd9:00b8', 'module-6', MINI],
  ['0fd9:006c', 'xl', G32],
  ['0fd9:008f', 'xl-2022', G32],
  ['0fd9:00ba', 'module-32', G32],
  ['0fd9:009a', 'neo', { proto: 'gen2', keyFmt: 'jpeg', keyXf: 'rot180', sensors: 2, fullLcd: { w: 480, h: 320 },
    lcd: { kind: 'infobar', w: 248, h: 58, cmd: 0x0b, xf: 'rot180' } }],
  ['0fd9:0084', 'plus', { proto: 'gen2', keyFmt: 'jpeg', keyXf: 'none', encoders: 4, touch: true, fullLcd: { w: 800, h: 480 },
    lcd: { kind: 'strip', w: 800, h: 100, cmd: 0x0c, xf: 'none', segments: 4 } }],
  ['0fd9:00c6', 'plusxl', { proto: 'gen2', keyFmt: 'jpeg', keyXf: 'ccw90', encoders: 6, touch: true, fullLcd: { w: 1280, h: 800 },
    lcd: { kind: 'strip', w: 1200, h: 100, cmd: 0x0c, xf: 'ccw90', segments: 6 } }],
  ['0fd9:00aa', 'studio', { proto: 'gen2', keyFmt: 'jpeg', keyXf: 'none', encoders: 2, nfc: true,
    ring: { kind: 'studio', leds: 24, offsets: [0, 12] } }],
  ['0fd9:0086', 'pedal', { proto: 'gen2', keyFmt: null, keyXf: null, inputOnly: true, resetStream: false }],
  ['1b1c:2b18', 'galleon', { proto: 'gen2', keyFmt: 'jpeg', keyXf: 'none', encoders: 2, iface: 0,
    keepAlive: { ms: 500, report: [0x03, 0x27] }, resetStream: false, budget: GALLEON_BUDGET,
    lcd: { kind: 'screen', w: 720, h: 384, cmd: 0x0c, xf: 'none', widgets: { cols: 2, rows: 2, w: 360, h: 192 } },
    ring: { kind: 'galleon', leds: 4, offsets: [3, 1] } }],
];

function build([usb, id, p]) {
  const [vid, pid] = usb.split(':').map((h) => parseInt(h, 16));
  const d = getDevice(id);
  if (d.id !== id) throw new Error(`hid/models: ${usb} maps to unknown device "${id}"`);
  const key = d.keyPx && !p.inputOnly ? { w: d.keyPx.w, h: d.keyPx.h } : null;
  const m = {
    usb, vid, pid, id, name: d.name, vendor: d.vendor,
    cols: d.cols, rows: d.rows, keys: d.cols * d.rows, sensors: 0, encoders: 0, touch: false, nfc: false,
    key, keyFmt: null, keyXf: 'none', ppm: 0, rtl: false,
    lcd: null, ring: null, keepAlive: null, iface: undefined, fullLcd: null,
    outLen: 1024, inLen: 512, resetStream: true, inputOnly: false,
    feature: { kind: 'gen2', lens: [32] },
    budget: BUDGET,
    ...p,
  };
  m.inputs = m.keys + m.sensors; // key bytes in an input report (Neo: 8 keys + 2 touch sensors)
  return Object.freeze(m);
}

export const MODELS = Object.freeze(TABLE.map(build));
export const MODEL_BY_USB = Object.freeze(Object.fromEntries(MODELS.map((m) => [m.usb, m])));
export const MODEL_BY_ID = Object.freeze(Object.fromEntries(MODELS.map((m) => [m.id, m])));

export const usbKey = (vid, pid) => `${vid.toString(16).padStart(4, '0')}:${pid.toString(16).padStart(4, '0')}`;

/** The model for a USB vendor/product id (numbers), or null. */
export const modelForUsb = (vid, pid) => MODEL_BY_USB[usbKey(vid, pid)] || null;

/** The model for a devices.js id / alias, or null when the device can't be driven over hidraw. */
export function modelForDevice(q) {
  if (q && typeof q === 'object') return MODEL_BY_ID[q.id] || null;
  const s = String(q ?? '').toLowerCase();
  const d = getDevice(s); // unknown ids fall back to mk2 there, so check the match
  return d.id === s || d.aliases?.includes(s) ? MODEL_BY_ID[d.id] || null : null;
}

/** HID key index on the wire for a logical (row-major, top-left) key. The 2017 original runs right-to-left per row. */
export const hidKey = (m, key) => (m.rtl ? key - (key % m.cols) + (m.cols - 1 - (key % m.cols)) : key);

/** Every USB id a udev rule must cover (lower-case hex pairs). */
export const USB_IDS = Object.freeze(MODELS.map((m) => ({ vid: m.usb.slice(0, 4), pid: m.usb.slice(5), id: m.id, name: m.name })));
