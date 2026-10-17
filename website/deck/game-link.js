// Game Link demo — /deck/game-link.html. A fictional CS2 match replays on virtual decks through the real engine:
//
//   game-link/cs2-match.json   the Game State Integration posts a live player receives (fictional values, real
//                              CS2 shapes; prism-deck/test/fixtures/gamelink/cs2 + a synthesized final-round ACE)
//   normalizeCs2()             prism-deck's own normalizer (src/apps/sources/gamelink-cs2.js, browser-safe): each
//                              post → ctx.data.gamelink v1, exactly what the plugin's listener produces
//   gamelink-cs2-deck          the flagship deck facet, drawn by prism-deck's browser runtime (src/web): the same
//                              frames the plugin sends to the hardware
//
// The replay clock is the facets' ctx.now: posts are normalized with nowMs on the replay timeline, so event ages,
// the flash slew and the planted pulse all follow play / pause / scrub / speed. Quiet stretches longer than
// QUIET_MS are trimmed and time jumps (the fixtures' full-state resyncs) take JUMP_MS; everything else keeps the
// pace CS2 sent it at.
//
// Photosensitivity (same rules as the plugin): a gate before anything plays; Soft effects by default; Still when
// the system asks for reduced motion; never autoplay. A seek never lands inside a bright effect (it snaps to just
// before it, so the facets' rise slew always runs), and bright onsets stay ≥ 1 s apart in wall time, however fast
// someone clicks or scrubs.
const root = document.documentElement;
const byId = (id) => document.getElementById(id);
const site = window.PrismSite;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmtMoney = (n) => (Number.isFinite(n) ? `$${n.toLocaleString('en-US')}` : '—');
const mmss = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const reducedQuery = matchMedia('(prefers-reduced-motion: reduce)');
const pageMode = () => (site?.mode?.() === 'day' || root.dataset.rfMode === 'day' ? 'light' : 'dark');

const QUIET_MS = 4000, JUMP_MS = 2200, JUMP_GAP_MS = 60000, END_HOLD_MS = 3500;
const HOLD_AFTER = { '36-gameover-win': 9000 };        // let the final scoreboard stand
const START_AT = '03-freezetime';                       // the playhead starts at round 7's buy time
const BRIGHT_MS = 2600;                                  // a bright effect's window (seeks snap to just before it)
const ONSET_GAP_MS = 1000;                               // ≥ 1 s between bright onsets in wall time

// ── load: the engine (prism-deck), the match ──────────────────────────────────
const engine = document.querySelector('meta[name="prism-engine"]')?.content || './engine/';
const at = (rel) => new URL(rel, new URL(engine, location.href)).href;
let web, schema, deckMod, cs2, dev, match;
try {
  [web, schema, deckMod, cs2, dev, match] = await Promise.all([
    import(at('src/web/index.js')), import(at('src/facets/schema.js')), import(at('src/facets/gamelink/deck.js')),
    import(at('src/apps/sources/gamelink-cs2.js')), import(at('src/devices.js')),
    fetch(new URL('game-link/cs2-match.json', location.href)).then((r) => { if (!r.ok) throw new Error(`cs2-match.json: HTTP ${r.status}`); return r.json(); }),
  ]);
} catch (err) {
  console.error('[game-link] the demo could not load:', err);
  byId('gate').innerHTML = '<div class="gl-gate-card"><p class="gl-gate-eyebrow">DEMO UNAVAILABLE</p><h2>The replay couldn’t load.</h2><p>The live engine didn’t load in this browser. Everything on this page still describes it; try a reload.</p></div>';
  throw err;
}
const FACET = schema.normalizeFacet(deckMod.default, 'gamelink/deck.js');

// ── the replay: timeline + the real normalizer over every post ──────────────────
const frames = match.frames;
let tl = 0;
frames.forEach((f, i) => {
  if (i) { const gap = f.atMs - frames[i - 1].atMs; f.jump = gap > JUMP_GAP_MS; tl += f.jump ? JUMP_MS : Math.min(gap, HOLD_AFTER[frames[i - 1].id] ?? QUIET_MS); }
  f.t = tl;
});
const posts = [];
{
  let s = null;
  frames.forEach((f, i) => {
    const r = cs2.normalizeCs2(f.payload, s, { nowMs: f.t });
    s = r.state;
    posts.push({ f, i, t: f.t, state: s, events: r.events });
    // the flash hold's safety decay (a stuck stream): a time-only post, as the plugin's timer would push it
    const next = frames[i + 1]?.t ?? Infinity, nt = cs2.cs2NextTick(s);
    if (nt !== null && nt < next) { const k = cs2.tickCs2(s, nt); if (k.events.length) { s = k.state; posts.push({ f, i, t: nt, state: s, events: k.events, tick: true }); } }
  });
}
const END = posts.at(-1).t + END_HOLD_MS;
const postIndexAt = (T) => { let lo = 0, hi = posts.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (posts[mid].t <= T) lo = mid; else hi = mid - 1; } return lo; };
const postById = (id) => posts.find((p) => p.f.id === id && !p.tick);
const startT = postById(START_AT)?.t ?? 0;

// Bright moments: flash (strike → clear + the re-arm second), multi-kills, round won / lost, defuse / detonation, death.
const has = (p, types) => p.events.some((e) => types.includes(e.type));
const strikes = posts.filter((p) => has(p, ['flashOnset', 'flashFull'])).map((p) => p.t);
const bright = [];
for (const p of posts) {
  if (has(p, ['flashOnset', 'flashFull'])) {
    const clear = posts.find((q) => q.t > p.t && has(q, ['flashClear']));
    bright.push([p.t, (clear ? clear.t : p.t + 5000) + 1200]);
  } else if (has(p, ['multiKill', 'roundWon', 'roundLost', 'bombDefused', 'bombExploded', 'death', 'gameover', 'kill', 'hurt'])) bright.push([p.t, p.t + BRIGHT_MS]);
}
/** Where a seek really lands: never inside a bright effect (just before it instead). */
const snapSeek = (T) => { for (const [a, b] of bright) if (T > a && T < b) return Math.max(0, a - 350); return T; };

// ── chapters + captions ─────────────────────────────────────────────────────────
const CHAPTERS = [
  { id: '07-hurt', label: 'Damage', sub: '−27 HP' },
  { id: '08-flash-onset', label: 'Flashbang', sub: 'flashed 255' },
  { id: '15-kill', label: 'Headshot', sub: 'kill, then a double', lead: 700 },
  { id: '20-bomb-planted', label: 'Bomb planted', sub: 'no timer' },
  { id: '22-round-win-defuse', label: 'Defused', sub: 'round won' },
  { id: '25-hurt-heavy', label: 'Death', sub: '→ spectating' },
  { id: '35a-final-kill-1', label: 'Multi-kill', sub: '2K · 3K · 4K', lead: 900 },
  { id: '36-gameover-win', label: 'ACE', sub: 'wins the match', lead: 1100 },
].map((c, n) => { const p = postById(c.id); return p ? { ...c, n: n + 1, t: Math.max(0, p.t - (c.lead ?? 900)) } : null; }).filter(Boolean);

const CAPTIONS = {
  '00-main-menu': ['MENU', 'In the main menu: the deck waits, dark, and invents nothing.'],
  '01-map-loading': ['LOADING', 'Loading into a competitive match on Inferno.'],
  '02-warmup': ['WARMUP', 'Warmup: no round yet.'],
  '03-freezetime': ['BUY TIME', 'Round 7, freeze time. The deck breathes and the money key says Buy.'],
  '04-buy-rifle-armor': ['BUY', 'An M4A1-S, armor and a helmet: −$3,900.'],
  '05-buy-kit-flash': ['BUY', 'A defuse kit and a flashbang: −$600.'],
  '06-round-live': ['ROUND LIVE', 'Round 7 is live. Your health is the lit span of the Spectrum.'],
  '07-hurt': ['DAMAGE', 'Hit for 27: shards fly out from the center, as far as the damage reaches.'],
  '08-flash-onset': ['FLASHBANG', 'Flashed: 255. The whole deck floods white…'],
  '09-flash-fade-1': ['FLASHBANG', '…and disperses into the Spectrum as the game lets the flash fade.'],
  '14-flash-clear': ['CLEAR', 'flashed is back to 0: your sight, and the deck, return.'],
  '15-kill': ['KILL', 'A kill: a spectral burst on the kill counter and a ring of light across the deck.'],
  '16-kill-headshot': ['HEADSHOT · 2K', 'A headshot double: white rings, sharper rays, a crosshair that snaps shut.'],
  '17-reload-start': ['RELOAD', 'Low ammo, reloading.'],
  '20-bomb-planted': ['PLANTED', 'Bomb planted: a steady pulse at a fixed beat. Players get no bomb timer from CS2, so Prism doesn’t invent one.'],
  '22-round-win-defuse': ['DEFUSED · WON', 'Defused, round won: a cool burst, then a sweep of light. And the MVP.'],
  '23-freezetime-round8': ['ROUND 8', 'Round 8, freeze time.'],
  '24-round8-live': ['ROUND LIVE', 'Round 8 is live.'],
  '25-hurt-heavy': ['DAMAGE', 'Hit for 62: the shards reach the edges.'],
  '26-death': ['DEAD', 'Dead. The glass cracks from the middle of the deck.'],
  '27-spectating-teammate': ['SPECTATING', 'Watching a teammate: the deck dims and keeps your last numbers, never theirs.'],
  '28-spectating-teammate-flashed': ['NOT YOU', 'Your teammate is flashed (240). Not you, so your deck stays dark.'],
  '29-round-loss': ['ROUND LOST', 'Round lost: a cool fade.'],
  '30-round-over-no-player': ['BETWEEN', 'Between rounds: this post carries no player at all.'],
  '31-halftime': ['HALFTIME', 'Halftime: sides swap.'],
  '32-second-half-freezetime': ['SIDE SWAP', 'Second half: now on T, money reset.'],
  '33-round23-over': ['ROUND 23', 'Fifteen minutes later: 12 : 11.'],
  '34-match-point': ['MATCH POINT', 'Match point: one round to win it.'],
  '35-final-round-live': ['FINAL ROUND', 'The last round is live.'],
  '35a-final-kill-1': ['1K', 'One…'],
  '35b-final-kill-2-headshot': ['2K · HEADSHOT', 'Two, a headshot…'],
  '35c-final-hurt': ['DAMAGE', 'Hit for 36…'],
  '35d-final-kill-3': ['3K', 'Three…'],
  '35e-final-reload': ['RELOAD', 'Reloading…'],
  '35g-final-kill-4-headshot': ['4K · HEADSHOT', 'Four…'],
  '36-gameover-win': ['ACE · VICTORY', 'ACE. The fifth kill wins the match 13 : 11: the Spectrum floods the deck, then the final scoreboard.'],
  '37-back-to-menu': ['MENU', 'Back to the menu. GG.'],
};
// Still shows each moment as a static state: say what the keys show instead of the light that isn't there
const STILL_CAPTIONS = {
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
};
const CAPTION_MS = 6500;
const PHASE = { freezetime: 'FREEZE TIME', live: 'LIVE', over: 'ROUND OVER' };
function captionAt(T) {
  for (let i = postIndexAt(T); i >= 0; i--) {
    const p = posts[i];
    if (T - p.t > CAPTION_MS) break;
    const c = !p.tick && CAPTIONS[p.f.id];
    if (c) return st.motion === 'still' && STILL_CAPTIONS[p.f.id] ? [c[0], STILL_CAPTIONS[p.f.id]] : c;
  }
  const s = posts[postIndexAt(T)].state, m = s?.match;
  if (!s || !m) return ['REPLAY', 'A fictional competitive match on Inferno, as CS2 would send it to a player.'];
  const tag = s.status === 'spectating' ? 'SPECTATING' : m.phase === 'gameover' ? 'GAMEOVER' : PHASE[s.round?.phase] || String(m.phase || '').toUpperCase();
  return [tag, `Round ${s.round?.number ?? (m.ct ?? 0) + (m.t ?? 0) + 1} · ${m.title || 'Inferno'} · you ${m.us ?? '—'} : ${m.them ?? '—'}${s.round?.bomb === 'planted' ? ' · bomb planted' : ''}`];
}

// ── settings ──────────────────────────────────────────────────────────────────
const DEVICE_KEY = 'prism-deck-device';
const DEVICES = [['pair', 'Galleon + Stream Deck +'], ['galleon', 'Galleon 100 SD'], ['plus', 'Stream Deck +'], ['mk2', 'MK.2'], ['xl', 'XL'], ['mini', 'Mini']].filter(([k]) => k === 'pair' || dev.DEVICES[k]);
const recall = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const remember = (k, v) => { try { localStorage.setItem(k, v); } catch { /* optional */ } };
const st = {
  device: DEVICES.some(([k]) => k === recall(DEVICE_KEY)) ? recall(DEVICE_KEY) : 'pair',
  effects: 'soft',
  motion: reducedQuery.matches ? 'still' : 'full',
  motionChosen: false,
  accepted: false,
  playing: false, ended: false, speed: 1,
  T: startT,
  holdUntil: 0, lastOnsetWall: -Infinity,
};

// ── devices ─────────────────────────────────────────────────────────────────────
const box = byId('devices');
let views = [];
const gamelinkNow = () => cs2.gameLinkView(posts[postIndexAt(st.T)].state, st.T);
function mountAll() {
  for (const v of views) v.destroy();
  views = [];
  box.replaceChildren();
  const models = st.device === 'pair' ? ['galleon', 'plus'] : [st.device];
  const cs = getComputedStyle(box), px = (k) => parseFloat(cs[k]) || 0;
  const W = (box.clientWidth || 600) - px('paddingLeft') - px('paddingRight');
  const H = Math.max(240, (box.clientHeight || 420) - px('paddingTop') - px('paddingBottom'));
  const ratios = models.map((m) => { const L = dev.deviceLayout(m); return L.w / L.h; });
  const stack = models.length > 1 && W < 600;
  box.classList.toggle('is-stack', stack);
  const gap = W < 760 ? 16 : 32;
  const widths = stack
    ? ratios.map((r) => Math.floor(Math.min(W, (r < 1 ? 330 : 300) * r, r < 1 ? W * 0.62 : W)))
    // phones: the stage grows to the device (a tall Galleon stays readable); wider: everything fits the stage
    : (() => { const h = Math.min(W < 600 ? 440 : H, (W - gap * (models.length - 1)) / ratios.reduce((a, r) => a + r, 0)); return ratios.map((r) => Math.floor(h * r)); })();
  const still = st.motion === 'still' || !st.accepted;
  views = models.map((model, i) => {
    const slot = document.createElement('div');
    slot.className = 'gl-slot';
    box.append(slot);
    return web.mountDevice(slot, {
      // autoPause off: a rebuilt device draws its first frame at once (never a blank deck that then lights up);
      // the page pauses the devices itself while the stage is off-screen (stageObserver below)
      model, width: Math.max(120, widths[i]), theme: 'prism', mode: pageMode(), interactive: false, autoPause: false,
      facet: { facet: FACET, params: { effects: st.effects, layout: 'scene' } },
      data: () => ({ gamelink: gamelinkNow() }), now: () => st.T,
      reducedMotion: still, motion: st.motion === 'calm' ? 'calm' : 'full', fpsCap: st.motion === 'calm' ? 6 : 15,
      label: `${dev.DEVICES[model]?.name || model}, virtual, playing the CS2 replay`,
    });
  });
  if (!st.playing || !stageVisible) for (const v of views) v.pause();
  box.style.setProperty('--gl-gap', `${gap}px`);
}
/** Rebuild after a settings / size / mode change. Inside a bright effect the playhead steps back to its start, so a
 *  rebuild never cuts straight into a whiteout (the rise slew and the onset gap apply again). */
function remount() { mountAll(); seekTo(st.T); }
let stageVisible = true;
new IntersectionObserver(([e]) => {
  stageVisible = e.isIntersecting;
  for (const v of views) { if (stageVisible && st.playing) v.play(); else v.pause(); }
}, { rootMargin: '120px' }).observe(byId('stage'));
const redraw = () => { for (const v of views) v.refresh(); };

// ── the feed: what CS2 sent, what Prism heard ─────────────────────────────────────
const activeWeapon = (p) => Object.values(p?.player?.weapons || {}).find((w) => w.state === 'active' || w.state === 'reloading') || null;
const WEAPON = { m4a1_silencer: 'M4A1-S', ak47: 'AK-47', usp_silencer: 'USP-S', glock: 'Glock-18', knife: 'Knife', knife_t: 'Knife' };
const FIELDS = [
  { k: 'health', label: 'Health', path: 'player.state.health', get: (p) => p.player?.state?.health, fmt: (v) => String(v), tone: (v) => (v <= 0 ? 'crit' : v < 40 ? 'warn' : '') },
  { k: 'flashed', label: 'Flashed', path: 'player.state.flashed', get: (p) => p.player?.state?.flashed, fmt: (v) => `${v}`, unit: () => '/ 255', bar: (v) => v / 255 },
  { k: 'phase', label: 'Round phase', path: 'round.phase', get: (p) => p.round?.phase, fmt: (v) => v },
  { k: 'bomb', label: 'Bomb', path: 'round.bomb', get: (p) => (p.round ? p.round.bomb ?? null : undefined), fmt: (v) => v ?? 'none', tone: (v) => (v === 'planted' ? 'warn' : v === 'defused' ? 'pos' : v ? '' : 'quiet'), unit: (v) => (v === 'planted' ? 'no timer' : '') },
  { k: 'kills', label: 'Round kills', path: 'player.state.round_kills', get: (p) => p.player?.state?.round_kills, fmt: (v) => String(v), unit: (v, p) => (p.player?.state?.round_killhs ? `${p.player.state.round_killhs} HS` : '') },
  { k: 'money', label: 'Money', path: 'player.state.money', get: (p) => p.player?.state?.money, fmt: fmtMoney },
  { k: 'ammo', label: 'Ammo', path: 'weapons.*.ammo_clip', get: (p) => { const w = activeWeapon(p); return w ? (Number.isFinite(w.ammo_clip) ? `${w.ammo_clip}/${w.ammo_clip_max}` : '—') : undefined; }, fmt: (v) => v, unit: (v, p) => { const w = activeWeapon(p); if (!w) return ''; const n = w.name.replace(/^weapon_/, ''); return w.state === 'reloading' ? 'reloading' : WEAPON[n] || n; } },
  { k: 'who', label: 'Whose view', path: 'player.steamid', get: (p) => (p.player?.steamid ? (p.player.steamid === p.provider?.steamid ? 'yours' : 'teammate') : undefined), fmt: (v) => (v === 'yours' ? 'Yours' : 'Teammate'), tone: (v) => (v === 'teammate' ? 'warn' : ''), unit: (v) => (v === 'yours' ? '= provider' : '≠ provider') },
];
const fieldsEl = byId('fields');
fieldsEl.innerHTML = FIELDS.map((f) => `<div class="gl-field" data-k="${f.k}"><dt>${esc(f.label)}</dt><dd><span class="gl-v"></span><span class="gl-u"></span></dd><span class="gl-path" title="${esc(f.path)}">${esc(f.path)}</span>${f.bar ? '<span class="gl-bar" aria-hidden="true"><i></i></span>' : ''}</div>`).join('');
const fieldEls = new Map([...fieldsEl.children].map((el) => [el.dataset.k, el]));

const EV = {
  hurt: (e) => `−${e.damage} HP`, kill: (e) => (e.headshot ? 'headshot' : `#${e.roundKills ?? ''}`), multiKill: (e) => e.label, flashOnset: (e) => `strength ${(+e.strength).toFixed(2)}`,
  flashClear: (e) => (e.timeout ? 'safety decay' : `peak ${(+e.peak).toFixed(2)}`), money: (e) => `${e.delta > 0 ? '+' : '−'}$${Math.abs(e.delta).toLocaleString('en-US')}`,
  roundWon: (e) => e.reason || '', roundLost: (e) => e.reason || '', context: (e) => e.value || '', mapPhase: (e) => e.value || '', gameover: (e) => e.result || '',
  resync: () => 'full state: re-baselined, no effects', weaponSwitch: (e) => String(e.weapon || '').replace(/^weapon_/, ''), sideSwap: (e) => `${e.from || ''} → ${e.to || ''}`, matchJoined: (e) => e.map || '',
};
const HOT = new Set(['hurt', 'death', 'flashOnset', 'flashFull', 'kill', 'multiKill', 'bombPlanted', 'bombDefused', 'bombExploded', 'roundWon', 'roundLost', 'gameover', 'mvp', 'matchPoint']);
let feedAt = -1;
function renderFeed(i) {
  if (i === feedAt) return;
  feedAt = i;
  // "changed" = changed in this post (against the post CS2 sent before it), wherever the playhead came from
  const post = posts[i], p = post.f.payload, prev = post.i > 0 ? frames[post.i - 1].payload : null;
  byId('feed-count').textContent = `POST ${post.i + 1} / ${frames.length} · ${mmss(post.f.atMs)}${post.tick ? ' · TIMER' : ''}`;
  byId('feed-count').title = `Received ${mmss(post.f.atMs)} into the session`;
  const m = p.map;
  byId('feed-clock').textContent = m ? `${m.name} · CT ${m.team_ct?.score ?? 0} : ${m.team_t?.score ?? 0} T · map.phase ${m.phase}` : 'no map block: not in a match';
  for (const f of FIELDS) {
    const el = fieldEls.get(f.k), v = f.get(p), was = prev ? f.get(prev) : undefined;
    const absent = v === undefined;
    el.classList.toggle('is-absent', absent);
    el.querySelector('.gl-v').textContent = absent ? '—' : f.fmt(v, p);
    el.querySelector('.gl-u').textContent = absent ? 'not sent' : f.unit?.(v, p) || '';
    el.querySelector('.gl-path').textContent = f.path;
    el.dataset.tone = absent ? '' : f.tone?.(v) || '';
    if (f.bar) el.querySelector('.gl-bar i').style.width = `${absent ? 0 : Math.round(f.bar(v) * 100)}%`;
    const changed = !!prev && JSON.stringify(v) !== JSON.stringify(was);
    el.classList.remove('is-new');
    if (changed) { void el.offsetWidth; el.classList.add('is-new'); }
  }
  const evs = post.events.filter((e) => e.type !== 'resync' || post.events.length === 1);
  byId('events').innerHTML = evs.length
    ? evs.map((e) => { const d = EV[e.type]?.(e); return `<li class="${HOT.has(e.type) ? 'is-hot' : ''}"><code>${esc(e.type)}</code>${d ? `<span>${esc(d)}</span>` : ''}</li>`; }).join('')
    : `<li class="is-quiet">${post.f.id.includes('flash-fade') ? 'No event: the whiteout follows <code>flashed</code> as it falls.' : post.f.id.includes('heartbeat') ? 'A heartbeat: nothing changed, so nothing redraws.' : 'No new event: the deck follows the values.'}</li>`;
  if (byId('raw').open) renderRaw();
}
function renderRaw() {
  const p = posts[Math.max(0, feedAt)].f.payload;
  const json = esc(JSON.stringify(p, null, 2));
  byId('raw-json').innerHTML = json
    .replace(/^(\s*)&quot;(steamid|name|token)&quot;: (&quot;[^\n]*?&quot;)(,?)$/gm, (all, sp, k, v, comma) => `${sp}<span class="is-dropped"><b>&quot;${k}&quot;</b>: ${v}${comma}</span><em>${k === 'token' ? 'checked, then dropped' : 'dropped at the edge'}</em>`)
    .replace(/^(\s*)&quot;([a-z0-9_]+)&quot;:/gim, '$1<b>&quot;$2&quot;</b>:');
}
byId('raw').addEventListener('toggle', () => { if (byId('raw').open) renderRaw(); });

// ── transport UI ──────────────────────────────────────────────────────────────────
const seek = byId('seek'), playBtn = byId('play');
seek.max = String(END);
const pct = (T) => `${((T / END) * 100).toFixed(3)}%`;
byId('marks').innerHTML = [
  ...posts.filter((p) => p.f.jump && !p.tick).map((p) => `<i class="gl-jump" style="left:${pct(p.t - JUMP_MS / 2)}" title="Time skipped"></i>`),
  ...CHAPTERS.map((c) => `<i class="gl-mark" style="left:${pct(c.t + (c.lead ?? 900))}"></i>`),
].join('');
const chaptersEl = byId('chapters');
chaptersEl.innerHTML = CHAPTERS.map((c) => `<button type="button" class="gl-chap" data-n="${c.n}"><span class="gl-chap-no">${String(c.n).padStart(2, '0')}</span><span class="gl-chap-name">${esc(c.label)}</span><span class="gl-chap-sub">${esc(c.sub)}</span></button>`).join('');
const chapButtons = [...chaptersEl.children];
let lastUi = { sec: -1, fill: '', chap: -2, cap: '' };
function renderTransport(force = false) {
  const sec = Math.floor(st.T / 1000);
  if (force || sec !== lastUi.sec) { lastUi.sec = sec; byId('time').innerHTML = `${mmss(st.T)} <span>/ ${mmss(END)}</span>`; seek.setAttribute('aria-valuetext', `${mmss(st.T)} of ${mmss(END)}`); }
  if (!dragging) seek.value = String(Math.round(st.T));
  const fill = pct(st.T);
  if (fill !== lastUi.fill) { lastUi.fill = fill; byId('fill').style.width = fill; }
  let ci = -1;
  for (let k = 0; k < CHAPTERS.length; k++) if (CHAPTERS[k].t <= st.T + 1 && st.T < CHAPTERS[k].t + 16000) ci = k;
  if (ci !== lastUi.chap) { lastUi.chap = ci; chapButtons.forEach((b, k) => { if (k === ci) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current'); }); }
  const [tag, text] = captionAt(st.T);
  if (tag + text !== lastUi.cap) {
    lastUi.cap = tag + text;
    byId('caption-tag').textContent = tag;
    byId('caption-text').textContent = text;
    const cap = byId('caption');
    cap.classList.remove('is-new'); void cap.offsetWidth; cap.classList.add('is-new');
  }
  const icon = st.playing ? 'pause' : st.ended ? 'replay' : 'play';
  if (playBtn.dataset.icon !== icon) {
    playBtn.dataset.icon = icon;
    playBtn.innerHTML = `<svg class="ic" aria-hidden="true"><use href="#i-${icon}"/></svg>`;
    playBtn.setAttribute('aria-label', st.playing ? 'Pause' : st.ended ? 'Replay from round 7' : 'Play');
  }
  root.dataset.motion = st.playing ? 'playing' : 'paused';
}
function sync(force = false) {
  const i = postIndexAt(st.T);
  if (i !== feedAt) { renderFeed(i); redraw(); }
  else if (force) redraw();
  renderTransport(force);
}

// ── the clock ─────────────────────────────────────────────────────────────────────
let raf = 0, lastWall = 0;
const onsets = [];   // wall times of the bright onsets that played (tests: always ≥ ONSET_GAP_MS apart)
function frame(now) {
  raf = 0;
  if (!st.playing) return;
  const dt = Math.min(250, now - lastWall);
  lastWall = now;
  if (now >= st.holdUntil) {
    const T0 = st.T, T1 = Math.min(END, st.T + dt * st.speed);
    // a bright onset is about to play: keep ≥ 1 s (wall) since the last one, however the playhead got here
    const strike = strikes.find((t) => t > T0 && t <= T1);
    if (strike !== undefined && now - st.lastOnsetWall < ONSET_GAP_MS) st.holdUntil = st.lastOnsetWall + ONSET_GAP_MS;
    else {
      if (strike !== undefined) { st.lastOnsetWall = now; onsets.push(Math.round(now)); if (onsets.length > 32) onsets.shift(); }
      st.T = T1;
      if (st.T >= END) { st.playing = false; st.ended = true; for (const v of views) v.pause(); }
    }
  }
  sync();
  if (st.playing) raf = requestAnimationFrame(frame);
}
function play() {
  if (!st.accepted) return;
  if (st.ended || st.T >= END) { st.T = startT; st.ended = false; feedAt = -1; }
  st.playing = true;
  if (stageVisible) for (const v of views) v.play();
  lastWall = performance.now();
  if (!raf) raf = requestAnimationFrame(frame);
  sync(true);
}
function pause() { st.playing = false; for (const v of views) v.pause(); sync(); }
/** Jump the playhead (snapped out of bright effects). A jump right after a bright onset waits out its second. */
function seekTo(T, { snap = true } = {}) {
  const now = performance.now();
  st.T = Math.min(END, Math.max(0, snap ? snapSeek(T) : T));
  st.ended = st.T >= END;
  if (now - st.lastOnsetWall < ONSET_GAP_MS) st.holdUntil = st.lastOnsetWall + ONSET_GAP_MS;
  sync(true);
}

playBtn.addEventListener('click', () => (st.playing ? pause() : play()));
let dragging = false;
seek.addEventListener('pointerdown', () => { dragging = true; byId('stage').classList.add('is-scrubbing'); });
seek.addEventListener('input', () => {
  // while scrubbing, the deck holds (no flashes from dragging across a moment); the time and the feed follow
  const T = Number(seek.value);
  byId('time').innerHTML = `${mmss(T)} <span>/ ${mmss(END)}</span>`;
  byId('fill').style.width = pct(T);
  renderFeed(postIndexAt(T));
  if (!dragging) seekTo(T);
});
const endDrag = () => { if (!dragging) return; dragging = false; byId('stage').classList.remove('is-scrubbing'); seekTo(Number(seek.value)); };
seek.addEventListener('pointerup', endDrag); seek.addEventListener('pointercancel', endDrag); seek.addEventListener('change', endDrag);
chaptersEl.addEventListener('click', (e) => {
  const b = e.target.closest('[data-n]');
  if (!b) return;
  const c = CHAPTERS.find((x) => x.n === Number(b.dataset.n));
  seekTo(c.t, { snap: false });
  if (!st.playing) play();
});
byId('speed').addEventListener('click', (e) => {
  const b = e.target.closest('[data-v]');
  if (!b) return;
  st.speed = Number(b.dataset.v);
  for (const x of byId('speed').children) x.setAttribute('aria-pressed', String(x === b));
});

// ── options ───────────────────────────────────────────────────────────────────────
const deviceSeg = byId('device-seg');
deviceSeg.innerHTML = DEVICES.map(([k, label]) => `<button type="button" data-v="${k}" aria-pressed="${k === st.device}">${esc(label)}</button>`).join('');
deviceSeg.addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (!b || b.dataset.v === st.device) return; st.device = b.dataset.v; remember(DEVICE_KEY, st.device); pressed(deviceSeg, st.device); remount(); });
const pressed = (seg, v) => { for (const x of seg.children) x.setAttribute('aria-pressed', String(x.dataset.v === v)); };
const NOTES = {
  soft: 'Soft effects: capped brightness and a slowed rise, the plugin’s default.',
  full: 'Full effects: brighter peaks and a faster rise, still at most one bright flash a second and never a full red field.',
  calm: 'Calm motion: gentle, slower effects at a few frames a second.',
  still: 'Still: no motion and no flashes. Each moment is a static state on the keys: Flashed, Planted, Dead.',
};
function renderNote() { byId('opt-note').textContent = st.motion === 'full' ? NOTES[st.effects] : NOTES[st.motion]; }
byId('effects-seg').addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (!b || b.dataset.v === st.effects) return; st.effects = b.dataset.v; pressed(byId('effects-seg'), st.effects); renderNote(); remount(); });
function setMotion(m, chosen = true) {
  if (chosen) st.motionChosen = true;
  st.motion = m; pressed(byId('motion-seg'), m); renderNote(); remount();
}
byId('motion-seg').addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (b && b.dataset.v !== st.motion) setMotion(b.dataset.v); });
reducedQuery.addEventListener?.('change', () => { if (!st.motionChosen) setMotion(reducedQuery.matches ? 'still' : 'full', false); syncGate(); });

// ── the gate: nothing plays (and nothing flashes) before a choice ──────────────────────
function syncGate() {
  const rm = reducedQuery.matches;
  byId('gate-play-label').textContent = rm ? 'Play the match (Still)' : 'Play the match';
  byId('gate-still-label').textContent = rm ? 'Play with gentle motion (Calm)' : 'Play without flashes';
  byId('gate-note').textContent = rm ? 'Your system asks for reduced motion, so the replay starts Still: no motion and no flashes. Calm adds slow, gentle effects.' : 'You can switch to Still (no motion, no flashes) or Calm at any time, under the replay.';
}
syncGate();
function accept(motion) {
  st.accepted = true;
  byId('gate').hidden = true;
  byId('controls').inert = false;
  byId('stage').classList.add('is-live');
  if (motion !== st.motion) { st.motion = motion; st.motionChosen = true; pressed(byId('motion-seg'), motion); renderNote(); }
  mountAll();
  play();
  playBtn.focus({ preventScroll: true });
}
byId('gate-play').addEventListener('click', () => accept(st.motion));
byId('gate-still').addEventListener('click', () => accept(reducedQuery.matches ? 'calm' : 'still'));

// ── boot: the poster (round 7's buy time, Still) behind the gate ────────────────────────
pressed(byId('motion-seg'), st.motion);
renderNote();
mountAll();
sync(true);
let resizeTimer, lastSize = `${box.clientWidth}x${box.clientHeight}`;
new ResizeObserver(() => {
  const size = `${box.clientWidth}x${box.clientHeight}`;
  if (size === lastSize) return;
  lastSize = size; clearTimeout(resizeTimer); resizeTimer = setTimeout(remount, 160);
}).observe(box);
site?.onMode?.(remount);
site?.tilesReady?.([byId('stage')]);

// for tests and screenshots: the replay's state and controls (read-mostly; nothing here touches the network)
window.__gameLink = {
  get T() { return st.T; }, get END() { return END; }, get playing() { return st.playing; }, get accepted() { return st.accepted; },
  get motion() { return st.motion; }, get effects() { return st.effects; }, get device() { return st.device; },
  chapters: CHAPTERS.map(({ id, label, t }) => ({ id, label, t })), posts: posts.length,
  post: () => { const p = posts[postIndexAt(st.T)]; return { id: p.f.id, status: p.state?.status, flashed: p.state?.player?.flashed ?? null, events: p.events.map((e) => e.type) }; },
  onsets: () => [...onsets], tOf: (id) => postById(id)?.t ?? null, seek: (T, snap = true) => seekTo(T, { snap }), pause, play, views: () => views.length,
};
