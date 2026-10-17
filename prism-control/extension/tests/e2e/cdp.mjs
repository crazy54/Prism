// Minimal Chrome DevTools Protocol client over --remote-debugging-pipe (fd 3 = to Chrome, fd 4 =
// from Chrome, NUL-separated JSON). Node built-ins only. Used by the browser tests and the icon tool.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

export const BROWSERS = {
  chrome: ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'],
  edge: ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'],
};

export function findBrowser(name) {
  for (const p of BROWSERS[name] || []) if (existsSync(p)) return p;
  return null;
}

export class Cdp {
  constructor(writable, readable) {
    this.w = writable;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Set();
    let buf = '';
    readable.setEncoding('utf8');
    readable.on('data', (chunk) => {
      buf += chunk;
      let i;
      while ((i = buf.indexOf('\0')) >= 0) {
        const raw = buf.slice(0, i);
        buf = buf.slice(i + 1);
        let msg;
        try { msg = JSON.parse(raw); } catch { continue; }
        if (msg.id && this.pending.has(msg.id)) {
          const p = this.pending.get(msg.id);
          this.pending.delete(msg.id);
          if (msg.error) p.reject(Object.assign(new Error(`${p.method}: ${msg.error.message}`), { cdp: msg.error }));
          else p.resolve(msg.result);
        } else if (msg.method) {
          for (const l of this.listeners) l(msg);
        }
      }
    });
  }

  send(method, params = {}, sessionId) {
    const id = this.nextId++;
    const msg = { id, method, params };
    if (sessionId) msg.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, method });
      this.w.write(JSON.stringify(msg) + '\0');
    });
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  waitFor(pred, ms = 10000, what = 'event') {
    return new Promise((resolve, reject) => {
      const off = this.on((m) => { if (pred(m)) { clearTimeout(t); off(); resolve(m); } });
      const t = setTimeout(() => { off(); reject(new Error(`timeout waiting for ${what}`)); }, ms);
    });
  }

  /** Attaches (flatten) to a target and returns a session helper. */
  async attach(targetId) {
    const { sessionId } = await this.send('Target.attachToTarget', { targetId, flatten: true });
    const self = this;
    return {
      sessionId,
      send: (method, params) => self.send(method, params, sessionId),
      async eval(expression, { awaitPromise = true, userGesture = false } = {}) {
        const r = await self.send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true, userGesture }, sessionId);
        if (r.exceptionDetails) {
          const d = r.exceptionDetails;
          throw new Error(`eval failed: ${(d.exception && (d.exception.description || d.exception.value)) || d.text}`);
        }
        return r.result.value;
      },
    };
  }
}

/**
 * Launches a browser with a throwaway profile under `profileRoot` (deleted by close()).
 * Never point profileRoot at a real profile.
 */
export async function launch({ browser = 'chrome', profileRoot, headless = true, args = [], label = 'run' }) {
  const exe = findBrowser(browser);
  if (!exe) throw new Error(`${browser} not found`);
  if (!profileRoot) throw new Error('profileRoot is required (a scratch folder)');
  const userDataDir = join(profileRoot, `profile-${browser}-${label}-${process.pid}-${Date.now()}`);
  mkdirSync(userDataDir, { recursive: true });
  const argv = [
    '--remote-debugging-pipe',
    '--enable-unsafe-extension-debugging',
    `--user-data-dir=${userDataDir}`,
    '--no-first-run', '--no-default-browser-check', '--disable-sync', '--disable-background-networking',
    '--disable-component-update', '--disable-default-apps', '--disable-features=Translate,MediaRouter,OptimizationHints,AutofillServerCommunication',
    '--metrics-recording-only', '--password-store=basic', '--autoplay-policy=no-user-gesture-required',
    '--disable-search-engine-choice-screen', '--deny-permission-prompts',
    ...(headless ? ['--headless=new', '--window-size=1280,800'] : ['--window-position=40,40', '--window-size=1100,760']),
    ...args,
    'about:blank',
  ];
  const proc = spawn(exe, argv, { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'], windowsHide: true });
  let stderr = '';
  proc.stderr.on('data', (d) => { stderr += d; if (stderr.length > 20000) stderr = stderr.slice(-20000); });
  const cdp = new Cdp(proc.stdio[3], proc.stdio[4]);
  const exited = new Promise((r) => proc.once('exit', r));
  const version = await Promise.race([
    cdp.send('Browser.getVersion'),
    new Promise((_, rej) => setTimeout(() => rej(new Error(`no CDP answer; stderr: ${stderr.slice(-800)}`)), 15000)),
  ]);
  async function close() {
    try { await Promise.race([cdp.send('Browser.close'), new Promise((r) => setTimeout(r, 3000))]); } catch { /* already gone */ }
    const done = await Promise.race([exited.then(() => true), new Promise((r) => setTimeout(() => r(false), 5000))]);
    if (!done) { try { proc.kill('SIGKILL'); } catch { /* ignore */ } await Promise.race([exited, new Promise((r) => setTimeout(r, 3000))]); }
    for (let i = 0; i < 10; i++) {
      try { rmSync(userDataDir, { recursive: true, force: true }); break; } catch { await new Promise((r) => setTimeout(r, 500)); }
    }
    return !existsSync(userDataDir);
  }
  return { cdp, proc, version, userDataDir, close, stderr: () => stderr, pid: proc.pid };
}

/** Opens a page target and attaches to it. */
export async function openPage(cdp, url) {
  const { targetId } = await cdp.send('Target.createTarget', { url });
  const s = await cdp.attach(targetId);
  await s.send('Runtime.enable');
  return { targetId, ...s };
}
