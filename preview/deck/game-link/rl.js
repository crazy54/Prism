// Game Link page config: Rocket League (/deck/game-link-rl.html). A fictional online 3v3 as the Stats API messages a
// player's game sends ({ Event, Data }; game-link/rl-match.json, 132 messages), replayed through prism-deck's own
// normalizer (normalizeRl + rlView, src/apps/sources/gamelink-rl.js) onto the Rocket League deck facet
// (gamelink-rl-deck, src/facets/gamelink/rl-deck.js) in its game skin.
// The shape is cs2.js's (see its header). Rocket League specifics:
//   - fairness: the Stats API withholds the other team's boost, and so does Prism: only ever our team's (the feed and the
//     boost panel say "withheld" for theirs)
//   - setup: nothing by hand: Prism's Connect sets the Stats API ini, then the game restarts once
//   - identities: player names are struck by value wherever a player ref carries them (a bare "Name" key would also
//     strike the team names); PrimaryId and MatchGuid by key

const mmss = (t) => (Number.isFinite(t) ? `${Math.floor(Math.max(0, t) / 60)}:${String(Math.floor(Math.max(0, t) % 60)).padStart(2, '0')}` : '—');
const PHASE = { kickoff: 'Kickoff', live: 'Live', goal: 'Goal', replay: 'Replay', overtime: 'Overtime', ended: 'Full time', podium: 'Full time' };
const game = (p) => p?.Data?.Game || null;
const players = (p) => (Array.isArray(p?.Data?.Players) ? p.Data.Players : []);
const ours = (p) => players(p).filter((x) => Number.isFinite(x.Boost));   // the cars the game reports boost for: our team's
const theirs = (p) => players(p).filter((x) => !Number.isFinite(x.Boost));

export default {
  id: 'rl',
  status: 'live',
  name: 'Rocket League',
  short: 'Rocket League',
  sides: { a: 'Blue', b: 'Orange' },
  fixture: 'game-link/rl-match.json',
  engine: { normalizer: 'src/apps/sources/gamelink-rl.js', facet: 'src/facets/gamelink/rl-deck.js', facetExport: null },
  normalize: (mod, payload, prev, nowMs) => mod.normalizeRl(payload, prev, { nowMs }),
  view: (mod, state, nowMs) => (state ? mod.rlView(state, nowMs) : null),
  facetParams: { skin: 'game' },
  labels: { replay: 'the Rocket League replay', fromStart: 'Replay from the kickoff' },
  chapterTag: (s) => (s?.rl?.clock ? `${s.rl.clock.overtime ? '+' : ''}${mmss(s.rl.clock.t)}` : null),

  timeline: {
    quietMs: 4000, jumpMs: 2200, jumpGapMs: Infinity, endHoldMs: 3500,
    holdAfter: { '120-StatfeedEvent': 4000 },   // let the MVP stand
    startAt: '000-MatchCreated',
    brightMs: 2200,
    strike: [], clear: [],
    // bright onsets (≥ 1 s apart in wall time, whatever the speed): goals, demolitions, the big saves, the crossbar, the end
    onset: ['goal', 'demo', 'epicSave', 'crossbar', 'matchEnd', 'mvp'],
    bright: ['save', 'kickoff', 'overtime'],
  },

  chapters: [
    { id: '003-CountdownBegin', label: 'Kickoff', sub: '3 · 2 · 1' },
    { id: '035-StatfeedEvent', label: 'Demolition', sub: 'by your team' },
    { id: '039-CrossbarHit', label: 'Crossbar', sub: 'a hard hit' },
    { id: '051-GoalScored', label: 'Goal', sub: 'yours · 108 km/h' },
    { id: '070-StatfeedEvent', label: 'Epic save', sub: 'off the line' },
    { id: '081-GoalScored', label: 'Goal against', sub: '1 : 1' },
    { id: '097-ClockUpdatedSeconds', label: 'Overtime', sub: 'next goal wins' },
    { id: '117-GoalScored', label: 'Golden goal', sub: '2 : 1' },
    { id: '120-StatfeedEvent', label: 'MVP', sub: 'your team' },
  ],
  captions: {
    '000-MatchCreated': ['LOADING', 'An online 3v3 is about to load. The deck waits.'],
    '003-CountdownBegin': ['KICKOFF', 'The kickoff countdown: 3 … 2 … 1.'],
    '024-StatfeedEvent': ['SAVE', 'Orange saves: their moment, announced to everyone.'],
    '035-StatfeedEvent': ['DEMOLITION', 'Your teammate demolishes an Orange car.'],
    '039-CrossbarHit': ['CROSSBAR', 'Off the crossbar: a hard hit.'],
    '051-GoalScored': ['GOAL', 'GOAL for Blue at 108 km/h: the deck floods your team’s color. 1 : 0.'],
    '060-GoalReplayEnd': ['REPLAY', 'The goal replay ends: back to the kickoff.'],
    '070-StatfeedEvent': ['EPIC SAVE', 'An epic save, off the line.'],
    '081-GoalScored': ['GOAL AGAINST', 'Orange scores: 1 : 1, 0:40 left.'],
    '096-ClockUpdatedSeconds': ['0:00', 'Time is up at 1 : 1. The ball must touch the ground.'],
    '097-ClockUpdatedSeconds': ['OVERTIME', 'Overtime: the next goal wins.'],
    '117-GoalScored': ['GOLDEN GOAL', 'Golden goal for Blue at 122 km/h: 2 : 1, the match is yours.'],
    '119-MatchEnded': ['VICTORY', 'Full time: victory.'],
    '120-StatfeedEvent': ['MVP', 'The MVP is on your team.'],
  },
  stillCaptions: {
    '051-GoalScored': 'A goal for Blue: the score key steps up. Still shows it as a state.',
    '117-GoalScored': 'The golden goal: 2 : 1, as plain numbers on the keys.',
  },
  fallbackCaption(s) {
    if (!s) return ['WAITING', 'No match: the deck waits for Rocket League.'];
    if (s.status === 'menu' || s.status === 'loading') return [s.status.toUpperCase(), 'No ball in play yet.'];
    const m = s.match, c = s.rl?.clock;
    return [String(PHASE[s.rl?.phase] || s.status || '').toUpperCase(), `${m?.title || 'The arena'} · ${c?.overtime ? '+' : ''}${mmss(c?.t)} · Blue ${s.rl?.scores?.blue ?? 0} : ${s.rl?.scores?.orange ?? 0} Orange`];
  },
  notes: {
    soft: 'Soft effects: capped brightness and a slowed rise, the plugin’s default.',
    full: 'Full effects: brighter peaks and a faster rise, still at most one bright onset a second and never a full red field.',
    calm: 'Calm motion: gentle, slower effects at a few frames a second.',
    still: 'Still: no motion and no flashes. Each moment is a static state on the keys.',
  },

  scoreboard(s) {
    const m = s?.match, R = s?.rl;
    if (!m) return null;
    const side = m.side === 'orange' ? 'b' : m.side === 'blue' ? 'a' : null;
    const c = R?.clock;
    const bottom = m.result === 'win' ? 'Victory' : m.result === 'loss' ? 'Defeat' : s.status === 'paused' ? 'Paused' : c?.overtime && R?.phase === 'live' ? 'Overtime' : PHASE[R?.phase] || 'Live';
    return { a: { label: 'Blue', score: R?.scores?.blue ?? 0 }, b: { label: 'Orange', score: R?.scores?.orange ?? 0 }, side, top: c ? `${c.overtime ? '+' : ''}${mmss(c.t)}` : '', bottom, map: m.title || null, mode: m.mode === 'online' ? 'Online 3v3' : m.mode || null, matchPoint: !!c?.overtime };
  },

  feed: {
    title: 'What Rocket League sent',
    unit: 'MSG',
    route: 'ws://127.0.0.1:49124 · Stats API',
    clock: (p) => (!p ? 'no message' : game(p) ? `${p.Event} · ${game(p).Arena || 'arena'} · ${mmss(game(p).TimeSeconds)}${game(p).bOvertime ? ' overtime' : ''}` : `${p.Event}`),
    fields: [
      { k: 'event', label: 'Message', path: 'Event', get: (p) => p?.Event, fmt: (v) => v.replace(/([a-z])([A-Z])/g, '$1 $2'), tone: (v) => (v === 'GoalScored' ? 'pos' : '') },
      { k: 'clock', label: 'Clock', path: 'Game.TimeSeconds', get: (p) => game(p)?.TimeSeconds, fmt: (v) => mmss(v), unit: (v, p) => (game(p).bOvertime ? 'overtime' : '') },
      { k: 'score', label: 'Score', path: 'Game.Teams[].Score', get: (p) => (game(p)?.Teams ? `${game(p).Teams[0]?.Score ?? 0}:${game(p).Teams[1]?.Score ?? 0}` : undefined), fmt: (v) => v.replace(':', ' : '), unit: () => 'Blue : Orange' },
      { k: 'boost', label: 'Our boost', path: 'Players[ours].Boost', get: (p) => (players(p).length ? ours(p).map((x) => x.Boost).join(' · ') || '—' : undefined), fmt: (v) => v, tone: () => 'a' },
      { k: 'theirs', label: 'Their boost', path: 'Players[theirs].Boost', get: (p) => (players(p).length ? 'withheld' : undefined), fmt: (v) => v, tone: () => 'quiet', unit: () => 'not sent' },
      { k: 'ball', label: 'Ball', path: 'Game.Ball.Speed', get: (p) => game(p)?.Ball?.Speed, fmt: (v) => String(Math.round(v)), unit: () => 'km/h' },
      { k: 'goal', label: 'Goal speed', path: 'GoalSpeed', get: (p) => (p?.Event === 'GoalScored' ? p.Data?.GoalSpeed : undefined), fmt: (v) => String(Math.round(v)), unit: () => 'km/h', tone: () => 'pos' },
      { k: 'statfeed', label: 'Stat feed', path: 'StatfeedEvent.EventName', get: (p) => (p?.Event === 'StatfeedEvent' ? p.Data?.EventName : undefined), fmt: (v) => v.replace(/([a-z])([A-Z])/g, '$1 $2') },
    ],
    events: {
      goal: (e) => `${e.team}${e.golden ? ' · golden' : ''} · ${Math.round(e.speed)} km/h`, demo: (e) => (e.ours ? 'by your team' : 'on your team'), save: (e) => (e.ours ? 'yours' : 'theirs'), epicSave: (e) => (e.ours ? 'yours' : 'theirs'),
      shot: (e) => (e.ours ? 'yours' : 'theirs'), assist: (e) => (e.ours ? 'yours' : 'theirs'), crossbar: (e) => `${Math.round(e.speed)} km/h`, matchEnd: (e) => `${e.result} · ${e.us} : ${e.them}`, mvp: (e) => (e.ours ? 'your team' : 'theirs'), context: (e) => e.value || '',
    },
    hot: new Set(['goal', 'demo', 'epicSave', 'save', 'crossbar', 'matchEnd', 'mvp', 'overtime']),
    quiet: () => 'No new event: the deck follows the values.',
    redact: /^(\s*)&quot;(PrimaryId|primaryId|MatchGuid|matchGuid)&quot;: (&quot;[^\n]*?&quot;)(,?)$/gm,
    // player names, wherever a player ref carries them (Players[], Scorer, Assister, MainTarget, BallLastTouch.Player …)
    identities: (p) => { const out = []; const walk = (o) => { if (!o || typeof o !== 'object') return; if (typeof o.Name === 'string' && ('Shortcut' in o || 'PrimaryId' in o)) out.push(o.Name); for (const v of Object.values(o)) walk(v); }; walk(p?.Data); return out; },
    dropNote: () => 'dropped at the edge',
    foot: 'Fictional match, invented values, the Stats API’s documented shapes. The deck never sees a player name or a platform id: Prism drops them the moment a message arrives.',
  },

  killfeed(e) {
    const tone = e.ours ? 'side' : 'b';
    switch (e.type) {
      case 'kickoff': return { glyph: 'flag', text: 'Kickoff', detail: '3 · 2 · 1', tone: 'side' };
      case 'goal': return { glyph: 'objective', text: e.ours ? (e.golden ? 'Golden goal' : 'Goal') : 'Goal against', detail: `${Math.round(e.speed)} km/h${e.self ? ' · yours' : ''}`, tone: e.ours ? 'pos' : 'b' };
      case 'shot': return { glyph: 'kill', text: 'Shot', detail: e.ours ? 'your team' : 'theirs', tone };
      case 'save': return { glyph: 'defuse', text: 'Save', detail: e.ours ? 'your team' : 'theirs', tone };
      case 'epicSave': return { glyph: 'defuse', text: 'Epic save', detail: e.ours ? 'your team' : 'theirs', tone: e.ours ? 'pos' : 'b' };
      case 'demo': return { glyph: 'death', text: 'Demolition', detail: e.ours ? 'by your team' : 'on your team', tone: e.ours ? 'side' : 'neg' };
      case 'assist': return { glyph: 'multi', text: 'Assist', detail: e.ours ? 'your team' : 'theirs', tone };
      case 'crossbar': return { glyph: 'flash', text: 'Crossbar', detail: `${Math.round(e.speed)} km/h`, tone: 'white' };
      case 'overtime': return { glyph: 'reload', text: 'Overtime', detail: 'next goal wins', tone: 'warn' };
      case 'matchEnd': return { glyph: 'flag', text: e.result === 'win' ? 'Victory' : e.result === 'loss' ? 'Defeat' : 'Full time', detail: `${e.us ?? '—'} : ${e.them ?? '—'}`, tone: e.result === 'win' ? 'pos' : 'dim' };
      case 'mvp': return { glyph: 'mvp', text: 'MVP', detail: e.ours ? 'your team' : 'theirs', tone: e.ours ? 'pos' : 'b' };
      default: return null;
    }
  },

  // the boost panel: our team's cars only — the other team's boost is withheld by the game, and by Prism
  buy(post, s) {
    const R = s?.rl;
    const mates = R?.mates || [];
    if (!s || !R) return { label: 'Team boost', value: '—', delta: null, sub: 'No match yet', stale: true, items: [] };
    const known = mates.filter((x) => Number.isFinite(x.boost));
    const avg = Number.isFinite(R.boost) ? R.boost : known.length ? Math.round(known.reduce((a, x) => a + x.boost, 0) / known.length) : null;
    return {
      label: Number.isFinite(R.boost) ? 'Your boost' : 'Team boost', value: avg === null ? '—' : String(avg), delta: null, stale: false,
      sub: Number.isFinite(R.boost) ? 'your car' : 'average · your team only',
      items: mates.slice(0, 3).map((x, i) => ({ slot: `Car ${i + 1}${x.self ? ' · you' : ''}`, name: x.demolished ? 'Demolished' : Number.isFinite(x.boost) ? `${x.boost}${x.supersonic ? ' · supersonic' : ''}` : null }))
        .concat([{ slot: 'Their team', name: 'Withheld by the game', dim: true }]),
    };
  },
};
