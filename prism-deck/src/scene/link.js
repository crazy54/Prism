// Linked state (API 1.6) — keys, dials and screens on one device that show or control the same
// thing agree: mute the mic on a key and the Galleon screen and the + strip say MUTED; push the
// screen's dial to go live and the On Air key lights; turn a volume dial and every volume readout follows.
//
// A facet declares what it mirrors with `link` (an object, or a function of the resolved params):
//
//   link: { 'mic.muted': { live: false, muted: true } }    its states mirror a shared value (state name → value)
//   link: { 'volume.level': 'value' }                      its dial value is the shared value (0–1)
//   link: (p) => p.controls === 'mic' ? { 'mic.muted': { on: false, muted: true } } : {}
//
// Channels are '<data key>.<field>' paths: the shared value reaches every facet that links the channel
// or lists its data key in `data`, as ctx.data.<key>.<field> (so 'mic.muted' → ctx.data.mic.muted).
// A channel without a field ('game') carries a whole object (game readouts: see readoutOf()).
//
// Runtimes keep one bus per device (the web player per DeckView, the plugin per physical device):
//   bus.publish(facet, params, { state, value })  after a press / turn: → the channels that changed
//   bus.stateOf(facet, params, state)              the state a linked slot must show now (null = its own)
//   bus.valueOf(facet, params)                     the dial value a linked slot must show now (null = its own)
//   bus.listens(facet, params, channels)           does a slot read any of these channels (repaint it)?
//   bus.data(facet, params, base)                  ctx.data with the channels merged in
//   bus.adopt(facet, params, { state, value })     a slot appears: take the bus's values, or publish its own
// Pure and DOM-free (no timers, no I/O); the bus is plain data, so renders stay deterministic for given inputs.

export const LINK_CHANNELS = Object.freeze(['mic.muted', 'camera.on', 'stream.live', 'volume.level', 'volume.muted', 'game']);

const resolved = (facet, params = {}) => {
  const out = {};
  for (const [k, p] of Object.entries(facet?.params || {})) out[k] = p?.default;
  return { ...out, ...(params || {}) };
};

/** The facet's links for these params → [{ channel, states?: { name: value }, value?: true }]. */
export function linksOf(facet, params) {
  if (!facet?.link) return [];
  let L = facet.link;
  if (typeof L === 'function') { try { L = L(resolved(facet, params)); } catch { return []; } }
  if (!L || typeof L !== 'object') return [];
  const out = [];
  for (const [channel, m] of Object.entries(L)) {
    if (m === 'value') out.push({ channel, value: true });
    else if (m && typeof m === 'object') out.push({ channel, states: m });
  }
  return out;
}

/** Problems with a facet's `link` declaration ([] = fine). Used by the facet schema. */
export function validateLink(f) {
  const errs = [];
  if (f.link === undefined) return errs;
  if (typeof f.link !== 'function' && (typeof f.link !== 'object' || f.link === null)) return ['link must be an object or a function of params'];
  let L = f.link;
  if (typeof L === 'function') { try { L = L(resolved(f, {})); } catch (e) { return [`link(params) threw: ${e.message}`]; } }
  for (const [ch, m] of Object.entries(L || {})) {
    if (!LINK_CHANNELS.includes(ch)) errs.push(`link channel "${ch}" is not one of ${LINK_CHANNELS.join(', ')}`);
    if (m === 'value') continue;
    if (!m || typeof m !== 'object') { errs.push(`link "${ch}" must map state names to values, or be 'value'`); continue; }
    for (const s of Object.keys(m)) if (!(f.states || []).includes(s)) errs.push(`link "${ch}" names state "${s}", which the facet does not have`);
  }
  return errs;
}

const split = (ch) => { const i = ch.indexOf('.'); return i < 0 ? [ch, null] : [ch.slice(0, i), ch.slice(i + 1)]; };
const same = (a, b) => a === b || (typeof a === 'object' && a && b && JSON.stringify(a) === JSON.stringify(b));

/** A game's readout for screens and strips (`game.readout(state, params)` → { title, cards: [{ title, value, sub, bar, hue, tone }] }). */
export function readoutOf(facet, state, params) {
  const fn = facet?.game?.readout;
  if (typeof fn !== 'function' || !state) return null;
  try {
    const r = fn(state, resolved(facet, params));
    if (!r || !Array.isArray(r.cards)) return null;
    return { id: facet.id, title: r.title || facet.title, cards: r.cards.slice(0, 4).map((c) => ({ ...c })) };
  } catch { return null; }
}

export function createLinkBus() {
  const vals = new Map();
  const subs = new Set();
  const bus = {
    /** Several runtimes may share one bus (a page with two devices): each hears what the others changed. → unsubscribe */
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
    notify(channels, origin) { if (channels?.length) for (const fn of [...subs]) fn(channels, origin); },
    get: (ch) => vals.get(ch),
    has: (ch) => vals.has(ch),
    /** Set one channel. → true when it changed. */
    set(ch, v) { if (vals.has(ch) && same(vals.get(ch), v)) return false; vals.set(ch, v); return true; },
    delete(ch) { return vals.delete(ch); },
    clear() { vals.clear(); },
    /** What a slot says about the shared state (its state / dial value) → the channels that changed. */
    publish(facet, params, { state = 0, value } = {}) {
      const out = [];
      for (const l of linksOf(facet, params)) {
        let v;
        if (l.value) { if (typeof value !== 'number' || !Number.isFinite(value)) continue; v = Math.round(value * 1e4) / 1e4; }
        else { const name = facet.states?.[state]; if (name === undefined || !Object.hasOwn(l.states, name)) continue; v = l.states[name]; }
        if (bus.set(l.channel, v)) out.push(l.channel);
      }
      return out;
    },
    /** The state index the slot must show for the bus (keeps its own state when that already agrees); null = the bus doesn't decide it. */
    stateOf(facet, params, state = 0) {
      let want = null;
      for (const l of linksOf(facet, params)) {
        if (!l.states || !vals.has(l.channel)) continue;
        const v = vals.get(l.channel), cur = facet.states?.[state];
        if (cur !== undefined && Object.hasOwn(l.states, cur) && same(l.states[cur], v)) return state;
        const name = Object.keys(l.states).find((s) => same(l.states[s], v));
        const i = name === undefined ? -1 : facet.states.indexOf(name);
        if (i >= 0 && want === null) want = i;
      }
      return want;
    },
    /** The dial value the slot must show for the bus; null = its own. */
    valueOf(facet, params) {
      for (const l of linksOf(facet, params)) if (l.value && typeof vals.get(l.channel) === 'number') return vals.get(l.channel);
      return null;
    },
    /** Does the slot read any of these channels (it links them, or lists their data key)? */
    listens(facet, params, channels) {
      if (!facet) return false;
      const own = new Set(linksOf(facet, params).map((l) => l.channel));
      const keys = new Set(facet.data || []);
      return channels.some((ch) => own.has(ch) || keys.has(split(ch)[0]));
    },
    /** ctx.data for the slot: base (live sources) with the bus's channels merged in (the bus wins: it is the user's latest action). */
    data(facet, params, base = {}) {
      if (!vals.size || !facet) return base;
      const own = new Set(linksOf(facet, params).map((l) => l.channel));
      const keys = new Set(facet.data || []);
      let out = base;
      for (const [ch, v] of vals) {
        const [key, field] = split(ch);
        if (!own.has(ch) && !keys.has(key)) continue;
        if (out === base) out = { ...base };
        if (field === null) out[key] = v;
        else out[key] = { ...(out[key] && typeof out[key] === 'object' ? out[key] : {}), [field]: v };
      }
      return out;
    },
    /** A slot appears: it takes the bus's values where the bus has them and publishes the rest. → { state, value, changed: [channels] } */
    adopt(facet, params, { state = 0, value } = {}) {
      const s = bus.stateOf(facet, params, state);
      const v = bus.valueOf(facet, params);
      const next = { state: s ?? state, value: v ?? value };
      return { ...next, changed: bus.publish(facet, params, next) };
    },
    snapshot: () => Object.fromEntries(vals),
    get size() { return vals.size; },
  };
  return bus;
}
