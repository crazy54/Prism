import { __m as __bm } from '../../facets.bundle.js';
// Game Link in the plugin (prism-play): turns the global `gamelink` settings into the listener's state, runs the
// property inspector's "Game Link" subsection, and pushes every data change into the runtime at once.
//
//   new GameLinkController({ runtime, gameLink: hub.gameLink, log })
//
//   globals.gamelink { enabled, port } → gameLink.configure()   (enabled: listening on 127.0.0.1; off: no socket at all)
//   gameLink 'change' (keys, { urgent }) → runtime.dataChanged() (a flashbang lands within one frame, even under Still)
//   PI { cmd: 'gamelink', action: 'status' | 'listen' | 'connect-cs2' | 'disconnect-cs2' | 'connect-dota2' | 'disconnect-dota2' | 'port', on, port }:
//     listen          the "Listen for game data" toggle = globals.gamelink.enabled (default off). Independent of CS2:
//                     companions (Prism Control's Prism Sight) post to /v1/companion with CS2 absent
//     connect-cs2     finds CS2 (read-only); only if it's really installed: listening on, then our cfg written into
//                     <cs2>/game/csgo/cfg/ — the user's click is the consent. "CS2 not found" otherwise (a leftover
//                     folder is not an install); that never blocks the listen toggle. CS2 reads the cfg at launch.
//     disconnect-cs2  removes exactly our cfg (never another vendor's) and rotates the CS2 token; listening is left
//                     as it is (the toggle owns it)
//     port            a fixed port (null = 38140 with fallbacks); the cfg then reads "out of date" until Connect again
//     connect-dota2   (MOBAs, lead/CONTRACT-moba.md) the same for Dota 2: found read-only first, then listening on and our
//                     cfg written into <dota>/game/dota/cfg/gamestate_integration/ (the folder made if Dota hasn't). Dota 2
//                     reads it only at launch AND only with the -gamestateintegration launch option (Valve, 11 March 2022
//                     update): the PI says so (dota2.launchOption) until a Dota post arrives (dota2.seen). We never touch
//                     Steam's own files: the user adds the option in Steam
//     disconnect-dota2  removes exactly our Dota cfg and rotates the Dota token
//   runtime.gameLinkStatus() → the PI's state.gameLink (no tokens, ever)

export const GAMELINK_DEFAULT_PORT = 38140;
/** The Steam launch option Dota 2 needs for Game State Integration (Valve's 11 March 2022 update). */
export const DOTA2_LAUNCH_OPTION = '-gamestateintegration';

export class GameLinkController {
  constructor({ runtime, gameLink = null, log = () => {} } = {}) {
    this.runtime = runtime;
    this.gl = gameLink;
    this.log = log;
    this.busy = null;     // 'connect' | 'disconnect' while a click is being handled
    this.last = null;     // the last click's outcome, for the PI
    this.busyDota = null; // the same for Dota 2 (its own row in the PI)
    this.lastDota = null;
    this.offs = [];
    runtime.gameLinkStatus = () => this.piStatus();
    runtime.gameLinkController = this;
    const onGlobals = (g) => this.apply(g);
    const onPi = (p) => { this.onPi(p).catch((e) => this.log('error', `game link: ${e.message}`)); };
    runtime.on('globals', onGlobals);
    runtime.on('pi-gamelink', onPi);
    this.offs.push(() => runtime.off('globals', onGlobals), () => runtime.off('pi-gamelink', onPi));
    if (this.gl) {
      this.offs.push(this.gl.on('change', (keys, o) => { try { runtime.dataChanged(keys, o); } catch (e) { this.log('error', `game link push: ${e.message}`); } }));
      this.offs.push(this.gl.on('status', () => runtime.sendPiState?.()));   // e.g. the cfg turned "out of date" after a port change
      this.apply(runtime.globals);
    }
  }

  /** The gamelink globals → the listener (idempotent; configure() serializes). */
  apply(g) {
    if (!this.gl) return Promise.resolve(null);
    const want = g?.gamelink || {};
    return this.gl.configure({ enabled: want.enabled === true, port: want.port ?? null }).then((s) => { this.runtime.sendPiState?.(); return s; }, (e) => { this.log('warn', `game link: ${e.message}`); return null; });
  }

  setGameLinkGlobals(patch) {
    const cur = this.runtime.globals.gamelink || { enabled: false, port: null };
    const next = { ...cur, ...patch };
    if (next.enabled !== cur.enabled || next.port !== cur.port) this.runtime.setGlobals({ gamelink: next });
  }

  async onPi(p = {}) {
    if (this.gl) {
      if (p.action === 'listen') await this.listen(p.on === true);
      else if (p.action === 'connect-cs2') await this.connect();
      else if (p.action === 'disconnect-cs2') await this.disconnect();
      else if (p.action === 'port') this.setPort(p.port);
      else if (p.action === 'connect-dota2') await this.connectDota();
      else if (p.action === 'disconnect-dota2') await this.disconnectDota();
      else { await this.gl.cs2Status(false); await this.gl.dota2Status?.(false); }   // 'status': refresh the read-only checks (at most every 5 s)
    }
    this.runtime.sendPiState?.();
  }

  /** The listen toggle: binds (or closes) the listener whether or not CS2 is installed. */
  async listen(on) {
    this.last = null;
    this.setGameLinkGlobals({ enabled: !!on });
    const g = this.runtime.globals.gamelink || {};
    await this.gl.configure({ enabled: !!on, port: g.port ?? null });
    if (on && !this.gl.status().listening) this.last = { action: 'listen', ok: false, reason: 'no-port' };
    return this.gl.status();
  }

  async connect() {
    if (this.busy) return this.last;
    this.busy = 'connect';
    this.runtime.sendPiState?.();
    try {
      const found = await this.gl.cs2Status(true);
      if (!found.found) { this.last = { action: 'connect', ok: false, reason: found.reason || 'not-installed', leftover: !!found.leftover }; return this.last; }
      const g = this.runtime.globals.gamelink || {};
      await this.gl.configure({ enabled: true, port: g.port ?? null });
      this.setGameLinkGlobals({ enabled: true });
      const st = this.gl.status();
      if (!st.listening) { this.last = { action: 'connect', ok: false, reason: 'no-port', error: st.error || null }; return this.last; }
      const r = await this.gl.connectCs2();
      this.last = { action: 'connect', ...r };
      return this.last;
    } finally { this.busy = null; }
  }

  async disconnect() {
    if (this.busy) return this.last;
    this.busy = 'disconnect';
    this.runtime.sendPiState?.();
    try {
      const r = await this.gl.disconnectCs2();   // listening stays as the toggle says (companions may use it)
      this.last = { action: 'disconnect', ...r };
      return this.last;
    } finally { this.busy = null; }
  }

  /** Connect Dota 2 (the user's click): found first (read-only), then listening on, then our cfg. */
  async connectDota() {
    if (this.busyDota || !this.gl.connectDota2) return this.lastDota;
    this.busyDota = 'connect';
    this.runtime.sendPiState?.();
    try {
      const found = await this.gl.dota2Status(true);
      if (!found.found) { this.lastDota = { action: 'connect', ok: false, reason: found.reason || 'not-installed', leftover: !!found.leftover }; return this.lastDota; }
      const g = this.runtime.globals.gamelink || {};
      await this.gl.configure({ enabled: true, port: g.port ?? null });
      this.setGameLinkGlobals({ enabled: true });
      const st = this.gl.status();
      if (!st.listening) { this.lastDota = { action: 'connect', ok: false, reason: 'no-port', error: st.error || null }; return this.lastDota; }
      this.lastDota = { action: 'connect', ...(await this.gl.connectDota2()) };
      return this.lastDota;
    } finally { this.busyDota = null; }
  }

  async disconnectDota() {
    if (this.busyDota || !this.gl.disconnectDota2) return this.lastDota;
    this.busyDota = 'disconnect';
    this.runtime.sendPiState?.();
    try {
      this.lastDota = { action: 'disconnect', ...(await this.gl.disconnectDota2()) };   // listening stays as the toggle says
      return this.lastDota;
    } finally { this.busyDota = null; }
  }

  setPort(port) {
    const n = Number(port);
    const p = port === null || port === '' || port === undefined ? null : Number.isInteger(n) && n >= 1024 && n <= 65535 ? n : undefined;
    if (p === undefined) { this.last = { action: 'port', ok: false, reason: 'bad-port' }; return; }
    this.last = null;
    this.setGameLinkGlobals({ port: p });
  }

  /** The PI's state.gameLink: never a token. */
  piStatus() {
    if (!this.gl) return { available: false };
    const s = this.gl.status();
    const g = this.runtime.globals.gamelink || {};
    const L = this.last;
    return {
      available: true, enabled: g.enabled === true, listening: s.listening, port: s.port, wantPort: g.port ?? null, defaultPort: GAMELINK_DEFAULT_PORT, error: s.error || null,
      state: s.live ? 'live' : s.listening ? 'waiting' : 'off',
      game: s.game, lastAgoMs: s.lastAgoMs,
      cs2: s.cs2 ? { found: s.cs2.found, reason: s.cs2.reason, leftover: s.cs2.leftover, path: s.cs2.path, cfg: s.cs2.cfg } : null,
      outOfDate: s.cs2?.cfg === 'outdated',
      busy: this.busy,
      last: L ? { action: L.action, ok: !!L.ok, reason: L.reason || null, restartNeeded: !!L.restartNeeded, removed: !!L.removed, leftover: !!L.leftover, path: L.path || null } : null,
      refused: Object.values(s.refused || {}).reduce((a, b) => a + b, 0),
      ...this.dotaStatus(s),
    };
  }

  /** The PI's Dota 2 row (MOBAs): found / cfg state, the launch option to add until Dota has posted, the last click. */
  dotaStatus(s) {
    const d = s.dota2, L = this.lastDota;
    return {
      dota2: d ? { found: d.found, reason: d.reason, leftover: d.leftover, path: d.path, cfg: d.cfg, seen: !!d.seen } : null,
      dota2OutOfDate: d?.cfg === 'outdated',
      // Dota 2 needs this Steam launch option before it posts anything (the user adds it; we never edit Steam's files)
      dota2LaunchOption: DOTA2_LAUNCH_OPTION,
      dota2Busy: this.busyDota,
      dota2Last: L ? { action: L.action, ok: !!L.ok, reason: L.reason || null, restartNeeded: !!L.restartNeeded, removed: !!L.removed, leftover: !!L.leftover, path: L.path || null } : null,
    };
  }

  stop() { for (const off of this.offs.splice(0)) { try { off(); } catch { /* best effort */ } } }
}

// ── League of Legends (prism-play, LoL engineer) ────────────────────────────────────────────────────────────────
// A separate block (the rest of this file belongs to the Game Link / Dota 2 wiring): the LoL toggle and its status.
//
//   new LolLinkController({ runtime, gameLink: hub.gameLink, log })   // after GameLinkController (either order works)
//
//   globals.gamelink.lol (default off) → gameLink.attachPoller({ game: 'lol', start: poller.start, urgent }); off → detach().
//     The hub runs the poller only while it listens, so turning LoL on also turns "Listen for game data" on (like
//     Connect CS2); turning it off leaves listening alone.
//   PI { cmd: 'gamelink', action: 'lol', on: true | false }   (the base controller answers it as a 'status' refresh too)
//   runtime.gameLinkStatus() → { …the base status, lol: { available, enabled, state, reason, lastAgoMs } }
//     state: 'off' | 'probing' (no game yet) | 'loading' | 'live' | 'watching' | 'untrusted' (a certificate Riot's
//     root didn't sign, or expired: reason says which). Never a name, a Riot id or a payload.
import { createLolPoller } from '../apps/sources/gamelink-lol-client.js';
import { LOL_URGENT } from '../apps/sources/gamelink-lol.js';

export class LolLinkController {
  constructor({ runtime, gameLink = null, log = () => {}, poller = null } = {}) {
    this.runtime = runtime;
    this.gl = gameLink && typeof gameLink.attachPoller === 'function' ? gameLink : null;
    this.log = log;
    this.poller = this.gl ? poller || createLolPoller() : null;
    this.detach = null;
    this.offs = [];
    runtime.lolLinkController = this;
    // wrap whatever status the base controller installs, before or after us (it assigns runtime.gameLinkStatus)
    let base = runtime.gameLinkStatus;
    Object.defineProperty(runtime, 'gameLinkStatus', {
      configurable: true, enumerable: true,
      get: () => () => ({ ...(base ? base() : { available: false }), lol: this.piStatus() }),
      set: (fn) => { base = fn; },
    });
    const onGlobals = (g) => this.apply(g);
    const onPi = (p) => { if (p?.action === 'lol') this.toggle(p.on === true); };
    runtime.on('globals', onGlobals);
    runtime.on('pi-gamelink', onPi);
    this.offs.push(() => runtime.off('globals', onGlobals), () => runtime.off('pi-gamelink', onPi));
    this.apply(runtime.globals);
  }

  /** globals.gamelink.lol → attached or not (idempotent). */
  apply(g) {
    if (!this.gl) return;
    const on = g?.gamelink?.lol === true;
    try {
      if (on && !this.detach) this.detach = this.gl.attachPoller({ game: 'lol', start: this.poller.start, urgent: LOL_URGENT });
      else if (!on && this.detach) { const d = this.detach; this.detach = null; d(); }
    } catch (e) { this.log('warn', `game link (lol): ${String(e?.message || e).slice(0, 120)}`); }
  }

  /** The PI's toggle: LoL on also turns listening on (the poller only runs while the hub listens). */
  toggle(on) {
    const cur = this.runtime.globals?.gamelink || { enabled: false, port: null };
    const next = { ...cur, lol: !!on, ...(on ? { enabled: true } : {}) };
    if (next.lol !== cur.lol || next.enabled !== cur.enabled) this.runtime.setGlobals({ gamelink: next });
    else this.apply(this.runtime.globals);
    this.runtime.sendPiState?.();
  }

  /** state.gameLink.lol for the PI: no names, no payloads. */
  piStatus() {
    if (!this.gl) return { available: false };
    const s = this.poller.status();
    const enabled = this.runtime.globals?.gamelink?.lol === true;
    return { available: true, enabled, state: enabled && s.running ? s.phase : 'off', reason: enabled ? s.reason : null, lastAgoMs: s.lastOkAt === null ? null : Math.max(0, Date.now() - s.lastOkAt) };
  }

  stop() {
    for (const off of this.offs.splice(0)) { try { off(); } catch { /* best effort */ } }
    if (this.detach) { const d = this.detach; this.detach = null; try { d(); } catch { /* best effort */ } }
  }
}

// ── Rocket League (prism-play, Rocket League engineer) ──────────────────────────────────────────────────────────
// A separate block (the rest of this file belongs to the Game Link / Dota 2 and LoL wiring): the Rocket League
// toggle, the Stats API ini switch and their status.
//
//   new RlLinkController({ runtime, gameLink: hub.gameLink, log })   // after GameLinkController (any order works)
//
//   globals.gamelink.rl (default off) → gameLink.attachPoller({ game: 'rl', start: client.start, urgent: RL_URGENT });
//     off → detach(). The hub runs the client only while it listens, so turning RL on also turns "Listen for game
//     data" on (like Connect CS2); turning it off leaves listening alone.
//   PI { cmd: 'gamelink', action: 'rl', on }       the toggle
//      { action: 'rl-connect' }                     on the user's click: find Rocket League (Steam / Epic, read-only),
//                                                   back the Stats API ini up into Prism's folder, then set
//                                                   PacketSendRate 30, Port 49123, WebPort 49124 (our keys only).
//                                                   The game reads it at launch: restartNeeded tells the PI to say so
//      { action: 'rl-disconnect' }                  put back exactly what our keys held (a key the user changed since
//                                                   is theirs); the toggle is left as it is
//      { action: 'status' }                         refresh the read-only install check (at most every 5 s)
//   runtime.gameLinkStatus() → { …, rl: { available, enabled, state, transport, install, busy, last } }
//     state: 'off' | 'probing' (the game isn't running, or its Stats API is off) | 'connected'. Never a name, an id
//     or a payload. Nothing is ever sent to the game: the client only reads (no Stats API command, ever).
import { createRlClient, connectRl, disconnectRl, rlStatus } from '../apps/sources/gamelink-rl-client.js';
const { RL_URGENT } = __bm(644);

export const RL_STATUS_MS = 5000;

export class RlLinkController {
  /** opts (tests): { client, io (findRl's io), dir (the backup folder), find, now } */
  constructor({ runtime, gameLink = null, log = () => {}, client = null, io, dir, find, now = () => Date.now() } = {}) {
    this.runtime = runtime;
    this.gl = gameLink && typeof gameLink.attachPoller === 'function' ? gameLink : null;
    this.log = log;
    this.client = this.gl ? client || createRlClient() : null;
    this.fileOpts = { ...(io ? { io } : {}), ...(dir ? { dir } : {}), ...(find ? { find } : {}) };
    this.now = now;
    this.detach = null;
    this.busy = null;
    this.last = null;
    this.install = null;
    this.installAt = -Infinity;
    this.offs = [];
    runtime.rlLinkController = this;
    this.wrap();
    const onGlobals = (g) => { this.wrap(); this.apply(g); };
    const onPi = (p) => { this.wrap(); this.onPi(p).catch((e) => this.log('warn', `game link (rl): ${String(e?.message || e).slice(0, 120)}`)); };
    runtime.on('globals', onGlobals);
    runtime.on('pi-gamelink', onPi);
    this.offs.push(() => runtime.off('globals', onGlobals), () => runtime.off('pi-gamelink', onPi));
    this.apply(runtime.globals);
  }

  /**
   * Add state.gameLink.rl to runtime.gameLinkStatus, around whatever the other controllers installed (the base one
   * assigns it; the LoL block wraps it). A wrapper already there keeps receiving the base controller's assignment
   * through its own setter. A block that wraps after us without forwarding to ours drops our wrapper: then we wrap
   * again (checked on every globals and PI message, so the PI always sees `rl`).
   */
  wrap() {
    const runtime = this.runtime;
    const cur = Object.getOwnPropertyDescriptor(runtime, 'gameLinkStatus');
    if (cur?.get && cur.get === this.getter) return;
    let base = runtime.gameLinkStatus;
    this.getter = () => () => ({ ...(typeof base === 'function' ? base() : { available: false }), rl: this.piStatus() });
    Object.defineProperty(runtime, 'gameLinkStatus', {
      configurable: true, enumerable: true,
      get: this.getter,
      set: (fn) => { if (cur?.set) { cur.set(fn); base = cur.get ? cur.get() : fn; } else base = fn; },
    });
  }

  /** globals.gamelink.rl → attached or not (idempotent). */
  apply(g) {
    if (!this.gl) return;
    const on = g?.gamelink?.rl === true;
    try {
      if (on && !this.detach) this.detach = this.gl.attachPoller({ game: 'rl', start: this.client.start, urgent: RL_URGENT });
      else if (!on && this.detach) { const d = this.detach; this.detach = null; d(); }
    } catch (e) { this.log('warn', `game link (rl): ${String(e?.message || e).slice(0, 120)}`); }
  }

  async onPi(p = {}) {
    if (!this.gl) return;
    if (p.action === 'rl') this.toggle(p.on === true);
    else if (p.action === 'rl-connect') await this.connect();
    else if (p.action === 'rl-disconnect') await this.disconnect();
    else if (p.action === 'status') { await this.refresh(false); this.runtime.sendPiState?.(); }
  }

  /** The PI's toggle: RL on also turns listening on (the client only runs while the hub listens). */
  toggle(on) {
    const cur = this.runtime.globals?.gamelink || { enabled: false, port: null };
    const next = { ...cur, rl: !!on, ...(on ? { enabled: true } : {}) };
    if (next.rl !== cur.rl || next.enabled !== cur.enabled) this.runtime.setGlobals({ gamelink: next });
    else this.apply(this.runtime.globals);
    this.runtime.sendPiState?.();
  }

  /** The install check (read-only), at most every RL_STATUS_MS unless forced. */
  async refresh(force = true) {
    if (!force && this.install && this.now() - this.installAt < RL_STATUS_MS) return this.install;
    try { this.install = await rlStatus(this.fileOpts); } catch { this.install = { found: false, reason: 'error' }; }
    this.installAt = this.now();
    return this.install;
  }

  async connect() {
    if (this.busy) return this.last;
    this.busy = 'connect';
    this.runtime.sendPiState?.();
    try {
      const r = await connectRl(this.fileOpts);
      this.last = { action: 'rl-connect', ...r };
      if (r.ok) this.toggle(true);   // connected: read it (and listen) too
      await this.refresh(true);
      return this.last;
    } finally { this.busy = null; this.runtime.sendPiState?.(); }
  }

  async disconnect() {
    if (this.busy) return this.last;
    this.busy = 'disconnect';
    this.runtime.sendPiState?.();
    try {
      const r = await disconnectRl(this.fileOpts);
      this.last = { action: 'rl-disconnect', ...r };
      await this.refresh(true);
      return this.last;
    } finally { this.busy = null; this.runtime.sendPiState?.(); }
  }

  /** state.gameLink.rl for the PI: no names, no ids, no payloads. */
  piStatus() {
    if (!this.gl) return { available: false };
    const s = this.client.status();
    const enabled = this.runtime.globals?.gamelink?.rl === true;
    const i = this.install, L = this.last;
    return {
      available: true, enabled,
      state: enabled && s.running ? s.phase : 'off', transport: enabled ? s.transport : null,
      lastAgoMs: s.lastMsgAt === null ? null : Math.max(0, this.now() - s.lastMsgAt),
      install: i ? { found: !!i.found, reason: i.reason || null, store: i.store || null, path: i.iniPath || null, ini: i.ini ?? null, rate: i.rate ?? null, connected: !!i.connected } : null,
      busy: this.busy,
      last: L ? { action: L.action, ok: !!L.ok, reason: L.reason || null, restartNeeded: !!L.restartNeeded, already: !!L.already, kept: Array.isArray(L.kept) ? L.kept : [], path: L.path || null } : null,
    };
  }

  stop() {
    for (const off of this.offs.splice(0)) { try { off(); } catch { /* best effort */ } }
    if (this.detach) { const d = this.detach; this.detach = null; try { d(); } catch { /* best effort */ } }
  }
}
