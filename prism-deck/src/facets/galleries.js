// Deck facet taxonomy — galleries, their categories, surfaces and Spectrum hues.
//
// Every facet names one gallery (its folder) and one of that gallery's categories;
// the registry rejects anything else. `surfaces` says which surfaces a gallery
// holds; `prefix` lists the id prefixes its facets use (ids are global across
// Prism). `hue` is the gallery's position on the Spectrum (OKLCH degrees) — facets
// get it as ctx.hue / ctx.tint, the catalog shows it as a λ index. Hues sit on the design
// tokens' 12 Spectrum stops (violet 296 … amber 60.4 — amber is the deck surface hue).

export const GALLERIES = [
  {
    id: 'themes', title: 'Themes', icon: 'layers', hue: 296, prefix: ['theme'], surfaces: ['deck'],
    blurb: 'One facet per deck theme: the whole device dressed in that material — every glyph, label, state and press.',
    categories: ['Signature', 'Dark', 'Light', 'Experimental'],
  },
  {
    id: 'icons', title: 'Icons', icon: 'grid', hue: 269.8, prefix: ['icon'], surfaces: ['key'],
    blurb: 'One facet per glyph — 48-unit geometry with states and idle motion, rendered in any theme.',
    categories: ['Media', 'Audio', 'Streaming', 'System', 'Status', 'Time', 'Navigation', 'Productivity', 'Dev & Ops', 'Home & Light'],
  },
  {
    id: 'motion', title: 'Motion', icon: 'pulse', hue: 243.6, prefix: ['press', 'state', 'idle', 'alert'], surfaces: ['key'],
    blurb: 'Key animations built for the hardware: press feedback, state transitions, idle loops and alerts.',
    categories: ['Press Feedback', 'State Transitions', 'Idle Loops', 'Alerts & Attention'],
  },
  {
    id: 'spans', title: 'Spans', icon: 'waveform', hue: 191.3, prefix: ['span'], surfaces: ['span', 'deck'],
    blurb: 'Animations across blocks of keys — the physical gaps are hidden pixels, so motion reads continuous behind the bezel; deck walls carry on across the + strip and the Galleon screen.',
    categories: ['Waveforms & Audio', 'Bars & Meters', 'Text & Marquee', 'Ripples & Light', 'Whole Device'],
  },
  {
    id: 'dials', title: 'Dials & Strips', icon: 'sliders', hue: 138.9, prefix: ['dial', 'strip'], surfaces: ['strip'],
    blurb: 'Stream Deck + / + XL encoders: 200×100 dial segments and full touch-strip panoramas.',
    categories: ['Dial Segments', 'Strip Panoramas', 'Gauges & Scrubbers'],
  },
  {
    id: 'screens', title: 'Screens', icon: 'monitor', hue: 86.5, prefix: ['screen'], surfaces: ['screen', 'strip'],
    blurb: 'Display widgets: the Galleon 100 SD screen, the Neo info bar and Stream Deck + strip dashboards.',
    categories: ['Galleon Dashboards', 'Neo Info Bar', 'Strip Dashboards'],
  },
  {
    id: 'apps', title: 'Apps', icon: 'cpu', hue: 60.4, prefix: ['app'], surfaces: ['key', 'span', 'strip', 'screen', 'deck'],
    blurb: 'Live apps composed from the above plus data sources: audio, system, clocks and timers, controls (meeting, scene and media keys), dashboards.',
    categories: ['Audio', 'System', 'Clocks & Timers', 'Controls', 'Dashboards'],
  },
  {
    id: 'games', title: 'Games', icon: 'target', hue: 34.2, prefix: ['game'], surfaces: ['key', 'span', 'deck'],
    blurb: 'Games and toys played on the keys: puzzles across a block of keys, chance and reflex games on one — stateful facets (scene/game.js).',
    categories: ['Puzzles', 'Chance', 'Reflex', 'Board'],
  },
];

export const GALLERY_IDS = GALLERIES.map((g) => g.id);
const BY_ID = new Map(GALLERIES.map((g) => [g.id, g]));
export const getGallery = (id) => BY_ID.get(id) || null;

/** Glyph category (folder under src/glyphs/) → Icons gallery category. */
export const GLYPH_CATEGORIES = {
  media: 'Media', audio: 'Audio', stream: 'Streaming', system: 'System', status: 'Status', time: 'Time',
  nav: 'Navigation', productivity: 'Productivity', dev: 'Dev & Ops', home: 'Home & Light',
};
