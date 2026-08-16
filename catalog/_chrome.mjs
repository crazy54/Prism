/* Cross-platform Chrome/Chromium binary resolver for the CDP tooling (no deps).
   ----------------------------------------------------------------------------
   Every headless-Chrome script in this folder (extract-from-prism, _find_broken,
   _shoot, _shell-shot, _scrollbar-shot) used to hardcode a single OS-specific
   Chrome path, which meant they only ran on whichever machine authored them.
   This module resolves a usable Chromium-family binary at runtime so the same
   pipeline runs on Windows, macOS, and Linux.

   Resolution order:
     1. $PRISM_CHROME — explicit override (any Chromium-family browser). Honored
        even if the file check fails, so users can point at an unusual install.
     2. First existing path from the per-OS candidate list below (Chrome, then
        Chromium, then Edge — all speak the same DevTools protocol).

   Throws a clear, actionable error if nothing is found (tells you to set
   PRISM_CHROME) rather than letting spawn() fail with a cryptic ENOENT. */
import { existsSync } from 'node:fs';
import { platform } from 'node:os';

// Windows install roots vary by 32/64-bit and per-user vs machine-wide installs.
const WIN_ROOTS = [
  process.env['PROGRAMFILES'] || 'C:/Program Files',
  process.env['PROGRAMFILES(X86)'] || 'C:/Program Files (x86)',
  process.env['LOCALAPPDATA'] || (process.env['USERPROFILE'] || 'C:/Users/Default') + '/AppData/Local',
].map(r => r.replace(/\\/g, '/'));

function candidates() {
  const os = platform();
  if (os === 'win32') {
    const out = [];
    for (const root of WIN_ROOTS) {
      out.push(
        root + '/Google/Chrome/Application/chrome.exe',
        root + '/Google/Chrome Beta/Application/chrome.exe',
        root + '/Chromium/Application/chrome.exe',
        root + '/Microsoft/Edge/Application/msedge.exe',
      );
    }
    return out;
  }
  if (os === 'darwin') {
    return [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Google Chrome Beta.app/Contents/MacOS/Google Chrome Beta',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    ];
  }
  // linux + everything else: rely on well-known absolute paths (PATH lookups are
  // spawn's job, but we want a concrete path so the error message is useful).
  return [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
    '/usr/bin/microsoft-edge',
  ];
}

/** Resolve a Chromium-family executable path, or throw with guidance. */
export function resolveChrome() {
  const override = process.env.PRISM_CHROME;
  if (override) return override; // trust the user's explicit choice, checked or not.
  const list = candidates();
  const found = list.find(p => existsSync(p));
  if (found) return found;
  throw new Error(
    'No Chrome/Chromium/Edge binary found. Set the PRISM_CHROME environment ' +
    'variable to your browser executable, e.g.\n' +
    (platform() === 'win32'
      ? '  set PRISM_CHROME="C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"'
      : '  export PRISM_CHROME="/path/to/chrome"') +
    '\nLocations checked:\n  ' + list.join('\n  '),
  );
}
