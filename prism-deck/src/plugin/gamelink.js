// Game Link in the plugin (prism-play): turns the global `gamelink` settings into the listener's state, runs the
// property inspector's "Game Link" subsection, and pushes every data change into the runtime at once.
//
//   new GameLinkController({ runtime, gameLink: hub.gameLink, log })
//
//   globals.gamelink { enabled, port } → gameLink.configure()   (enabled: listening on 127.0.0.1; off: no socket at all)
//   gameLink 'change' (keys, { urgent }) → runtime.dataChanged() (a flashbang lands within one frame, even under Still)
//   PI { cmd: 'gamelink', action: 'status' | 'listen' | 'connect-cs2' | 'disconnect-cs2' | 'port', on, port }:
//     listen          the "Listen for game data" toggle = globals.gamelink.enabled (default off). Independent of CS2:
//                     companions (Prism Control's Prism Sight) post to /v1/companion with CS2 absent
//     connect-cs2     finds CS2 (read-only); only if it's really installed: listening on, then our cfg written into
//                     <cs2>/game/csgo/cfg/ — the user's click is the consent. "CS2 not found" otherwise (a leftover
//                     folder is not an install); that never blocks the listen toggle. CS2 reads the cfg at launch.
//     disconnect-cs2  removes exactly our cfg (never another vendor's) and rotates the CS2 token; listening is left
//                     as it is (the toggle owns it)
//     port            a fixed port (null = 38140 with fallbacks); the cfg then reads "out of date" until Connect again
//   runtime.gameLinkStatus() → the PI's state.gameLink (no tokens, ever)

export const GAMELINK_DEFAULT_PORT = 38140;

export class GameLinkController {
  constructor({ runtime, gameLink = null, log = () => {} } = {}) {
    this.runtime = runtime;
    this.gl = gameLink;
    this.log = log;
    this.busy = null;     // 'connect' | 'disconnect' while a click is being handled
    this.last = null;     // the last click's outcome, for the PI
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
      else await this.gl.cs2Status(false);   // 'status': refresh the read-only CS2 check (at most every 5 s)
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
    };
  }

  stop() { for (const off of this.offs.splice(0)) { try { off(); } catch { /* best effort */ } } }
}
