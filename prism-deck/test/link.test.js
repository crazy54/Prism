// Linked state (API 1.6, src/scene/link.js): keys, dials and screens that show the same thing agree —
// the bus itself, the facets that declare links, and the plugin runtime (a Galleon studio screen and
// its On Air / mic keys; a + mic dial). The web player is driven in headless Chrome (aaa-prism-ds/fix-deck).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLinkBus, linksOf, validateLink, readoutOf } from '../src/scene/link.js';
import { findFacet, allFacets } from '../src/facets/index.js';
import { createGameHost } from '../src/scene/game.js';
import { PrismRuntime } from '../src/plugin/runtime.js';

test('link bus: publish, follow (stateOf / valueOf), data merge, adopt', () => {
  const bus = createLinkBus();
  const mic = findFacet('icon-mic'), meet = findFacet('app-meeting-mic'), studio = findFacet('screen-galleon-studio'), onAir = findFacet('icon-broadcast');
  assert.deepEqual(bus.publish(mic, {}, { state: mic.states.indexOf('off') }), ['mic.muted']);
  assert.equal(bus.get('mic.muted'), true);
  assert.equal(meet.states[bus.stateOf(meet, {}, 0)], 'muted', 'a linked meeting mic follows into muted');
  assert.deepEqual(bus.data(studio, {}, { audio: { level: 0.5 } }), { audio: { level: 0.5 }, mic: { muted: true } }, 'the studio screen reads data.mic');
  const a = bus.adopt(onAir, {}, { state: 0 });
  assert.deepEqual(a.changed, ['stream.live'], 'a new On Air key publishes its own state when the bus has none');
  bus.publish(studio, {}, { state: studio.states.indexOf('live') });
  assert.equal(onAir.states[bus.stateOf(onAir, {}, 0)], 'live');
  assert.ok(bus.listens(studio, {}, ['mic.muted']) && !bus.listens(findFacet('icon-clock'), {}, ['mic.muted']));
  const dial = findFacet('dial-volume');
  assert.deepEqual(linksOf(dial, { controls: 'mic' }).map((l) => l.channel), ['mic.muted']);
  assert.deepEqual(bus.publish(dial, {}, { state: 0, value: 0.42 }).sort(), ['volume.level', 'volume.muted']);
  assert.equal(bus.valueOf(findFacet('dial-volume-arc'), {}), 0.42, 'output dials share the level');
  let heard = null;
  const un = bus.subscribe((ch) => { heard = ch; });
  bus.notify(['mic.muted'], 'x'); un();
  assert.deepEqual(heard, ['mic.muted']);
});

test('link declarations are valid, and every key / span game has a 4-card readout', () => {
  for (const f of allFacets()) assert.deepEqual(validateLink(f), [], f.id);
  assert.ok(allFacets().filter((f) => f.link).length >= 15, 'the mic / camera / volume / live facets link');
  for (const id of ['game-tictactoe', 'game-dice', 'game-coin', 'game-oracle', 'game-slots', 'game-lights-out', 'game-reaction']) {
    const f = findFacet(id), h = createGameHost(f, { device: 'galleon', params: {}, seed: 3, clock: () => 0 });
    h.dispatch({ type: 'press', key: 4, t: 1 });
    const r = readoutOf(f, h.state, {});
    assert.equal(r.cards.length, 4, id);
    assert.doesNotThrow(() => JSON.stringify(r), 'plain data: it travels on the bus');
  }
});

test('plugin runtime: the studio screen, On Air and mic keys, and a mic dial share one state per device', () => {
  const settings = new Map();
  const conn = { on() {}, setImage() { return true; }, setFeedback: () => true, setFeedbackLayout() {}, setTriggerDescription() {}, setSettings: (c, s) => settings.set(c, s), getGlobalSettings() {}, bufferedAmount: 0, info: {} };
  let t = 1000;
  const rt = new PrismRuntime({ conn, now: () => t, log: () => {} });
  const appear = (device, context, controller, column, row, s) => rt.onWillAppear({ action: 'com.jeremyfhall.prism.facet', context, device, payload: { controller, coordinates: { column, row }, settings: s } });
  rt.upsertDevice('g', { name: 'Galleon 100 SD', type: 12, size: { columns: 3, rows: 4 } });
  appear('g', 'mic', 'Keypad', 0, 0, { facet: 'icon-mic' });
  appear('g', 'air', 'Keypad', 1, 0, { facet: 'icon-broadcast' });
  appear('g', 'meet', 'Keypad', 2, 0, { facet: 'app-meeting-mic' });
  for (const [c, col, row] of [['s00', 0, 0], ['s10', 1, 0], ['s01', 0, 1], ['s11', 1, 1]]) appear('g', c, 'Encoder', col, row, { facet: 'screen-galleon-studio' });
  const unit = (c) => rt.unitOf(rt.instances.get(c));
  const stateName = (c) => { const u = unit(c); return u.facet.states[u.cfg.state || 0]; };
  assert.equal(stateName('s00'), 'off-air');
  // push a Galleon dial: the screen goes live, and so does the On Air key
  rt.onPress({ context: 's10' }, true); rt.onPress({ context: 's10' }, false);
  assert.equal(stateName('s00'), 'live');
  assert.equal(stateName('air'), 'live', 'the On Air key follows the screen');
  assert.equal(settings.get('air')?.state, 1, 'and its state is persisted');
  // mute on the mic key: the meeting mic follows, the screen reads data.mic.muted
  t += 100;
  rt.onPress({ context: 'mic' }, true); rt.onPress({ context: 'mic' }, false);
  assert.equal(stateName('meet'), 'muted');
  assert.equal(rt.frameOpts(unit('s00')).data.mic.muted, true);
  // the screen's dials are its volumes (ctx.values)
  rt.onDialRotate({ context: 's00', payload: { ticks: 5 } });
  assert.equal(rt.frameOpts(unit('s00')).values.length, 2);
  // a new key that appears later adopts the device's state
  appear('g', 'mic2', 'Keypad', 0, 1, { facet: 'state-crossfade' });
  assert.equal(stateName('mic2'), 'off', 'a mic crossfade key appears muted');
  assert.ok(Number.isFinite(rt.frameOpts(unit('mic2')).pressAge), 'a linked motion key shows the device state, not its demo autoplay');
  // another device keeps its own state
  rt.upsertDevice('p', { name: 'Stream Deck +', type: 7, size: { columns: 4, rows: 2 } });
  appear('p', 'pmic', 'Keypad', 0, 0, { facet: 'icon-mic' });
  appear('p', 'pdial', 'Encoder', 0, 0, { facet: 'dial-volume', params: { controls: 'mic' } });
  assert.equal(stateName('pmic'), 'on');
  rt.onPress({ context: 'pdial' }, true); rt.onPress({ context: 'pdial' }, false);
  assert.equal(stateName('pmic'), 'off', 'pushing the + mic dial mutes the + mic key');
  rt.stop();
});

test('plugin runtime: a key game publishes its readout for the Game Scoreboard screen', () => {
  const conn = { on() {}, setImage() { return true; }, setFeedback: () => true, setFeedbackLayout() {}, setTriggerDescription() {}, setSettings() {}, getGlobalSettings() {}, bufferedAmount: 0, info: {} };
  let t = 1000;
  const rt = new PrismRuntime({ conn, now: () => t, log: () => {} });
  rt.upsertDevice('g', { name: 'Galleon 100 SD', type: 12, size: { columns: 3, rows: 4 } });
  rt.onWillAppear({ action: 'x.facet', context: 'dice', device: 'g', payload: { controller: 'Keypad', coordinates: { column: 0, row: 0 }, settings: { facet: 'game-dice' } } });
  for (const [c, col, row] of [['s00', 0, 0], ['s10', 1, 0], ['s01', 0, 1], ['s11', 1, 1]]) rt.onWillAppear({ action: 'x.facet', context: c, device: 'g', payload: { controller: 'Encoder', coordinates: { column: col, row }, settings: { facet: 'screen-galleon-game' } } });
  rt.onPress({ context: 'dice' }, true); t += 200; rt.onPress({ context: 'dice' }, false);
  const g = rt.frameOpts(rt.unitOf(rt.instances.get('s00'))).data.game;
  assert.equal(g.id, 'game-dice');
  assert.equal(g.cards[0].title, 'Rolled');
  rt.stop();
});
