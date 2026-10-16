// Client for the Prism Deck plugin's local control channel, API v1
// (aaa-prism-ds/elgato-mcp/DESIGN.md §6.3; implemented by prism-deck/src/plugin/control.js).
//
// The channel exists ONLY while the user has switched "Allow AI editing" on in the
// Prism Deck plugin: then the plugin listens on 127.0.0.1:<random port> and writes a
// per-user discovery file with that port and a fresh 256-bit token. No file ⇒ the
// channel is off (or the plugin isn't running): we report "unreachable" and never try
// to switch anything on. Every call re-reads the file (port + token rotate on each
// plugin start), connects to 127.0.0.1 only, sends the exact Host the plugin expects,
// never an Origin, and JSON bodies only. The token never leaves this module: it is
// not logged, echoed or returned.
//
// This module speaks to nothing else — in particular never to the Stream Deck app,
// its WebSocket ports, or Elgato's MCP named pipe.

import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const CONTROL_API = 1;
export const PLUGIN_ID = 'com.jeremyfhall.prism';
export const MAX_BODY = 2 * 1024 * 1024;

export class ChannelError extends Error {
  constructor(message, { code = 'channel_error', status = 0, data = null } = {}) {
    super(message);
    this.name = 'ChannelError';
    this.code = code;
    this.status = status;
    this.data = data;
  }
}

/** control.json: $PRISM_DECK_CONTROL › %APPDATA%\Prism\deck › ~/Library/Application Support/Prism/deck › $XDG_STATE_HOME/prism/deck (same rule as the plugin's paths.js). */
export function defaultControlPath({ env = process.env, platform = process.platform, home = os.homedir() } = {}) {
  if (env.PRISM_DECK_CONTROL) return path.resolve(env.PRISM_DECK_CONTROL);
  if (platform === 'win32') return path.join(env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'Prism', 'deck', 'control.json');
  if (platform === 'darwin') return path.join(home, 'Library', 'Application Support', 'Prism', 'deck', 'control.json');
  return path.join(env.XDG_STATE_HOME || path.join(home, '.local', 'state'), 'prism', 'deck', 'control.json');
}

const OFF_HINT = 'AI editing is off or the Prism Deck plugin is not running. Only the user can turn it on: Stream Deck app → any Prism Facet key → property inspector → Plugin settings → "Allow AI editing". Do not try to enable it yourself.';

/** Read + check the discovery file. Throws ChannelError('unreachable'). Never returns the raw file. */
export function readControl(controlPath) {
  let raw;
  try { raw = fs.readFileSync(controlPath, 'utf8'); } catch (err) {
    throw new ChannelError(err.code === 'ENOENT' ? 'No Prism Deck control file: AI editing is off or the plugin is not running.' : `Cannot read the Prism Deck control file (${err.code || err.message}).`, { code: 'unreachable', data: { controlPath, hint: OFF_HINT } });
  }
  let c;
  try { c = JSON.parse(raw); } catch { throw new ChannelError('The Prism Deck control file is not valid JSON (the plugin may be restarting).', { code: 'unreachable', data: { controlPath } }); }
  if (!c || c.v !== CONTROL_API || !Number.isInteger(c.port) || c.port < 1 || c.port > 65535 || !/^[0-9a-f]{64}$/.test(String(c.token))) {
    throw new ChannelError(`The Prism Deck control file has an unsupported shape (expected API v${CONTROL_API}).`, { code: 'unreachable', data: { controlPath } });
  }
  if (c.plugin != null && c.plugin !== PLUGIN_ID) throw new ChannelError(`The control file belongs to "${String(c.plugin).slice(0, 80)}", not ${PLUGIN_ID}.`, { code: 'unreachable', data: { controlPath } });
  return { port: c.port, token: c.token, version: typeof c.version === 'string' ? c.version : null, pid: Number.isInteger(c.pid) ? c.pid : null, startedAt: typeof c.startedAt === 'string' ? c.startedAt : null };
}

export class DeckControlClient {
  /** @param {{ controlPath?, timeoutMs?, env? }} opts */
  constructor({ controlPath, timeoutMs = 5000, env = process.env } = {}) {
    this.controlPath = controlPath ? path.resolve(controlPath) : defaultControlPath({ env });
    this.timeoutMs = timeoutMs;
  }

  /** Is a discovery file present (cheap; no network)? */
  present() { try { return fs.statSync(this.controlPath).isFile(); } catch { return false; } }

  /** → parsed JSON on 2xx (with `_status`), else throws ChannelError carrying the channel's { code, message, data }. */
  request(method, urlPath, body) {
    const { port, token } = readControl(this.controlPath);
    const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
    if (payload && payload.length > MAX_BODY) return Promise.reject(new ChannelError(`Request body is ${payload.length} bytes; the channel accepts at most ${MAX_BODY}`, { code: 'too_large' }));
    return new Promise((resolve, reject) => {
      const req = http.request({
        host: '127.0.0.1', port, method, path: urlPath, timeout: this.timeoutMs, setHost: false, agent: false,
        headers: {
          host: `127.0.0.1:${port}`,
          authorization: `Bearer ${token}`,
          accept: 'application/json',
          ...(payload ? { 'content-type': 'application/json', 'content-length': payload.length } : {}),
        },
      }, (res) => {
        const chunks = [];
        let size = 0;
        res.on('data', (c) => { size += c.length; if (size <= 8 * MAX_BODY) chunks.push(c); });
        res.on('end', () => {
          let json = null;
          try { json = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { /* not JSON */ }
          if (res.statusCode >= 200 && res.statusCode < 300 && json && typeof json === 'object') return resolve({ ...json, _status: res.statusCode });
          const e = (json && json.error) || {};
          const retry = Number(res.headers['retry-after']);
          const data = e.data || (res.statusCode === 429 && retry ? { retryAfterMs: retry * 1000 } : null);
          reject(new ChannelError(String(e.message || `HTTP ${res.statusCode}`).slice(0, 500), { code: e.code || `http_${res.statusCode}`, status: res.statusCode, data }));
        });
      });
      req.on('timeout', () => req.destroy(new ChannelError('The Prism Deck plugin did not answer in time.', { code: 'timeout' })));
      req.on('error', (err) => reject(err instanceof ChannelError ? err : new ChannelError(`Cannot reach the Prism Deck plugin (${err.code || err.message}); the control file may be stale.`, { code: 'unreachable', data: { controlPath: this.controlPath, hint: OFF_HINT } })));
      if (payload) req.write(payload);
      req.end();
    });
  }

  status() { return this.request('GET', '/v1/status'); }
  pair(body) { return this.request('POST', '/v1/pair', body || {}); }
  ops(deviceId, ops, dryRun) { return this.request('POST', '/v1/ops', { deviceId, ops, dryRun: !!dryRun }); }
  apply(deviceId, layout, page, dryRun) { return this.request('POST', '/v1/apply', { deviceId, layout, ...(page != null ? { page } : {}), dryRun: !!dryRun }); }
  undo(deviceId, steps) { return this.request('POST', '/v1/undo', { deviceId, steps }); }
  snapshot(deviceId, render) { return this.request('GET', `/v1/snapshot?deviceId=${encodeURIComponent(deviceId)}${render ? '&render=1' : ''}`); }
}
