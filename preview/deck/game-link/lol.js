// Game Link page config: League of Legends (/deck/game-link-lol.html). A fictional match as the Live Client Data API
// polls a local player's Prism Deck reads (game-link/lol-match.json, copied from prism-deck/test/fixtures/gamelink/lol),
// replayed through prism-deck's own normalizer (normalizeLol + lolView, src/apps/sources/gamelink-lol.js) onto the
// shared MOBA deck facet (gamelink-moba-deck, src/facets/gamelink/moba-deck.js) in its League skin.
// The shape is cs2.js's (see its header). LoL specifics:
//   - frames carry `poll` (the player reads it); a null poll = the game closed → state null → "Waiting for a game"
//   - quiet stretches compress to under 3 s: polls with the same game clock more than LOL_PAUSE_MS apart read as paused
//   - abilities: levels only (Riot publishes no cooldowns); no objective or respawn timers but our own respawn
//   - identities (Riot ids, summoner names, the names inside Riot's events) are struck through in the raw view: the
//     deck never sees them (sanitizeLol drops them at the edge)

const PHASE = { pregame: 'Pregame', live: 'Live', post: 'Game over' };
const mmss = (t) => (Number.isFinite(t) ? `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}` : '—');
const gold = (n) => (Number.isFinite(n) ? Math.floor(n).toLocaleString('en-US') : '—');
const ap = (p) => p?.allgamedata?.activePlayer || null;
const cs = (p) => ap(p)?.championStats || null;
/** Our line on the Tab scoreboard (found by our own Riot id, in the page only: the deck never gets it). */
const me = (p) => { const a = ap(p), list = p?.allgamedata?.allPlayers || []; return a ? list.find((x) => x.riotId && x.riotId === a.riotId) || list.find((x) => x.summonerName && x.summonerName === a.summonerName) || null : null; };
const OBJECTIVE = { dragon: 'Dragon', baron: 'Baron', herald: 'Rift Herald', grubs: 'Voidgrubs', atakhan: 'Atakhan', tower: 'Tower', inhibitor: 'Inhibitor' };
const DRAKE = { fire: 'Infernal drake', water: 'Ocean drake', earth: 'Mountain drake', air: 'Cloud drake', hextech: 'Hextech drake', chemtech: 'Chemtech drake', elder: 'Elder dragon' };
const MULTI = { 2: 'Double kill', 3: 'Triple kill', 4: 'Quadra kill', 5: 'Pentakill' };

export default {
  id: 'lol',
  status: 'live',
  name: 'League of Legends',
  short: 'LoL',
  sides: { a: 'Order', b: 'Chaos' },
  fixture: 'game-link/lol-match.json',
  engine: { normalizer: 'src/apps/sources/gamelink-lol.js', facet: 'src/facets/gamelink/moba-deck.js', facetExport: 'gamelink-moba-deck' },
  normalize: (mod, poll, prev, nowMs) => mod.normalizeLol(poll, prev, { nowMs }),
  view: (mod, state, nowMs) => (state ? mod.lolView(state, nowMs) : null),
  facetParams: { skin: 'game' },
  labels: { replay: 'the League of Legends replay', fromStart: 'Replay from the game start' },
  chapterTag: (s) => (s?.lol?.clock ? mmss(s.lol.clock.t) : null),

  timeline: {
    quietMs: 2800, jumpMs: 2200, jumpGapMs: Infinity, endHoldMs: 3500,
    holdAfter: { '27-victory-heartbeat': 2900 },
    startAt: '02-game-start',
    brightMs: 2200,
    strike: [], clear: [],
    // bright onsets (≥ 1 s apart in wall time, whatever the speed): kills, multi-kills, objectives, the end
    onset: ['kill', 'multiKill', 'firstBlood', 'ace', 'death', 'objective', 'gameover'],
    bright: ['levelUp'],
  },

  chapters: [
    { id: '07-first-blood', label: 'First blood', sub: 'yours' },
    { id: '09-death', label: 'Death', sub: 'your respawn time' },
    { id: '12-voidgrubs', label: 'Voidgrubs', sub: 'objectives' },
    { id: '13-level-6', label: 'Level 6', sub: 'levels, no cooldowns' },
    { id: '18-dragon-stolen', label: 'Stolen drake', sub: 'no timers' },
    { id: '20-double-kill', label: 'Multi-kill', sub: 'double · triple · quadra', lead: 900 },
    { id: '23-penta-ace', label: 'Pentakill', sub: 'and the ace', lead: 900 },
    { id: '26-victory', label: 'Victory', sub: 'the nexus falls', lead: 900 },
  ],
  captions: {
    '00-loading': ['LOADING', 'The loading screen: the game answers on 127.0.0.1, with no match data yet. The deck waits.'],
    '01-loading-2': ['LOADING', 'Still loading. Nothing new, so nothing redraws.'],
    '02-game-start': ['GAME START', 'In game: Annie, mid lane, for Order. Health, mana and gold land on the deck.'],
    '03-heartbeat': ['LIVE', 'Half a second later, the same picture: the same frames, nothing sent.'],
    '04-minions': ['MINIONS', 'Minions spawn at 1:05: the match is live. Q learned.'],
    '05-level-2': ['LEVEL 2', 'Level 2: W learned. Abilities show their levels, never a cooldown: Riot doesn’t publish them.'],
    '06-level-3': ['LEVEL 3', 'Level 3.'],
    '07-first-blood': ['FIRST BLOOD', 'First blood is yours: you take down the enemy Zed.'],
    '08-first-blood-again': ['FIRST BLOOD', 'The next read brings the same history: Prism counts every event once.'],
    '09-death': ['DOWN', 'Ganked: you’re down. The deck shows the respawn time your own HUD shows.'],
    '10-dead': ['RESPAWN', 'Still dead: only your respawn countdown changes.'],
    '11-respawn': ['RESPAWN', 'Back at the fountain.'],
    '12-voidgrubs': ['VOIDGRUBS', 'Your jungler takes the Voidgrubs. Level 4, boots and a first item.'],
    '13-level-6': ['LEVEL 6', 'Level 6: your ultimate is learned. Levels only, no cooldowns.'],
    '14-dragon-fire': ['DRAGON', 'Your team takes the Infernal drake; you assist.'],
    '15-first-tower': ['TOWER', 'You take the enemy’s outer mid tower.'],
    '16-herald-enemy': ['HERALD', 'The enemy takes the Rift Herald: their objective, announced to everyone.'],
    '17-tower-lost': ['TOWER LOST', 'The enemy takes your outer top tower.'],
    '18-dragon-stolen': ['STOLEN', 'The enemy steals the Ocean drake. No respawn timers: the game doesn’t show them, so neither does the deck.'],
    '19-before-fight': ['LEVEL 13', 'Level 13, before the fight at Baron.'],
    '20-double-kill': ['DOUBLE KILL', 'Tibbers lands: a double kill.'],
    '21-triple-kill': ['TRIPLE KILL', 'Triple kill.'],
    '22-quadra-kill': ['QUADRA KILL', 'Quadra kill.'],
    '23-penta-ace': ['PENTAKILL · ACE', 'Pentakill, and the ace: the whole enemy team is down.'],
    '24-baron': ['BARON', 'Your jungler takes Baron Nashor; you assist.'],
    '25-inhibitor': ['INHIBITOR', 'You take the enemy’s mid inhibitor.'],
    '26-victory': ['VICTORY', 'The nexus falls: victory, 7 : 2.'],
    '27-victory-heartbeat': ['VICTORY', 'The victory screen: nothing new.'],
    '28-gone': ['WAITING', 'The game closes. The deck says Waiting for a game, and invents nothing.'],
  },
  stillCaptions: {
    '07-first-blood': 'First blood: the K / D / A key steps up. Still shows it as a state.',
    '20-double-kill': 'A double kill: the K / D / A key steps up, no banner.',
    '23-penta-ace': 'Pentakill and the ace, as plain numbers on the keys.',
    '26-victory': 'Victory: the match key says so.',
  },
  fallbackCaption(s) {
    if (!s) return ['WAITING', 'No game client: the deck waits for a game.'];
    if (s.status === 'loading') return ['LOADING', 'The loading screen: no match data yet.'];
    const m = s.match, c = s.lol?.clock;
    return [String(PHASE[s.lol?.phase] || s.status || '').toUpperCase(), `${m?.title || 'Summoner’s Rift'} · ${mmss(c?.t)} · your team ${m?.us ?? '—'} : ${m?.them ?? '—'}`];
  },
  notes: {
    soft: 'Soft effects: capped brightness and a slowed rise, the plugin’s default.',
    full: 'Full effects: brighter peaks and a faster rise, still at most one bright onset a second and never a full red field.',
    calm: 'Calm motion: gentle, slower effects at a few frames a second.',
    still: 'Still: no motion and no flashes. Each moment is a static state on the keys.',
  },

  scoreboard(s) {
    const m = s?.match;
    if (!m) return null;
    const ours = m.side === 'chaos' ? 'b' : m.side === 'order' ? 'a' : null;
    const order = ours === 'b' ? m.them : m.us, chaos = ours === 'b' ? m.us : m.them;
    const t = s.lol?.clock?.t;
    const dead = s.player && s.player.alive === false && Number.isFinite(s.lol?.hero?.respawnIn);
    const bottom = m.result === 'win' ? 'Victory' : m.result === 'loss' ? 'Defeat' : s.status === 'paused' ? 'Paused' : dead ? `Respawn ${Math.ceil(s.lol.hero.respawnIn)} s` : PHASE[s.lol?.phase] || 'Live';
    return { a: { label: 'Order', score: order ?? 0 }, b: { label: 'Chaos', score: chaos ?? 0 }, side: ours, top: Number.isFinite(t) ? mmss(t) : m.title || '', bottom, map: m.title || null, mode: m.mode === 'classic' ? 'Classic 5v5' : m.mode || null, matchPoint: false };
  },

  feed: {
    title: 'What League sent',
    unit: 'POLL',
    route: 'GET 127.0.0.1:2999/liveclientdata/allgamedata',
    clock: (p) => (!p ? 'no game client: nothing answers on 2999' : p.status !== 200 ? `HTTP ${p.status}: the client has no game data yet` : `${p.allgamedata?.gameData?.mapName || 'map'} · game clock ${mmss(p.allgamedata?.gameData?.gameTime)} · ${p.allgamedata?.events?.Events?.length ?? 0} events`),
    fields: [
      { k: 'status', label: 'Answer', path: 'HTTP status', get: (p) => (p ? p.status : undefined), fmt: (v) => String(v), tone: (v) => (v === 200 ? '' : 'warn'), unit: (v) => (v === 200 ? 'OK' : 'no game yet') },
      { k: 'clock', label: 'Game clock', path: 'gameData.gameTime', get: (p) => p?.allgamedata?.gameData?.gameTime, fmt: (v) => mmss(v) },
      { k: 'health', label: 'Health', path: 'championStats.currentHealth', get: (p) => cs(p)?.currentHealth, fmt: (v) => String(Math.round(v)), unit: (v, p) => `/ ${Math.round(cs(p)?.maxHealth ?? 0)}`, tone: (v, p) => (v <= 0 ? 'crit' : v / (cs(p)?.maxHealth || 1) < 0.3 ? 'warn' : ''), bar: (v) => v, barOf: (v, p) => v / (cs(p)?.maxHealth || 1) },
      { k: 'resource', label: 'Mana', path: 'championStats.resourceValue', get: (p) => cs(p)?.resourceValue, fmt: (v) => String(Math.round(v)), unit: (v, p) => `/ ${Math.round(cs(p)?.resourceMax ?? 0)} ${String(cs(p)?.resourceType || '').toLowerCase()}`.trim(), bar: (v) => v, barOf: (v, p) => v / (cs(p)?.resourceMax || 1) },
      { k: 'gold', label: 'Gold', path: 'activePlayer.currentGold', get: (p) => ap(p)?.currentGold, fmt: (v) => gold(v) },
      { k: 'level', label: 'Level', path: 'activePlayer.level', get: (p) => ap(p)?.level, fmt: (v) => String(v), unit: (v, p) => (me(p)?.isDead ? `dead · ${Math.ceil(me(p).respawnTimer)} s` : '') },
      { k: 'kda', label: 'Your K / D / A', path: 'allPlayers[you].scores', get: (p) => { const s = me(p)?.scores; return s ? `${s.kills}/${s.deaths}/${s.assists}` : undefined; }, fmt: (v) => v, unit: (v, p) => `${me(p)?.scores?.creepScore ?? 0} CS` },
      { k: 'team', label: 'Your team', path: 'allPlayers[you].team', get: (p) => me(p)?.team, fmt: (v) => v, tone: (v) => (v === 'ORDER' ? 'a' : v === 'CHAOS' ? 'b' : '') },
    ],
    events: {
      kill: () => 'you got the kill', death: () => 'you died', multiKill: (e) => e.label || '', firstBlood: (e) => (e.self ? 'yours' : e.ours ? 'your team' : 'the enemy'),
      ace: (e) => (e.ours ? 'your team' : 'the enemy'), objective: (e) => `${e.name}${e.kind ? ` · ${e.kind}` : ''}${e.ours ? ' · ours' : ' · theirs'}${e.stolen ? ' · stolen' : ''}`,
      levelUp: (e) => `level ${e.level}`, gameover: (e) => e.result || '', matchJoined: (e) => e.map || '', context: (e) => e.value || '',
    },
    hot: new Set(['kill', 'death', 'multiKill', 'firstBlood', 'ace', 'objective', 'gameover']),
    quiet: (post) => (!post.f.poll ? 'No game client: the deck says Waiting.' : post.f.poll.status !== 200 ? 'The loading screen: no data, nothing to show yet.' : 'No new event: the deck follows the values.'),
    // keyed identities in the raw poll; the names inside arrays (Assisters) are caught by identities()
    redact: /^(\s*)&quot;(riotId|riotIdGameName|riotIdTagLine|summonerName|KillerName|VictimName|Recipient|Acer|skinName)&quot;: (&quot;[^\n]*?&quot;)(,?)$/gm,
    identities: (p) => { const g = p?.allgamedata; if (!g) return []; const out = []; for (const x of [g.activePlayer, ...(g.allPlayers || [])]) if (x) out.push(x.riotId, x.riotIdGameName, x.summonerName); for (const e of g.events?.Events || []) out.push(e.KillerName, e.VictimName, e.Recipient, e.Acer, ...(e.Assisters || [])); return out; },
    dropNote: () => 'dropped at the edge',
    foot: 'Fictional match, invented values, Riot’s documented shapes. The deck never sees a Riot ID or a summoner name: Prism drops them the moment a poll arrives.',
  },

  killfeed(e, post) {
    switch (e.type) {
      case 'kill': return { glyph: 'kill', text: 'You', detail: 'Kill', tone: 'side' };
      case 'death': return { glyph: 'death', text: 'You', detail: 'Down', tone: 'neg' };
      case 'multiKill': return { glyph: 'multi', text: MULTI[e.count] || `${e.count} kills`, detail: '', tone: 'side' };
      case 'firstBlood': return { glyph: 'flag', text: 'First blood', detail: e.self ? 'yours' : e.ours ? 'your team' : 'the enemy', tone: e.ours ? 'pos' : 'neg' };
      case 'ace': return { glyph: 'mvp', text: 'Ace', detail: e.ours ? 'your team' : 'the enemy', tone: e.ours ? 'pos' : 'neg' };
      case 'objective': return { glyph: 'objective', text: e.name === 'dragon' ? DRAKE[e.kind] || 'Dragon' : OBJECTIVE[e.name] || e.name, detail: `${e.stolen ? 'stolen · ' : ''}${e.ours ? 'ours' : 'theirs'}${e.name === 'tower' && e.kind ? ` · ${e.kind}` : ''}`, tone: e.ours ? 'side' : 'b' };
      case 'levelUp': return { glyph: 'level', text: `Level ${e.level}`, detail: '', tone: 'side' };
      case 'respawn': return { glyph: 'reload', text: 'Respawn', detail: 'the fountain', tone: 'side' };
      case 'gameover': return { glyph: 'flag', text: e.result === 'win' ? 'Victory' : e.result === 'loss' ? 'Defeat' : 'Game over', detail: '', tone: e.result === 'win' ? 'pos' : 'dim' };
      case 'matchJoined': return { glyph: 'flag', text: 'Game start', detail: post?.state?.match?.title || '', tone: 'side' };
      default: return null;
    }
  },

  // the gold panel: gold, creep score and the items the client lists (no prices, no shop advice)
  buy(post, s) {
    const L = s?.lol;
    if (!s || !L) return { label: 'Gold', value: '—', delta: null, sub: post.f.poll ? 'Loading' : 'No game', stale: true, items: [] };
    const items = L.items || [];
    const slot = (k) => items.find((x) => x.slot === k)?.name || null;
    return {
      label: 'Gold', value: gold(L.economy?.gold ?? s.player?.money), delta: null, stale: s.player?.fresh === false,
      sub: `CS ${L.economy?.cs ?? '—'} · level ${L.hero?.level ?? '—'}`,
      items: [0, 1, 2, 3, 4, 5].map((k) => ({ slot: `Slot ${k + 1}`, name: slot(k) })).concat([{ slot: 'Trinket', name: slot('trinket') }]),
    };
  },
};
