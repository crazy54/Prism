// A fake Stream Deck app for tests and local development (not shipped in the plugin).
// It is a real WebSocket server on 127.0.0.1 that speaks the plugin protocol: it
// waits for the plugin's registration, answers settings requests, and lets a test
// drive what the app would send (devices, willAppear, presses, dial turns, the
// property inspector) while recording every command the plugin sends.
//
//   const sd = await startFakeStreamDeck({ devices: OWNER_DEVICES });
//   // launch the plugin with sd.argv(), or connect in-process with sd.port
//   const ctx = sd.appear({ device: sd.devices[1].id, controller: 'Keypad', col: 0, row: 0, settings: { facet: 'icon-mic' } });
//   await sd.waitFor((m) => m.event === 'setImage' && m.context === ctx);
//   await sd.close();

import http from 'node:http';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { acceptWebSocket } from '../ws.js';

/** The owner's devices as the real app reported them (hardware-lab session 20261015-134720, ids replaced). */
export const OWNER_DEVICES = Object.freeze([
  { id: 'dev-plus-0001', name: 'Stream Deck +', size: { columns: 4, rows: 2 }, type: 7 },
  { id: 'dev-galleon-01', name: 'Galleon 100 SD', size: { columns: 3, rows: 4 }, type: 12 },
  { id: 'dev-mcpdeck-01', name: 'MCP Deck 2', size: { columns: 8, rows: 4 }, type: 14 },
]);

export function registrationInfo({ devices = OWNER_DEVICES, platform = 'windows', version = '7.6.0.23012', uuid = 'com.jeremyfhall.prism', pluginVersion = '0.3.0.0' } = {}) {
  return {
    application: { font: 'Segoe UI', language: 'en', platform, platformVersion: '10.0.26300', version },
    colors: { buttonMouseOverBackgroundColor: '#464646FF', buttonPressedBackgroundColor: '#303030FF', buttonPressedBorderColor: '#646464FF', buttonPressedTextColor: '#969696FF', highlightColor: '#0078FFFF' },
    devicePixelRatio: 2, devices: devices.map((d) => ({ ...d })), plugin: { uuid, version: pluginVersion },
  };
}

export async function startFakeStreamDeck({ devices = OWNER_DEVICES, uuid = 'com.jeremyfhall.prism', registrationTimeoutMs = 10000, globals = {}, info: infoOpts = {} } = {}) {
  const ee = new EventEmitter();
  const pluginUUID = crypto.randomBytes(16).toString('hex');
  const info = registrationInfo({ devices, uuid, ...infoOpts });
  const received = [];
  const contexts = new Map(); // context → { action, device, controller, col, row, settings }
  const state = { globals: { ...globals }, ws: null, registered: false, piContext: null };
  let resolveReg;
  const registered = new Promise((r) => { resolveReg = r; });

  const server = http.createServer((req, res) => { res.writeHead(426); res.end(); });
  server.on('upgrade', (req, socket, head) => {
    const ws = acceptWebSocket(req, socket, head);
    if (!ws) return;
    if (state.ws) { ws.close(1013, 'one plugin per fake'); return; }
    state.ws = ws;
    ws.on('message', (text) => {
      let m;
      try { m = JSON.parse(text); } catch { return; }
      if (!state.registered) {
        if (m.event === 'registerPlugin' && m.uuid === pluginUUID) { state.registered = true; resolveReg(); ee.emit('registered'); }
        return;
      }
      received.push(m);
      if (m.event === 'getGlobalSettings') send({ event: 'didReceiveGlobalSettings', payload: { settings: state.globals } });
      if (m.event === 'setGlobalSettings') state.globals = m.payload || {};
      if (m.event === 'setSettings' && contexts.has(m.context)) contexts.get(m.context).settings = m.payload;
      if (m.event === 'getSettings' && contexts.has(m.context)) { const c = contexts.get(m.context); send({ event: 'didReceiveSettings', action: c.action, context: m.context, device: c.device, payload: { settings: c.settings, coordinates: { column: c.col, row: c.row }, controller: c.controller, isInMultiAction: false } }); }
      ee.emit('message', m);
    });
    ws.on('close', () => { state.ws = null; ee.emit('plugin-closed'); });
    ws.on('error', () => {});
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;

  const send = (m) => { if (state.ws && state.ws.readyState === 1) state.ws.send(JSON.stringify(m)); };
  const action = (controller) => (controller === 'Neo' ? `${uuid}.infobar` : `${uuid}.facet`);
  const payloadOf = (c, extra = {}) => ({ controller: c.controller, coordinates: { column: c.col, row: c.row }, isInMultiAction: false, resources: {}, settings: c.settings, ...extra });

  const fake = {
    port, pluginUUID, info, received, contexts, devices: info.devices, registered,
    /** argv the app would pass to bin/plugin.js */
    argv: () => ['-port', String(port), '-pluginUUID', pluginUUID, '-registerEvent', 'registerPlugin', '-info', JSON.stringify(info)],
    send,
    on: (...a) => ee.on(...a),
    get globals() { return state.globals; },
    connectDevices() { for (const d of info.devices) send({ event: 'deviceDidConnect', device: d.id, deviceInfo: { name: d.name, size: d.size, type: d.type } }); },
    disconnect(device) { send({ event: 'deviceDidDisconnect', device }); },
    appear({ device, controller = 'Keypad', col = 0, row = 0, settings = {}, context = crypto.randomBytes(16).toString('hex') } = {}) {
      const c = { action: action(controller), device, controller, col, row, settings };
      contexts.set(context, c);
      send({ event: 'willAppear', action: c.action, context, device, payload: payloadOf(c) });
      return context;
    },
    disappear(context) { const c = contexts.get(context); if (!c) return; contexts.delete(context); send({ event: 'willDisappear', action: c.action, context, device: c.device, payload: payloadOf(c) }); },
    keyDown(context) { const c = contexts.get(context); send({ event: c.controller === 'Encoder' ? 'dialDown' : 'keyDown', action: c.action, context, device: c.device, payload: payloadOf(c) }); },
    keyUp(context) { const c = contexts.get(context); send({ event: c.controller === 'Encoder' ? 'dialUp' : 'keyUp', action: c.action, context, device: c.device, payload: payloadOf(c) }); },
    rotate(context, ticks, pressed = false) { const c = contexts.get(context); send({ event: 'dialRotate', action: c.action, context, device: c.device, payload: payloadOf(c, { ticks, pressed }) }); },
    touch(context, x = 100, hold = false) { const c = contexts.get(context); send({ event: 'touchTap', action: c.action, context, device: c.device, payload: payloadOf(c, { tapPos: [x, 50], hold }) }); },
    /** The PI changed this instance's settings (the app relays it as didReceiveSettings). */
    piSetSettings(context, settings) { const c = contexts.get(context); c.settings = settings; send({ event: 'didReceiveSettings', action: c.action, context, device: c.device, payload: payloadOf(c) }); },
    piSetGlobals(settings) { state.globals = settings; send({ event: 'didReceiveGlobalSettings', payload: { settings } }); },
    piAppear(context) { const c = contexts.get(context); state.piContext = context; send({ event: 'propertyInspectorDidAppear', action: c.action, context, device: c.device }); },
    piDisappear(context) { const c = contexts.get(context); state.piContext = null; send({ event: 'propertyInspectorDidDisappear', action: c.action, context, device: c.device }); },
    piSend(context, payload) { const c = contexts.get(context); send({ event: 'sendToPlugin', action: c.action, context, payload }); },
    wake() { send({ event: 'systemDidWakeUp' }); },
    /** Commands received so far matching a filter. */
    sent(filter = () => true) { return received.filter(filter); },
    clear() { received.length = 0; },
    /** Resolve with the first (future or past, since `from`) message matching pred. */
    waitFor(pred, { timeoutMs = 5000, from = 0 } = {}) {
      const past = received.slice(from).find(pred);
      if (past) return Promise.resolve(past);
      return new Promise((resolve, reject) => {
        const onMsg = (m) => { if (pred(m)) { clearTimeout(t); ee.off('message', onMsg); resolve(m); } };
        const t = setTimeout(() => { ee.off('message', onMsg); reject(new Error('waitFor timed out')); }, timeoutMs);
        ee.on('message', onMsg);
      });
    },
    /** Wait until the plugin has been quiet for `ms`. */
    async settle(ms = 150, maxMs = 5000) {
      const t0 = Date.now();
      let n = -1;
      while (Date.now() - t0 < maxMs) { if (received.length === n) return; n = received.length; await new Promise((r) => setTimeout(r, ms)); }
    },
    whenRegistered(timeoutMs = registrationTimeoutMs) { return Promise.race([registered, new Promise((_, rej) => setTimeout(() => rej(new Error('plugin did not register')), timeoutMs).unref?.())]); },
    async close() {
      try { state.ws?.close(1001, 'app quit'); } catch { /* gone */ }
      state.ws?.terminate?.();
      await new Promise((r) => { server.close(() => r()); server.closeAllConnections?.(); });
    },
  };
  return fake;
}
