// Game Link pages — /deck/game-link.html (CS2), game-link-dota2.html, game-link-lol.html. One player for every game:
// <html data-game="cs2"> picks the config in game-link/<game>.js (the fixture, the engine modules, the moments, the
// feed), and a fictional match replays on virtual decks through the real engine:
//
//   game-link/<game>-match.json   the raw feed a live player receives (fictional values, real shapes)
//   cfg.normalize()               prism-deck's own normalizer (src/apps/sources/gamelink-<game>.js, browser-safe): each
//                                 post → ctx.data.gamelink v1, exactly what the plugin's listener produces
//   cfg.engine.facet              the whole-deck facet, drawn by prism-deck's browser runtime (src/web) in its game
//                                 skin: the same frames the plugin sends to the hardware
//
// A config with status 'coming' leaves the page as written (the plan); nothing loads.
//
// The replay clock is the facets' ctx.now: posts are normalized with nowMs on the replay timeline, so event ages,
// fades and pulses all follow play / pause / scrub / speed. Quiet stretches longer than quietMs are trimmed and time
// jumps (the fixtures' full-state resyncs) take jumpMs; everything else keeps the pace the game sent it at.
//
// Photosensitivity (same rules as the plugin): a gate before anything plays; Soft effects by default; Still when the
// system asks for reduced motion; never autoplay. A seek never lands inside a bright effect (it snaps to just before
// it, so the facets' rise slew always runs), and bright onsets stay ≥ 1 s apart in wall time, however fast someone
// clicks or scrubs.
const root = document.documentElement;
const GAME = /^[a-z0-9]{2,12}$/.test(root.dataset.game || '') ? root.dataset.game : 'cs2';
const byId = (id) => document.getElementById(id);
const site = window.PrismSite;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmtMoney = (n, sign = false) => (Number.isFinite(n) ? `${n < 0 ? '−' : sign ? '+' : ''}$${Math.abs(n).toLocaleString('en-US')}` : '—');
const mmss = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const reducedQuery = matchMedia('(prefers-reduced-motion: reduce)');
const ONSET_GAP_MS = 1000;   // ≥ 1 s between bright onsets in wall time

// Kill-feed glyphs: our own 16-unit line icons (no game art)
const G = (d, extra = '') => `<svg class="gl-kf-g" viewBox="0 0 16 16" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="square" stroke-linejoin="miter">${d}</g>${extra}</svg>`;
const GLYPH = {
  kill: G('<circle cx="8" cy="8" r="4.5"/><path d="M8 1v3M8 12v3M1 8h3M12 8h3"/>'),
  headshot: G('<path d="M3 3l3 3M13 3l-3 3M3 13l3-3M13 13l-3-3"/>', '<rect x="7" y="7" width="2" height="2" fill="currentColor"/>'),
  multi: G('<path d="M2 4l4 4-4 4M8 4l4 4-4 4"/>'),
  hurt: G('<path d="M6 2h4v4h4v4h-4v4H6v-4H2V6h4z"/>'),
  death: G('<path d="M3 3l10 10M13 3L3 13"/>'),
  flash: G('<circle cx="8" cy="8" r="2.5"/><path d="M8 1v2.5M8 12.5V15M1 8h2.5M12.5 8H15M3 3l1.8 1.8M11.2 11.2L13 13M13 3l-1.8 1.8M4.8 11.2L3 13"/>'),
  clear: G('<path d="M1.5 8C3.5 4.5 12.5 4.5 14.5 8 12.5 11.5 3.5 11.5 1.5 8z"/><circle cx="8" cy="8" r="2"/>'),
  defuse: G('<path d="M8 1.5l5.5 2v4c0 3.5-2.5 6-5.5 7-3-1-5.5-3.5-5.5-7v-4z"/><path d="M5.5 8l2 2 3-3.5"/>'),
  bomb: G('<circle cx="7" cy="9.5" r="4.5"/><path d="M10 6l2-2.5M13 1.5l.5.5M14.5 3.5h-1"/>'),
  flag: G('<path d="M3.5 15V1.5M3.5 2h9l-2 3 2 3h-9"/>'),
  money: G('<circle cx="8" cy="8" r="6.5"/><path d="M10.5 5.5H7a1.3 1.3 0 0 0 0 2.6h2a1.3 1.3 0 0 1 0 2.6H5.5M8 3.5v9"/>'),
  mvp: G('<path d="M8 1.5l1.9 4.1 4.4.5-3.3 3 .9 4.4L8 11.3l-3.9 2.2.9-4.4-3.3-3 4.4-.5z"/>'),
  swap: G('<path d="M2 5h10l-2.5-2.5M14 11H4l2.5 2.5"/>'),
  reload: G('<path d="M13 8a5 5 0 1 1-1.5-3.6M13 2v3h-3"/>'),
  level: G('<path d="M3 10l5-5 5 5M3 14l5-5 5 5"/>'),
  objective: G('<path d="M8 1.5 14.5 8 8 14.5 1.5 8z"/><path d="M8 5.5 10.5 8 8 10.5 5.5 8z"/>'),
};

const cfg = (await import(`./game-link/${GAME}.js`)).default;
if (cfg.status === 'live') await live(cfg);
else site?.tilesReady?.([]);

async function live(cfg) {
  const TL = cfg.timeline;
  // ── load: the engine (prism-deck), the match ──────────────────────────────────
  const engine = document.querySelector('meta[name="prism-engine"]')?.content || './engine/';
  const at = (rel) => new URL(rel, new URL(engine, location.href)).href;
  let web, schema, facetMod, norm, dev, match, viewMod;
  try {
    [web, schema, facetMod, norm, dev, match, viewMod] = await Promise.all([
      import(at('src/web/index.js')), import(at('src/facets/schema.js')), import(at(cfg.engine.facet)),
      import(at(cfg.engine.normalizer)), import(at('src/devices.js')),
      fetch(new URL(cfg.fixture, location.href)).then((r) => { if (!r.ok) throw new Error(`${cfg.fixture}: HTTP ${r.status}`); return r.json(); }),
      cfg.engine.view ? import(at(cfg.engine.view)) : null,   // the module of cfg.view when it isn't the normalizer's (Dota 2: gameLinkView)
    ]);
  } catch (err) {
    console.error('[game-link] the demo could not load:', err);
    byId('gate').innerHTML = '<div class="gl-gate-card"><p class="gl-gate-eyebrow">DEMO UNAVAILABLE</p><h2>The replay couldn’t load.</h2><p>The live engine didn’t load in this browser. Everything on this page still describes it; try a reload.</p></div>';
    throw err;
  }
  const exp = facetMod.default;
  const FACET = schema.normalizeFacet(Array.isArray(exp) ? exp.find((f) => f.id === cfg.engine.facetExport) || exp[0] : exp, cfg.engine.facet.replace(/^src\/facets\//, ''));

  // ── the replay: timeline + the real normalizer over every post ──────────────────
  const frames = match.frames;
  // the raw message of a frame: CS2 / Dota 2 posts are `payload`, LoL polls `poll` (cfg.payloadOf overrides)
  const pl = cfg.payloadOf || ((f) => f.payload ?? f.poll ?? f.message ?? null);
  let tl = 0;
  frames.forEach((f, i) => {
    if (i) { const gap = f.atMs - frames[i - 1].atMs; f.jump = gap > TL.jumpGapMs; tl += f.jump ? TL.jumpMs : Math.min(gap, TL.holdAfter?.[frames[i - 1].id] ?? TL.quietMs); }
    f.t = tl;
  });
  const posts = [];
  {
    let s = null;
    frames.forEach((f, i) => {
      const r = cfg.normalize(norm, pl(f), s, f.t);
      s = r.state;
      posts.push({ f, i, t: f.t, state: s, events: r.events });
      // a time-only post (e.g. CS2's flash-hold safety decay), as the plugin's timer would push it
      const next = frames[i + 1]?.t ?? Infinity, nt = cfg.tick ? cfg.tick(norm, s) : null;
      if (nt !== null && nt < next) { const k = cfg.ticked(norm, s, nt); if (k.events.length) { s = k.state; posts.push({ f, i, t: nt, state: s, events: k.events, tick: true }); } }
    });
  }
  const END = posts.at(-1).t + TL.endHoldMs;
  const postIndexAt = (T) => { let lo = 0, hi = posts.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (posts[mid].t <= T) lo = mid; else hi = mid - 1; } return lo; };
  const postById = (id) => posts.find((p) => p.f.id === id && !p.tick);
  const startT = postById(TL.startAt)?.t ?? 0;

  // Bright moments: strikes (→ their clear + the re-arm second) and the bright event types.
  const has = (p, types) => p.events.some((e) => types.includes(e.type));
  // the ≥ 1 s rule counts TL.onset (default: the strikes); a strike's bright window runs to its clear
  const strikes = posts.filter((p) => has(p, TL.onset ?? TL.strike)).map((p) => p.t);
  const bright = [];
  for (const p of posts) {
    if (TL.strike.length && has(p, TL.strike)) {
      const clear = posts.find((q) => q.t > p.t && has(q, TL.clear));
      bright.push([p.t, (clear ? clear.t : p.t + 5000) + 1200]);
    } else if (has(p, TL.bright) || (TL.onset && has(p, TL.onset))) bright.push([p.t, p.t + TL.brightMs]);
  }
  /** Where a seek really lands: never inside a bright effect (just before it instead). */
  const snapSeek = (T) => { for (const [a, b] of bright) if (T > a && T < b) return Math.max(0, a - 350); return T; };

  // ── chapters + captions ─────────────────────────────────────────────────────────
  const tagOf = (s) => (cfg.chapterTag ? cfg.chapterTag(s) : Number.isFinite(s?.round?.number) ? `R${s.round.number}` : null);
  const CHAPTERS = cfg.chapters.map((c, n) => { const p = postById(c.id); return p ? { ...c, n: n + 1, t: Math.max(0, p.t - (c.lead ?? 900)), tag: tagOf(p.state) } : null; }).filter(Boolean);
  const CAPTION_MS = 6500;
  function captionAt(T) {
    for (let i = postIndexAt(T); i >= 0; i--) {
      const p = posts[i];
      if (T - p.t > CAPTION_MS) break;
      const c = !p.tick && cfg.captions[p.f.id];
      if (c) return st.motion === 'still' && cfg.stillCaptions?.[p.f.id] ? [c[0], cfg.stillCaptions[p.f.id]] : c;
    }
    return cfg.fallbackCaption(posts[postIndexAt(T)].state);
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
  const gamelinkNow = () => cfg.view(viewMod || norm, posts[postIndexAt(st.T)].state, st.T);
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
        // the page pauses the devices itself while the stage is off-screen (stageObserver below). The decks wear the
        // facet's game skin, which is dark like the game's HUD: the device is the black edition in either page mode.
        model, width: Math.max(120, widths[i]), theme: 'prism', mode: 'dark', interactive: false, autoPause: false,
        facet: { facet: FACET, params: { effects: st.effects, ...cfg.facetParams } },
        data: () => ({ gamelink: gamelinkNow() }), now: () => st.T,
        reducedMotion: still, motion: st.motion === 'calm' ? 'calm' : 'full', fpsCap: st.motion === 'calm' ? 6 : 15,
        label: `${dev.DEVICES[model]?.name || model}, virtual, playing ${cfg.labels.replay}`,
      });
    });
    if (!st.playing || !stageVisible) for (const v of views) v.pause();
    box.style.setProperty('--gl-gap', `${gap}px`);
  }
  /** Rebuild after a settings / size change. Inside a bright effect the playhead steps back to its start, so a rebuild
   *  never cuts straight into a whiteout (the rise slew and the onset gap apply again). */
  function remount() { mountAll(); seekTo(st.T); }
  let stageVisible = true;
  new IntersectionObserver(([e]) => {
    stageVisible = e.isIntersecting;
    for (const v of views) { if (stageVisible && st.playing) v.play(); else v.pause(); }
  }, { rootMargin: '120px' }).observe(byId('stage'));
  const redraw = () => { for (const v of views) v.refresh(); };

  // ── the scoreboard over the stage, our side ─────────────────────────────────────────
  const player = byId('player');
  let lastSb = '';
  function renderScoreboard(s) {
    const sb = cfg.scoreboard?.(s);
    const key = JSON.stringify(sb);
    if (key === lastSb) return;
    lastSb = key;
    const el = byId('sb');
    el.hidden = !sb;
    player.dataset.side = sb?.side || '';
    if (!sb) return;
    byId('sb-a').textContent = sb.a.label; byId('sb-a-score').textContent = sb.a.score;
    byId('sb-b').textContent = sb.b.label; byId('sb-b-score').textContent = sb.b.score;
    byId('sb-top').textContent = sb.top; byId('sb-bottom').textContent = sb.bottom;
    el.querySelector('.gl-sb-a').classList.toggle('is-us', sb.side === 'a');
    el.querySelector('.gl-sb-b').classList.toggle('is-us', sb.side === 'b');
    el.classList.toggle('is-mp', !!sb.matchPoint);
    const where = byId('callout-map');
    if (where) where.textContent = [sb.map, sb.mode].filter(Boolean).join(' · ') || cfg.short;
    byId('sb-side').textContent = sb.side ? `You: ${sb[sb.side].label}` : '';
  }

  // ── the feed: what the game sent, what Prism heard ─────────────────────────────────
  const F = cfg.feed;
  const fieldsEl = byId('fields');
  fieldsEl.innerHTML = F.fields.map((f) => `<div class="gl-field" data-k="${f.k}"><dt>${esc(f.label)}</dt><dd><span class="gl-v"></span><span class="gl-u"></span></dd><span class="gl-path" title="${esc(f.path)}">${esc(f.path)}</span>${f.bar ? `<span class="gl-bar" aria-hidden="true" data-tone="${f.barTone || ''}"><i></i></span>` : ''}</div>`).join('');
  const fieldEls = new Map([...fieldsEl.children].map((el) => [el.dataset.k, el]));
  let feedAt = -1;
  function renderFeed(i) {
    if (i === feedAt) return;
    feedAt = i;
    // "changed" = changed in this post (against the post the game sent before it), wherever the playhead came from
    const post = posts[i], p = pl(post.f), prev = post.i > 0 ? pl(frames[post.i - 1]) : null;
    byId('feed-count').textContent = `${F.unit || 'POST'} ${post.i + 1} / ${frames.length} · ${mmss(post.f.atMs)}${post.tick ? ' · TIMER' : ''}`;
    byId('feed-count').title = `Received ${mmss(post.f.atMs)} into the session`;
    byId('feed-clock').textContent = F.clock(p);
    for (const f of F.fields) {
      const el = fieldEls.get(f.k), v = f.get(p), was = prev ? f.get(prev) : undefined;
      const absent = v === undefined || v === null && f.k !== 'bomb';
      el.classList.toggle('is-absent', absent);
      el.querySelector('.gl-v').textContent = absent ? '—' : f.fmt(v, p);
      el.querySelector('.gl-u').textContent = absent ? 'not sent' : f.unit?.(v, p) || '';
      el.dataset.tone = absent ? '' : f.tone?.(v, p) || '';
      if (f.bar) el.querySelector('.gl-bar i').style.width = `${absent ? 0 : Math.round(Math.max(0, Math.min(1, f.barOf ? f.barOf(v, p) : f.bar(v))) * 100)}%`;
      const changed = !!prev && JSON.stringify(v) !== JSON.stringify(was);
      el.classList.remove('is-new');
      if (changed) { void el.offsetWidth; el.classList.add('is-new'); }
    }
    renderKillfeed(i);
    renderBuy(post);
    renderScoreboard(post.state);
    if (byId('raw').open) renderRaw();
  }

  // the kill feed: Prism's events, newest on top — this post's highlighted, the last few before it dimmed
  const KF_ROWS = 6;
  function renderKillfeed(i) {
    const rows = [];
    for (let k = i; k >= 0 && rows.length < KF_ROWS; k--) {
      const post = posts[k];
      if (post.t < posts[i].t - 45000) break;
      const evs = post.events.filter((e) => e.type !== 'resync' && e.type !== 'context').slice().reverse();
      for (const e of evs) {
        if (rows.length >= KF_ROWS) break;
        const r = cfg.killfeed(e, post);
        rows.push({ e, r, now: k === i, at: post.f.atMs, d: F.events[e.type]?.(e) });
      }
    }
    const list = byId('events');
    if (!rows.length) { list.innerHTML = `<li class="is-quiet">${F.quiet(posts[i])}</li>`; return; }
    list.innerHTML = rows.map(({ e, r, now, at: when, d }) => {
      const hot = F.hot.has(e.type);
      if (!r) return `<li class="gl-kf is-plain${now ? ' is-now' : ''}"><span class="gl-kf-t">${mmss(when)}</span><code>${esc(e.type)}</code>${d ? `<span class="gl-kf-d">${esc(d)}</span>` : ''}</li>`;
      return `<li class="gl-kf${now ? ' is-now' : ''}${hot ? ' is-hot' : ''}" data-tone="${r.tone || ''}"><span class="gl-kf-t">${mmss(when)}</span>${GLYPH[r.glyph] || ''}<b>${esc(r.text)}</b>${r.detail ? `<span class="gl-kf-d">${esc(r.detail)}</span>` : ''}<code>${esc(e.type)}</code></li>`;
    }).join('');
    if (!posts[i].events.length) list.insertAdjacentHTML('afterbegin', `<li class="is-quiet">${F.quiet(posts[i])}</li>`);
  }

  // the buy panel (CS2): money in big numerals, the last buy or reward, what you carry
  function renderBuy(post) {
    const el = byId('buy');
    if (!el) return;
    const b = cfg.buy?.(post, post.state);
    el.hidden = !b;
    if (!b) return;
    if (byId('buy-label')) byId('buy-label').textContent = b.label || 'Money';
    byId('buy-money').textContent = b.value ?? fmtMoney(b.money);
    const d = byId('buy-delta');
    d.textContent = Number.isFinite(b.delta) ? fmtMoney(b.delta, true) : '';
    d.dataset.tone = b.delta > 0 ? 'pos' : b.delta < 0 ? 'neg' : '';
    byId('buy-equip').textContent = b.sub ?? (Number.isFinite(b.equip) ? `Loadout ${fmtMoney(b.equip)}` : b.stale ? 'Not your view: last known' : '');
    el.classList.toggle('is-stale', !!b.stale);
    byId('buy-items').innerHTML = b.items.map((it) => `<li class="${it.name && !it.dim ? 'is-owned' : it.dim ? 'is-dim' : ''}"><span>${esc(it.slot)}</span><b>${esc(it.name || '—')}</b>${it.value ? `<i>${esc(it.value)}</i>` : ''}</li>`).join('');
  }

  function renderRaw() {
    const p = pl(posts[Math.max(0, feedAt)].f);
    const json = esc(JSON.stringify(p, null, 2));
    let html = json
      .replace(F.redact, (all, sp, k, v, comma) => `${sp}<span class="is-dropped"><b>&quot;${k}&quot;</b>: ${v}${comma}</span><em>${F.dropNote(k)}</em>`)
      .replace(/^(\s*)&quot;([a-z0-9_]+)&quot;:/gim, '$1<b>&quot;$2&quot;</b>:');
    const ids = [...new Set((F.identities?.(p) || []).filter((x) => typeof x === 'string' && x.length > 1))].map((x) => `&quot;${esc(x)}&quot;`);
    if (ids.length) html = html.split('\n').map((ln) => (ln.includes('is-dropped') ? ln : ids.reduce((a, id) => a.split(id).join(`<span class="is-dropped">${id}</span>`), ln))).join('\n');
    byId('raw-json').innerHTML = html;
  }
  byId('raw').addEventListener('toggle', () => { if (byId('raw').open) renderRaw(); });

  // ── transport UI ──────────────────────────────────────────────────────────────────
  const seek = byId('seek'), playBtn = byId('play');
  seek.max = String(END);
  const pct = (T) => `${((T / END) * 100).toFixed(3)}%`;
  byId('marks').innerHTML = [
    ...posts.filter((p) => p.f.jump && !p.tick).map((p) => `<i class="gl-jump" style="left:${pct(p.t - TL.jumpMs / 2)}" title="Time skipped"></i>`),
    ...CHAPTERS.map((c) => `<i class="gl-mark" style="left:${pct(c.t + (c.lead ?? 900))}"></i>`),
  ].join('');
  const chaptersEl = byId('chapters');
  chaptersEl.innerHTML = CHAPTERS.map((c) => `<button type="button" class="gl-chap" data-n="${c.n}"><span class="gl-chap-no"><span>${String(c.n).padStart(2, '0')}</span>${c.tag ? `<span class="gl-chap-r">${esc(c.tag)}</span>` : ''}</span><span class="gl-chap-name">${esc(c.label)}</span><span class="gl-chap-sub">${esc(c.sub)}</span></button>`).join('');
  chaptersEl.style.setProperty('--chapters', String(Math.max(1, CHAPTERS.length)));
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
      playBtn.setAttribute('aria-label', st.playing ? 'Pause' : st.ended ? cfg.labels.fromStart : 'Play');
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
  function renderNote() { byId('opt-note').textContent = st.motion === 'full' ? cfg.notes[st.effects] : cfg.notes[st.motion]; }
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

  // ── boot: the poster (the start moment, Still) behind the gate ────────────────────────
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
  site?.tilesReady?.([byId('stage')]);

  // for tests and screenshots: the replay's state and controls (read-mostly; nothing here touches the network)
  window.__gameLink = {
    game: cfg.id,
    get T() { return st.T; }, get END() { return END; }, get playing() { return st.playing; }, get accepted() { return st.accepted; },
    get motion() { return st.motion; }, get effects() { return st.effects; }, get device() { return st.device; },
    chapters: CHAPTERS.map(({ id, label, t }) => ({ id, label, t })), posts: posts.length,
    post: () => { const p = posts[postIndexAt(st.T)]; return { id: p.f.id, status: p.state?.status, flashed: p.state?.player?.flashed ?? null, side: p.state?.match?.side ?? null, events: p.events.map((e) => e.type) }; },
    onsets: () => [...onsets], tOf: (id) => postById(id)?.t ?? null, seek: (T, snap = true) => seekTo(T, { snap }), pause, play, views: () => views.length,
  };
}
