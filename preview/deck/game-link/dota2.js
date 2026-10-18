// Game Link page config: Dota 2 (/deck/game-link-dota2.html). A fictional match as the Game State Integration posts a
// live player receives (game-link/dota2-match.json: a Radiant Juggernaut, 37 posts), replayed through prism-deck's own
// normalizer (normalizeDota2, src/apps/sources/gamelink-dota2.js) and the listener's view (gameLinkView, as the plugin
// does) onto the shared MOBA deck facet (gamelink-moba-deck, src/facets/gamelink/moba-deck.js) in its Dota 2 skin.
// The shape is cs2.js's (see its header). Dota 2 specifics:
//   - cooldowns, the respawn and the buyback are the game's own numbers for OUR hero (the HUD shows them); never an
//     enemy's, and no Roshan timer
//   - the raw view strikes the Steam id, account id, player name, match id and auth token (dropped at the edge)
//   - Dota 2 posts only with the -gamestateintegration launch option (Valve, 2022-03-11): the page says so

const mmss = (t) => { if (!Number.isFinite(t)) return '—'; const a = Math.abs(Math.trunc(t)); return `${t < 0 ? '−' : ''}${Math.floor(a / 60)}:${String(a % 60).padStart(2, '0')}`; };
const gold = (n) => (Number.isFinite(n) ? Math.floor(n).toLocaleString('en-US') : '—');
// the game's own names where the ids are abbreviations (the rest: the id, tidied)
const NAMES = { tpscroll: 'Town Portal Scroll', bfury: 'Battle Fury', omni_slash: 'Omnislash', blade_fury: 'Blade Fury', manta: 'Manta Style', phase_boots: 'Phase Boots', ward_observer: 'Observer Ward', ward_sentry: 'Sentry Ward', smoke_of_deceit: 'Smoke of Deceit', aegis: 'Aegis of the Immortal' };
const title = (id) => { const k = String(id || '').replace(/^(item_|npc_dota_hero_|juggernaut_)/, ''); return NAMES[k] || k.split('_').filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' '); };
const PHASE = { draft: 'Hero selection', strategy: 'Strategy', pregame: 'Pre-game', live: 'Live', post: 'Game over' };
const STATUS = ['stunned', 'silenced', 'hexed', 'disarmed', 'muted', 'break', 'magicimmune'];
const MULTI = { double: 'Double kill', triple: 'Triple kill', ultra: 'Ultra kill', rampage: 'Rampage' };
const STREAK = { 'killing-spree': 'Killing spree', dominating: 'Dominating', 'mega-kill': 'Mega kill', unstoppable: 'Unstoppable', 'wicked-sick': 'Wicked sick', 'monster-kill': 'Monster kill', godlike: 'Godlike', 'beyond-godlike': 'Beyond godlike' };
const OBJECTIVE = { roshan: 'Roshan', aegis: 'Aegis', tormentor: 'Tormentor', tower: 'Tower', barracks: 'Barracks' };

export default {
  id: 'dota2',
  status: 'live',
  name: 'Dota 2',
  short: 'Dota 2',
  sides: { a: 'Radiant', b: 'Dire' },
  fixture: 'game-link/dota2-match.json',
  engine: { normalizer: 'src/apps/sources/gamelink-dota2.js', view: 'src/apps/sources/gamelink-cs2.js', facet: 'src/facets/gamelink/moba-deck.js', facetExport: 'gamelink-moba-deck' },
  normalize: (mod, payload, prev, nowMs) => mod.normalizeDota2(payload, prev, { nowMs }),
  view: (mod, state, nowMs) => (state ? mod.gameLinkView(state, nowMs) : null),
  facetParams: { skin: 'game' },
  labels: { replay: 'the Dota 2 replay', fromStart: 'Replay from the pre-game' },
  chapterTag: (s) => (s?.dota2?.clock ? mmss(s.dota2.clock.t) : null),

  timeline: {
    quietMs: 3000, jumpMs: 2200, jumpGapMs: Infinity, endHoldMs: 3500,
    holdAfter: { '35-win': 7000 },   // let the victory stand
    startAt: '03-pre-game',
    brightMs: 2200,
    strike: [], clear: [],
    // bright onsets (≥ 1 s apart in wall time, whatever the speed): kills, multi-kills, objectives, the end
    onset: ['kill', 'multiKill', 'firstBlood', 'ace', 'death', 'objective', 'gameover'],
    bright: ['respawn', 'ultReady', 'levelUp'],
  },

  chapters: [
    { id: '09-first-blood', label: 'First blood', sub: 'yours' },
    { id: '12-hexed', label: 'Hexed', sub: 'the keys lock' },
    { id: '19-death', label: 'Death', sub: 'respawn · buyback' },
    { id: '22-buyback', label: 'Buyback', sub: 'back in the fight' },
    { id: '23-roshan', label: 'Roshan', sub: 'then the Aegis' },
    { id: '28-kill-4', label: 'Multi-kill', sub: 'double · triple · ultra', lead: 1200 },
    { id: '31-kill-7', label: 'Rampage', sub: 'five in a row', lead: 900 },
    { id: '35-win', label: 'Victory', sub: 'the Dire ancient falls', lead: 900 },
  ],
  captions: {
    '00-dashboard': ['DASHBOARD', 'In the dashboard: the deck waits, dark, and invents nothing.'],
    '01-hero-selection': ['HERO SELECTION', 'Hero selection, on Radiant with your starting gold.'],
    '02-strategy': ['STRATEGY', 'Strategy time: Juggernaut is picked.'],
    '03-pre-game': ['PRE-GAME', 'Pre-game, night before the horn: your abilities and starting items land on the keys.'],
    '04-horn': ['THE HORN', 'The horn: 0:00, the first dawn.'],
    '05-laning': ['LANING', 'Laning: Blade Fury on cooldown, the sweep running from the game’s own number.'],
    '06-laning-cd': ['COOLDOWN', 'Eleven seconds later the game says 13: the sweep follows the HUD, never a guess.'],
    '07-night': ['NIGHT', 'Night falls at 5:00: the deck’s light shifts.'],
    '08-level-6': ['LEVEL 6', 'Level 6: Omnislash learned, ready at once.'],
    '09-first-blood': ['FIRST BLOOD', 'First blood is yours: 1 : 0 to the Radiant, Omnislash spent.'],
    '10-silenced': ['SILENCED', 'Silenced: the ability keys lock; items stay usable.'],
    '11-silence-ends': ['CLEAR', 'The silence ends.'],
    '12-hexed': ['HEXED', 'Hexed: abilities and items lock.'],
    '13-hex-ends': ['CLEAR', 'The hex ends.'],
    '14-ult-ready': ['ULTIMATE READY', 'Omnislash comes off cooldown.'],
    '15-day': ['DAY', 'Day at 10:00.'],
    '16-smoked': ['SMOKED', 'A Smoke of Deceit: the deck goes hazy.'],
    '17-smoke-gank': ['SMOKE GANK', 'The gank: a kill breaks the smoke.'],
    '18-stunned': ['STUNNED', 'Stunned and burst to 22 % health.'],
    '19-death': ['DEAD', 'Down: the respawn countdown your HUD shows fills the keys; buyback is ready.'],
    '20-respawn-33': ['RESPAWN', 'The countdown is the game’s own number: 33…'],
    '21-respawn-32': ['RESPAWN', '…32.'],
    '22-buyback': ['BUYBACK', 'Buyback: light rises, and you’re back in the fight.'],
    '23-roshan': ['ROSHAN', 'Roshan falls to the Radiant, announced to all ten players. No Roshan timer: the game shows none.'],
    '24-aegis': ['AEGIS', 'You pick up the Aegis: a gold glow while you carry it.'],
    '25-tower-lost': ['TOWER LOST', 'Your tier-1 bottom tower falls.'],
    '26-omnislash': ['TEAMFIGHT', 'The teamfight: Omnislash cast.'],
    '27-kill-3': ['KILL', 'A kill…'],
    '28-kill-4': ['DOUBLE KILL', 'Double kill…'],
    '29-kill-5': ['TRIPLE KILL', 'Triple kill…'],
    '30-kill-6': ['ULTRA KILL', 'Ultra kill…'],
    '31-kill-7': ['RAMPAGE', 'RAMPAGE: the deck floods with gold.'],
    '32-cooldowns': ['COOLDOWNS', 'After the fight: Omnislash and Manta count down as the HUD does.'],
    '33-level-16': ['LEVEL 16', 'Level 16.'],
    '34-ult-ready': ['ULTIMATE READY', 'Omnislash ready again.'],
    '35-win': ['VICTORY', 'The Dire ancient falls: victory, 31 : 14.'],
    '36-back-to-dashboard': ['DASHBOARD', 'Back to the dashboard. GG.'],
  },
  stillCaptions: {
    '09-first-blood': 'First blood: the K / D / A key steps up. Still shows it as a state.',
    '19-death': 'Down: the respawn number the game sends, as plain numbers on the keys.',
    '31-kill-7': 'Rampage: the K / D / A key steps up, no flood.',
    '35-win': 'Victory: the match key says so.',
  },
  fallbackCaption(s) {
    if (!s) return ['WAITING', 'No game: the deck waits for Dota 2.'];
    if (s.status === 'menu') return ['DASHBOARD', 'In the dashboard: nothing to show.'];
    const m = s.match, c = s.dota2?.clock;
    return [String(PHASE[s.dota2?.phase] || s.status || '').toUpperCase(), `${s.dota2?.hero?.name || 'Your hero'} · ${mmss(c?.t)} · Radiant ${m?.side === 'dire' ? m?.them ?? '—' : m?.us ?? '—'} : ${m?.side === 'dire' ? m?.us ?? '—' : m?.them ?? '—'} Dire`];
  },
  notes: {
    soft: 'Soft effects: capped brightness and a slowed rise, the plugin’s default.',
    full: 'Full effects: brighter peaks and a faster rise, still at most one bright onset a second and never a full red field.',
    calm: 'Calm motion: gentle, slower effects at a few frames a second.',
    still: 'Still: no motion and no flashes. Each moment is a static state on the keys.',
  },

  scoreboard(s) {
    const m = s?.match, D = s?.dota2;
    if (!m) return null;
    const ours = m.side === 'dire' ? 'b' : m.side === 'radiant' ? 'a' : null;
    const radiant = ours === 'b' ? m.them : m.us, dire = ours === 'b' ? m.us : m.them;
    const dead = s.player && s.player.alive === false && Number.isFinite(D?.hero?.respawnIn);
    const bottom = m.result === 'win' ? 'Victory' : m.result === 'loss' ? 'Defeat' : D?.clock?.paused ? 'Paused' : dead ? `Respawn ${Math.ceil(D.hero.respawnIn)} s` : D?.phase === 'live' ? (D?.clock?.daytime === false ? 'Night' : 'Day') : PHASE[D?.phase] || '';
    return { a: { label: 'Radiant', score: radiant ?? 0 }, b: { label: 'Dire', score: dire ?? 0 }, side: ours, top: D?.clock ? mmss(D.clock.t) : PHASE[D?.phase] || '', bottom, map: D?.hero?.name || null, mode: Number.isFinite(D?.hero?.level) ? `level ${D.hero.level}` : null, matchPoint: false };
  },

  feed: {
    title: 'What Dota 2 sent',
    route: 'POST 127.0.0.1:38140/v1/dota2',
    clock: (p) => (!p?.map ? 'no map block: the dashboard' : `${String(p.map.game_state || '').replace('DOTA_GAMERULES_STATE_', '').toLowerCase()} · clock ${mmss(p.map.clock_time)} · Radiant ${p.map.radiant_score ?? 0} : ${p.map.dire_score ?? 0} Dire`),
    fields: [
      { k: 'clock', label: 'Game clock', path: 'map.clock_time', get: (p) => p?.map?.clock_time, fmt: (v) => mmss(v), unit: (v, p) => (p.map.daytime === false ? 'night' : p.map.daytime ? 'day' : '') },
      { k: 'health', label: 'Health', path: 'hero.health', get: (p) => p?.hero?.health, fmt: (v) => String(v), unit: (v, p) => `/ ${p.hero.max_health ?? 0}`, tone: (v, p) => (v <= 0 ? 'crit' : (p.hero.health_percent ?? 100) < 30 ? 'warn' : ''), bar: (v) => v, barOf: (v, p) => v / (p.hero.max_health || 1) },
      { k: 'mana', label: 'Mana', path: 'hero.mana', get: (p) => p?.hero?.mana, fmt: (v) => String(v), unit: (v, p) => `/ ${p.hero.max_mana ?? 0}`, bar: (v) => v, barOf: (v, p) => v / (p.hero.max_mana || 1) },
      { k: 'gold', label: 'Gold', path: 'player.gold', get: (p) => p?.player?.gold, fmt: (v) => gold(v), unit: (v, p) => (Number.isFinite(p.player.gpm) ? `${p.player.gpm} GPM` : '') },
      { k: 'level', label: 'Level', path: 'hero.level', get: (p) => p?.hero?.level, fmt: (v) => String(v), unit: (v, p) => (p.hero.alive === false ? `dead · ${p.hero.respawn_seconds} s` : '') },
      { k: 'kda', label: 'Your K / D / A', path: 'player.kills', get: (p) => (p?.player && Number.isFinite(p.player.kills) ? `${p.player.kills}/${p.player.deaths}/${p.player.assists}` : undefined), fmt: (v) => v, unit: (v, p) => `${p.player.last_hits ?? 0} LH` },
      { k: 'status', label: 'Status', path: 'hero.stunned …', get: (p) => (p?.hero && 'stunned' in p.hero ? STATUS.filter((k) => p.hero[k] === true)[0] || 'clear' : undefined), fmt: (v) => v, tone: (v) => (v === 'clear' ? 'quiet' : 'warn'), unit: (v, p) => (p.hero.smoked ? 'smoked' : '') },
      { k: 'team', label: 'Your team', path: 'player.team_name', get: (p) => p?.player?.team_name, fmt: (v) => v, tone: (v) => (v === 'radiant' ? 'a' : v === 'dire' ? 'b' : '') },
    ],
    events: {
      kill: (e) => (e.label ? STREAK[e.label] || e.label : `streak ${e.streak ?? 1}`), death: () => 'you died', multiKill: (e) => e.label || '', firstBlood: (e) => (e.ours ? 'your team' : 'the enemy'),
      objective: (e) => `${e.name}${e.kind ? ` · ${e.kind}` : ''}${e.ours ? ' · ours' : ' · theirs'}`, levelUp: (e) => `level ${e.level}`, ultReady: (e) => title(e.name),
      buybackReady: (e) => `${e.cost} gold`, respawn: (e) => (e.buyback ? 'bought back' : 'respawned'), gameover: (e) => `${e.result} · ${e.us} : ${e.them}`, context: (e) => e.value || '',
    },
    hot: new Set(['kill', 'death', 'multiKill', 'firstBlood', 'ace', 'objective', 'gameover', 'buybackReady']),
    quiet: (post) => (!post.f.payload?.map ? 'The dashboard: no match, nothing to show.' : 'No new event: the deck follows the values.'),
    redact: /^(\s*)&quot;(steamid|accountid|matchid|token)&quot;: (&quot;[^\n]*?&quot;)(,?)$/gm,
    identities: (p) => [p?.player?.name],
    dropNote: (k) => (k === 'token' ? 'checked, then dropped' : 'dropped at the edge'),
    foot: 'Fictional match, invented values, real Dota 2 shapes. The deck never sees a Steam ID, an account id or a name: Prism drops them the moment a post arrives.',
  },

  killfeed(e) {
    switch (e.type) {
      case 'kill': return { glyph: 'kill', text: 'You', detail: e.label ? STREAK[e.label] || 'Kill' : 'Kill', tone: 'side' };
      case 'death': return { glyph: 'death', text: 'You', detail: 'Down', tone: 'neg' };
      case 'multiKill': return { glyph: 'multi', text: MULTI[e.label] || `${e.count} kills`, detail: '', tone: 'side' };
      case 'firstBlood': return { glyph: 'flag', text: 'First blood', detail: e.ours ? 'yours' : 'the enemy', tone: e.ours ? 'pos' : 'neg' };
      case 'ace': return { glyph: 'mvp', text: 'Team wipe', detail: e.ours ? 'your team' : 'the enemy', tone: e.ours ? 'pos' : 'neg' };
      case 'objective': return { glyph: 'objective', text: OBJECTIVE[e.name] || title(e.name), detail: `${e.ours ? 'ours' : 'theirs'}${e.kind ? ` · ${String(e.kind).replace('tier', 'tier ')}` : ''}`, tone: e.ours ? 'side' : 'b' };
      case 'buybackReady': return { glyph: 'money', text: 'Buyback ready', detail: `${gold(e.cost)} gold`, tone: 'warn' };
      case 'respawn': return { glyph: 'reload', text: e.buyback ? 'Buyback' : 'Respawn', detail: e.buyback ? 'back in the fight' : 'the fountain', tone: 'side' };
      case 'levelUp': return { glyph: 'level', text: `Level ${e.level}`, detail: '', tone: 'side' };
      case 'ultReady': return { glyph: 'mvp', text: 'Ultimate ready', detail: title(e.name), tone: 'side' };
      case 'gameover': return { glyph: 'flag', text: e.result === 'win' ? 'Victory' : e.result === 'loss' ? 'Defeat' : 'Game over', detail: `${e.us ?? '—'} : ${e.them ?? '—'}`, tone: e.result === 'win' ? 'pos' : 'dim' };
      default: return null;
    }
  },

  // the gold panel: gold, GPM and last hits, the items as the game lists them (no prices, no build advice)
  buy(post, s) {
    const D = s?.dota2;
    if (!s || !D?.economy) return { label: 'Gold', value: '—', delta: null, sub: post.f.payload?.map ? 'No hero yet' : 'The dashboard', stale: true, items: [] };
    const items = D.items || [];
    const slot = (k) => { const it = items.find((x) => x.slot === k); return it ? title(it.name) : null; };
    return {
      label: 'Gold', value: gold(D.economy.gold ?? s.player?.money), delta: null, stale: s.player?.fresh === false,
      sub: `${D.economy.gpm ?? '—'} GPM · ${D.economy.lastHits ?? '—'} LH${D.aegis ? ' · Aegis' : ''}`,
      items: [0, 1, 2, 3, 4, 5].map((k) => ({ slot: `Slot ${k + 1}`, name: slot(k) })).concat([{ slot: 'Teleport', name: slot('tp') }, { slot: 'Neutral', name: slot('neutral') }]),
    };
  },
};
