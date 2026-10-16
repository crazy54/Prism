// screen-galleon-game — the Galleon 100 SD screen as a scoreboard for the game on the keys. Key and span
// games (tic-tac-toe, dice, coin, oracle, slots, lights out, reaction) publish a readout on the device's
// link bus ('game' channel, scene/link.js: `game.readout(state)`); this screen shows its four cards, one per
// dial widget. The web player puts it on a Galleon screen the page left empty whenever a game is on the
// keys; in the Stream Deck app, put it on both dials. Whole-deck games (memory, catch …) draw the screen
// themselves. Without a game it explains itself (no invented scores).

import { surface } from '../../scene/index.js';
import { screenCards, HUE } from '../games/_d8-kit.js';

const IDLE = [
  { title: 'Scoreboard', value: 'No game', role: 'value', sub: 'put a game on the keys', hue: HUE.violet },
  { title: 'Plays', value: '—', role: 'value', sub: 'tic-tac-toe, dice, coin …', hue: HUE.citrine },
  { title: 'Score', value: '—', role: 'value', sub: 'appears here as you play', hue: HUE.amber },
  { title: 'Best', value: '—', role: 'value', sub: 'kept with the game', hue: HUE.lime },
];

export default {
  id: 'screen-galleon-game',
  title: 'Game Scoreboard',
  category: 'Galleon Dashboards',
  description: 'The Galleon 100 SD screen as the scoreboard for the game on the keys: the result, the score and the best, one card per dial widget, updated on every move.',
  tags: ['galleon', 'corsair', 'screen', 'game', 'games', 'scoreboard', 'score', 'result', 'tic-tac-toe', 'dice', 'coin', 'slots'],
  surface: 'screen',
  screens: ['galleon'],
  data: ['game'],
  dataShape: { game: '{ id, title, cards: [{ title, value, sub, bar 0–1, hue, tone, role }] ×4 } (a game facet’s readout)' },
  animated: false,
  fps: 0,
  loop: 4,
  params: {},
  order: 40,
  render(ctx) {
    const g = ctx.data?.game;
    const cards = g && Array.isArray(g.cards) && g.cards.length ? g.cards : IDLE;
    return screenCards(surface(ctx), ctx, cards);
  },
};
