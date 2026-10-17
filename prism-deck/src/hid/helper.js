// Client for linux/prism-deck-hidfeature.py — the stdlib python3 co-process that
// issues HID feature-report ioctls (brightness, show-logo, Galleon keep-alive).
// Node has no ioctl and no built-in FFI, so this is the smallest auditable bridge.
//
//   const fx = await startFeatureHelper('/dev/hidraw3');   // rejects (code ENOHELPER) without python3
//   await fx.set(features.brightness(model, 60));
//   await fx.keepAlive(500, [0x03, 0x27]);                 // Galleon: pings in the helper's own thread
//   fx.close();                                            // stdin closes → keep-alive stops, helper exits
//
// Every request is checked against the same allowlist the helper enforces (features.js).

import { spawn as nodeSpawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { HidError } from './claim.js';
import { checkFeature, ALLOWED_GET } from './features.js';

export const HELPER_PATH = fileURLToPath(new URL('../../linux/prism-deck-hidfeature.py', import.meta.url));
const hex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

/**
 * Spawn the helper for one hidraw node. opts: { python ('python3'), script, spawn (injectable), timeoutMs, onAsync(line) }.
 * → Promise<{ set(bytes), get(id, len), keepAlive(ms, bytes), close(), closed }>
 */
export function startFeatureHelper(devPath, { python = 'python3', script = HELPER_PATH, spawn = nodeSpawn, timeoutMs = 3000, onAsync = () => {} } = {}) {
  return new Promise((resolve, reject) => {
    let child;
    try { child = spawn(python, ['-I', '-u', script, devPath], { stdio: ['pipe', 'pipe', 'pipe'] }); } catch (e) {
      reject(new HidError('ENOHELPER', `cannot start ${python} (${e.code || e.message}) — brightness and the Galleon keep-alive need python3`, { cause: e }));
      return;
    }
    const waiting = new Map();
    let buf = '', ready = false, closed = false, seq = 0, stderr = '';
    const fail = (err) => {
      closed = true;
      if (!ready) reject(err);
      for (const w of waiting.values()) w.reject(err);
      waiting.clear();
    };
    const timer = setTimeout(() => { if (!ready) { fail(new HidError('ENOHELPER', `${python} feature helper did not start within ${timeoutMs} ms`)); try { child.kill(); } catch { /* gone */ } } }, timeoutMs);
    child.on('error', (e) => { clearTimeout(timer); fail(new HidError('ENOHELPER', `cannot start ${python} (${e.code || e.message}) — brightness and the Galleon keep-alive need python3`, { cause: e })); });
    child.on('exit', (code) => { clearTimeout(timer); if (!closed) fail(new HidError(ready ? 'ENODEV' : 'ENOHELPER', `feature helper exited (${code})${stderr ? `: ${stderr.trim().split('\n').pop()}` : ''}`)); closed = true; });
    child.stderr?.setEncoding?.('utf8');
    child.stderr?.on?.('data', (d) => { stderr = (stderr + d).slice(-2000); });
    child.stdout.setEncoding?.('utf8');
    child.stdout.on('data', (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (!line) continue;
        if (!ready) {
          if (line.startsWith('ready')) { ready = true; clearTimeout(timer); resolve(api); continue; }
          if (line.startsWith('fatal')) {
            const [, errno, ...why] = line.split(' ');
            const code = errno === '13' || errno === '1' ? 'EACCES' : errno === '2' || errno === '19' ? 'ENODEV' : 'ENOHELPER';
            clearTimeout(timer); fail(new HidError(code, `feature helper could not open ${devPath}: ${why.join(' ')} (errno ${errno})`));
            continue;
          }
        }
        if (line.startsWith('*')) { onAsync(line.slice(1).trim()); continue; }
        const [id, status, ...rest] = line.split(' ');
        const w = waiting.get(id);
        if (!w) continue;
        waiting.delete(id);
        if (status === 'ok') w.resolve(rest[0] ? Uint8Array.from(rest[0].match(/../g).map((h) => parseInt(h, 16))) : null);
        else w.reject(new HidError(rest[0] === '1' ? 'EREFUSED' : 'EIO', `feature report failed: ${rest.slice(1).join(' ') || 'error'} (errno ${rest[0]})`, { errno: Number(rest[0]) }));
      }
    });
    const req = (line) => new Promise((res, rej) => {
      if (closed) return rej(new HidError('ENODEV', 'feature helper is closed'));
      const id = String(++seq);
      waiting.set(id, { resolve: res, reject: rej });
      child.stdin.write(`${id} ${line}\n`);
    });
    const api = {
      get closed() { return closed; },
      set(bytes) {
        const why = checkFeature(bytes);
        return why ? Promise.reject(new HidError('EREFUSED', `refused feature report: ${why}`)) : req(`S ${hex(bytes)}`);
      },
      get(id, len = 32) {
        return ALLOWED_GET.includes(id) ? req(`G ${id.toString(16)} ${len}`) : Promise.reject(new HidError('EREFUSED', `refused feature GET 0x${id.toString(16)}`));
      },
      keepAlive(ms, bytes = [0x03, 0x27]) { return req(`K ${ms | 0} ${hex(bytes)}`); },
      close() {
        if (closed) return;
        closed = true;
        for (const w of waiting.values()) w.reject(new HidError('ENODEV', 'feature helper closed'));
        waiting.clear();
        try { child.stdin.end(); } catch { /* gone */ }
        const t = setTimeout(() => { try { child.kill(); } catch { /* gone */ } }, 1000);
        t.unref?.();
      },
    };
  });
}
