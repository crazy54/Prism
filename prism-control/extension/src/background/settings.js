// User settings (storage.local, written by the options page) and the per-profile uid.
import { LIMITS, WHILE_STREAMING } from '../shared/protocol.js';
import { capStr, randomHex } from '../shared/util.js';
import { parseDomainList } from '../shared/domains.js';
import { isLevel } from './privacy.js';

export const DEFAULT_SETTINGS = Object.freeze({
  privacyBase: 'full',          // "Streamer-safe": full (off) | domain | hidden
  whileStreaming: 'domain',     // applied while the plugin reports OBS running: domain | hidden | full (= don't change)
  alwaysHidden: [],             // domains hidden even at full (banking, mail, health...)
  mediaAllow: [],               // media domains whose titles may show at "domain"
  profileLabel: '',             // shown on the deck ("Work", "Personal")
  raiseOnFocus: true,           // informational for the plugin; the deck decides
});

export function sanitizeSettings(s) {
  const o = { ...DEFAULT_SETTINGS, ...(s && typeof s === 'object' ? s : {}) };
  return {
    privacyBase: isLevel(o.privacyBase) ? o.privacyBase : 'full',
    whileStreaming: WHILE_STREAMING.includes(o.whileStreaming) ? o.whileStreaming : 'domain',
    alwaysHidden: parseDomainList(o.alwaysHidden),
    mediaAllow: parseDomainList(o.mediaAllow),
    profileLabel: capStr(String(o.profileLabel || '').replace(/[\u0000-\u001f]/g, '').trim(), LIMITS.profileLabel) || '',
    raiseOnFocus: o.raiseOnFocus !== false,
  };
}

export async function loadSettings(storage) {
  const got = await storage.local.get(['settings', 'profileUid']);
  let uid = got.profileUid;
  if (typeof uid !== 'string' || !/^[0-9a-f]{32}$/.test(uid)) {
    uid = randomHex(16);
    await storage.local.set({ profileUid: uid });
  }
  return { settings: sanitizeSettings(got.settings), profileUid: uid };
}
