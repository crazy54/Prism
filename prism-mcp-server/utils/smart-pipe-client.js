// Client for Prism Control's Smart Deck preferences channel (the "smart" named pipe, API v1; implemented in
// prism-control/src/PrismControl.Smart/Control/SmartControlChannel.cs on Desktop's PipeEndpoint).
//
// The pipe exists ONLY while the user has switched "Allow AI preferences" on in a Smart Key's property inspector. Then
// Prism Control listens on \\.\pipe\prism-control-smart-<128-bit hex> (current user only, remote clients refused) and
// writes a per-user discovery file with that name and a fresh 256-bit token:
//   %APPDATA%\Prism\control\modules\smart\ingress.json   ($PRISM_CONTROL_DIR moves the root; $PRISM_SMART_INGRESS the file)
// No file ⇒ the channel is off: we report "unreachable" and never try to switch anything on. Every call re-reads the
// file (name + token rotate on each plugin start). The token never leaves this module: not logged, echoed or returned.
//
// Wire format: u32 little-endian length + UTF-8 JSON. Hello { v: 1, token, client }, then { id, op, args } →
// { id, ok: true, result } | { id, ok: false, error: { code, message, data } }. One connection per call.

import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

export const SMART_API = 1;
export const MAX_FRAME = 1024 * 1024;
const PIPE_RX = /^prism-control-smart-[0-9a-f]{32}$/;
const TOKEN_RX = /^[0-9a-f]{64}$/;

export class SmartChannelError extends Error {
  constructor(message, { code = 'channel_error', data = null } = {}) {
    super(message);
    this.name = 'SmartChannelError';
    this.code = code;
    this.data = data;
  }
}

const OFF_HINT = 'The Smart Deck AI channel is off or Prism Control is not running. Only the user can turn it on: Stream Deck app → any Smart Key → property inspector → AI preferences → "Allow AI preferences". Do not try to enable it yourself.';

/** ingress.json: $PRISM_SMART_INGRESS › $PRISM_CONTROL_DIR/modules/smart › %APPDATA%\Prism\control\modules\smart (Prism Control's DesktopPaths). */
export function defaultIngressPath({ env = process.env, home = os.homedir() } = {}) {
  if (env.PRISM_SMART_INGRESS) return path.resolve(env.PRISM_SMART_INGRESS);
  const root = env.PRISM_CONTROL_DIR ? path.resolve(env.PRISM_CONTROL_DIR) : path.join(env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'Prism', 'control');
  return path.join(root, 'modules', 'smart', 'ingress.json');
}

/** Read + check the discovery file. Throws SmartChannelError('unreachable'). Never returns the raw file. */
export function readIngress(file) {
  let raw;
  try { raw = fs.readFileSync(file, 'utf8'); } catch (err) {
    throw new SmartChannelError(err.code === 'ENOENT' ? 'No Smart Deck discovery file: "Allow AI preferences" is off or Prism Control is not running.' : `Cannot read the Smart Deck discovery file (${err.code || err.message}).`, { code: 'unreachable', data: { hint: OFF_HINT } });
  }
  let d;
  try { d = JSON.parse(raw.replace(/^\uFEFF/, '')); } catch { throw new SmartChannelError('The Smart Deck discovery file is not valid JSON (Prism Control may be restarting).', { code: 'unreachable' }); }
  if (!d || d.v !== SMART_API || !PIPE_RX.test(String(d.pipe)) || !TOKEN_RX.test(String(d.token))) {
    throw new SmartChannelError(`The Smart Deck discovery file has an unsupported shape (expected API v${SMART_API}).`, { code: 'unreachable' });
  }
  return { pipe: d.pipe, token: d.token };
}

function frame(obj) {
  const body = Buffer.from(JSON.stringify(obj), 'utf8');
  const head = Buffer.alloc(4);
  head.writeUInt32LE(body.length, 0);
  return Buffer.concat([head, body]);
}

export class SmartPipeClient {
  /** @param {{ ingressPath?, timeoutMs?, env?, pipePrefix? }} opts  pipePrefix: tests only (default \\.\pipe\) */
  constructor({ ingressPath, timeoutMs = 5000, env = process.env, pipePrefix = '\\\\.\\pipe\\' } = {}) {
    this.ingressPath = ingressPath ? path.resolve(ingressPath) : defaultIngressPath({ env });
    this.timeoutMs = timeoutMs;
    this.pipePrefix = pipePrefix;
  }

  /** Is a discovery file present (cheap; no connection)? */
  present() { try { return fs.statSync(this.ingressPath).isFile(); } catch { return false; } }

  /** One operation: connect, hello, request, one answer, close. Resolves the result; rejects SmartChannelError with the channel's code. */
  call(op, args = {}, client = 'AI assistant (Prism MCP)') {
    const { pipe, token } = readIngress(this.ingressPath);
    return new Promise((resolve, reject) => {
      let done = false, buf = Buffer.alloc(0);
      const finish = (err, value) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        sock.destroy();
        if (err) reject(err); else resolve(value);
      };
      const sock = net.connect(this.pipePrefix + pipe);
      const timer = setTimeout(() => finish(new SmartChannelError('Prism Control did not answer in time.', { code: 'timeout' })), this.timeoutMs);
      sock.on('connect', () => {
        sock.write(frame({ v: SMART_API, token, client: String(client).replace(/[^\x20-\x7e]/g, '').slice(0, 64) }));
        sock.write(frame({ id: 1, op, args: args || {} }));
      });
      sock.on('data', (chunk) => {
        buf = Buffer.concat([buf, chunk]);
        while (buf.length >= 4) {
          const len = buf.readUInt32LE(0);
          if (len > MAX_FRAME) return finish(new SmartChannelError('The answer is too large.', { code: 'too_large' }));
          if (buf.length < 4 + len) return;
          let msg;
          try { msg = JSON.parse(buf.subarray(4, 4 + len).toString('utf8')); } catch { return finish(new SmartChannelError('Prism Control sent a broken frame.', { code: 'bad_frame' })); }
          buf = buf.subarray(4 + len);
          if (!msg || typeof msg !== 'object') continue;
          if (msg.ok === true && msg.id === 1) return finish(null, msg.result);
          if (msg.ok === false && (msg.id === 1 || msg.id == null)) {
            const e = msg.error || {};
            return finish(new SmartChannelError(String(e.message || 'refused').slice(0, 500), { code: String(e.code || 'refused'), data: e.data || null }));
          }
        }
      });
      sock.on('error', (err) => finish(new SmartChannelError(`Cannot reach Prism Control's Smart Deck pipe (${err.code || err.message}); the discovery file may be stale.`, { code: 'unreachable', data: { hint: OFF_HINT } })));
      sock.on('close', () => finish(new SmartChannelError('Prism Control closed the connection (it restarted, or the token was refused).', { code: 'unreachable', data: { hint: OFF_HINT } })));
    });
  }
}
