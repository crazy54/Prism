// Per-user locations for the live control channel's discovery file (DESIGN.md §6.3).
// Never inside the .sdPlugin folder (DRM makes it immutable; other users could read it).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** control.json path: PRISM_DECK_CONTROL › %APPDATA%\Prism\deck › ~/Library/Application Support/Prism/deck › $XDG_STATE_HOME/prism/deck */
export function controlPath({ env = process.env, platform = process.platform, home = os.homedir() } = {}) {
  if (env.PRISM_DECK_CONTROL) return path.resolve(env.PRISM_DECK_CONTROL);
  if (platform === 'win32') return path.join(env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'Prism', 'deck', 'control.json');
  if (platform === 'darwin') return path.join(home, 'Library', 'Application Support', 'Prism', 'deck', 'control.json');
  return path.join(env.XDG_STATE_HOME || path.join(home, '.local', 'state'), 'prism', 'deck', 'control.json');
}

/** Write a JSON file readable only by this user (dir 0700, file 0600; atomic rename). */
export function writePrivateJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(obj, null, 2)}\n`, { mode: 0o600 });
  if (process.platform !== 'win32') fs.chmodSync(tmp, 0o600);
  fs.renameSync(tmp, file);
}

export function removeFile(file) { try { fs.unlinkSync(file); return true; } catch { return false; } }

/** Append one JSON line, rotating at maxBytes (keeps one .1 generation). */
export function appendJsonl(file, obj, maxBytes = 1024 * 1024) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    try { if (fs.statSync(file).size > maxBytes) fs.renameSync(file, `${file}.1`); } catch { /* new file */ }
    fs.appendFileSync(file, `${JSON.stringify(obj)}\n`, { mode: 0o600 });
  } catch { /* audit is best effort; never break a request on it */ }
}
