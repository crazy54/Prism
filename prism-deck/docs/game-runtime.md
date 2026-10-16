# Hosting game facets (API 1.5): integration note for `src/plugin`

Game facets (gallery `games`, any facet with a `game` block) are stateful. The facet stays pure: `game.init` and `game.reduce` are a deterministic state machine, and `render(ctx)` reads `ctx.game`. The runtime owns one **game host** per instance and feeds it input. `src/scene/game.js` is the runtime-neutral driver. The web player (`src/web/player.js`) and the hid runner (`src/hid/runner.js`) already use it, and they are the reference for everything below.

```js
import { createGameHost, GAME_RESET_HOLD_S, GAME_FPS, GAME_STATE_MAX } from '../scene/game.js';
```

## 1. One host per unit

When `u.facet.game` is set, create the host once per **unit**, when the unit is built or regrouped:

| unit mode | host |
|---|---|
| `key` | one host per instance (a single-key game: dice, coin, 8-ball, reaction timer) |
| `span` | one host for the whole block. Every member's press goes to the same host. |
| `deck` | one host for the deck unit (keys, dials and strip all feed it) |

Games never use the strip, dial-segment or Galleon-widget modes (`GAME_SURFACES` = key, span, deck). The schema rejects them.

```js
u.game = createGameHost(u.facet, {
  device: dev.model.id,               // the same geometry you pass to render() for this unit:
  span: u.span,                       //   span units: { col, row, cols, rows } of the block
  params: u.cfg.params,
  seed: u.cfg.gameSeed,               // see § 5
  snapshot: anchor.settings.game,     // resume (ignored if it's for another facet or grid size)
  clock: () => this.now() / 1000,     // seconds; the SAME clock you use for renderOpts(t) below
});
```

A snapshot whose grid differs (the user resized the span) or whose facet differs is ignored, and the host deals a fresh game. You don't need to check this yourself.

**Blocks that assemble one key at a time.** On hardware a span's keys arrive as separate `willAppear` events, so the unit (and its host) is rebuilt while the block grows. Always resume from the **anchor's persisted snapshot**, never from the previous host's in-memory `snapshot()`. A partial-grid host deals a throwaway board, and carrying that board forward would replace the saved game once the block is complete. Never persist from a host whose grid is still partial; it receives no input before the block completes, so `changed`-gated persistence already guarantees this. The plugin does this as of 0.5.0.0 (docs/plugin.md, Games). The web player and the hid runner build whole grids at once, so they aren't affected.

## 2. Input → events

For game units, these replace the normal handling (no `nextState`, no `value` changes, no hold-to-reset-value):

| Stream Deck event | dispatch |
|---|---|
| `keyDown` | `u.game.dispatch({ type: 'press', key: inst.row * cols + inst.col })`, the same index as `pressKey` |
| `keyUp` | `{ type: 'release', key }` (the key that went down) |
| `dialDown` / `dialUp` | `{ type: 'press' / 'release', dial: inst.col }` |
| `dialRotate` | `{ type: 'rotate', dial: inst.col, ticks }` (clamp to ±48 as today) |
| `touchTap` | `{ type: 'touch', x, y, hold }`: `x = tapPos[0] + inst.col * 200` for deck units (segment-local for anything else), `hold` = `payload.hold`. **Swipes never reach plugins**, so there is no swipe event. |

The host adds `t`, `n` (sequence), `seed` (per event) and, for keys, `cell` / `col` / `row` within the facet's grid. A key outside the facet's grid arrives with `cell: null`, and reducers ignore it.

`dispatch()` returns `{ state, changed, event }`. When `changed` is false, nothing needs persisting. A redraw is still allowed, because a release can start a transition in some games.

### New game: long-press (not on the Galleon)

- On `keyDown` of a game unit, start a timer for `GAME_RESET_HOLD_S` (1.5 s). If the key is still down when it fires, call `u.game.reset()`. Clear the timer on `keyUp`. The press that began the hold has already been dispatched. That's fine, because reset re-deals.
- **Galleon 100 SD: no hold-to-reset.** The app consumes long holds there (a dial hold of about 4 s switches the widget layer, hardware lab), so a hold can't be told apart reliably. On the Galleon, and as an extra everywhere, offer a **New game** button in the Property Inspector. It sends `sendToPlugin { event: 'game-reset' }`, which calls `u.game.reset()`.
- A `touchTap` with `hold: true` on a game deck unit is a `touch` event with `hold: true`, **not** a reset (today's "hold resets value" doesn't apply to games).

## 3. Rendering

```js
const t = this.now() / 1000;
u.game.pump(t);                                    // deliver a due clock tick (no-op for games that don't tick)
const frame = render(u.facet, { ...o, ...u.game.renderOpts(t) });   // adds game, gamePrev, gameEvent { …, age }
```

Then slice and send as for any span or deck unit: `toDeviceSvg` → `svgDataUrl`, with the per-key dedupe. API 1.2 slices are byte-identical when a key didn't change, so a Lights Out press on a 5 × 3 sends **only the 5 toggled keys** (`test/games.test.js` asserts this for the web and hid hooks).

## 4. Frame rate and the ~200 updates/s budget

Games are static between events. The unit's fps comes from the host, **not** from `steadyFps` or `BURST_FPS`:

```js
const want = u.game.fps(this.now() / 1000, Math.min(GAME_FPS, capFromMotion));   // ≤ 12 during a transition, tickHz while ticking, else 0
u.slot.fps = u.alloc != null ? Math.min(want, u.alloc) : want;
```

- **Transitions**: run for `facet.game.animate` seconds after each event (default 0.6), at ≤ `GAME_FPS` (12), plus one settling frame. Frames are pure functions of the event's age. When the budget allocator cuts fps, a transition just skips ahead and still lands on the final frame.
- **Ticks**: only while `game.ticking(state)` is true, at `tickHz` ≤ 4 (the host clamps it). `pump(t)` delivers at most one tick per call, and only when it's due. Don't dispatch `tick` yourself.
- Under `motion: 'still'`, render once per event (skip transitions) but **keep pumping ticks** if the game needs them (its logic runs on them). `fps = u.game.needsTick() ? u.game.tickHz : 0`.
- What it costs, in updates: a 5 × 3 Lights Out press is about 5 keys × 12 fps × 0.7 s ≈ 42. A dice roll is about 12. A full-XL ripple (32 keys changing) would ask for about 384/s for under a second. Let `allocateFps` cap it, and send the first frame after an event with `priority: true`.
- Element budget: game frames obey the same < 300 elements per key frame rule (conformance-tested mid-game, not just at init).

## 5. Persistence (action settings)

- After a dispatch with `changed: true`, persist `{ game: u.game.snapshot() }` on the unit's **anchor instance** (span units: `members[0]`; key and deck units: the instance), debounced like dial values (`PERSIST_MS`). Flush on `willDisappear`. Ticks can change state often, so debounce. Persisting every tick isn't required.
- A snapshot is `{ v: 1, facet, grid: 'cols×rows', seed, n, state }`, at most `GAME_STATE_MAX` (4 KB) of state plus about 80 B. `settings.js` must allow and keep the `game` key (`normalizeSettings` / `compactSettings`), and drop it when the facet changes.
- Seed: if `settings.gameSeed` is missing when the unit is first built, pick one (`hashStr(context) ^ wallNow()`) and persist it. Every later round derives from the state's rng and the per-event seeds, so the game never needs a new seed.
- On `didReceiveSettings` with a different facet, span size or difficulty param, rebuild the host. A changed param means a new game (`snapshot: null`).

## 6. Tests to add on the plugin side

Use the fake connection the existing tests use:
1. `keyDown`/`keyUp` on one member of a Lights Out span sends `setImage` only for the toggled keys.
2. Holding a game key for 1.5 s resets it. On a Galleon it doesn't, and the PI `game-reset` does.
3. `setSettings` carries `game` (a snapshot), and a new runtime resumes from it.
4. An idle game unit's slot fps is 0 after its transition.
5. The dice key re-renders about 12 times per roll, then stops.

## 7. Not a game, but the same hosting: the boot sequence (span-power-on)

D6's `span-power-on` is the deck's start-up animation (a beam strikes a prism in the middle key and the Spectrum lights every key before each settles into its face). Play it **once when the plugin starts**, on every connected device, before the profile's facets take over:

- render it as a span over the whole device: `render(findFacet('span-power-on'), { device, span: { cols: 'all', rows: 'all' }, params: { replay: false }, t })` with `t` = seconds since the plugin started (not wall-clock; don't loop it);
- send only the keys whose slice changed (≈ 3 at a time; it runs at ≤ 8 fps inside the 200 updates/s budget — `createChangeGovernor` in `scene/scheduler.js` caps it for you);
- after it holds (`t ≥ loop − 1.4` ≈ 14.6 s at the default pace), hand each key back to its configured action / facet; a key press during the sequence skips it (repaint everything at once);
- skip it under motion 'still' (the global motion setting) and on Virtual / Mobile decks.

Also new in 1.5.1 for runtimes: `render()` of a **deck** facet on the Galleon now returns `widgets` (the four 360 × 180 windows, x / y in the panel), so whole-deck games can put their scoreboards on the dials; and pass `opts.heldFor` (seconds the last press lasted, set on release) and `heldFor` on game `release` events.

