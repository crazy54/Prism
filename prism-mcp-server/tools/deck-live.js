// Prism Deck LIVE tools: change what Prism's own keys, dials and screens show on the
// user's physical Stream Deck / Galleon devices, through the Prism Deck plugin's local
// control channel (API v1, prism-deck/src/plugin/control.js; spec: aaa-prism-ds/
// elgato-mcp/DESIGN.md §6.3). Consent layers, all enforced by the plugin:
//   1. the user switched "Allow AI editing" on (no control.json otherwise → unreachable;
//      we never try to turn it on),
//   2. the user approved this assistant by PRESSING the glowing Prism key on a physical
//      deck (deck_live_pair; the MCP Deck / Virtual Stream Deck can't approve),
//   3. rate limits (10 updates/s per key, 30/s per device, 1 apply/s, 50 requests/s),
//      safe behaviors only, 50-step undo, an audit log.
// Nothing here runs programs, sends keystrokes or presses the user's other actions.
// Handlers receive ctx.deckControl (DeckControlClient), ctx.deckEngine, ctx.deckLayouts.

import { ChannelError } from '../utils/deck-control-client.js';
import { DeckEngineError } from '../utils/deck-engine.js';
import { LayoutError, LAYOUT_SCHEMA, normalizeLayout, validateLayoutDoc, liveDocument } from '../utils/deck-layouts.js';
import { BEHAVIOR } from './deck.js';

const SAFE_KINDS = new Set(['none', 'prism.toggle', 'prism.page', 'prism.app']);
const APPS = new Set(['clock', 'timer', 'stopwatch', 'counter', 'sysmon', 'spectrum', 'waveform']);
const DEEP_LINK = /streamdeck:\/\//i;

/** Same classes as prism-deck/src/plugin/live-validate.js classifyBehavior (checked again by the plugin). */
export function classifyBehavior(b) {
  if (b == null) return { class: 'safe' };
  if (typeof b !== 'object' || Array.isArray(b)) return { class: 'forbidden', reason: 'behavior must be an object' };
  if (DEEP_LINK.test(JSON.stringify(b))) return { class: 'forbidden', reason: 'streamdeck:// deep links are never allowed' };
  if (b.kind === 'native') return b.uuid ? { class: 'export-only', reason: `${b.uuid} is a native / other-plugin action; it can only reach the deck in an exported profile the user reviews and imports` } : { class: 'forbidden', reason: 'native behavior needs an action uuid' };
  if (!SAFE_KINDS.has(b.kind)) return { class: 'forbidden', reason: `unknown behavior kind "${b.kind}"` };
  if (b.kind === 'prism.page' && !(typeof b.page === 'string' && b.page)) return { class: 'forbidden', reason: 'prism.page needs a page id' };
  if (b.kind === 'prism.app' && !APPS.has(b.app)) return { class: 'forbidden', reason: `unknown Prism app "${b.app}"; allowed: ${[...APPS].join(', ')}` };
  return { class: 'safe' };
}

const HINTS = {
  unreachable: 'The channel is off. Only the user can switch on "Allow AI editing" (Stream Deck app → a Prism Facet key → property inspector → Plugin settings). Do not try to enable it; use deck_layout_* + deck_export_profile instead.',
  ai_editing_off: 'The user switched "Allow AI editing" off. Ask them to switch it on if they want live edits; never try to enable it yourself.',
  not_paired: 'Call deck_live_pair, tell the user the 4-digit code, and wait until they press and hold the glowing Prism key on their deck (1.5 s, until its ring is full).',
  no_physical_key: 'No Prism key is visible on a physical deck. Ask the user to show a page with a Prism Facet key on a real device (the MCP Deck, Virtual Stream Deck and Mobile cannot approve).',
  rate_limited: 'Wait data.retryAfterMs, then retry. Batch changes (deck_live_batch / deck_live_apply_layout) instead of many single calls; never animate by calling tools in a loop — Prism facets animate on the device.',
  unauthorized: 'The plugin restarted (new token). Retry once; the token is re-read from the control file on every call.',
  requires_export: 'Native actions (hotkeys, apps, URLs, other plugins) never go live. Put them in a layout and use deck_export_profile; the user reviews and imports the file.',
  forbidden_behavior: 'That behavior is not allowed in any form.',
  device_mismatch: 'The layout is for another device model. Use deck_live_status for the device ids and models, or retarget the layout (deck_layout_update retarget).',
  nothing_to_undo: 'There are no live edits left to undo on this device.',
  unknown_device: 'Use a device id from deck_live_status.',
  timeout: 'The plugin did not answer; it may be busy or restarting. Check deck_live_status.',
};

export function deckLiveTools({ ToolError }) {
  function client(ctx) {
    if (!ctx.deckControl) throw new ToolError('Live deck control is not available in this server context', { code: 'unavailable' });
    return ctx.deckControl;
  }
  /** Channel error → ToolError (behavior refusals refined to requires_export / forbidden_behavior). */
  function convert(e) {
    if (e instanceof ToolError) return e;
    if (e instanceof LayoutError || e instanceof DeckEngineError) return new ToolError(e.message, { code: e.code, data: e.data });
    if (!(e instanceof ChannelError)) return e;
    let code = e.code;
    if (code === 'behavior_not_allowed') {
      const errs = e.data?.errors || [];
      code = errs.some((x) => x.code === 'forbidden_behavior') ? 'forbidden_behavior' : 'requires_export';
    }
    if (code === 'timeout') code = 'unreachable';
    return new ToolError(e.message, { code, data: { ...(e.data || {}), ...(e.status ? { status: e.status } : {}), ...(HINTS[code] || HINTS[e.code] ? { hint: HINTS[code] || HINTS[e.code] } : {}) } });
  }
  const guard = (fn) => async (a, ctx) => { try { return await fn(a || {}, ctx); } catch (e) { throw convert(e); } };
  function checkBehavior(b, where) {
    const c = classifyBehavior(b);
    if (c.class === 'safe') return;
    const code = c.class === 'forbidden' ? 'forbidden_behavior' : 'requires_export';
    throw new ToolError(`${where}: ${c.reason}; nothing was sent to the deck`, { code, data: { hint: HINTS[code] } });
  }
  const lookWarnings = (look, where) => (look && typeof look === 'object' ? ['fg', 'bg'].filter((k) => look[k] != null).map((k) => ({ path: `${where}.${k}`, code: 'ignored_field', message: `${k} is ignored: deck themes own the material; pick a theme instead` })) : []);
  /** set_dial rotate {step, value} → feedback.params.step / feedback.value (0–100), like deck_layout_update. */
  function dialFeedback(a) {
    const fb = a.feedback ? { ...a.feedback } : {};
    if (a.rotate) {
      if (a.rotate.step != null) { if (typeof a.rotate.step !== 'number' || a.rotate.step <= 0 || a.rotate.step > 0.25) throw new ToolError('rotate.step must be a number in (0, 0.25]', { code: 'invalid_argument' }); fb.params = { ...(fb.params || {}), step: a.rotate.step }; }
      if (a.rotate.value != null) { if (typeof a.rotate.value !== 'number' || a.rotate.value < 0 || a.rotate.value > 1) throw new ToolError('rotate.value must be 0–1', { code: 'invalid_argument' }); fb.value = Math.round(a.rotate.value * 100); }
    }
    return fb;
  }
  function toOp(o, i) {
    const where = `$.ops[${i}]`;
    if (!o || typeof o !== 'object') throw new ToolError(`${where} must be an object`, { code: 'invalid_ops' });
    switch (o.op) {
      case 'set_key': checkBehavior(o.behavior, `${where}.behavior`); return { op: 'set_key', col: o.col, row: o.row, ...(o.look ? { look: o.look } : {}), ...(o.behavior ? { behavior: o.behavior } : {}) };
      case 'clear_key': return { op: 'clear_key', col: o.col, row: o.row };
      case 'set_dial': { const b = o.press !== undefined ? o.press : o.behavior; checkBehavior(b, `${where}.press`); return { op: 'set_dial', dial: o.dial, layer: o.layer ?? 0, feedback: dialFeedback(o), ...(b ? { behavior: b } : {}) }; }
      case 'clear_dial': return { op: 'clear_dial', dial: o.dial, layer: o.layer ?? 0 };
      default: throw new ToolError(`${where}: unknown op "${o.op}"; use set_key, clear_key, set_dial, clear_dial`, { code: 'invalid_ops' });
    }
  }
  const compactDevice = (d) => ({
    id: d.id, type: d.type, name: d.name, model: d.model, size: d.size, dials: d.dials, layers: d.layers, virtual: d.virtual, connected: d.connected, revision: d.revision, surface: d.surface,
    prismKeys: (d.prismKeys || []).map((k) => `${k.col},${k.row}`), prismDials: (d.prismDials || []).map((k) => `${k.dial},${k.layer}`),
  });
  const DEVICE_ID = { type: 'string', description: 'A device id from deck_live_status' };
  const LIVE_LOOK = { type: 'object', description: 'Key look: { facet | glyph, params?, state?, title?, theme?, accent?, image? } (see deck_layout_update). fg/bg are ignored with a warning.' };
  const LIVE_FEEDBACK = { type: 'object', description: 'Dial feedback: { facet?, params?, theme?, title?, value? (0–100), layout? }' };
  const ROTATE = { type: 'object', properties: { step: { type: 'number', exclusiveMinimum: 0, maximum: 0.25, description: 'Value change per tick (0–1 scale; ×5 while the dial is pressed)' }, value: { type: 'number', minimum: 0, maximum: 1, description: 'Current value' } }, additionalProperties: false };

  return [
    {
      name: 'deck_live_status',
      description: 'Is the Prism Deck plugin\'s live control channel reachable, is "Allow AI editing" on, is this assistant paired, is a pairing prompt pending, and which devices are connected (id, SDK type, model, grid, dials, Galleon layers, virtual?, the coordinates of Prism keys/dials present, live revision)? Call first. Never errors: when the channel is off it returns reachable:false with the reason (no control file = AI editing is off or the plugin is not running) — do not try to enable it.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, openWorldHint: false },
      handler: async (a, ctx) => {
        const c = client(ctx);
        if (!c.present()) return { reachable: false, reason: 'No control file: "Allow AI editing" is off or the Prism Deck plugin is not running.', controlPath: c.controlPath, hint: HINTS.unreachable };
        try {
          const s = await c.status();
          return { reachable: true, api: s.api, plugin: s.plugin, version: s.version, aiEditing: s.aiEditing, paired: s.paired, pendingPrompt: s.pendingPrompt || null, devices: (s.devices || []).map(compactDevice), limits: s.limits, next: s.paired ? 'deck_live_set_key / deck_live_set_dial / deck_live_batch / deck_live_apply_layout' : 'deck_live_pair' };
        } catch (e) {
          if (!(e instanceof ChannelError)) throw e;
          return { reachable: false, reason: e.message, code: e.code, controlPath: c.controlPath, hint: HINTS[e.code] || HINTS.unreachable };
        }
      },
    },
    {
      name: 'deck_live_pair',
      description: 'Pair this assistant with the Prism Deck plugin. No arguments (or {client}) STARTS pairing: the top-left Prism key of each physical deck lights up with "ALLOW AI?" and a 4-digit code — tell the user the code and ask them to press that key within 2 minutes. {pairingId} POLLS: pending | approved | denied | expired. Only a physical key press approves; never claim success before status is "approved". Errors: no_physical_key (409: no Prism key on a physical deck), rate_limited (429: one request every few seconds), ai_editing_off.',
      inputSchema: { type: 'object', properties: { pairingId: { type: 'string' }, client: { type: 'string', maxLength: 64, description: 'Name shown on the deck (default: the MCP client name)' } }, additionalProperties: false },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      handler: guard(async (a, ctx) => {
        const c = client(ctx);
        if (a.pairingId) {
          const r = await c.pair({ pairingId: String(a.pairingId) });
          return { pairingId: r.pairingId, status: r.status, code: r.code, expiresAt: r.expiresAt, ...(r.status === 'pending' ? { next: `Still waiting for the user to press and hold the key showing ${r.code} for 1.5 s. Poll again in a few seconds.` } : r.status === 'approved' ? { next: 'Paired. Live tools can now change Prism keys and dials.' } : { next: 'Not approved. Start again only if the user asks.' }) };
        }
        const name = String(a.client || (ctx.clientName ? `${ctx.clientName} via Prism MCP` : 'AI assistant (Prism MCP)')).replace(/[^\x20-\x7e]/g, '').slice(0, 64);
        const r = await c.pair({ client: name });
        if (r.status === 'approved') return { status: 'approved', note: r.note || 'already paired' };
        return { pairingId: r.pairingId, status: r.status, code: r.code, expiresAt: r.expiresAt, tellUser: `If you asked for this, press and hold the glowing Prism key that shows ${r.code} on your deck for 1.5 s (until its ring is full), within 2 minutes, to allow "${name}".`, next: 'Poll deck_live_pair {pairingId} until approved.' };
      }),
    },
    {
      name: 'deck_live_set_key',
      description: 'Change ONE Prism key on a connected device right now: its look (facet or glyph + params, state, title, theme, accent, SVG/PNG image) and optionally a safe Prism behavior (none / prism.toggle / prism.page / prism.app). clear:true removes the live edit. dryRun validates without changing anything. Requires pairing. Native actions are refused (requires_export). Prefer deck_live_batch or deck_live_apply_layout for several keys.',
      inputSchema: { type: 'object', properties: { deviceId: DEVICE_ID, col: { type: 'integer', minimum: 0 }, row: { type: 'integer', minimum: 0 }, look: LIVE_LOOK, behavior: BEHAVIOR, clear: { type: 'boolean' }, dryRun: { type: 'boolean' } }, required: ['deviceId', 'col', 'row'], additionalProperties: false },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      handler: guard(async (a, ctx) => {
        const op = a.clear ? { op: 'clear_key', col: a.col, row: a.row } : toOp({ op: 'set_key', col: a.col, row: a.row, look: a.look, behavior: a.behavior }, 0);
        if (!a.clear && !a.look && !a.behavior) throw new ToolError('Pass look (or a prism.app behavior), or clear:true', { code: 'invalid_argument' });
        const r = await client(ctx).ops(a.deviceId, [op], a.dryRun);
        delete r._status;
        return { ...r, warnings: [...lookWarnings(a.look, '$.look'), ...(r.warnings || []).filter((w) => w.code !== 'ignored_field' || !/^(fg|bg)/.test(w.message))] };
      }),
    },
    {
      name: 'deck_live_set_dial',
      description: 'Change ONE Prism dial (knob) right now — a Stream Deck + / + XL touch-strip segment or a Galleon 100 SD screen widget (layer 0–1; holding the Galleon dial ~3 s switches layers): its feedback (dial/strip/screen facet + params, or title + value 0–100), what a press / strip tap does (press: a safe Prism behavior), and rotate {step, value} (turning changes the value by step per tick). clear:true removes the live edit. Requires pairing.',
      inputSchema: { type: 'object', properties: { deviceId: DEVICE_ID, dial: { type: 'integer', minimum: 0 }, layer: { type: 'integer', minimum: 0, maximum: 1, default: 0 }, feedback: LIVE_FEEDBACK, press: BEHAVIOR, rotate: ROTATE, clear: { type: 'boolean' }, dryRun: { type: 'boolean' } }, required: ['deviceId', 'dial'], additionalProperties: false },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      handler: guard(async (a, ctx) => {
        const op = a.clear ? { op: 'clear_dial', dial: a.dial, layer: a.layer ?? 0 } : toOp({ op: 'set_dial', dial: a.dial, layer: a.layer, feedback: a.feedback, press: a.press, rotate: a.rotate }, 0);
        const r = await client(ctx).ops(a.deviceId, [op], a.dryRun);
        delete r._status;
        return r;
      }),
    },
    {
      name: 'deck_live_batch',
      description: 'Apply up to 64 live key/dial changes on one device atomically (all or nothing): ops [{op:"set_key",col,row,look?,behavior?} | {op:"clear_key",col,row} | {op:"set_dial",dial,layer?,feedback?,press?,rotate?} | {op:"clear_dial",dial,layer?}]. Rate limits count every op; dryRun validates first. Requires pairing.',
      inputSchema: { type: 'object', properties: { deviceId: DEVICE_ID, ops: { type: 'array', minItems: 1, maxItems: 64, items: { type: 'object', properties: { op: { type: 'string', enum: ['set_key', 'clear_key', 'set_dial', 'clear_dial'] } }, required: ['op'] } }, dryRun: { type: 'boolean' } }, required: ['deviceId', 'ops'], additionalProperties: false },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      handler: guard(async (a, ctx) => {
        if (!Array.isArray(a.ops) || !a.ops.length || a.ops.length > 64) throw new ToolError('ops must hold 1–64 changes', { code: 'invalid_ops' });
        const ops = a.ops.map(toOp);
        const r = await client(ctx).ops(a.deviceId, ops, a.dryRun);
        delete r._status;
        return { ...r, warnings: [...a.ops.flatMap((o, i) => lookWarnings(o.look, `$.ops[${i}].look`)), ...(r.warnings || [])] };
      }),
    },
    {
      name: 'deck_live_apply_layout',
      description: `Replace a device's whole live Prism surface with one page of a layout (stored layoutId or inline "${LAYOUT_SCHEMA}" document; DESIGN device names and prism-deck ids both work), atomically. Returns the diff (keys/dials set and cleared). Call with dryRun:true first and show the user the diff — this is destructive. Max one apply per second per device. The layout is validated locally first (live rules: native behaviors refused). Requires pairing.`,
      inputSchema: { type: 'object', properties: { deviceId: DEVICE_ID, layoutId: { type: 'string' }, layout: { type: 'object' }, page: { type: 'string', description: 'Page id (default: the first page)' }, dryRun: { type: 'boolean' } }, required: ['deviceId'], additionalProperties: false },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
      handler: guard(async (a, ctx) => {
        if (!a.layoutId === !a.layout) throw new ToolError('Pass exactly one of layoutId or layout', { code: 'invalid_argument' });
        let doc = a.layoutId ? (ctx.deckLayouts ? ctx.deckLayouts.get(a.layoutId).layout : null) : a.layout;
        if (!doc) throw new ToolError('Deck layouts are not available in this server context', { code: 'unavailable' });
        let warnings = [];
        const e = ctx.deckEngine;
        if (e) { await e.load(); }
        if (e && e.available && e.mods.live) {
          const v = validateLayoutDoc(e, doc, { live: true });
          if (!v.ok) {
            const code = v.errors.some((x) => x.code === 'forbidden_behavior') ? 'forbidden_behavior' : v.errors.some((x) => x.code === 'requires_export') ? 'requires_export' : 'invalid_layout';
            throw new ToolError('The layout is not valid for live apply; nothing was sent', { code, data: { errors: v.errors, warnings: v.warnings, ...(HINTS[code] ? { hint: HINTS[code] } : {}) } });
          }
          warnings = v.warnings;
          doc = liveDocument(normalizeLayout(doc, e));
        }
        const r = await client(ctx).apply(a.deviceId, doc, a.page, a.dryRun);
        delete r._status;
        return { ...r, warnings: [...warnings, ...(r.warnings || [])] };
      }),
    },
    {
      name: 'deck_live_snapshot',
      description: 'Read what Prism currently shows on a connected device: every Prism key and dial present, whether it carries a live edit, its look/feedback and behavior, the live revision and page. render:true adds the SVG each key/dial is showing (large).',
      inputSchema: { type: 'object', properties: { deviceId: DEVICE_ID, render: { type: 'boolean', default: false } }, required: ['deviceId'], additionalProperties: false },
      annotations: { readOnlyHint: true, openWorldHint: false },
      handler: guard(async (a, ctx) => { const r = await client(ctx).snapshot(a.deviceId, a.render === true); delete r._status; return r; }),
    },
    {
      name: 'deck_live_undo',
      description: 'Undo the last N live changes on a device (default 1, history depth 50). Returns how many were undone, the new revision and how many remain. nothing_to_undo when the history is empty.',
      inputSchema: { type: 'object', properties: { deviceId: DEVICE_ID, steps: { type: 'integer', minimum: 1, maximum: 50, default: 1 } }, required: ['deviceId'], additionalProperties: false },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      handler: guard(async (a, ctx) => { const r = await client(ctx).undo(a.deviceId, a.steps ?? 1); delete r._status; return r; }),
    },
  ];
}
