// Coexistence: hidraw has NO exclusive open — if OpenDeck, StreamController,
// Companion and Prism Deck all open one deck, they all write and the keys
// flicker. So before opening we refuse (code EBUSY) when the deck is claimed:
//
//   1. another process holds the node open — /proc/<pid>/fd/* → /dev/hidrawN
//      (visible for our own user's processes incl. Flatpak apps; root's are not)
//   2. another Prism Deck process holds our lock file for this deck (any user)
//   3. a known deck app is running (OpenDeck, StreamController, Companion,
//      streamdeck-linux-gui, Boatswain, galleon-deck) — it may own the deck even
//      when we can't see its fds; `force` overrides this heuristic only, never 1 or 2.
//
// Everything takes { proc, fs, pid } so tests run against a fake /proc.

import nodeFs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export class HidError extends Error {
  constructor(code, message, extra = {}) { super(message); this.name = 'HidError'; this.code = code; Object.assign(this, extra); }
}

/** Process names / command lines of apps that drive decks themselves. */
export const DECK_APPS = Object.freeze([
  { name: 'OpenDeck', re: /(^|[/\s])opendeck(\s|$)/i },
  { name: 'StreamController', re: /streamcontroller/i },
  { name: 'Bitfocus Companion', re: /(^|[/\s])companion(-satellite|-headless)?(\s|$)|bitfocus/i },
  { name: 'streamdeck-linux-gui', re: /streamdeck[-_]linux[-_]gui|(^|[/\s])streamdeck(\s|$)|streamdeck_ui/i },
  { name: 'Boatswain', re: /boatswain/i },
  { name: 'galleon-deck', re: /galleon-deck/i },
]);

const pids = (fs, proc) => { try { return fs.readdirSync(proc).filter((d) => /^\d+$/.test(d)).map(Number); } catch { return []; } };
const comm = (fs, proc, pid) => { try { return fs.readFileSync(`${proc}/${pid}/comm`, 'utf8').trim(); } catch { return ''; } };
const cmdline = (fs, proc, pid) => { try { return fs.readFileSync(`${proc}/${pid}/cmdline`, 'utf8').split('\0').filter(Boolean).join(' '); } catch { return ''; } };

/** Processes (other than `pid`) with `devPath` open → [{ pid, comm }]. Unreadable /proc entries are skipped. */
export function findHolders(devPath, { proc = '/proc', fs = nodeFs, pid = process.pid } = {}) {
  const out = [];
  for (const p of pids(fs, proc)) {
    if (p === pid) continue;
    let fds;
    try { fds = fs.readdirSync(`${proc}/${p}/fd`); } catch { continue; } // other users' processes: EACCES
    for (const fd of fds) {
      let target;
      try { target = fs.readlinkSync(`${proc}/${p}/fd/${fd}`); } catch { continue; }
      if (target === devPath) { out.push({ pid: p, comm: comm(fs, proc, p) }); break; }
    }
  }
  return out;
}

/** Running deck apps → [{ pid, app, comm }]. */
export function findDeckApps({ proc = '/proc', fs = nodeFs, pid = process.pid } = {}) {
  const out = [];
  for (const p of pids(fs, proc)) {
    if (p === pid) continue;
    const c = comm(fs, proc, p), line = cmdline(fs, proc, p);
    if (/prism-deck/.test(line)) continue;
    const hay = `${c} ${line}`;
    const app = DECK_APPS.find((a) => a.re.test(c) || a.re.test(line));
    if (app) out.push({ pid: p, app: app.name, comm: c || hay.slice(0, 40) });
  }
  return out;
}

const alive = (pid) => {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } // EPERM: alive, another user's
};

/**
 * Take the per-deck lock file (O_EXCL) → release(). A lock left by a dead process is reclaimed.
 * key: the deck's serial (stable across replug) or its node name.
 */
export function acquireLock(key, { dir = os.tmpdir(), fs = nodeFs, pid = process.pid, isAlive = alive } = {}) {
  const file = path.join(dir, `prism-deck-${String(key).replace(/[^A-Za-z0-9._-]/g, '_')}.lock`);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = fs.openSync(file, 'wx', 0o644);
      fs.writeSync(fd, `${pid}\n`);
      fs.closeSync(fd);
      let released = false;
      return { file, release() { if (released) return; released = true; try { if (fs.readFileSync(file, 'utf8').trim() === String(pid)) fs.unlinkSync(file); } catch { /* gone */ } } };
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      let owner = NaN;
      try { owner = Number(fs.readFileSync(file, 'utf8').trim()); } catch { /* raced */ }
      if (Number.isInteger(owner) && owner > 0 && owner !== pid && isAlive(owner)) {
        throw new HidError('EBUSY', `deck ${key} is in use by another Prism Deck process (pid ${owner}, lock ${file})`, { holders: [{ pid: owner, comm: 'prism-deck' }] });
      }
      if (owner === pid) throw new HidError('EBUSY', `deck ${key} is already open in this process`, { holders: [{ pid, comm: 'prism-deck' }] });
      try { fs.unlinkSync(file); } catch (u) { if (u.code !== 'ENOENT') throw new HidError('EBUSY', `stale lock ${file} cannot be removed (${u.code}) — delete it by hand`); }
    }
  }
  throw new HidError('EBUSY', `could not take the lock for deck ${key}`);
}

/**
 * Refuse to open a claimed deck. Throws HidError('EBUSY') with { holders | apps }. `fs` reads /proc, `lockFs` the lock dir.
 * Returns the lock (call .release() on close).
 */
export function claimDeck(info, { force = false, proc = '/proc', fs = nodeFs, lockFs = nodeFs, lockDir, pid = process.pid, isAlive } = {}) {
  const holders = findHolders(info.path, { proc, fs, pid });
  if (holders.length) {
    throw new HidError('EBUSY', `${info.path} (${info.model?.name || info.id}) is already open by ${holders.map((h) => `${h.comm || 'pid'} [${h.pid}]`).join(', ')} — quit that app first; Prism Deck never shares a deck`, { holders });
  }
  if (!force) {
    const apps = findDeckApps({ proc, fs, pid });
    if (apps.length) {
      throw new HidError('EBUSY', `${apps.map((a) => `${a.app} (pid ${a.pid})`).join(', ')} is running and may own ${info.path} — quit it, or pass --force if it does not drive this deck`, { apps });
    }
  }
  return acquireLock(info.serial || info.node || path.basename(info.path), { dir: lockDir, fs: lockFs, pid, isAlive });
}
