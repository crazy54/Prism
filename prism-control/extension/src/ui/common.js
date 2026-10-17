// Shared by the popup and the options page.
export const HELP = {
  connected: 'Your Stream Deck can see and control this browser.',
  connecting: 'Looking for Prism Control...',
  plugin_down: 'Start the Stream Deck app; Prism Control reconnects on its own.',
  host_error: 'Start the Stream Deck app; Prism Control reconnects on its own.',
  host_missing: 'In Stream Deck, open a Browser key\'s settings and press "Connect browsers".',
  host_forbidden: 'The host is installed but does not list this extension id. Press "Connect browsers" again.',
  proto_mismatch: 'Update Prism Control and this extension to matching versions.',
  idle: 'Starting...',
};

export const LEVEL_LABEL = { full: 'Off', domain: 'Domain only', hidden: 'Hidden' };
export const REASON_LABEL = { off: '', setting: 'your setting', deck: 'set from the deck', streaming: 'streaming app running' };

export async function getStatus() {
  try { return await chrome.runtime.sendMessage({ t: 'ui.status' }); } catch { return null; }
}

export async function retry() {
  try { return await chrome.runtime.sendMessage({ t: 'ui.retry' }); } catch { return null; }
}

export function $(id) { return document.getElementById(id); }

export function originPattern(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return `${u.protocol}//${u.hostname}/*`;
  } catch { return null; }
}

export function hostOfPattern(p) {
  const m = /^[a-z*]+:\/\/([^/]+)\//.exec(p);
  return m ? m[1] : p;
}

export const BROAD = new Set(['https://*/*', 'http://*/*', '<all_urls>', '*://*/*']);
