// Streamer-safe privacy, enforced at the source (browser.md §10).
//
// Every object that leaves the browser is built by one of the *View functions below from the raw
// store record and a privacy context. Raw records never go on the wire; tests prove that hidden
// titles, URLs and names never appear in anything posted to the port.

import { LEVELS, LIMITS } from '../shared/protocol.js';
import { capStr, intOrNull, finiteOrNull } from '../shared/util.js';
import { hostOf, registrableDomain, hostInList, extensionOf, basename, parseUrl, accessFor } from '../shared/domains.js';
import { parseUnread } from '../shared/titles.js';

export const levelIndex = (l) => Math.max(0, LEVELS.indexOf(l));
export const isLevel = (l) => LEVELS.includes(l);
export const stricter = (a, b) => (levelIndex(a) >= levelIndex(b) ? a : b);

/**
 * The effective level is the strictest of: the user's own setting in the extension (`base`), the level
 * the deck asked for (`deck`: welcome.privacy, privacy.set, panic) and, while the plugin reports a
 * streaming app (OBS) running, the user's "while streaming" level (`full` = "don't change").
 */
export function effectiveLevel({ base = 'full', deck = 'full', streaming = false, whileStreaming = 'domain' }) {
  let l = isLevel(base) ? base : 'full';
  if (isLevel(deck)) l = stricter(l, deck);
  if (streaming) l = stricter(l, isLevel(whileStreaming) ? whileStreaming : 'domain');
  return l;
}

/** Explains why the effective level is what it is (for the popup/options). */
export function levelReason(p) {
  const eff = effectiveLevel(p);
  if (eff === 'full') return 'off';
  if (p.streaming && levelIndex(p.whileStreaming) >= levelIndex(eff)) return 'streaming';
  if (levelIndex(p.deck) >= levelIndex(eff) && levelIndex(p.deck) > levelIndex(p.base)) return 'deck';
  return 'setting';
}

/**
 * Builds a privacy context. `level` is the effective level; `alwaysHidden` lists domains that are
 * hidden even at `full`; `mediaAllow` lists media domains whose titles may show at `domain`.
 */
export function makeContext({ level = 'full', alwaysHidden = [], mediaAllow = [], granted = [], psl = null, iconFor = null, tabsById = null } = {}) {
  return { level, alwaysHidden, mediaAllow, granted, psl, iconFor, tabsById };
}

function tabLevel(host, ctx) {
  if (host && hostInList(host, ctx.alwaysHidden)) return 'hidden';
  return ctx.level;
}

const INTERNAL = /^(chrome|edge|brave|opera|vivaldi|about|devtools|chrome-extension|chrome-untrusted|view-source):/;

/** Tab -> wire object. */
export function tabView(t, ctx) {
  const url = t.url || '';
  const u = parseUrl(url);
  const host = u && (u.protocol === 'http:' || u.protocol === 'https:') ? hostOf(u) : null;
  const alwaysHidden = !!host && hostInList(host, ctx.alwaysHidden);
  const level = alwaysHidden ? 'hidden' : ctx.level;
  const domain = host ? registrableDomain(host, ctx.psl) : null;
  const out = {
    id: t.id,
    win: t.win,
    idx: t.idx,
    active: !!t.active,
    pinned: !!t.pinned,
    audible: !!t.audible,
    muted: !!t.muted,
    title: null,
    url: null,
    domain: null,
    // The full host name, for Site Watch ("mail.example" under "example"), only where the URL may show too.
    host: null,
    // Unread counts are kept at every level (they say nothing about the page), except for always-hidden
    // sites: a number taken from "Lab results (127)" is part of what the user chose to hide.
    unread: alwaysHidden ? null : parseUnread(t.title, domain),
    status: t.status === 'loading' || t.status === 'unloaded' ? t.status : 'complete',
    discarded: !!t.discarded,
    frozen: !!t.frozen,
    group: Number.isInteger(t.group) ? t.group : -1,
    split: Number.isInteger(t.split) ? t.split : -1,
    lastAccessed: intOrNull(t.lastAccessed),
    access: accessFor(u || url, ctx.granted),
    icon: 'glyph:globe',
    hidden: null,
  };
  if (level === 'hidden') {
    out.icon = 'glyph:tab';
    out.hidden = 'all';
    return out;
  }
  out.domain = capStr(domain, LIMITS.domain);
  if (level === 'full') {
    out.title = capStr(t.title ?? null, LIMITS.title);
    out.url = url && url.length <= LIMITS.url ? url : capStr(url, LIMITS.url) || null;
    out.host = capStr(host, LIMITS.domain);
  } else {
    out.hidden = 'domain';
  }
  if (!host && INTERNAL.test(url)) out.icon = 'glyph:browser';
  else {
    const ref = ctx.iconFor ? ctx.iconFor(t) : null;
    if (ref) out.icon = ref;
  }
  return out;
}

/** Window -> wire object. Bounds and state are not private. */
export function windowView(w) {
  return {
    id: w.id,
    focused: !!w.focused,
    state: w.state || 'normal',
    type: w.type || 'normal',
    left: intOrNull(w.left),
    top: intOrNull(w.top),
    width: intOrNull(w.width),
    height: intOrNull(w.height),
  };
}

/** Group -> wire object. Group titles are user-chosen ("Taxes"), so they show at `full` only. */
export function groupView(g, ctx) {
  return {
    id: g.id,
    win: g.win,
    color: g.color || 'grey',
    collapsed: !!g.collapsed,
    title: ctx.level === 'full' ? capStr(g.title || '', LIMITS.groupTitle) : null,
    hidden: ctx.level === 'full' ? null : (ctx.level === 'hidden' ? 'all' : 'domain'),
  };
}

/** Media entry -> wire object. `tab` is the raw tab the media lives in (for its domain). */
export function mediaView(m, ctx, tab) {
  const host = tab && tab.url ? hostOf(tab.url) : null;
  let level = tabLevel(host, ctx);
  const domain = host ? registrableDomain(host, ctx.psl) : null;
  const allowed = level === 'full' || (level === 'domain' && host && hostInList(host, ctx.mediaAllow));
  const out = {
    key: m.key,
    tabId: m.tabId,
    frameId: m.frameId,
    kind: m.kind,
    state: m.state,
    title: null,
    artist: null,
    album: null,
    art: null,
    chapters: [],
    durationMs: intOrNull(m.durationMs),
    live: !!m.live,
    positionMs: intOrNull(m.positionMs),
    positionAt: intOrNull(m.positionAt),
    rate: finiteOrNull(m.rate) ?? 1,
    volume: finiteOrNull(m.volume),
    elementMuted: typeof m.elementMuted === 'boolean' ? m.elementMuted : null,
    pip: !!m.pip,
    actions: Array.isArray(m.actions) ? m.actions.slice(0, LIMITS.actions) : [],
    mic: typeof m.mic === 'boolean' ? m.mic : null,
    camera: typeof m.camera === 'boolean' ? m.camera : null,
    source: m.source,
    hidden: null,
  };
  if (allowed) {
    out.title = capStr(m.title ?? null, LIMITS.title);
    out.artist = capStr(m.artist ?? null, LIMITS.artist);
    out.album = capStr(m.album ?? null, LIMITS.album);
    out.art = m.art && (m.art.url || m.art.img) ? { url: m.art.url || null, img: m.art.img || null, type: m.art.type || null } : null;
    out.chapters = Array.isArray(m.chapters) ? m.chapters.slice(0, LIMITS.chapters) : [];
    if (level !== 'full') out.hidden = 'domain';
  } else {
    out.hidden = level === 'hidden' ? 'all' : 'domain';
  }
  // `domain` is a convenience for "Playing on video.example"; it is only present when the tab's
  // domain itself may be shown.
  if (level !== 'hidden') out.domain = capStr(domain, LIMITS.domain);
  else out.domain = null;
  return out;
}

/** Download -> wire object. The absolute path is never included (see download.path). */
export function downloadView(d, ctx) {
  const host = d.url ? hostOf(d.url) : null;
  const level = tabLevel(host, ctx);
  const name = basename(d.filename);
  let shown = null;
  if (level === 'full') shown = capStr(name, LIMITS.downloadName);
  else if (level === 'domain') shown = extensionOf(name);
  return {
    id: d.id,
    state: d.state,
    name: shown,
    bytes: intOrNull(d.bytes) ?? 0,
    total: intOrNull(d.total),
    etaAt: intOrNull(d.etaAt),
    paused: !!d.paused,
    canResume: !!d.canResume,
    danger: capStr(d.danger || 'safe', 32),
    error: capStr(d.error ?? null, 64),
    exists: d.exists !== false,
    icon: level === 'full' ? (d.iconRef || null) : null,
    hidden: level === 'full' ? null : (level === 'hidden' ? 'all' : 'domain'),
  };
}

/** A recently closed tab/window (session.recent) -> wire object. */
export function sessionItemView(s, ctx) {
  const tab = s.tab || null;
  const win = s.window || null;
  const url = tab ? tab.url : null;
  const host = url ? hostOf(url) : null;
  const level = tabLevel(host, ctx);
  const out = {
    sessionId: (tab && tab.sessionId) || (win && win.sessionId) || null,
    kind: tab ? 'tab' : 'window',
    lastModified: intOrNull(s.lastModified),
    tabCount: win && Array.isArray(win.tabs) ? win.tabs.length : null,
    title: null,
    url: null,
    domain: null,
  };
  if (tab && level !== 'hidden') {
    out.domain = host ? registrableDomain(host, ctx.psl) : null;
    if (level === 'full') { out.title = capStr(tab.title ?? null, LIMITS.title); out.url = capStr(url, LIMITS.url); }
  }
  return out;
}

/** Origins in a permission event or caps, reduced to what the level allows. */
export function originsView(origins, ctx) {
  if (ctx.level === 'hidden') return [];
  const list = [];
  for (const o of origins) {
    if (o === '<all_urls>' || o.startsWith('*://*') || o.startsWith('https://*/') || o.startsWith('http://*/')) { list.push(o); continue; }
    const host = hostOf(o.replace('*.', '').replace(/\/\*$/, '/'));
    if (!host || hostInList(host, ctx.alwaysHidden)) continue;
    list.push(ctx.level === 'full' ? o : registrableDomain(host, ctx.psl));
  }
  return [...new Set(list)];
}
