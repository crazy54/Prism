// Stream Deck plugin protocol over the raw WebSocket (no SDK).
//
// The app launches CodePath with `-port <p> -pluginUUID <id> -registerEvent <name>
// -info '<json>'`; the plugin connects to ws://127.0.0.1:<p> and sends
// { event: <registerEvent>, uuid: <pluginUUID> } (formats.md §1.8). Every inbound
// message is emitted by its event name (and as 'event'); outbound commands are
// small helpers. OpenDeck (Linux) runs the same plugin but reports platform
// "windows" and rejects a few commands, so the host is detected from
// process.platform + the app version it reports, and unsupported commands are
// skipped (linux.md §1.1).

import { EventEmitter } from 'node:events';
import { connectWebSocket } from './ws.js';

/** Parse the app's launch arguments. → { port, pluginUUID, registerEvent, info } (info parsed; {} when absent). */
export function parseLaunchArgs(argv = process.argv.slice(2)) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-port' || a === '--port') out.port = Number(argv[++i]);
    else if (a === '-pluginUUID' || a === '--pluginUUID') out.pluginUUID = argv[++i];
    else if (a === '-registerEvent' || a === '--registerEvent') out.registerEvent = argv[++i];
    else if (a === '-info' || a === '--info') out.infoRaw = argv[++i];
  }
  try { out.info = out.infoRaw ? JSON.parse(out.infoRaw) : {}; } catch { out.info = {}; }
  return out;
}

/** Which host runs us: 'elgato' (Stream Deck app on Windows/macOS) | 'opendeck' (Linux) | 'unknown'. */
export function detectHost(info = {}, platform = process.platform) {
  if (platform === 'linux') return 'opendeck';
  if (info?.application?.version && (platform === 'win32' || platform === 'darwin')) return 'elgato';
  return 'unknown';
}

/** Commands a host understands. OpenDeck fails to decode setTriggerDescription, switchToProfile and resources. */
export function hostFeatures(host) {
  const elgato = host !== 'opendeck';
  return { triggerDescription: elgato, switchToProfile: elgato, resources: elgato };
}

export class StreamDeckConnection extends EventEmitter {
  /**
   * opts: { port, pluginUUID, registerEvent, info, platform, connect (url → Promise<ws>), log }
   */
  constructor({ port, pluginUUID, registerEvent = 'registerPlugin', info = {}, platform = process.platform, connect = connectWebSocket, log = () => {} } = {}) {
    super();
    this.port = port;
    this.pluginUUID = pluginUUID;
    this.registerEvent = registerEvent;
    this.info = info || {};
    this.platform = platform;
    this.host = detectHost(this.info, platform);
    this.features = hostFeatures(this.host);
    this._connect = connect;
    this.log = log;
    this.ws = null;
    this.stats = { in: 0, out: 0, bytesOut: 0, unparsable: 0, skipped: 0 };
  }

  get open() { return !!this.ws && this.ws.readyState === 1; }
  /** Bytes waiting in the socket (backpressure signal for the frame budget). */
  get bufferedAmount() { return this.ws ? this.ws.bufferedAmount : 0; }

  async connect() {
    if (!Number.isInteger(this.port) || this.port <= 0) throw new Error('no -port given');
    this.ws = await this._connect(`ws://127.0.0.1:${this.port}`);
    this.ws.on('message', (data, binary) => { if (!binary) this._onMessage(data); });
    this.ws.on('close', (e) => this.emit('close', e));
    this.ws.on('error', (e) => this.emit('ws-error', e));
    this._raw({ event: this.registerEvent, uuid: this.pluginUUID });
    this.emit('open');
    return this;
  }

  _onMessage(text) {
    this.stats.in++;
    let msg;
    try { msg = JSON.parse(text); } catch { this.stats.unparsable++; return; }
    if (!msg || typeof msg.event !== 'string') return;
    this.emit('event', msg);
    this.emit(msg.event, msg);
  }

  _raw(obj) {
    if (!this.open) return false;
    const s = JSON.stringify(obj);
    this.stats.out++;
    this.stats.bytesOut += s.length;
    this.ws.send(s);
    return true;
  }

  /** Send one command: send('setImage', { context, payload }). Returns false when not connected. */
  send(event, fields = {}) { return this._raw({ event, ...fields }); }

  // ── commands (formats.md §1.7–1.8; SDK websocket reference) ──────────────────
  setImage(context, image, { target, state } = {}) {
    const payload = {};
    if (image !== undefined) payload.image = image;
    if (target !== undefined) payload.target = target;
    if (state !== undefined) payload.state = state;
    return this.send('setImage', { context, payload });
  }
  setTitle(context, title, { target, state } = {}) {
    const payload = {};
    if (title !== undefined) payload.title = title;
    if (target !== undefined) payload.target = target;
    if (state !== undefined) payload.state = state;
    return this.send('setTitle', { context, payload });
  }
  setState(context, state) { return this.send('setState', { context, payload: { state } }); }
  setFeedback(context, payload) { return this.send('setFeedback', { context, payload }); }
  setFeedbackLayout(context, layout) { return this.send('setFeedbackLayout', { context, payload: { layout } }); }
  setTriggerDescription(context, d = {}) {
    if (!this.features.triggerDescription) { this.stats.skipped++; return false; }
    return this.send('setTriggerDescription', { context, payload: d });
  }
  showOk(context) { return this.send('showOk', { context }); }
  showAlert(context) { return this.send('showAlert', { context }); }
  setSettings(context, settings) { return this.send('setSettings', { context, payload: settings }); }
  getSettings(context) { return this.send('getSettings', { context }); }
  setGlobalSettings(settings) { return this.send('setGlobalSettings', { context: this.pluginUUID, payload: settings }); }
  getGlobalSettings() { return this.send('getGlobalSettings', { context: this.pluginUUID }); }
  sendToPropertyInspector(context, action, payload) { return this.send('sendToPropertyInspector', { action, context, payload }); }
  openUrl(url) { return this.send('openUrl', { payload: { url } }); }
  logMessage(message) { return this.send('logMessage', { payload: { message: String(message).slice(0, 2000) } }); }
  switchToProfile(device, profile, page) {
    if (!this.features.switchToProfile) { this.stats.skipped++; return false; }
    const payload = {};
    if (profile !== undefined) payload.profile = profile;
    if (page !== undefined) payload.page = page;
    return this.send('switchToProfile', { context: this.pluginUUID, device, payload });
  }

  close() { try { this.ws?.close(1000, 'bye'); } catch { /* already closed */ } }
}
