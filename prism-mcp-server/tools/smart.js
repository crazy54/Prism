// Prism SMART DECK preference tools: tell Prism Control's Smart Deck what you like ("camera on the left dial", "big
// icons", "never show titles on stream", "keep Undo on that key in VS Code") through its "smart" named pipe
// (utils/smart-pipe-client.js; prism-control/src/PrismControl.Smart/Control). Consent layers, all enforced by Prism
// Control:
//   1. the user switched "Allow AI preferences" on (no discovery file otherwise → unreachable; we never try to turn it on),
//   2. the user approved this assistant by HOLDING the glowing top-left Smart Key on a physical deck for 1.5 s
//      (smart_pair; Stream Deck Mobile, the Virtual Stream Deck and the MCP Deck can never approve),
//   3. every change is validated, undoable (50 steps) and audited; override bindings are keyboard chords only.
//   4. (smart-fix) the approval creates a per-pairing secret: the approved smart_pair poll returns it once, this module
//      keeps it in memory per client (never in a tool result, never logged) and sends it with every call;
//   5. (smart-fix) a binding change is only a PROPOSAL: it is "pending your approval on the deck" (the Smart Key shows
//      REVIEW) until the user holds that key or presses Approve; Alt+F4, Win-key, Ctrl+Alt+Del, Ctrl+Shift+Esc and
//      Print Screen chords can never be proposed; an assistant only makes things stricter and never turns streamer-safe off.
// Nothing here sends input, runs a verb, presses keys, installs a profile or touches other plugins.
// Handlers receive ctx.smartControl (SmartPipeClient).

import { SmartChannelError } from '../utils/smart-pipe-client.js';

const HINTS = {
  unreachable: 'The Smart Deck channel is off. Only the user can switch on "Allow AI preferences" (Stream Deck app → a Smart Key → property inspector → AI preferences). Do not try to enable it.',
  ai_off: 'The user switched "Allow AI preferences" off. Ask them to switch it on if they want this; never try to enable it yourself.',
  not_paired: 'Call smart_pair, tell the user the 4-digit code, and wait until they press and hold the glowing top-left Smart Key on their deck (1.5 s, until its ring is full).',
  no_physical_key: 'No Smart Key is visible on a physical deck. Ask the user to show their Prism Smart profile on a real device (Stream Deck Mobile, the Virtual Stream Deck and the MCP Deck cannot approve).',
  rate_limited: 'Wait data.retryAfterMs, then retry. Batch preference changes into one smart_set_pref call.',
  changed_since: 'The user changed their preferences after that AI change. Ask them before calling smart_undo with force: true.',
  nothing_to_undo: 'There are no AI changes left to undo.',
  not_allowed: 'That field or binding can never be set by an assistant (only labels, glyphs, priority, category, stricter safety and keyboard-chord binding proposals; never Alt+F4, Windows-key, Ctrl+Alt+Del, Ctrl+Shift+Esc or Print Screen chords; streamer-safe can never be turned off).',
  invalid_override: 'The pack would not validate with that change; nothing was written. See data.problems.',
  safe_mode: 'Prism Control runs in safe mode (a test host): override files are never written; dryRun works.',
  timeout: 'Prism Control did not answer; it may be busy or restarting. Check smart_status.',
  pairing_pending: 'Another pairing request is waiting for the user. Wait for it to be approved, denied or to expire (2 min) before asking again.',
};

/** Said with every proposal: the user approves it on the deck, never the assistant. */
const PENDING = 'pending your approval on the deck';
const PENDING_TELL = (list) => `I proposed ${list.map((p) => `${p.chord} for ${p.id || p.verb}`).join(', ')}. ${list.length > 1 ? 'They are' : 'It is'} ${PENDING}: the Smart Key shows REVIEW. Hold that key for 1.5 s (it shows the new key) or press Approve in the Smart Key settings. Until then the old key runs, and an approved AI key always needs a hold to run.`;

const DEVICE_KINDS = ['galleon-100-sd', 'stream-deck-plus', 'stream-deck-plus-xl', 'stream-deck', 'stream-deck-xl', 'stream-deck-mini', 'stream-deck-neo'];
const DIAL = { type: ['string', 'null'], enum: ['left', 'right', '0', '1', '2', '3', 'auto', null], description: 'left | right | a dial index 0–3 | auto/null (back to the app layout)' };
const SLOT = {
  kind: { type: 'string', enum: ['key', 'dial'], default: 'key' },
  x: { type: 'integer', minimum: 0, maximum: 15, description: 'key: column (0 = left); dial: dial index (0 = left)' },
  y: { type: 'integer', minimum: 0, maximum: 7, default: 0, description: 'key: row (0 = top); dial: layer (Galleon 0 = top widget, 1 = bottom)' },
};

export function smartTools({ ToolError }) {
  function client(ctx) {
    if (!ctx.smartControl) throw new ToolError('Smart Deck control is not available in this server context', { code: 'unavailable' });
    return ctx.smartControl;
  }
  const name = (ctx) => String(ctx.clientName ? `${ctx.clientName} via Prism MCP` : 'AI assistant (Prism MCP)').replace(/[^\x20-\x7e]/g, '').slice(0, 64);
  function convert(e) {
    if (e instanceof ToolError || !(e instanceof SmartChannelError)) return e;
    const code = e.code === 'timeout' ? 'unreachable' : e.code;
    return new ToolError(e.message, { code, data: { ...(e.data || {}), ...(HINTS[code] ? { hint: HINTS[code] } : {}) } });
  }
  // The per-pairing secret, per SmartPipeClient (one per server context): in memory only, sent with every call,
  // stripped from every result.
  const secrets = new WeakMap();
  const call = async (ctx, op, args) => {
    const c = client(ctx);
    const secret = secrets.get(c);
    try {
      const r = await c.call(op, secret ? { ...(args || {}), pairingSecret: secret } : args, name(ctx));
      if (r && typeof r === 'object' && 'pairingSecret' in r) {
        if (typeof r.pairingSecret === 'string') secrets.set(c, r.pairingSecret);
        const { pairingSecret, ...rest } = r;
        return rest;
      }
      return r;
    } catch (e) {
      if (e instanceof SmartChannelError && e.code === 'not_paired') secrets.delete(c);
      throw convert(e);
    }
  };
  const RW = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
  const RO = { readOnlyHint: true, openWorldHint: false };

  return [
    {
      name: 'smart_status',
      description: 'Is Prism Control\'s Smart Deck reachable, is "Allow AI preferences" on, is this assistant paired, is a pairing prompt pending (the code comes only from smart_pair), what app/pack/context the deck follows, which decks have Smart slots (virtual decks cannot approve), how many changes can be undone, and which proposed keys are still pending the user\'s approval on the deck (paired only)? Call first. Never errors: when the channel is off it returns reachable:false with the reason; do not try to enable it.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: RO,
      handler: async (a, ctx) => {
        const c = client(ctx);
        if (!c.present()) return { reachable: false, reason: 'No discovery file: "Allow AI preferences" is off or Prism Control is not running.', hint: HINTS.unreachable };
        try {
          const s = await call(ctx, 'status', {});
          const waiting = Array.isArray(s.pendingApprovals) ? s.pendingApprovals : [];
          return {
            reachable: true, ...s,
            next: s.paired ? 'smart_get_prefs / smart_set_pref / smart_pin / smart_explain_slot / smart_list / smart_override / smart_undo' : 'smart_pair',
            ...(waiting.length ? { tellUser: PENDING_TELL(waiting) } : {}),
          };
        } catch (e) {
          if (e instanceof ToolError) return { reachable: false, reason: e.message, code: e.code, hint: HINTS[e.code] || HINTS.unreachable };
          if (!(e instanceof SmartChannelError)) throw e;
          return { reachable: false, reason: e.message, code: e.code, hint: HINTS[e.code] || HINTS.unreachable };
        }
      },
    },
    {
      name: 'smart_pair',
      description: 'Pair this assistant with the Smart Deck. No pairingId STARTS pairing: the top-left Smart Key of each physical deck glows "ALLOW AI?" with a 4-digit code; tell the user the code and ask them to press and HOLD that key for 1.5 s within 2 minutes (a tap never approves). {pairingId} POLLS: pending | approved | denied | expired. Never claim success before status is "approved". Errors: ai_off, no_physical_key, rate_limited.',
      inputSchema: { type: 'object', properties: { pairingId: { type: 'string' }, client: { type: 'string', maxLength: 64, description: 'Name quoted in the property inspector (never shown on the key). Default: the MCP client name.' } }, additionalProperties: false },
      annotations: RW,
      handler: async (a, ctx) => {
        if (a.pairingId) {
          const r = await call(ctx, 'pair', { pairingId: String(a.pairingId) });
          return { ...r, next: r.status === 'pending' ? `Still waiting for the user to hold the key showing ${r.code}. Poll again in a few seconds.` : r.status === 'approved' ? 'Paired. The smart_* tools can now change Smart Deck preferences.' : 'Not approved. Start again only if the user asks.' };
        }
        const r = await call(ctx, 'pair', a.client ? { client: String(a.client) } : {});
        if (r.status === 'approved') return r;
        return { ...r, tellUser: `If you asked for this, press and hold the glowing Smart Key that shows ${r.code} on your deck for 1.5 s (until its ring is full), within 2 minutes.`, next: 'Poll smart_pair {pairingId} until approved.' };
      },
    },
    {
      name: 'smart_get_prefs',
      description: 'Read the Smart Deck preferences: on/off, label size, big icons, streamer-safe, paging, dial-by-category ("camera" → left dial), app-switch delay, and per app (pack id) the pinned and hidden verbs; plus the allowed values. Requires pairing.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: RO,
      handler: (a, ctx) => call(ctx, 'prefs.get', {}),
    },
    {
      name: 'smart_set_pref',
      description: 'Change Smart Deck preferences in one call, for plain-language wishes: "big icons" (bigIcons), "large labels"/"icons only" (labelSize large|none), "never show titles on stream" (streamerSafe), "camera on the left dial" (dialCategories {camera:"left"}; null/auto unsets), "no MORE key" (paging none), hide/unhide verbs for one app (hidden {app, hide[], unhide[]}). Unknown keys are ignored and reported. Undoable (smart_undo); dryRun previews. Requires pairing.',
      inputSchema: {
        type: 'object',
        properties: {
          enabled: { type: 'boolean', description: 'Smart Deck on/off' },
          labelSize: { type: 'string', enum: ['none', 'small', 'normal', 'large'] },
          bigIcons: { type: 'boolean' },
          streamerSafe: { type: 'boolean', description: 'Never show window titles, names or other private readouts' },
          paging: { type: 'string', enum: ['more-key', 'none'] },
          appDebounceMs: { type: 'integer', minimum: 0, maximum: 2000 },
          readoutKeys: { type: 'boolean' },
          keepLastWhenNoMatch: { type: 'boolean' },
          dialCategories: { type: 'object', description: 'category (primary, tool, mode, nav, camera, system, toggle, readout) → dial', additionalProperties: DIAL },
          hidden: { type: 'object', properties: { app: { type: 'string', description: 'A pack id (smart_list packs)' }, hide: { type: 'array', items: { type: 'string' } }, unhide: { type: 'array', items: { type: 'string' } } }, required: ['app'], additionalProperties: false },
          dryRun: { type: 'boolean' },
        },
        additionalProperties: false,
      },
      annotations: RW,
      handler: (a, ctx) => {
        const { hidden, dryRun, ...patch } = a;
        if (!Object.keys(patch).length && !hidden) throw new ToolError('Pass at least one preference (or hidden).', { code: 'invalid_argument' });
        return call(ctx, 'prefs.set', { ...(Object.keys(patch).length ? { patch } : {}), ...(hidden ? { hidden } : {}), ...(dryRun ? { dryRun: true } : {}) });
      },
    },
    {
      name: 'smart_pin',
      description: 'Pin a verb (key) or control (dial) of one app to a slot on one device kind ("keep Undo on the top-right key in VS Code"), or unpin a slot. The pin holds in every context of that app where the item exists; context (optional) checks it is available there. Validated: app = pack id, item from smart_list verbs/controls, slot inside the device. Undoable. Requires pairing.',
      inputSchema: {
        type: 'object',
        properties: {
          app: { type: 'string', description: 'Pack id (smart_list packs), e.g. "vscode"' },
          device: { type: 'string', description: `A device kind (${DEVICE_KINDS.join(', ')}) or a deviceId from smart_status` },
          ...SLOT,
          item: { type: 'string', description: 'Verb id (key) or control id (dial)' },
          context: { type: 'string', description: 'Optional: a context id the item must be available in' },
          unpin: { type: 'boolean' },
          dryRun: { type: 'boolean' },
        },
        required: ['app', 'device', 'x'],
        additionalProperties: false,
      },
      annotations: RW,
      handler: (a, ctx) => {
        if (!a.unpin && !a.item) throw new ToolError('Pass item (or unpin: true).', { code: 'invalid_argument' });
        return call(ctx, 'pin', a);
      },
    },
    {
      name: 'smart_explain_slot',
      description: '"Why is this here?" for one Smart Key or Smart Dial on a connected deck: what it shows now, its binding (or fallback key), safety, the app/context and the rule that matched, the layout reason (pack proposal, zone, pinned by the user), whether it can run right now. A slot holding one of the user\'s fixed actions says so. Requires pairing.',
      inputSchema: { type: 'object', properties: { deviceId: { type: 'string', description: 'From smart_status (optional when one deck has Smart slots)' }, ...SLOT }, required: ['x'], additionalProperties: false },
      annotations: RO,
      handler: (a, ctx) => call(ctx, 'explain', a),
    },
    {
      name: 'smart_list',
      description: 'List what the Smart Deck knows: packs (apps/games/sites with their policy), contexts of a pack, verbs of a pack (optionally valid in one context; with binding, safety and hidden), dial controls of a pack, devices (connected decks + every device kind and its grid), pins, history (the undo stack). Requires pairing.',
      inputSchema: { type: 'object', properties: { what: { type: 'string', enum: ['packs', 'contexts', 'verbs', 'controls', 'devices', 'pins', 'history'], default: 'packs' }, pack: { type: 'string' }, context: { type: 'string' } }, additionalProperties: false },
      annotations: RO,
      handler: (a, ctx) => call(ctx, 'list', a),
    },
    {
      name: 'smart_override',
      description: 'Add a per-item user override to an app\'s pack, validated before anything is written: for a verb label (≤ 12), longLabel, glyph, monogram, priority, category, safety (stricter only) or a keyboard-chord binding {kind:"chord", chord:"Ctrl+Alt+Z"} (never text, macros, mouse, module or Sight bindings; never in display-only packs); for a dial control label, glyph, monogram, priority, category. Written to %APPDATA%\\Prism\\control\\packs\\<pack>.ai.json (the user\'s own pack files still win). A binding is only a PROPOSAL: it is "pending your approval on the deck" (the key shows REVIEW) until the user holds that key or presses Approve; an approved AI key is always hold-to-confirm. Alt+F4, Windows-key, Ctrl+Alt+Del and system Ctrl+Alt, Ctrl+Shift+Esc and Print Screen chords, and system-wide hotkey verbs, are refused. Safety only gets stricter (safe < never-auto < confirm). Undoable; dryRun validates only. Requires pairing.',
      inputSchema: {
        type: 'object',
        properties: {
          pack: { type: 'string' },
          items: { type: 'array', minItems: 1, maxItems: 32, items: { type: 'object', properties: { type: { type: 'string', enum: ['verb', 'control'], default: 'verb' }, id: { type: 'string' }, set: { type: 'object' } }, required: ['id', 'set'], additionalProperties: false } },
          dryRun: { type: 'boolean' },
        },
        required: ['pack', 'items'],
        additionalProperties: false,
      },
      annotations: { ...RW, destructiveHint: false },
      handler: async (a, ctx) => {
        const r = await call(ctx, 'override', a);
        const pending = Array.isArray(r?.pending) ? r.pending : [];
        if (!pending.length) return r;
        // Proposals never apply on their own: say so, in the user's words.
        return { ...r, pending: pending.map((p) => ({ ...p, status: p.status || PENDING })), tellUser: PENDING_TELL(pending), next: r.dryRun ? 'Call again without dryRun to propose it.' : 'Nothing else to do: the user approves or rejects it on their deck. smart_status lists what is still pending.' };
      },
    },
    {
      name: 'smart_undo',
      description: 'Undo the last N AI changes (preferences, pins, overrides; history 50). Refuses with changed_since when the user edited the same preferences or file afterwards: ask them before retrying with force: true.',
      inputSchema: { type: 'object', properties: { steps: { type: 'integer', minimum: 1, maximum: 50, default: 1 }, force: { type: 'boolean' } }, additionalProperties: false },
      annotations: RW,
      handler: (a, ctx) => call(ctx, 'undo', { steps: a.steps ?? 1, ...(a.force ? { force: true } : {}) }),
    },
  ];
}
