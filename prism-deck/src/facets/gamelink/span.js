// gamelink-span-prism — the deck's prism scene on a block of keys: white light strikes a glass prism and leaves as
// the Spectrum, one pane per key, its lit span your health (grey while you spectate, a warm core while the bomb is
// planted). Every Game Link moment plays across the block: the flashbang's whiteout dispersing into a rainbow, the
// kill rings, the damage splash, the crack, the round sweep. For pages that also hold hotkeys or other actions.

import { renderDeck } from './deck.js';
import { EFFECTS_PARAM, DATA_SHAPE } from './_gl-kit.js';

export default {
  id: 'gamelink-span-prism',
  title: 'CS2 Prism Span',
  category: 'Whole Deck',
  description: 'The Game Link prism across a block of keys: a white beam dispersed into a Spectrum that is your health, with every Counter-Strike 2 moment played across it.',
  tags: ['cs2', 'counter-strike', 'game link', 'span', 'prism', 'spectrum', 'flashbang', 'ambient'],
  surface: 'span',
  span: { cols: 'all', rows: 2 },
  data: ['gamelink'],
  dataShape: DATA_SHAPE,
  animated: true,
  fps: 12,
  loop: 60,
  still: 7.5,
  press: 'none',
  params: { effects: EFFECTS_PARAM },
  order: 11,
  render: (ctx) => renderDeck(ctx, { sceneOnly: true }),
};
