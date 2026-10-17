// Glyph aliases: other names for glyphs that already exist, so callers (context packs, layouts, the
// Smart Deck) can ask for "trash", "pause" or "gear" without duplicating geometry. An alias names a
// target glyph id and, optionally, the state it should show by default ("pause" is play-pause showing
// its pause bars). The registry resolves aliases in getGlyph() / resolveGlyph() and checks this table:
// every target must exist, every state must be one of the target's, and no alias may shadow a glyph id.
//
// Add a name here only when the target really draws the same thing; when the idea differs, design a
// glyph instead. Keep entries sorted by alias name.

export const GLYPH_ALIASES = Object.freeze({
  axis: { glyph: 'move' },                       // world / relative transform axes
  bottom: { glyph: 'scroll-bottom' },
  box: { glyph: 'scale' },                       // bounding box
  clipboard: { glyph: 'paste' },
  'close-pane': { glyph: 'close' },
  discard: { glyph: 'delete' },
  duplicate: { glyph: 'copy' },
  'eye-off': { glyph: 'eye', state: 'hidden' },
  'folder-up': { glyph: 'arrow-up' },
  gear: { glyph: 'settings' },
  'hidden-files': { glyph: 'eye' },
  'hide-ui': { glyph: 'eye', state: 'hidden' },
  line: { glyph: 'goto-line' },
  'mail-down': { glyph: 'arrow-down' },
  'mail-up': { glyph: 'arrow-up' },
  'monitor-next': { glyph: 'monitor' },
  'page-scroll': { glyph: 'scroll' },
  'page-top': { glyph: 'scroll-top' },
  paint: { glyph: 'brush' },
  'pane-down': { glyph: 'arrow-down' },
  'pane-right': { glyph: 'arrow-right' },
  'pane-up': { glyph: 'arrow-up' },
  panes: { glyph: 'split' },
  'path-join': { glyph: 'path' },
  pause: { glyph: 'play-pause', state: 'playing' }, // playing shows the pause bars (the action you get)
  play: { glyph: 'play-pause', state: 'paused' },
  preview: { glyph: 'eye' },
  properties: { glyph: 'info' },
  redo: { glyph: 'forward' },
  'refresh-rate': { glyph: 'monitor' },
  reopen: { glyph: 'back' },                     // reopen the closed tab / editor: undo the close
  resize: { glyph: 'scale' },
  revert: { glyph: 'back' },
  'seek-back': { glyph: 'rewind-10' },
  'seek-forward': { glyph: 'forward-10' },
  'select-all': { glyph: 'select' },
  'select-block': { glyph: 'select' },
  'select-lines': { glyph: 'select' },
  'select-words': { glyph: 'select' },
  'split-auto': { glyph: 'split' },
  'split-right': { glyph: 'split' },
  'tab-1': { glyph: 'tab' },
  'tab-2': { glyph: 'tab' },
  'tab-close': { glyph: 'close' },
  'tab-last': { glyph: 'tab' },
  'tab-move': { glyph: 'tab' },
  'tab-next': { glyph: 'arrow-right' },
  'tab-prev': { glyph: 'arrow-left' },
  'tab-slot': { glyph: 'tab' },
  top: { glyph: 'scroll-top' },
  transform: { glyph: 'scale' },
  trash: { glyph: 'delete' },
  undo: { glyph: 'back' },
  'width-minus': { glyph: 'length-minus' },
  'width-plus': { glyph: 'length-plus' },
  'window-close': { glyph: 'close' },
  zoom: { glyph: 'zoom-in' },
});
