// Device discovery on Linux without libudev: walk /sys/class/hidraw/*/device/uevent
// (world-readable; written by the kernel's hid_uevent()) and match HID_ID against
// the model table. research linux.md §2.7.
//
//   HID_ID=0003:00000FD9:00000084     bus(4 hex):vendor(8):product(8); bus 0003 = USB
//   HID_NAME=Elgato …                 product string (informational only)
//   HID_PHYS=usb-0000:00:14.0-3/input0   "/input<bInterfaceNumber>" — the Galleon must be interface 0
//   HID_UNIQ=AL12K1A12345             the USB serial number (no feature report needed)
//
// Composite devices (the Galleon is a keyboard + a deck behind one USB id): the node
// must be the deck interface by BOTH sources we can read — HID_PHYS "/inputN" and the
// parent usb_interface's sysfs bInterfaceNumber (the attribute the udev rule checks).
// Unknown or disagreeing → refused, so the keyboard's hidraw nodes are never opened.
//
// Everything takes { sysfs, dev, fs } so tests run against a fake tree.

import nodeFs from 'node:fs';
import path from 'node:path';
import { modelForUsb } from './models.js';

const BUS_USB = 0x0003;

/** KEY=value lines → object. */
export function parseUevent(text) {
  const out = {};
  for (const line of String(text).split(/\r?\n/)) {
    const i = line.indexOf('=');
    if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

/** HID_ID → { bus, vid, pid } or null. */
export function parseHidId(s) {
  const m = /^([0-9A-F]{4}):([0-9A-F]{8}):([0-9A-F]{8})$/i.exec(String(s || '').trim());
  return m ? { bus: parseInt(m[1], 16), vid: parseInt(m[2], 16), pid: parseInt(m[3], 16) } : null;
}

/** USB interface number from HID_PHYS ("…/input0" → 0), or -1. */
export const interfaceOf = (phys) => Number(/\/input(\d+)$/.exec(String(phys || ''))?.[1] ?? -1);

/** sysfs bInterfaceNumber text ("00\n", hex) → number, or -1. */
export const parseInterfaceNumber = (s) => (/^\s*[0-9a-f]{1,2}\s*$/i.test(String(s ?? '')) ? parseInt(String(s).trim(), 16) : -1);

/**
 * Match one uevent to a deck → { vid, pid, model, name, serial, iface, phys } or null
 * (not USB, unknown id, or the wrong interface of a composite device). `sysIface` is the
 * parent usb_interface's bInterfaceNumber when it could be read (-1 / undefined = unknown).
 */
export function matchUevent(ev, sysIface) {
  const id = parseHidId(ev.HID_ID);
  if (!id || id.bus !== BUS_USB) return null;
  const model = modelForUsb(id.vid, id.pid);
  if (!model) return null;
  const phys = interfaceOf(ev.HID_PHYS);
  const sys = Number.isInteger(sysIface) ? sysIface : -1;
  const iface = phys >= 0 ? phys : sys;
  if (model.iface !== undefined) { // Galleon: only the Stream Deck interface, never the keyboard's
    if (iface !== model.iface) return null;
    if (sys >= 0 && sys !== model.iface) return null;
  }
  return { vid: id.vid, pid: id.pid, model, name: ev.HID_NAME || model.name, serial: ev.HID_UNIQ || null, iface, phys: ev.HID_PHYS || null };
}

/**
 * Every supported deck on this machine → [{ path: '/dev/hidrawN', node, id, model, name, serial, iface, phys }],
 * sorted by node number. Returns [] where there is no hidraw (Windows, macOS, containers).
 */
export function listDecks({ sysfs = '/sys', dev = '/dev', fs = nodeFs } = {}) {
  const dir = path.posix.join(sysfs.replace(/\\/g, '/'), 'class', 'hidraw');
  let nodes;
  try { nodes = fs.readdirSync(dir); } catch { return []; }
  const out = [];
  for (const node of nodes) {
    if (!/^hidraw\d+$/.test(node)) continue;
    let text;
    try { text = fs.readFileSync(`${dir}/${node}/device/uevent`, 'utf8'); } catch { continue; }
    const hit = matchUevent(parseUevent(text), sysInterface(fs, `${dir}/${node}/device`));
    if (hit) out.push({ path: `${dev.replace(/\\/g, '/').replace(/\/$/, '')}/${node}`, node, id: hit.model.id, ...hit });
  }
  return out.sort((a, b) => Number(a.node.slice(6)) - Number(b.node.slice(6)));
}

/** bInterfaceNumber of the usb_interface above a hid device dir (sysfs symlink), or -1. */
function sysInterface(fs, deviceDir) {
  try {
    const real = fs.realpathSync(deviceDir);
    return parseInterfaceNumber(fs.readFileSync(path.join(path.dirname(real), 'bInterfaceNumber'), 'utf8'));
  } catch { return -1; }
}

/**
 * Pick one deck: by `path` (/dev/hidrawN or hidrawN), `serial`, or `model` (devices.js id); otherwise
 * the only one present. Throws a HidError-like Error with a code when nothing / several match.
 */
export function selectDeck(decks, { path: p, serial, model } = {}) {
  let list = decks;
  if (p) { const n = String(p).replace(/^.*\//, ''); list = list.filter((d) => d.node === n || d.path === p); }
  if (serial) list = list.filter((d) => d.serial === serial);
  if (model) list = list.filter((d) => d.id === model || d.model.id === model);
  if (!list.length) {
    const e = new Error(decks.length ? `no deck matches ${JSON.stringify({ path: p, serial, model })} (found: ${decks.map((d) => `${d.id} ${d.path}`).join(', ')})` : 'no supported deck found in /sys/class/hidraw (is it plugged in? see `prism-deck hid doctor`)');
    e.code = 'ENODEV';
    throw e;
  }
  if (list.length > 1) {
    const e = new Error(`several decks match — pick one with --path or --serial: ${list.map((d) => `${d.id} ${d.path}${d.serial ? ` (${d.serial})` : ''}`).join(', ')}`);
    e.code = 'EAMBIGUOUS';
    throw e;
  }
  return list[0];
}
