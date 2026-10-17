// Command dispatch (PROTOCOL.md §6). Every command is validated, rate limited and answered with
// exactly one `result`. Handlers throw CmdError(code, message) for expected failures.

import { ERR, LIMITS, SPEED_LADDER, SPEED_MIN, SPEED_MAX, ZOOM_LADDER, ZOOM_MIN, ZOOM_MAX, GROUP_COLORS, MEDIA_ACTIONS, PIP_KEYS, PIP_DEFAULT_KEY } from '../shared/protocol.js';
import { clamp, capStr, isFiniteNum, delay } from '../shared/util.js';
import { parseUrl, hostOf, hostInList } from '../shared/domains.js';
import { sessionItemView, isLevel } from './privacy.js';
import { MediaHub } from './media.js';

export class CmdError extends Error {
  constructor(code, message) { super(message || code); this.code = code; }
}

// ---- argument validation ----
const A = {
  int(v, name, { min = -(2 ** 31), max = 2 ** 31 - 1, optional = false } = {}) {
    if (v === undefined || v === null) { if (optional) return undefined; throw new CmdError(ERR.BAD_ARGS, `${name} is required`); }
    if (!Number.isInteger(v) || v < min || v > max) throw new CmdError(ERR.BAD_ARGS, `${name} must be an integer`);
    return v;
  },
  num(v, name, { min = -Infinity, max = Infinity, optional = false } = {}) {
    if (v === undefined || v === null) { if (optional) return undefined; throw new CmdError(ERR.BAD_ARGS, `${name} is required`); }
    if (!isFiniteNum(v)) throw new CmdError(ERR.BAD_ARGS, `${name} must be a finite number`);
    return clamp(v, min, max);
  },
  bool(v, name, { optional = true } = {}) {
    if (v === undefined || v === null) { if (optional) return undefined; throw new CmdError(ERR.BAD_ARGS, `${name} is required`); }
    if (typeof v !== 'boolean') throw new CmdError(ERR.BAD_ARGS, `${name} must be a boolean`);
    return v;
  },
  oneOf(v, name, list, { optional = false } = {}) {
    if (v === undefined || v === null) { if (optional) return undefined; throw new CmdError(ERR.BAD_ARGS, `${name} is required`); }
    if (!list.includes(v)) throw new CmdError(ERR.BAD_ARGS, `${name} must be one of ${list.join(', ')}`);
    return v;
  },
  ids(v, name, { min = 1, max = 64 } = {}) {
    if (!Array.isArray(v) || v.length < min || v.length > max || !v.every(Number.isInteger)) throw new CmdError(ERR.BAD_ARGS, `${name} must be an array of tab ids`);
    return v;
  },
  str(v, name, { max = 256, optional = true } = {}) {
    if (v === undefined || v === null) { if (optional) return undefined; throw new CmdError(ERR.BAD_ARGS, `${name} is required`); }
    if (typeof v !== 'string' || v.length > max) throw new CmdError(ERR.BAD_ARGS, `${name} must be a string <= ${max}`);
    return v;
  },
};

/** Maps a Chrome API error to a protocol error code. */
export function mapChromeError(e) {
  if (e instanceof CmdError) return e;
  const msg = String(e && e.message || e || 'error');
  const m = msg.toLowerCase();
  let code = ERR.BUSY;
  if (/no (tab|window|group|download)|invalid (tab|window|download)|not found|no such|unknown/.test(m)) code = ERR.NOT_FOUND;
  else if (/cannot access|host permission|cannot be scripted|extensions gallery|chrome:\/\/ url/.test(m)) code = ERR.NO_HOST_PERMISSION;
  else if (/user gesture/.test(m)) code = ERR.GESTURE_REQUIRED;
  else if (/permission|is not allowed|requires/.test(m)) code = ERR.NO_PERMISSION;
  else if (/must be|invalid|expected|out of range|cannot be (negative|greater)/.test(m)) code = ERR.BAD_ARGS;
  else if (/dragging|cannot be edited right now|busy/.test(m)) code = ERR.BUSY;
  return new CmdError(code, capStr(msg, 200));
}

const WINDOW_STATES = ['normal', 'minimized', 'maximized', 'fullscreen'];
/** The least time a page gets to answer, even late in a command's budget. */
const MIN_PAGE_MS = 200;
const PIP_MODES = ['toggle', 'enter', 'exit'];
const PIP_VIA = ['gesture', 'auto'];

/** Nearest ladder index for a value. */
function ladderIndex(ladder, v) {
  let best = 0;
  for (let i = 1; i < ladder.length; i++) if (Math.abs(ladder[i] - v) < Math.abs(ladder[best] - v)) best = i;
  return best;
}

export function stepLadder(ladder, current, steps) {
  const i = ladderIndex(ladder, current);
  return ladder[clamp(i + steps, 0, ladder.length - 1)];
}

/**
 * @param {object} ctx  the app context: chrome, store, grants, media, images, publisher, privacy,
 *                      preview, clock, waitForFocus(windowId, ms), prevActive(windowId), log
 */
export function createHandlers(ctx) {
  const { chrome, store } = ctx;

  const tabOr404 = async (tabId) => {
    A.int(tabId, 'tabId', { min: 0 });
    try { return await chrome.tabs.get(tabId); } catch { throw new CmdError(ERR.NOT_FOUND, `no tab ${tabId}`); }
  };
  const needApi = (ns, perm) => {
    if (!chrome[ns]) throw new CmdError(ERR.NO_PERMISSION, `grant "${perm}" in the extension options`);
    return chrome[ns];
  };
  const bounds = (w) => ({ left: w.left ?? null, top: w.top ?? null, width: w.width ?? null, height: w.height ?? null });

  async function focusWindow(windowId) {
    const wait = ctx.waitForFocus(windowId, LIMITS.focusWaitMs);
    await chrome.windows.update(windowId, { focused: true });
    await wait;
    return chrome.windows.get(windowId);
  }

  /**
   * Media and page command: routes to the frame's content script. If access exists but no port is open (a page
   * without media, or a script that is not there yet), the script is asked to open one, injected if needed. The
   * whole command, waiting included, stays within LIMITS.cmdBudgetMs so the plugin (2 s) always gets an answer.
   * A frame whose host access was removed is dropped and refused.
   */
  async function media(args, op, payload) {
    const deadline = ctx.clock.now() + LIMITS.cmdBudgetMs;
    const k = MediaHub.parseKey(args.key);
    if (!k) throw new CmdError(ERR.BAD_ARGS, 'key must be "tabId:frameId[:n]"');
    const tab = await tabOr404(k.tabId);
    if (ctx.media.dropIfRevoked(k.tabId, k.frameId)) throw new CmdError(ERR.NO_HOST_PERMISSION, 'site not granted; use perm.hostRequest');
    if (!ctx.media.hasPort(k.tabId, k.frameId)) {
      const access = ctx.grants.access(tab.url || '');
      if (access === 'blocked') throw new CmdError(ERR.UNSUPPORTED, 'scripts cannot run on this page');
      if (access !== 'granted') throw new CmdError(ERR.NO_HOST_PERMISSION, 'site not granted; use perm.hostRequest');
      if (tab.discarded) throw new CmdError(ERR.NOT_FOUND, 'tab is discarded');
      await ctx.ensurePort(k.tabId, k.frameId, deadline - MIN_PAGE_MS);
      if (!ctx.media.hasPort(k.tabId, k.frameId)) throw new CmdError(ERR.NOT_FOUND, op === 'scroll' ? 'the page script did not start' : 'no media in that frame');
    }
    const left = Math.max(MIN_PAGE_MS, deadline - ctx.clock.now());
    const r = await ctx.media.send(k.tabId, k.frameId, op, payload, k.sub, left);
    if (!r.ok) throw new CmdError(r.error.code in ERR_CODES ? r.error.code : ERR.BUSY, r.error.message);
    return { r, tab, k };
  }

  const ERR_CODES = Object.fromEntries(Object.values(ERR).map((c) => [c, true]));

  return {
    // ---- tabs and windows ----
    async 'tab.focus'(a) {
      const tab = await tabOr404(a.tabId);
      await chrome.tabs.update(tab.id, { active: true });
      let w;
      if (a.raise === false) w = await chrome.windows.get(tab.windowId);
      else w = await focusWindow(tab.windowId);
      return { tabId: tab.id, windowId: w.id, bounds: bounds(w), state: w.state, focused: !!w.focused };
    },
    async 'tab.close'(a) {
      const tab = await tabOr404(a.tabId);
      await chrome.tabs.remove(tab.id);
      return { closed: true, undo: 'session.restore' };
    },
    async 'tab.create'(a) {
      const url = A.str(a.url, 'url', { max: LIMITS.url });
      if (url !== undefined) {
        const u = parseUrl(url);
        if (!u || (u.protocol !== 'https:' && u.protocol !== 'http:')) throw new CmdError(ERR.BAD_ARGS, 'url must be http(s)');
      }
      const windowId = A.int(a.windowId, 'windowId', { optional: true, min: 0 });
      const index = A.int(a.index, 'index', { optional: true, min: 0, max: 10000 });
      const splitWith = A.int(a.splitWith, 'splitWith', { optional: true, min: 0 });
      const props = { active: true };
      if (url) props.url = url;
      if (windowId !== undefined) props.windowId = windowId;
      // Undo of a closed tab puts it back where it was (Chrome clamps an index past the end).
      if (index !== undefined) props.index = index;
      if (splitWith !== undefined) {
        const other = await tabOr404(splitWith);
        props.windowId = other.windowId;
        props.index = other.index + 1;
      }
      const t = await chrome.tabs.create(props);
      let splitViewId;
      if (splitWith !== undefined) splitViewId = (await this['split.create']({ tabIds: [splitWith, t.id] })).splitViewId;
      return { tabId: t.id, windowId: t.windowId, ...(splitViewId !== undefined ? { splitViewId } : {}) };
    },
    async 'tab.reload'(a) {
      const tab = await tabOr404(a.tabId);
      await chrome.tabs.reload(tab.id, { bypassCache: A.bool(a.bypassCache, 'bypassCache') === true });
      return {};
    },
    async 'tab.back'(a) { const tab = await tabOr404(a.tabId); await chrome.tabs.goBack(tab.id); return {}; },
    async 'tab.forward'(a) { const tab = await tabOr404(a.tabId); await chrome.tabs.goForward(tab.id); return {}; },
    async 'tab.mute'(a) {
      const tab = await tabOr404(a.tabId);
      let muted = A.bool(a.muted, 'muted');
      if (muted === undefined) muted = !(tab.mutedInfo && tab.mutedInfo.muted);
      const t = await chrome.tabs.update(tab.id, { muted });
      return { muted: !!(t && t.mutedInfo ? t.mutedInfo.muted : muted) };
    },
    async 'tab.pin'(a) {
      const tab = await tabOr404(a.tabId);
      let pinned = A.bool(a.pinned, 'pinned');
      if (pinned === undefined) pinned = !tab.pinned;
      await chrome.tabs.update(tab.id, { pinned });
      return { pinned };
    },
    async 'tab.move'(a) {
      const tab = await tabOr404(a.tabId);
      const index = A.int(a.index, 'index', { min: -1, max: 10000 });
      const windowId = A.int(a.windowId, 'windowId', { optional: true, min: 0 });
      const props = { index };
      if (windowId !== undefined) props.windowId = windowId;
      const moved = await chrome.tabs.move(tab.id, props);
      const m = Array.isArray(moved) ? moved[0] : moved;
      return { index: m ? m.index : index, windowId: m ? m.windowId : (windowId ?? tab.windowId) };
    },
    async 'tab.discardable'(a) {
      const tab = await tabOr404(a.tabId);
      const autoDiscardable = A.bool(a.autoDiscardable, 'autoDiscardable', { optional: false });
      await chrome.tabs.update(tab.id, { autoDiscardable });
      return { autoDiscardable };
    },
    async 'window.focus'(a) {
      const windowId = A.int(a.windowId, 'windowId', { min: 0 });
      try { await chrome.windows.get(windowId); } catch { throw new CmdError(ERR.NOT_FOUND, `no window ${windowId}`); }
      const w = await focusWindow(windowId);
      return { windowId: w.id, bounds: bounds(w), state: w.state, focused: !!w.focused };
    },
    async 'window.state'(a) {
      const windowId = A.int(a.windowId, 'windowId', { min: 0 });
      const state = A.oneOf(a.state, 'state', WINDOW_STATES);
      try { await chrome.windows.get(windowId); } catch { throw new CmdError(ERR.NOT_FOUND, `no window ${windowId}`); }
      const w = await chrome.windows.update(windowId, { state });
      return { windowId, state: w ? w.state : state };
    },

    // ---- sessions ----
    async 'session.restore'(a) {
      const s = needApi('sessions', 'Reopen closed tabs');
      const sessionId = A.str(a.sessionId, 'sessionId', { max: 64 });
      const r = await s.restore(sessionId);
      if (!r) throw new CmdError(ERR.NOT_FOUND, 'nothing to restore');
      return r.tab ? { kind: 'tab', tabId: r.tab.id, windowId: r.tab.windowId } : { kind: 'window', windowId: r.window ? r.window.id : null };
    },
    async 'session.recent'(a) {
      const s = needApi('sessions', 'Reopen closed tabs');
      const max = A.int(a.max, 'max', { optional: true, min: 1, max: LIMITS.sessionRecentMax }) ?? 10;
      const list = await s.getRecentlyClosed({ maxResults: max });
      const pctx = ctx.privacyContext();
      return { items: list.slice(0, max).map((x) => sessionItemView(x, pctx)) };
    },

    // ---- groups and split view ----
    async 'group.update'(a) {
      const g = needApi('tabGroups', 'Tab groups');
      const groupId = A.int(a.groupId, 'groupId', { min: 0 });
      const props = {};
      const collapsed = A.bool(a.collapsed, 'collapsed');
      if (collapsed !== undefined) props.collapsed = collapsed;
      const title = A.str(a.title, 'title', { max: LIMITS.groupTitle });
      if (title !== undefined) props.title = title;
      if (a.color !== undefined) props.color = A.oneOf(a.color, 'color', GROUP_COLORS);
      if (a.toggle === true) {
        const cur = await g.get(groupId).catch(() => null);
        if (!cur) throw new CmdError(ERR.NOT_FOUND, `no group ${groupId}`);
        props.collapsed = !cur.collapsed;
      }
      if (Object.keys(props).length === 0) throw new CmdError(ERR.BAD_ARGS, 'nothing to update');
      const r = await g.update(groupId, props);
      return { groupId, collapsed: !!(r && r.collapsed), color: r ? r.color : props.color };
    },
    async 'tab.group'(a) {
      const tabIds = A.ids(a.tabIds, 'tabIds');
      const groupId = A.int(a.groupId, 'groupId', { optional: true, min: 0 });
      const opts = { tabIds };
      if (groupId !== undefined) opts.groupId = groupId;
      const id = await chrome.tabs.group(opts);
      return { groupId: id };
    },
    async 'tab.ungroup'(a) {
      await chrome.tabs.ungroup(A.ids(a.tabIds, 'tabIds'));
      return {};
    },
    async 'split.create'(a) {
      const [ida, idb] = A.ids(a.tabIds, 'tabIds', { min: 2, max: 2 });
      const create = chrome.tabs.createSplit || chrome.tabs.split;
      if (typeof create !== 'function') throw new CmdError(ERR.UNSUPPORTED, 'split view is not available in this browser');
      const ta = await tabOr404(ida);
      const tb = await tabOr404(idb);
      if (ta.windowId !== tb.windowId || ta.pinned !== tb.pinned || ta.groupId !== tb.groupId) {
        throw new CmdError(ERR.BAD_ARGS, 'tabs must share window, pinned state and group');
      }
      if (Math.abs(ta.index - tb.index) !== 1) await chrome.tabs.move(tb.id, { index: ta.index < tb.index ? ta.index + 1 : ta.index });
      const r = await create.call(chrome.tabs, [ida, idb]);
      const splitViewId = typeof r === 'number' ? r : (r && (r.splitViewId ?? r.id));
      return { splitViewId: Number.isInteger(splitViewId) ? splitViewId : null };
    },
    async 'split.remove'(a) {
      const splitViewId = A.int(a.splitViewId, 'splitViewId', { min: 0 });
      const un = chrome.tabs.unsplit || chrome.tabs.removeSplit;
      if (typeof un !== 'function') throw new CmdError(ERR.UNSUPPORTED, 'split view is not available in this browser');
      await un.call(chrome.tabs, splitViewId);
      return {};
    },

    // ---- page ----
    async 'page.scroll'(a) {
      const tabId = A.int(a.tabId, 'tabId', { optional: true, min: 0 }) ?? (store.activeTab() || {}).id;
      if (tabId === undefined) throw new CmdError(ERR.NOT_FOUND, 'no active tab');
      const dy = A.num(a.dy, 'dy', { min: -20000, max: 20000 });
      const dx = A.num(a.dx, 'dx', { optional: true, min: -20000, max: 20000 }) ?? 0;
      const smooth = A.bool(a.smooth, 'smooth') !== false;
      const { r } = await media({ key: `${tabId}:0` }, 'scroll', { dy, dx, smooth });
      return r.data;
    },
    async 'page.zoom'(a) {
      const tab = await tabOr404(a.tabId);
      let factor;
      if (a.reset === true) factor = 0;
      else if (a.factor !== undefined) factor = A.num(a.factor, 'factor', { min: ZOOM_MIN, max: ZOOM_MAX });
      else if (a.step !== undefined) {
        const step = A.int(a.step, 'step', { min: -16, max: 16 });
        factor = stepLadder(ZOOM_LADDER, await chrome.tabs.getZoom(tab.id), step);
      } else throw new CmdError(ERR.BAD_ARGS, 'one of factor, step or reset is required');
      await chrome.tabs.setZoom(tab.id, factor);
      return { factor: await chrome.tabs.getZoom(tab.id) };
    },

    // ---- media ----
    async 'media.toggle'(a) { return (await media(a, 'toggle', {})).r.data; },
    async 'media.play'(a) { return (await media(a, 'play', {})).r.data; },
    async 'media.pause'(a) { return (await media(a, 'pause', {})).r.data; },
    async 'media.seek'(a) {
      const positionMs = A.num(a.positionMs, 'positionMs', { optional: true, min: 0, max: 1e10 });
      const deltaMs = A.num(a.deltaMs, 'deltaMs', { optional: true, min: -1e9, max: 1e9 });
      if (positionMs === undefined && deltaMs === undefined) throw new CmdError(ERR.BAD_ARGS, 'positionMs or deltaMs is required');
      return (await media(a, 'seek', { positionMs, deltaMs })).r.data;
    },
    async 'media.rate'(a) {
      let rate = A.num(a.rate, 'rate', { optional: true });
      const step = A.int(a.step, 'step', { optional: true, min: -10, max: 10 });
      if (rate === undefined && step === undefined) throw new CmdError(ERR.BAD_ARGS, 'rate or step is required');
      if (rate !== undefined) rate = clamp(rate, SPEED_MIN, SPEED_MAX);
      return (await media(a, 'rate', { rate, step, ladder: SPEED_LADDER })).r.data;
    },
    async 'media.volume'(a) {
      const volume = A.num(a.volume, 'volume', { optional: true, min: 0, max: 1 });
      const delta = A.num(a.delta, 'delta', { optional: true, min: -1, max: 1 });
      if (volume === undefined && delta === undefined) throw new CmdError(ERR.BAD_ARGS, 'volume or delta is required');
      return (await media(a, 'volume', { volume, delta })).r.data;
    },
    async 'media.mute'(a) {
      const muted = A.bool(a.muted, 'muted');
      return (await media(a, 'mute', { muted })).r.data;
    },
    async 'media.action'(a) {
      const action = A.oneOf(a.action, 'action', MEDIA_ACTIONS);
      return (await media(a, 'action', { action })).r.data;
    },
    async 'media.pip'(a) {
      const mode = A.oneOf(a.mode ?? 'toggle', 'mode', PIP_MODES);
      const via = A.oneOf(a.via, 'via', PIP_VIA, { optional: true });
      // The keyboard key the plugin will press for the gesture (it picks one no other app registered as a
      // hotkey). `key` is the media key; the keyboard key is `pipKey`. Anything but F13-F24 is bad_args.
      const pipKey = A.oneOf(a.pipKey ?? PIP_DEFAULT_KEY, 'pipKey', PIP_KEYS);
      const { r, tab } = await media(a, 'pip', via === 'gesture' ? { mode, via, pipKey } : { mode, via });
      if (via === 'auto' && r.data && r.data.auto) {
        // Auto-PiP fires when the user (here: we) switches away from the playing tab.
        if (!tab.active) { await chrome.tabs.update(tab.id, { active: true }); await delay(ctx.clock, 250); }
        const other = ctx.prevActive(tab.windowId, tab.id);
        if (other === undefined) throw new CmdError(ERR.UNSUPPORTED, 'no other tab to switch to in that window');
        await chrome.tabs.update(other, { active: true });
        return { ...r.data, switchedTo: other };
      }
      return r.data;
    },

    // ---- downloads ----
    async 'download.show'(a) {
      const d = needApi('downloads', 'Downloads');
      const id = A.int(a.id, 'id', { min: 0 });
      d.show(id);
      return {};
    },
    async 'download.pause'(a) { await needApi('downloads', 'Downloads').pause(A.int(a.id, 'id', { min: 0 })); return {}; },
    async 'download.resume'(a) { await needApi('downloads', 'Downloads').resume(A.int(a.id, 'id', { min: 0 })); return {}; },
    async 'download.cancel'(a) { await needApi('downloads', 'Downloads').cancel(A.int(a.id, 'id', { min: 0 })); return {}; },
    async 'download.path'(a) {
      const d = needApi('downloads', 'Downloads');
      const id = A.int(a.id, 'id', { min: 0 });
      const pctx = ctx.privacyContext();
      if (pctx.level !== 'full') throw new CmdError(ERR.PRIVACY_BLOCKED, 'paths are only available while streamer-safe is off');
      const [item] = await d.search({ id });
      if (!item) throw new CmdError(ERR.NOT_FOUND, `no download ${id}`);
      const host = hostOf(item.finalUrl || item.url || '');
      if (host && hostInList(host, pctx.alwaysHidden)) throw new CmdError(ERR.PRIVACY_BLOCKED, 'download from an always-hidden site');
      return { id, path: item.filename || null, state: item.state, exists: item.exists !== false, danger: item.danger || 'safe', mime: item.mime || null };
    },

    // ---- permissions ----
    async 'perm.hostRequest'(a) {
      const tab = await tabOr404(a.tabId);
      const r = await ctx.grants.requestHostAccess({ id: tab.id, url: tab.url, win: tab.windowId, idx: tab.index });
      return r;
    },
    async 'perm.openOptions'(a) {
      const section = A.oneOf(a.section ?? 'general', 'section', ['general', 'grant', 'sites', 'features', 'privacy', 'profile']);
      await chrome.tabs.create({ url: chrome.runtime.getURL(`options.html#${section}`), active: true });
      return {};
    },

    // ---- preview, privacy, panic, images ----
    async 'preview.subscribe'(a) {
      const windowId = A.int(a.windowId, 'windowId', { optional: true, min: 0 });
      const fps = A.num(a.fps ?? 1, 'fps', { min: 0, max: LIMITS.previewMaxFps });
      const w = A.int(a.w ?? 200, 'w', { min: 16, max: LIMITS.previewMaxW });
      const h = A.int(a.h ?? 100, 'h', { min: 16, max: LIMITS.previewMaxH });
      return ctx.preview.subscribe({ windowId, fps, w, h });
    },
    async 'privacy.set'(a) {
      const level = a.level;
      if (!isLevel(level)) throw new CmdError(ERR.BAD_ARGS, 'level must be full, domain or hidden');
      return ctx.setDeckPrivacy(level);
    },
    async panic() {
      // 1. Blank the deck first: force hidden and resend at once.
      const p = ctx.setDeckPrivacy('hidden');
      ctx.preview.stop();
      // 2. Mute every tab that makes or may make sound; 3. minimize every browser window.
      const tabs = await chrome.tabs.query({});
      const toMute = tabs.filter((t) => !(t.mutedInfo && t.mutedInfo.muted) && (t.audible || ctx.store.mediaForTab(t.id).some((m) => m.state === 'playing')));
      const wins = await chrome.windows.getAll({});
      const toMin = wins.filter((w) => w.state !== 'minimized' && (w.type === 'normal' || w.type === 'popup' || w.type === 'app'));
      const results = await Promise.allSettled([
        ...toMute.map((t) => chrome.tabs.update(t.id, { muted: true })),
        ...toMin.map((w) => chrome.windows.update(w.id, { state: 'minimized' })),
      ]);
      const failed = results.filter((x) => x.status === 'rejected').length;
      return { privacy: p.level, muted: toMute.length, minimized: toMin.length, failed };
    },
    async 'img.get'(a) {
      if (!Array.isArray(a.ids) || a.ids.length > 32 || !a.ids.every((x) => typeof x === 'string' && x.length <= 80)) {
        throw new CmdError(ERR.BAD_ARGS, 'ids must be an array of image ids');
      }
      let sent = 0;
      const missing = [];
      for (const id of a.ids) {
        if (!ctx.isReferenced(id)) { missing.push(id); continue; }
        if (ctx.publisher.sendImage(id, true)) sent++; else missing.push(id);
      }
      return { sent, missing };
    },
  };
}

/** Dispatcher: envelope checks, rate limits, handler call, result shape. */
export class Dispatcher {
  constructor({ handlers, limiter, log = () => {} }) {
    this.handlers = handlers;
    this.limiter = limiter;
    this.log = log;
  }

  /** Returns the result envelope fields {id, ok, data?|error?}, or null when the command has no valid id. */
  async dispatch(msg) {
    const id = msg && msg.id;
    if (!Number.isInteger(id) || id < 1) return null;
    const op = msg.op;
    if (typeof op !== 'string' || op.length > 32) return { id, ok: false, error: { code: ERR.BAD_ARGS, message: 'op missing' } };
    const h = Object.prototype.hasOwnProperty.call(this.handlers, op) ? this.handlers[op] : null;
    if (!h) return { id, ok: false, error: { code: ERR.UNSUPPORTED, message: `unknown op ${capStr(op, 32)}` } };
    if (!this.limiter.allow(op)) return { id, ok: false, error: { code: ERR.RATE_LIMITED, message: 'too many commands' } };
    const args = msg.args && typeof msg.args === 'object' && !Array.isArray(msg.args) ? msg.args : {};
    try {
      const data = await h.call(this.handlers, args);
      return { id, ok: true, data: data && typeof data === 'object' ? data : {} };
    } catch (e) {
      const err = mapChromeError(e);
      this.log('command failed', op, err.code);
      return { id, ok: false, error: { code: err.code, message: err.message } };
    }
  }
}
