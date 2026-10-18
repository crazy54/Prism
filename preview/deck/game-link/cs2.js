// Game Link page config: Counter-Strike 2 (/deck/game-link.html). The shared player (../game-link.js) replays a
// fictional match through prism-deck's own CS2 normalizer onto virtual decks; everything CS2-specific lives here:
// the fixture, the engine modules, the moments, the captions, what the feed shows, the scoreboard, the buy panel.
//
// The shape every game config exports (dota2.js / lol.js follow it once their normalizers and facets land):
//   id, status ('live' | 'coming'), name, short, sides { a, b } (the CSS --g-a / --g-b teams)
//   fixture            the raw feed, relative to the page: { frames: [{ id, atMs, payload }] }
//   engine             prism-deck modules, relative to the engine root: { normalizer, facet, facetExport? }
//   normalize(mod, payload, prev, nowMs) → { state, events }   tick(mod, state) → nowMs | null   ticked(mod, state, at)
//   view(mod, state, nowMs) → ctx.data.gamelink                facetParams (the facet's params on the page)
//   timeline           { quietMs, jumpMs, jumpGapMs, endHoldMs, holdAfter, startAt, brightMs, strike[], clear[], bright[] }
//   chapters, captions, stillCaptions, fallbackCaption(state), notes (the motion notes), labels (devices, replay)
//   feed               { title, route, clock(payload), fields[], events{}, hot Set, quiet(post), redact RegExp, dropNote(key) }
//   killfeed(e, post)  → { glyph, text, detail, tone } | null  (one row of the kill-feed style event log)
//   scoreboard(state)  → { a: { label, score }, b: { label, score }, side, top, bottom } | null
//   buy(post)          → the buy panel (CS2 only) | null

const money = (n, sign = false) => (Number.isFinite(n) ? `${n < 0 ? '−' : sign ? '+' : ''}$${Math.abs(n).toLocaleString('en-US')}` : '—');
const activeWeapon = (p) => Object.values(p?.player?.weapons || {}).find((w) => w.state === 'active' || w.state === 'reloading') || null;
const WEAPON = { m4a1_silencer: 'M4A1-S', m4a1: 'M4A4', ak47: 'AK-47', awp: 'AWP', famas: 'FAMAS', galilar: 'Galil AR', usp_silencer: 'USP-S', glock: 'Glock-18', hkp2000: 'P2000', p250: 'P250', deagle: 'Desert Eagle', knife: 'Knife', knife_t: 'Knife', flashbang: 'Flashbang', smokegrenade: 'Smoke', hegrenade: 'HE grenade', molotov: 'Molotov', incgrenade: 'Incendiary', decoy: 'Decoy', c4: 'C4' };
const weaponName = (name) => { const k = String(name || '').replace(/^weapon_/, ''); return WEAPON[k] || k.toUpperCase(); };
const PHASE = { freezetime: 'Buy time', live: 'Live', over: 'Round over' };

export default {
  id: 'cs2',
  status: 'live',
  name: 'Counter-Strike 2',
  short: 'CS2',
  sides: { a: 'CT', b: 'T' },
  fixture: 'game-link/cs2-match.json',
  engine: { normalizer: 'src/apps/sources/gamelink-cs2.js', facet: 'src/facets/gamelink/deck.js' },
  normalize: (mod, payload, prev, nowMs) => mod.normalizeCs2(payload, prev, { nowMs }),
  tick: (mod, state) => mod.cs2NextTick(state),
  ticked: (mod, state, at) => mod.tickCs2(state, at),
  view: (mod, state, nowMs) => mod.gameLinkView(state, nowMs),
  facetParams: { layout: 'scene', skin: 'game' },
  labels: { replay: 'the CS2 replay', fromStart: 'Replay from round 7' },

  timeline: {
    quietMs: 4000, jumpMs: 2200, jumpGapMs: 60000, endHoldMs: 3500,
    holdAfter: { '36-gameover-win': 9000 },   // let the final scoreboard stand
    startAt: '03-freezetime',                 // the playhead starts at round 7's buy time
    brightMs: 2600,                           // a bright effect's window (seeks snap to just before it)
    strike: ['flashOnset', 'flashFull'], clear: ['flashClear'],
    bright: ['multiKill', 'roundWon', 'roundLost', 'bombDefused', 'bombExploded', 'death', 'gameover', 'kill', 'hurt'],
  },

  chapters: [
    { id: '07-hurt', label: 'Damage', sub: '−27 HP' },
    { id: '08-flash-onset', label: 'Flashbang', sub: 'flashed 255' },
    { id: '15-kill', label: 'Headshot', sub: 'kill, then a double', lead: 700 },
    { id: '20-bomb-planted', label: 'Bomb planted', sub: 'no timer' },
    { id: '22-round-win-defuse', label: 'Defused', sub: 'round won' },
    { id: '25-hurt-heavy', label: 'Death', sub: '→ spectating' },
    { id: '35a-final-kill-1', label: 'Multi-kill', sub: '2K · 3K · 4K', lead: 900 },
    { id: '36-gameover-win', label: 'ACE', sub: 'wins the match', lead: 1100 },
  ],
  captions: {
    '00-main-menu': ['MENU', 'In the main menu: the deck waits, dark, and invents nothing.'],
    '01-map-loading': ['LOADING', 'Loading into a competitive match on Inferno.'],
    '02-warmup': ['WARMUP', 'Warmup: no round yet.'],
    '03-freezetime': ['BUY TIME', 'Round 7, freeze time. The vitals bay breathes and the money key says Buy.'],
    '04-buy-rifle-armor': ['BUY', 'An M4A1-S, armor and a helmet: −$3,900.'],
    '05-buy-kit-flash': ['BUY', 'A defuse kit and a flashbang: −$600.'],
    '06-round-live': ['ROUND LIVE', 'Round 7 is live. Your health and armor run across the middle keys.'],
    '07-hurt': ['DAMAGE', 'Hit for 27: shards fly out from the center, as far as the damage reaches.'],
    '08-flash-onset': ['FLASHBANG', 'Flashed: 255. The whole deck floods white…'],
    '09-flash-fade-1': ['FLASHBANG', '…and fades as the game lets the flash fade.'],
    '14-flash-clear': ['CLEAR', 'flashed is back to 0: your sight, and the deck, return.'],
    '15-kill': ['KILL', 'A kill: a hit marker on the kill counter and a ring of light across the deck.'],
    '16-kill-headshot': ['HEADSHOT · 2K', 'A headshot double: white rings and a sharper hit marker.'],
    '17-reload-start': ['RELOAD', 'Low ammo, reloading.'],
    '20-bomb-planted': ['PLANTED', 'Bomb planted: a steady pulse at a fixed beat. Players get no bomb timer from CS2, so Prism doesn’t invent one.'],
    '22-round-win-defuse': ['DEFUSED · WON', 'Defused, round won: a CT-blue burst, then a sweep of light. And the MVP.'],
    '23-freezetime-round8': ['ROUND 8', 'Round 8, freeze time.'],
    '24-round8-live': ['ROUND LIVE', 'Round 8 is live.'],
    '25-hurt-heavy': ['DAMAGE', 'Hit for 62: the shards reach the edges, and health turns warn.'],
    '26-death': ['DEAD', 'Dead. The glass cracks from the middle of the deck.'],
    '27-spectating-teammate': ['SPECTATING', 'Watching a teammate: the deck dims and keeps your last numbers, never theirs.'],
    '28-spectating-teammate-flashed': ['NOT YOU', 'Your teammate is flashed (240). Not you, so your deck stays dark.'],
    '29-round-loss': ['ROUND LOST', 'Round lost: a cool fade.'],
    '30-round-over-no-player': ['BETWEEN', 'Between rounds: this post carries no player at all.'],
    '31-halftime': ['HALFTIME', 'Halftime: sides swap.'],
    '32-second-half-freezetime': ['SIDE SWAP', 'Second half: now on T. The deck turns amber, money resets.'],
    '33-round23-over': ['ROUND 23', 'Fifteen minutes later: 12 : 11.'],
    '34-match-point': ['MATCH POINT', 'Match point: one round to win it.'],
    '35-final-round-live': ['FINAL ROUND', 'The last round is live.'],
    '35a-final-kill-1': ['1K', 'One…'],
    '35b-final-kill-2-headshot': ['2K · HEADSHOT', 'Two, a headshot…'],
    '35c-final-hurt': ['DAMAGE', 'Hit for 36…'],
    '35d-final-kill-3': ['3K', 'Three…'],
    '35e-final-reload': ['RELOAD', 'Reloading…'],
    '35g-final-kill-4-headshot': ['4K · HEADSHOT', 'Four…'],
    '36-gameover-win': ['ACE · VICTORY', 'ACE. The fifth kill wins the match 13 : 11: the deck floods amber, then the final scoreboard.'],
    '37-back-to-menu': ['MENU', 'Back to the menu. GG.'],
  },
  // Still shows each moment as a static state: say what the keys show instead of the light that isn't there
  stillCaptions: {
    '07-hurt': 'Hit for 27: the health readout drops to 73.',
    '08-flash-onset': 'Flashed: 255. Still shows it as a state: the round key says Flashed, with no whiteout.',
    '09-flash-fade-1': 'flashed falls as the game lets the flash fade; the deck stays calm.',
    '15-kill': 'A kill: the kill counter steps up.',
    '16-kill-headshot': 'A headshot double: the kill key says 2K.',
    '20-bomb-planted': 'Bomb planted: the round key says Planted. No pulse, and no timer: CS2 gives players none.',
    '22-round-win-defuse': 'Defused, round won: the round key says Won, Defused.',
    '25-hurt-heavy': 'Hit for 62: health 38.',
    '26-death': 'Dead: the deck dims to your last numbers.',
    '36-gameover-win': 'ACE. The fifth kill wins the match 13 : 11, and the readout becomes the final scoreboard.',
  },
  fallbackCaption(s) {
    const m = s?.match;
    if (!s || !m) return ['REPLAY', 'A fictional competitive match on Inferno, as CS2 would send it to a player.'];
    const tag = s.status === 'spectating' ? 'SPECTATING' : m.phase === 'gameover' ? 'GAMEOVER' : String(PHASE[s.round?.phase] || m.phase || '').toUpperCase();
    return [tag, `Round ${s.round?.number ?? (m.ct ?? 0) + (m.t ?? 0) + 1} · ${m.title || 'Inferno'} · you ${m.us ?? '—'} : ${m.them ?? '—'}${s.round?.bomb === 'planted' ? ' · bomb planted' : ''}`];
  },
  notes: {
    soft: 'Soft effects: capped brightness and a slowed rise, the plugin’s default.',
    full: 'Full effects: brighter peaks and a faster rise, still at most one bright flash a second and never a full red field.',
    calm: 'Calm motion: gentle, slower effects at a few frames a second.',
    still: 'Still: no motion and no flashes. Each moment is a static state on the keys: Flashed, Planted, Down.',
  },

  // ── the scoreboard over the stage (our side highlighted; from the normalized state, never the payload's names) ──
  scoreboard(s) {
    const m = s?.match;
    if (!m) return null;
    const r = s.round;
    const top = m.phase === 'gameover' ? 'Final' : m.phase === 'intermission' ? 'Halftime' : m.phase === 'warmup' ? 'Warmup' : Number.isFinite(r?.number) ? `Round ${r.number}` : m.title || '';
    const bottom = m.phase === 'gameover' ? (m.result === 'win' ? 'Victory' : m.result === 'loss' ? 'Defeat' : 'Draw') : r?.bomb === 'planted' ? 'Bomb planted' : s.status === 'spectating' ? 'Spectating' : PHASE[r?.phase] || (m.phase === 'live' ? 'Live' : '');
    return { a: { label: 'CT', score: m.ct ?? 0 }, b: { label: 'T', score: m.t ?? 0 }, side: m.side === 'T' ? 'b' : m.side === 'CT' ? 'a' : null, top, bottom, map: m.title || null, mode: m.mode || null, matchPoint: !!m.matchPoint };
  },

  // ── the feed: what CS2 sent (the raw GSI post), what Prism heard ──────────────────
  feed: {
    title: 'What CS2 sent',
    route: 'POST /v1/cs2',
    clock: (p) => (p.map ? `${p.map.name} · CT ${p.map.team_ct?.score ?? 0} : ${p.map.team_t?.score ?? 0} T · map.phase ${p.map.phase}` : 'no map block: not in a match'),
    fields: [
      { k: 'health', label: 'Health', path: 'player.state.health', get: (p) => p.player?.state?.health, fmt: (v) => String(v), tone: (v) => (v <= 0 ? 'crit' : v < 40 ? 'warn' : ''), bar: (v) => v / 100 },
      { k: 'flashed', label: 'Flashed', path: 'player.state.flashed', get: (p) => p.player?.state?.flashed, fmt: (v) => `${v}`, unit: () => '/ 255', bar: (v) => v / 255, barTone: 'white' },
      { k: 'phase', label: 'Round phase', path: 'round.phase', get: (p) => p.round?.phase, fmt: (v) => v },
      { k: 'bomb', label: 'Bomb', path: 'round.bomb', get: (p) => (p.round ? p.round.bomb ?? null : undefined), fmt: (v) => v ?? 'none', tone: (v) => (v === 'planted' ? 'warn' : v === 'defused' ? 'pos' : v ? '' : 'quiet'), unit: (v) => (v === 'planted' ? 'no timer' : '') },
      { k: 'kills', label: 'Round kills', path: 'player.state.round_kills', get: (p) => p.player?.state?.round_kills, fmt: (v) => String(v), unit: (v, p) => (p.player?.state?.round_killhs ? `${p.player.state.round_killhs} HS` : '') },
      { k: 'ammo', label: 'Ammo', path: 'weapons.*.ammo_clip', get: (p) => { const w = activeWeapon(p); return w ? (Number.isFinite(w.ammo_clip) ? `${w.ammo_clip}/${w.ammo_clip_max}` : '—') : undefined; }, fmt: (v) => v, unit: (v, p) => { const w = activeWeapon(p); if (!w) return ''; return w.state === 'reloading' ? 'reloading' : weaponName(w.name); } },
      { k: 'who', label: 'Whose view', path: 'player.steamid', get: (p) => (p.player?.steamid ? (p.player.steamid === p.provider?.steamid ? 'yours' : 'teammate') : undefined), fmt: (v) => (v === 'yours' ? 'Yours' : 'Teammate'), tone: (v) => (v === 'teammate' ? 'warn' : ''), unit: (v) => (v === 'yours' ? '= provider' : '≠ provider') },
      { k: 'team', label: 'Your side', path: 'player.team', get: (p) => p.player?.team, fmt: (v) => v, tone: (v) => (v === 'CT' ? 'a' : v === 'T' ? 'b' : '') },
    ],
    events: {
      hurt: (e) => `−${e.damage} HP`, kill: (e) => (e.headshot ? 'headshot' : `#${e.roundKills ?? ''}`), multiKill: (e) => e.label, flashOnset: (e) => `strength ${(+e.strength).toFixed(2)}`,
      flashClear: (e) => (e.timeout ? 'safety decay' : `peak ${(+e.peak).toFixed(2)}`), money: (e) => money(e.delta, true),
      roundWon: (e) => e.reason || '', roundLost: (e) => e.reason || '', context: (e) => e.value || '', mapPhase: (e) => e.value || '', gameover: (e) => e.result || '',
      resync: () => 'full state: re-baselined, no effects', weaponSwitch: (e) => String(e.weapon || '').replace(/^weapon_/, ''), sideSwap: (e) => `${e.from || ''} → ${e.to || ''}`, matchJoined: (e) => e.map || '',
    },
    hot: new Set(['hurt', 'death', 'flashOnset', 'flashFull', 'kill', 'multiKill', 'bombPlanted', 'bombDefused', 'bombExploded', 'roundWon', 'roundLost', 'gameover', 'mvp', 'matchPoint']),
    quiet: (post) => (post.f.id.includes('flash-fade') ? 'No event: the whiteout follows <code>flashed</code> as it falls.' : post.f.id.includes('heartbeat') ? 'A heartbeat: nothing changed, so nothing redraws.' : 'No new event: the deck follows the values.'),
    // keyed identities (the provider's and the player's steamid, the auth token); the player's name by its value: a bare
    // "name" key would also strike the provider and every weapon
    redact: /^(\s*)&quot;(steamid|token)&quot;: (&quot;[^\n]*?&quot;)(,?)$/gm,
    identities: (p) => [p?.player?.name],
    dropNote: (k) => (k === 'token' ? 'checked, then dropped' : 'dropped at the edge'),
    foot: 'Fictional match, invented values, real CS2 shapes. The deck never sees a Steam ID or a name: Prism drops them the moment a post arrives.',
  },

  // ── the kill feed: what Prism heard, newest on top (our own rows; "you" is the only actor the state knows) ──
  killfeed(e) {
    switch (e.type) {
      case 'kill': return { glyph: e.headshot ? 'headshot' : 'kill', text: 'You', detail: e.headshot ? 'Headshot' : 'Kill', tone: 'side' };
      case 'multiKill': return { glyph: 'multi', text: String(e.label || '').toUpperCase() === 'ACE' ? 'ACE' : `${e.count}K`, detail: e.label === 'ace' ? 'five kills' : String(e.label || ''), tone: 'side' };
      case 'hurt': return { glyph: 'hurt', text: `−${e.damage}`, detail: `health ${e.health}`, tone: 'neg' };
      case 'death': return { glyph: 'death', text: 'You', detail: 'Down', tone: 'neg' };
      case 'flashOnset': return { glyph: 'flash', text: 'Flashed', detail: `${Math.round(e.strength * 255)} / 255`, tone: 'white' };
      case 'flashClear': return { glyph: 'clear', text: 'Clear', detail: e.timeout ? 'safety decay' : 'sight back', tone: 'dim' };
      case 'bombDefused': return { glyph: 'defuse', text: 'Defused', detail: 'bomb', tone: 'a' };
      case 'bombExploded': return { glyph: 'bomb', text: 'Detonated', detail: 'bomb', tone: 'b' };
      case 'roundWon': return { glyph: 'flag', text: 'Round won', detail: ({ bomb_defused: 'defused', bomb_exploded: 'detonated', elimination: 'elimination', time: 'time' })[e.reason] || '', tone: 'pos' };
      case 'roundLost': return { glyph: 'flag', text: 'Round lost', detail: ({ bomb_defused: 'defused', bomb_exploded: 'detonated', elimination: 'elimination', time: 'time' })[e.reason] || '', tone: 'dim' };
      case 'money': return { glyph: 'money', text: money(e.delta, true), detail: e.delta < 0 ? 'bought' : 'reward', tone: e.delta < 0 ? 'dim' : 'pos' };
      case 'mvp': return { glyph: 'mvp', text: 'MVP', detail: 'round MVP', tone: 'side' };
      case 'matchPoint': return { glyph: 'flag', text: 'Match point', detail: e.us && e.them ? 'both' : e.us ? 'us' : 'them', tone: 'warn' };
      case 'gameover': return { glyph: 'flag', text: e.result === 'win' ? 'Victory' : e.result === 'loss' ? 'Defeat' : 'Game over', detail: `${e.us ?? '—'} : ${e.them ?? '—'}`, tone: e.result === 'win' ? 'pos' : 'dim' };
      case 'sideSwap': return { glyph: 'swap', text: `Now ${e.to}`, detail: 'sides swap', tone: 'side' };
      case 'reloadStart': return { glyph: 'reload', text: 'Reload', detail: weaponName(e.weapon), tone: 'dim' };
      case 'reloadEnd': return { glyph: 'reload', text: 'Reloaded', detail: weaponName(e.weapon), tone: 'dim' };
      case 'lowAmmo': return { glyph: 'reload', text: 'Low ammo', detail: Number.isFinite(e.clip) ? `${e.clip} / ${e.clipMax}` : '', tone: 'warn' };
      case 'emptyClip': return { glyph: 'reload', text: 'Empty', detail: 'clip', tone: 'warn' };
      case 'bombPlanted': return { glyph: 'bomb', text: 'Bomb planted', detail: 'no timer', tone: 'warn' };
      case 'flashFull': return { glyph: 'flash', text: 'Full flash', detail: 'blind', tone: 'white' };
      case 'roundLive': return { glyph: 'flag', text: 'Round live', detail: '', tone: 'side' };
      case 'roundStart': return { glyph: 'flag', text: `Round ${e.round ?? ''}`.trim(), detail: 'buy time', tone: 'side' };
      case 'halftime': return { glyph: 'swap', text: 'Halftime', detail: 'sides swap', tone: 'dim' };
      case 'respawn': return { glyph: 'flag', text: 'Respawn', detail: '', tone: 'side' };
      default: return null;
    }
  },

  // ── the buy panel: money in the game's own terms, from the post (weapons as CS2 names them) ──
  buy(post, state) {
    const p = post.f.payload?.player, st = p?.state;
    if (!st || p.steamid !== post.f.payload?.provider?.steamid) return { money: state?.player?.money ?? null, stale: true, items: [] };
    const ws = Object.values(p.weapons || {});
    const of = (type) => ws.find((w) => w.type === type);
    const nades = ws.filter((w) => w.type === 'Grenade').map((w) => `${weaponName(w.name)}${(w.ammo_reserve ?? 1) > 1 ? ` ×${w.ammo_reserve}` : ''}`);
    const rifle = of('Rifle') || of('SniperRifle') || of('Submachine Gun') || of('Shotgun') || of('Machine Gun');
    const delta = [...post.events].reverse().find((e) => e.type === 'money')?.delta ?? null;
    return {
      money: st.money ?? null, delta, equip: st.equip_value ?? null, stale: false,
      items: [
        { slot: 'Primary', name: rifle ? weaponName(rifle.name) : null },
        { slot: 'Pistol', name: of('Pistol') ? weaponName(of('Pistol').name) : null },
        { slot: 'Armor', name: st.armor > 0 ? (st.helmet ? 'Kevlar + helmet' : 'Kevlar') : null, value: st.armor > 0 ? st.armor : null },
        { slot: 'Utility', name: nades.length ? nades.join(' · ') : null },
        { slot: p.team === 'T' ? 'Bomb' : 'Kit', name: p.team === 'T' ? (of('C4') ? 'C4' : null) : st.defusekit ? 'Defuse kit' : null },
      ],
    };
  },
};
