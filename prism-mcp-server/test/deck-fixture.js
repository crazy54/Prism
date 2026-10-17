// A small, real subset of prism-deck/catalog/deck-catalog.json (schema 2), copied verbatim
// (previews shortened) by aaa-prism-ds/mcp/gen-deck-fixture.mjs on 2026-10-15. Engine-backed
// tests render these ids with the real prism-deck engine.
export const DECK_FIXTURE = {
 "_ai": {
  "schema": 2,
  "what": "Prism Deck catalog: Stream Deck (and Corsair Galleon) artwork rendered as deterministic SVG — glyphs × themes on keys, spans of keys (including the physical gaps), touch strips, screens and whole devices — by the zero-dependency prism-deck engine.",
  "howToUse": "Pick a facet by gallery/category/surface/tags. In the Stream Deck app use the Prism Deck plugin (`usage.plugin`). In code, render(facet, { device, theme, t, state, params }) returns { svg, keys?, segments?, widgets?, screen? } — whole-canvas SVG plus the per-key / per-dial slices the hardware takes. Offline: every module of the package is in top-level `sources` (keys \"prism-deck/src/…\"); import `sources[\"prism-deck/src/web/island.js\"]` as a blob: module and call loadIsland(catalog) to run facets with no network. Output is deterministic for (t, state, params, seed, theme).",
  "fields": {
   "id": "stable unique id (gallery-prefixed)",
   "gallery": "gallery id (see galleries[])",
   "category": "category within the gallery",
   "surface": "key (native key px) | span (block of keys incl. gaps) | strip (Stream Deck + touch strip or one 200×100 dial segment) | screen (Galleon 720×384, Neo info bar 232×50) | deck (whole panel)",
   "span": "span: default block { cols, rows } (numbers or \"all\")",
   "segments": "strip: 1 (one dial) or 'all'",
   "screens": "screen: supported targets",
   "glyph": "icons gallery: the glyph shown",
   "theme": "themes gallery: the theme previewed (other facets follow the deck theme)",
   "animated": "false = still",
   "fps": "frame-rate hint (runtimes cap ~10/s per key)",
   "loop": "seconds per seamless cycle",
   "states": "named states; press advances per `press`",
   "tones": "state → tone",
   "params": "tunable parameters {key:{type,default,min,max,step,options,label}}",
   "data": "live inputs a runtime may feed (ctx.data) — facets simulate fallbacks",
   "dataShape": "optional: the shape of each ctx.data key the facet reads",
   "targets": "the sizes / devices / screens it renders at (conformance matrix)",
   "module": "the facet's ES module; also its key in `sources`",
   "imports": "import specifiers in the module (all resolvable inside `sources`)",
   "preview": "static frame { w, h, t, svg }"
  },
  "sources": "top-level `sources`: { \"prism-deck/src/<path>\": \"<ES module source>\" } for every browser-safe module of the package (engine, scene, fonts, devices, themes, glyphs, facets, raster, web), closed under relative imports. Node-only parts (plugin runtime, HID, audio capture, exporters) ship in the npm package only.",
  "count": 11,
  "island": "<script type=\"application/json\" id=\"prism-deck-catalog\">"
 },
 "engine": {
  "package": "prism-deck",
  "version": "0.2.0",
  "api": "1.0",
  "repo": "https://github.com/crazy54/Prism/tree/main/prism-deck",
  "web": "https://prism.jeremyfhall.com/deck/",
  "plugin": {
   "uuid": "com.jeremyfhall.prism",
   "action": "com.jeremyfhall.prism.facet"
  },
  "entry": {
   "render": "prism-deck/src/render.js",
   "registry": "prism-deck/src/facets/index.js",
   "web": "prism-deck/src/web/index.js",
   "island": "prism-deck/src/web/island.js"
  },
  "tokens": "design/tokens.json v1.2.1"
 },
 "devices": [
  {
   "id": "mk2",
   "name": "Stream Deck MK.2",
   "vendor": "Elgato",
   "type": 0,
   "model": "20GBA9901",
   "family": "classic",
   "cols": 5,
   "rows": 3,
   "display": "lcd",
   "key": {
    "w": 72,
    "h": 72
   },
   "dials": 0,
   "touch": false,
   "strip": null,
   "screen": null,
   "generic": false
  },
  {
   "id": "mini-2022",
   "name": "Stream Deck Mini",
   "vendor": "Elgato",
   "type": 1,
   "model": "20GAI9902",
   "family": "mini",
   "cols": 3,
   "rows": 2,
   "display": "lcd",
   "key": {
    "w": 80,
    "h": 80
   },
   "dials": 0,
   "touch": false,
   "strip": null,
   "screen": null,
   "generic": false
  },
  {
   "id": "xl-2022",
   "name": "Stream Deck XL",
   "vendor": "Elgato",
   "type": 2,
   "model": "20GAT9902",
   "family": "xl",
   "cols": 8,
   "rows": 4,
   "display": "lcd",
   "key": {
    "w": 96,
    "h": 96
   },
   "dials": 0,
   "touch": false,
   "strip": null,
   "screen": null,
   "generic": false
  },
  {
   "id": "neo",
   "name": "Stream Deck Neo",
   "vendor": "Elgato",
   "type": 9,
   "model": "20GBJ9901",
   "family": "neo",
   "cols": 4,
   "rows": 2,
   "display": "lcd",
   "key": {
    "w": 96,
    "h": 96
   },
   "dials": 0,
   "touch": false,
   "strip": null,
   "screen": {
    "kind": "infobar",
    "w": 248,
    "h": 58
   },
   "generic": false
  },
  {
   "id": "plus",
   "name": "Stream Deck +",
   "vendor": "Elgato",
   "type": 7,
   "model": "20GBD9901",
   "family": "plus",
   "cols": 4,
   "rows": 2,
   "display": "lcd",
   "key": {
    "w": 120,
    "h": 120
   },
   "dials": 4,
   "touch": true,
   "strip": {
    "w": 800,
    "h": 100,
    "segments": 4
   },
   "screen": null,
   "generic": false
  },
  {
   "id": "plusxl",
   "name": "Stream Deck + XL",
   "vendor": "Elgato",
   "type": 13,
   "model": "20GBX9901",
   "family": "plus",
   "cols": 9,
   "rows": 4,
   "display": "lcd",
   "key": {
    "w": 112,
    "h": 112
   },
   "dials": 6,
   "touch": true,
   "strip": {
    "w": 1200,
    "h": 100,
    "segments": 6
   },
   "screen": null,
   "generic": false
  },
  {
   "id": "galleon",
   "name": "Corsair Galleon 100 SD",
   "vendor": "Corsair",
   "type": 12,
   "model": "GRETSCH",
   "family": "galleon",
   "cols": 3,
   "rows": 4,
   "display": "lcd",
   "key": {
    "w": 160,
    "h": 160
   },
   "dials": 2,
   "touch": false,
   "strip": null,
   "screen": {
    "kind": "galleon",
    "w": 720,
    "h": 384
   },
   "generic": false
  },
  {
   "id": "mcp",
   "name": "MCP Deck",
   "vendor": "Elgato",
   "type": 14,
   "model": "AI Stream Deck",
   "family": "virtual",
   "cols": 8,
   "rows": 4,
   "display": "software",
   "key": {
    "w": 144,
    "h": 144
   },
   "dials": 0,
   "touch": false,
   "strip": null,
   "screen": null,
   "generic": true
  },
  {
   "id": "pedal",
   "name": "Stream Deck Pedal",
   "vendor": "Elgato",
   "type": 5,
   "model": "20GBF9901",
   "family": "pedal",
   "cols": 3,
   "rows": 1,
   "display": "none",
   "key": null,
   "dials": 0,
   "touch": false,
   "strip": null,
   "screen": null,
   "generic": false
  }
 ],
 "themes": [
  {
   "id": "prism",
   "title": "Prism",
   "description": "Refraction: ink-navy glass lit from the top (pearl by day), a spectral index on every key, rings and washes of light for on and alert, presses that refract.",
   "modes": [
    "dark",
    "light"
   ],
   "tags": [
    "signature",
    "glass",
    "spectrum",
    "dark",
    "light"
   ],
   "module": "prism-deck/src/themes/prism.js"
  },
  {
   "id": "paper",
   "title": "Paper",
   "description": "Ink on warm cotton paper: letterpress cards with impressed glyphs, a spot color printed off register, halftone screens for on, dog-eared alerts. By night, white ink and foil on black card.",
   "modes": [
    "light",
    "dark"
   ],
   "tags": [
    "light",
    "print",
    "letterpress",
    "paper",
    "halftone",
    "foil",
    "warm"
   ],
   "module": "prism-deck/src/themes/paper.js"
  },
  {
   "id": "mono",
   "title": "Mono",
   "description": "Maximal contrast for low vision and bright rooms: pure black and white, AAA text, heavy frames, reversed labels for on, shape-coded alerts, ghosted disabled keys, bold type.",
   "modes": [
    "dark",
    "light"
   ],
   "tags": [
    "accessibility",
    "high contrast",
    "low vision",
    "black",
    "white",
    "aaa",
    "dark",
    "light"
   ],
   "module": "prism-deck/src/themes/mono.js"
  }
 ],
 "glyphs": [
  {
   "id": "mic",
   "title": "Microphone",
   "category": "audio",
   "tags": [
    "mic",
    "microphone",
    "mute",
    "voice",
    "call",
    "meeting"
   ],
   "states": {
    "on": "active",
    "off": "neg"
   },
   "loop": 1.6,
   "module": "prism-deck/src/glyphs/audio/mic.js"
  },
  {
   "id": "play-pause",
   "title": "Play / Pause",
   "category": "media",
   "tags": [
    "play",
    "pause",
    "transport",
    "media",
    "music"
   ],
   "states": {
    "paused": "idle",
    "playing": "active"
   },
   "loop": 0,
   "module": "prism-deck/src/glyphs/media/play-pause.js"
  },
  {
   "id": "clock",
   "title": "Clock",
   "category": "time",
   "tags": [
    "clock",
    "time",
    "hour",
    "analog"
   ],
   "states": {
    "default": "idle"
   },
   "loop": 12,
   "module": "prism-deck/src/glyphs/time/clock.js"
  }
 ],
 "galleries": [
  {
   "id": "themes",
   "title": "Themes",
   "icon": "layers",
   "hue": 296,
   "surfaces": [
    "deck"
   ],
   "blurb": "One facet per deck theme: the whole device dressed in that material — every glyph, label, state and press.",
   "count": 11,
   "categories": [
    {
     "name": "Signature",
     "count": 1
    },
    {
     "name": "Dark",
     "count": 6
    },
    {
     "name": "Light",
     "count": 2
    },
    {
     "name": "Experimental",
     "count": 2
    }
   ]
  },
  {
   "id": "icons",
   "title": "Icons",
   "icon": "grid",
   "hue": 269.8,
   "surfaces": [
    "key"
   ],
   "blurb": "One facet per glyph — 48-unit geometry with states and idle motion, rendered in any theme.",
   "count": 56,
   "categories": [
    {
     "name": "Media",
     "count": 6
    },
    {
     "name": "Audio",
     "count": 7
    },
    {
     "name": "Streaming",
     "count": 6
    },
    {
     "name": "System",
     "count": 7
    },
    {
     "name": "Status",
     "count": 6
    },
    {
     "name": "Time",
     "count": 5
    },
    {
     "name": "Navigation",
     "count": 5
    },
    {
     "name": "Productivity",
     "count": 4
    },
    {
     "name": "Dev & Ops",
     "count": 6
    },
    {
     "name": "Home & Light",
     "count": 4
    }
   ]
  },
  {
   "id": "motion",
   "title": "Motion",
   "icon": "pulse",
   "hue": 243.6,
   "surfaces": [
    "key"
   ],
   "blurb": "Key animations built for the hardware: press feedback, state transitions, idle loops and alerts.",
   "count": 19,
   "categories": [
    {
     "name": "Press Feedback",
     "count": 5
    },
    {
     "name": "State Transitions",
     "count": 4
    },
    {
     "name": "Idle Loops",
     "count": 6
    },
    {
     "name": "Alerts & Attention",
     "count": 4
    }
   ]
  },
  {
   "id": "spans",
   "title": "Spans",
   "icon": "waveform",
   "hue": 191.3,
   "surfaces": [
    "span"
   ],
   "blurb": "Animations across blocks of keys — the physical gaps are hidden pixels, so motion reads continuous behind the bezel.",
   "count": 11,
   "categories": [
    {
     "name": "Waveforms & Audio",
     "count": 1
    },
    {
     "name": "Bars & Meters",
     "count": 2
    },
    {
     "name": "Text & Marquee",
     "count": 2
    },
    {
     "name": "Ripples & Light",
     "count": 2
    },
    {
     "name": "Whole Device",
     "count": 4
    }
   ]
  },
  {
   "id": "dials",
   "title": "Dials & Strips",
   "icon": "sliders",
   "hue": 138.9,
   "surfaces": [
    "strip"
   ],
   "blurb": "Stream Deck + / + XL encoders: 200×100 dial segments and full touch-strip panoramas.",
   "count": 10,
   "categories": [
    {
     "name": "Dial Segments",
     "count": 5
    },
    {
     "name": "Strip Panoramas",
     "count": 3
    },
    {
     "name": "Gauges & Scrubbers",
     "count": 2
    }
   ]
  },
  {
   "id": "screens",
   "title": "Screens",
   "icon": "monitor",
   "hue": 86.5,
   "surfaces": [
    "screen",
    "strip"
   ],
   "blurb": "Display widgets: the Galleon 100 SD screen, the Neo info bar and Stream Deck + strip dashboards.",
   "count": 11,
   "categories": [
    {
     "name": "Galleon Dashboards",
     "count": 5
    },
    {
     "name": "Neo Info Bar",
     "count": 4
    },
    {
     "name": "Strip Dashboards",
     "count": 2
    }
   ]
  },
  {
   "id": "apps",
   "title": "Apps",
   "icon": "cpu",
   "hue": 60.4,
   "surfaces": [
    "key",
    "span",
    "strip",
    "screen",
    "deck"
   ],
   "blurb": "Live apps composed from the above plus data sources: audio, system, clocks and timers, dashboards.",
   "count": 27,
   "categories": [
    {
     "name": "Audio",
     "count": 5
    },
    {
     "name": "System",
     "count": 8
    },
    {
     "name": "Clocks & Timers",
     "count": 1
    },
    {
     "name": "Dashboards",
     "count": 13
    }
   ]
  }
 ],
 "facets": [
  {
   "id": "theme-prism",
   "title": "Prism",
   "gallery": "themes",
   "galleryTitle": "Themes",
   "category": "Signature",
   "description": "Refraction on hardware: ink-navy glass keys lit from inside, the spectral Beam on every key that is on, pressed keys refracting.",
   "tags": [
    "theme",
    "preview",
    "signature",
    "glass",
    "spectrum",
    "refraction"
   ],
   "surface": "deck",
   "span": null,
   "segments": null,
   "screens": null,
   "devices": null,
   "glyph": null,
   "theme": "prism",
   "animated": true,
   "fps": 8,
   "loop": 6,
   "states": [],
   "tones": null,
   "press": "momentary",
   "params": {},
   "data": [],
   "dataShape": null,
   "targets": [
    {
     "device": "mini"
    },
    {
     "device": "mk2"
    },
    {
     "device": "xl"
    },
    {
     "device": "neo"
    },
    {
     "device": "plus"
    },
    {
     "device": "plusxl"
    },
    {
     "device": "galleon"
    },
    {
     "device": "studio"
    }
   ],
   "since": "0.1.0",
   "credits": null,
   "module": "prism-deck/src/facets/themes/prism.js",
   "imports": [
    "./_deck.js"
   ],
   "usage": {
    "plugin": "Stream Deck app → Prism Deck → \"Prism Facet\" → Prism",
    "code": "import { render, findFacet } from 'prism-deck';\nconst frame = render(findFacet('theme-prism'), { device: 'mk2', theme: 'prism', t: 1.5 }); // { svg, keys?, segments?, … }",
    "web": "import { mountDevice } from 'prism-deck/web';\nmountDevice(el, { model: 'mk2', facet: 'theme-prism', resolve: findFacet });",
    "page": "https://prism.jeremyfhall.com/deck/#theme-prism"
   },
   "preview": {
    "device": "mini",
    "w": 320,
    "h": 240,
    "t": 2.4000000000000004,
    "svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"8\" height=\"8\"/>"
   }
  },
  {
   "id": "icon-mic",
   "title": "Microphone",
   "gallery": "icons",
   "galleryTitle": "Icons",
   "category": "Audio",
   "description": "The microphone glyph (on / off): 48-unit geometry, painted by whichever deck theme is active.",
   "tags": [
    "icon",
    "mic",
    "microphone",
    "mute",
    "voice",
    "call",
    "meeting"
   ],
   "surface": "key",
   "span": null,
   "segments": null,
   "screens": null,
   "devices": null,
   "glyph": "mic",
   "theme": null,
   "animated": true,
   "fps": 12,
   "loop": 1.6,
   "states": [
    "on",
    "off"
   ],
   "tones": {
    "on": "active",
    "off": "neg"
   },
   "press": "toggle",
   "params": {
    "label": {
     "label": "Label",
     "type": "text",
     "default": "Mic",
     "maxLength": 14
    },
    "showLabel": {
     "label": "Show label",
     "type": "bool",
     "default": true
    },
    "level": {
     "label": "Level",
     "type": "number",
     "default": 0.7,
     "min": 0,
     "max": 1,
     "step": 0.05
    },
    "hue": {
     "label": "Hue",
     "type": "hue",
     "default": 269.8,
     "min": 0,
     "max": 360,
     "step": 1
    }
   },
   "data": [],
   "dataShape": null,
   "targets": [
    {
     "size": {
      "w": 72,
      "h": 72
     }
    },
    {
     "size": {
      "w": 80,
      "h": 80
     }
    },
    {
     "size": {
      "w": 96,
      "h": 96
     }
    },
    {
     "size": {
      "w": 112,
      "h": 112
     }
    },
    {
     "size": {
      "w": 120,
      "h": 120
     }
    },
    {
     "size": {
      "w": 144,
      "h": 112
     }
    },
    {
     "size": {
      "w": 160,
      "h": 160
     }
    }
   ],
   "since": "0.1.0",
   "credits": null,
   "module": "prism-deck/src/facets/icons/mic.js",
   "imports": [
    "./_icon.js"
   ],
   "usage": {
    "plugin": "Stream Deck app → Prism Deck → \"Prism Facet\" → Microphone",
    "code": "import { render, findFacet } from 'prism-deck';\nconst frame = render(findFacet('icon-mic'), { device: 'mk2', theme: 'prism', t: 1.5 }); // { svg, keys?, segments?, … }",
    "web": "import { mountDevice } from 'prism-deck/web';\nmountDevice(el, { model: 'mk2', keys: ['icon-mic'], resolve: findFacet });",
    "page": "https://prism.jeremyfhall.com/deck/#icon-mic"
   },
   "preview": {
    "size": 72,
    "w": 72,
    "h": 72,
    "t": 0.6400000000000001,
    "svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"8\" height=\"8\"/>"
   }
  },
  {
   "id": "icon-play-pause",
   "title": "Play / Pause",
   "gallery": "icons",
   "galleryTitle": "Icons",
   "category": "Media",
   "description": "The play / pause glyph (paused / playing): 48-unit geometry, painted by whichever deck theme is active.",
   "tags": [
    "icon",
    "play",
    "pause",
    "transport",
    "media",
    "music"
   ],
   "surface": "key",
   "span": null,
   "segments": null,
   "screens": null,
   "devices": null,
   "glyph": "play-pause",
   "theme": null,
   "animated": true,
   "fps": 10,
   "loop": 2,
   "states": [
    "paused",
    "playing"
   ],
   "tones": {
    "paused": "idle",
    "playing": "active"
   },
   "press": "toggle",
   "params": {
    "label": {
     "label": "Label",
     "type": "text",
     "default": "Play",
     "maxLength": 14
    },
    "showLabel": {
     "label": "Show label",
     "type": "bool",
     "default": true
    },
    "level": {
     "label": "Level",
     "type": "number",
     "default": 0.7,
     "min": 0,
     "max": 1,
     "step": 0.05
    },
    "hue": {
     "label": "Hue",
     "type": "hue",
     "default": 269.8,
     "min": 0,
     "max": 360,
     "step": 1
    }
   },
   "data": [],
   "dataShape": null,
   "targets": [
    {
     "size": {
      "w": 72,
      "h": 72
     }
    },
    {
     "size": {
      "w": 80,
      "h": 80
     }
    },
    {
     "size": {
      "w": 96,
      "h": 96
     }
    },
    {
     "size": {
      "w": 112,
      "h": 112
     }
    },
    {
     "size": {
      "w": 120,
      "h": 120
     }
    },
    {
     "size": {
      "w": 144,
      "h": 112
     }
    },
    {
     "size": {
      "w": 160,
      "h": 160
     }
    }
   ],
   "since": "0.1.0",
   "credits": null,
   "module": "prism-deck/src/facets/icons/play-pause.js",
   "imports": [
    "./_icon.js"
   ],
   "usage": {
    "plugin": "Stream Deck app → Prism Deck → \"Prism Facet\" → Play / Pause",
    "code": "import { render, findFacet } from 'prism-deck';\nconst frame = render(findFacet('icon-play-pause'), { device: 'mk2', theme: 'prism', t: 1.5 }); // { svg, keys?, segments?, … }",
    "web": "import { mountDevice } from 'prism-deck/web';\nmountDevice(el, { model: 'mk2', keys: ['icon-play-pause'], resolve: findFacet });",
    "page": "https://prism.jeremyfhall.com/deck/#icon-play-pause"
   },
   "preview": {
    "size": 72,
    "w": 72,
    "h": 72,
    "t": 0.8,
    "svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"8\" height=\"8\"/>"
   }
  },
  {
   "id": "icon-clock",
   "title": "Clock",
   "gallery": "icons",
   "galleryTitle": "Icons",
   "category": "Time",
   "description": "The clock glyph: 48-unit geometry, painted by whichever deck theme is active.",
   "tags": [
    "icon",
    "clock",
    "time",
    "hour",
    "analog"
   ],
   "surface": "key",
   "span": null,
   "segments": null,
   "screens": null,
   "devices": null,
   "glyph": "clock",
   "theme": null,
   "animated": true,
   "fps": 12,
   "loop": 12,
   "states": [],
   "tones": null,
   "press": "momentary",
   "params": {
    "label": {
     "label": "Label",
     "type": "text",
     "default": "Clock",
     "maxLength": 14
    },
    "showLabel": {
     "label": "Show label",
     "type": "bool",
     "default": true
    },
    "level": {
     "label": "Level",
     "type": "number",
     "default": 0.7,
     "min": 0,
     "max": 1,
     "step": 0.05
    },
    "hue": {
     "label": "Hue",
     "type": "hue",
     "default": 269.8,
     "min": 0,
     "max": 360,
     "step": 1
    }
   },
   "data": [],
   "dataShape": null,
   "targets": [
    {
     "size": {
      "w": 72,
      "h": 72
     }
    },
    {
     "size": {
      "w": 80,
      "h": 80
     }
    },
    {
     "size": {
      "w": 96,
      "h": 96
     }
    },
    {
     "size": {
      "w": 112,
      "h": 112
     }
    },
    {
     "size": {
      "w": 120,
      "h": 120
     }
    },
    {
     "size": {
      "w": 144,
      "h": 112
     }
    },
    {
     "size": {
      "w": 160,
      "h": 160
     }
    }
   ],
   "since": "0.1.0",
   "credits": null,
   "module": "prism-deck/src/facets/icons/clock.js",
   "imports": [
    "./_icon.js"
   ],
   "usage": {
    "plugin": "Stream Deck app → Prism Deck → \"Prism Facet\" → Clock",
    "code": "import { render, findFacet } from 'prism-deck';\nconst frame = render(findFacet('icon-clock'), { device: 'mk2', theme: 'prism', t: 1.5 }); // { svg, keys?, segments?, … }",
    "web": "import { mountDevice } from 'prism-deck/web';\nmountDevice(el, { model: 'mk2', keys: ['icon-clock'], resolve: findFacet });",
    "page": "https://prism.jeremyfhall.com/deck/#icon-clock"
   },
   "preview": {
    "size": 72,
    "w": 72,
    "h": 72,
    "t": 4.800000000000001,
    "svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"8\" height=\"8\"/>"
   }
  },
  {
   "id": "press-ripple",
   "title": "Spectral Ripple",
   "gallery": "motion",
   "galleryTitle": "Motion",
   "category": "Press Feedback",
   "description": "Every press sends three rings of dispersed light racing out from the glyph, over the theme’s own press feedback.",
   "tags": [
    "press",
    "feedback",
    "ripple",
    "tap",
    "spectrum"
   ],
   "surface": "key",
   "span": null,
   "segments": null,
   "screens": null,
   "devices": null,
   "glyph": null,
   "theme": null,
   "animated": true,
   "fps": 20,
   "loop": 2.4,
   "states": [],
   "tones": null,
   "press": "momentary",
   "params": {
    "glyph": {
     "label": "Glyph",
     "type": "glyph",
     "default": "power"
    },
    "label": {
     "label": "Label",
     "type": "text",
     "default": "Press",
     "maxLength": 14
    },
    "autoplay": {
     "label": "Demo press when idle",
     "type": "bool",
     "default": true
    }
   },
   "data": [],
   "dataShape": null,
   "targets": [
    {
     "size": {
      "w": 72,
      "h": 72
     }
    },
    {
     "size": {
      "w": 80,
      "h": 80
     }
    },
    {
     "size": {
      "w": 96,
      "h": 96
     }
    },
    {
     "size": {
      "w": 112,
      "h": 112
     }
    },
    {
     "size": {
      "w": 120,
      "h": 120
     }
    },
    {
     "size": {
      "w": 144,
      "h": 112
     }
    },
    {
     "size": {
      "w": 160,
      "h": 160
     }
    }
   ],
   "since": "0.1.0",
   "credits": null,
   "module": "prism-deck/src/facets/motion/press-ripple.js",
   "imports": [
    "../../scene/index.js",
    "./_autoplay.js"
   ],
   "usage": {
    "plugin": "Stream Deck app → Prism Deck → \"Prism Facet\" → Spectral Ripple",
    "code": "import { render, findFacet } from 'prism-deck';\nconst frame = render(findFacet('press-ripple'), { device: 'mk2', theme: 'prism', t: 1.5 }); // { svg, keys?, segments?, … }",
    "web": "import { mountDevice } from 'prism-deck/web';\nmountDevice(el, { model: 'mk2', keys: ['press-ripple'], resolve: findFacet });",
    "page": "https://prism.jeremyfhall.com/deck/#press-ripple"
   },
   "preview": {
    "size": 72,
    "w": 72,
    "h": 72,
    "t": 0.96,
    "svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"8\" height=\"8\"/>"
   }
  },
  {
   "id": "span-waveform",
   "title": "Waveform",
   "gallery": "spans",
   "galleryTitle": "Spans",
   "category": "Waveforms & Audio",
   "description": "A live audio waveform running across a whole row of keys — one continuous line behind the bezels, newest sound at the right.",
   "tags": [
    "audio",
    "waveform",
    "music",
    "live",
    "span",
    "oscilloscope"
   ],
   "surface": "span",
   "span": {
    "cols": "all",
    "rows": 1
   },
   "segments": null,
   "screens": null,
   "devices": null,
   "glyph": null,
   "theme": null,
   "animated": true,
   "fps": 15,
   "loop": 8,
   "states": [],
   "tones": null,
   "press": "momentary",
   "params": {
    "speed": {
     "label": "Scroll speed",
     "type": "number",
     "default": 1,
     "min": 0.25,
     "max": 3,
     "step": 0.05
    }
   },
   "data": [
    "audio"
   ],
   "dataShape": null,
   "targets": [
    {
     "device": "mini"
    },
    {
     "device": "mk2"
    },
    {
     "device": "xl"
    },
    {
     "device": "neo"
    },
    {
     "device": "plus"
    },
    {
     "device": "plusxl"
    },
    {
     "device": "galleon"
    },
    {
     "device": "studio"
    }
   ],
   "since": "0.1.0",
   "credits": null,
   "module": "prism-deck/src/facets/spans/waveform.js",
   "imports": [
    "../../scene/index.js",
    "../../scene/noise.js"
   ],
   "usage": {
    "plugin": "Stream Deck app → Prism Deck → \"Prism Facet\" → Waveform",
    "code": "import { render, findFacet } from 'prism-deck';\nconst frame = render(findFacet('span-waveform'), { device: 'mk2', theme: 'prism', t: 1.5 }); // { svg, keys?, segments?, … }",
    "web": "import { mountDevice } from 'prism-deck/web';\nmountDevice(el, { model: 'mk2', facet: 'span-waveform', resolve: findFacet });",
    "page": "https://prism.jeremyfhall.com/deck/#span-waveform"
   },
   "preview": {
    "device": "mini",
    "w": 295,
    "h": 80,
    "t": 3.2,
    "svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"8\" height=\"8\"/>"
   }
  },
  {
   "id": "dial-volume",
   "title": "Volume Dial",
   "gallery": "dials",
   "galleryTitle": "Dials & Strips",
   "category": "Dial Segments",
   "description": "Turn to set the level, push to mute. The segment shows the value as a spectral Beam with the live signal moving beneath it.",
   "tags": [
    "volume",
    "audio",
    "dial",
    "encoder",
    "mute",
    "level",
    "knob"
   ],
   "surface": "strip",
   "span": null,
   "segments": 1,
   "screens": null,
   "devices": null,
   "glyph": null,
   "theme": null,
   "animated": true,
   "fps": 15,
   "loop": 6,
   "states": [
    "on",
    "muted"
   ],
   "tones": {
    "on": "idle",
    "muted": "neg"
   },
   "press": "toggle",
   "params": {
    "label": {
     "label": "Channel",
     "type": "text",
     "default": "Master",
     "maxLength": 12
    },
    "value": {
     "label": "Level",
     "type": "number",
     "default": 0.64,
     "min": 0,
     "max": 1,
     "step": 0.01
    },
    "step": {
     "label": "Step per tick",
     "type": "number",
     "default": 0.02,
     "min": 0.005,
     "max": 0.1,
     "step": 0.005
    }
   },
   "data": [
    "audio"
   ],
   "dataShape": null,
   "targets": [
    {
     "device": "plus",
     "segments": 1
    }
   ],
   "since": "0.1.0",
   "credits": null,
   "module": "prism-deck/src/facets/dials/volume.js",
   "imports": [
    "../../scene/index.js",
    "../../scene/noise.js",
    "../../scene/easing.js"
   ],
   "usage": {
    "plugin": "Stream Deck app → Prism Deck → \"Prism Facet\" → Volume Dial (on a dial)",
    "code": "import { render, findFacet } from 'prism-deck';\nconst frame = render(findFacet('dial-volume'), { device: 'plus', theme: 'prism', t: 1.5 }); // { svg, keys?, segments?, … }",
    "web": "import { mountDevice } from 'prism-deck/web';\nmountDevice(el, { model: 'plus', dials: ['dial-volume'], resolve: findFacet });",
    "page": "https://prism.jeremyfhall.com/deck/#dial-volume"
   },
   "preview": {
    "device": "plus",
    "segments": 1,
    "w": 200,
    "h": 100,
    "t": 2.4000000000000004,
    "svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"8\" height=\"8\"/>"
   }
  },
  {
   "id": "strip-refraction",
   "title": "Refraction Waves",
   "gallery": "dials",
   "galleryTitle": "Dials & Strips",
   "category": "Strip Panoramas",
   "description": "Spectral ribbons flow across the whole touch strip; each dial swells the light above it. One labeled channel per dial, one panorama.",
   "tags": [
    "strip",
    "touch strip",
    "panorama",
    "eq",
    "waves",
    "spectrum"
   ],
   "surface": "strip",
   "span": null,
   "segments": "all",
   "screens": null,
   "devices": null,
   "glyph": null,
   "theme": null,
   "animated": true,
   "fps": 5,
   "loop": 10,
   "states": [],
   "tones": null,
   "press": "momentary",
   "params": {
    "labels": {
     "label": "Channel labels (comma separated)",
     "type": "text",
     "default": "Low,Mid,High,Air,FX,Out",
     "maxLength": 48
    }
   },
   "data": [],
   "dataShape": null,
   "targets": [
    {
     "device": "plus"
    },
    {
     "device": "plusxl"
    }
   ],
   "since": "0.1.0",
   "credits": null,
   "module": "prism-deck/src/facets/dials/refraction.js",
   "imports": [
    "../../scene/index.js",
    "../../scene/easing.js"
   ],
   "usage": {
    "plugin": "Stream Deck app → Prism Deck → \"Prism Facet\" → Refraction Waves (on a dial)",
    "code": "import { render, findFacet } from 'prism-deck';\nconst frame = render(findFacet('strip-refraction'), { device: 'plus', theme: 'prism', t: 1.5 }); // { svg, keys?, segments?, … }",
    "web": "import { mountDevice } from 'prism-deck/web';\nmountDevice(el, { model: 'plus', strip: 'strip-refraction', resolve: findFacet });",
    "page": "https://prism.jeremyfhall.com/deck/#strip-refraction"
   },
   "preview": {
    "device": "plus",
    "w": 800,
    "h": 100,
    "t": 4,
    "svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"8\" height=\"8\"/>"
   }
  },
  {
   "id": "screen-galleon-dashboard",
   "title": "Galleon Dashboard",
   "gallery": "screens",
   "galleryTitle": "Screens",
   "category": "Galleon Dashboards",
   "description": "The Galleon 100 SD screen as an everyday overview: the clock and your next event, volume on the right dial, CPU and network — one widget per dial layer.",
   "tags": [
    "galleon",
    "corsair",
    "screen",
    "dashboard",
    "cpu",
    "clock",
    "volume",
    "network",
    "widgets"
   ],
   "surface": "screen",
   "span": null,
   "segments": null,
   "screens": [
    "galleon"
   ],
   "devices": null,
   "glyph": null,
   "theme": null,
   "animated": true,
   "fps": 4,
   "loop": 12,
   "states": [],
   "tones": null,
   "press": "momentary",
   "params": {
    "layer": {
     "label": "Active layer (marked under the widgets)",
     "type": "select",
     "default": "top",
     "options": [
      "top",
      "bottom",
      "none"
     ]
    },
    "volume": {
     "label": "Volume (when no source sends one)",
     "type": "number",
     "default": 0.62,
     "min": 0,
     "max": 1,
     "step": 0.01
    },
    "hour12": {
     "label": "12-hour clock",
     "type": "bool",
     "default": false
    }
   },
   "data": [
    "cpu",
    "net",
    "audio",
    "clock",
    "calendar",
    "uptime"
   ],
   "dataShape": {
    "cpu": "number 0–1",
    "net": "{ up, down } bytes/s",
    "uptime": "seconds",
    "calendar": "{ next: { title, at, end }, current? }",
    "media": "{ volume? 0–1, muted? } (system volume)",
    "series": "{ cpu?, down?, up? } (extension)"
   },
   "targets": [
    {
     "screen": "galleon",
     "device": "galleon"
    }
   ],
   "since": "0.1.0",
   "credits": null,
   "module": "prism-deck/src/facets/screens/galleon-dashboard.js",
   "imports": [
    "../../scene/index.js",
    "./_d5-kit.js",
    "./_d5-widgets.js"
   ],
   "usage": {
    "plugin": "Stream Deck app → Prism Deck → \"Prism Facet\" → Galleon Dashboard (Galleon dial widget / Neo info bar)",
    "code": "import { render, findFacet } from 'prism-deck';\nconst frame = render(findFacet('screen-galleon-dashboard'), { device: 'galleon', theme: 'prism', t: 1.5 }); // { svg, keys?, segments?, … }",
    "web": "import { mountDevice } from 'prism-deck/web';\nmountDevice(el, { model: 'galleon', screen: 'screen-galleon-dashboard', resolve: findFacet });",
    "page": "https://prism.jeremyfhall.com/deck/#screen-galleon-dashboard"
   },
   "preview": {
    "screen": "galleon",
    "device": "galleon",
    "w": 720,
    "h": 384,
    "t": 4.800000000000001,
    "svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"8\" height=\"8\"/>"
   }
  },
  {
   "id": "screen-neo-clock",
   "title": "Neo Info-Bar Clock",
   "gallery": "screens",
   "galleryTitle": "Screens",
   "category": "Neo Info Bar",
   "description": "The Neo info bar as a clock: tabular time, the date as an instrument label, your next event, and a Beam that walks the Spectrum with the seconds.",
   "tags": [
    "neo",
    "info bar",
    "clock",
    "time",
    "date",
    "screen",
    "calendar"
   ],
   "surface": "screen",
   "span": null,
   "segments": null,
   "screens": [
    "infobar"
   ],
   "devices": null,
   "glyph": null,
   "theme": null,
   "animated": true,
   "fps": 1,
   "loop": 60,
   "states": [],
   "tones": null,
   "press": "momentary",
   "params": {
    "hour12": {
     "label": "12-hour clock",
     "type": "bool",
     "default": false
    },
    "showNext": {
     "label": "Show the next event",
     "type": "bool",
     "default": true
    }
   },
   "data": [
    "clock",
    "calendar"
   ],
   "dataShape": {
    "calendar": "{ next: { title, at }, current? } epoch ms"
   },
   "targets": [
    {
     "screen": "infobar",
     "device": "neo"
    }
   ],
   "since": "0.1.0",
   "credits": null,
   "module": "prism-deck/src/facets/screens/neo-clock.js",
   "imports": [
    "../../scene/index.js",
    "../../scene/text.js",
    "../apps/_data.js",
    "./_d5-kit.js"
   ],
   "usage": {
    "plugin": "Stream Deck app → Prism Deck → \"Prism Facet\" → Neo Info-Bar Clock (Galleon dial widget / Neo info bar)",
    "code": "import { render, findFacet } from 'prism-deck';\nconst frame = render(findFacet('screen-neo-clock'), { device: 'neo', theme: 'prism', t: 1.5 }); // { svg, keys?, segments?, … }",
    "web": "import { mountDevice } from 'prism-deck/web';\nmountDevice(el, { model: 'neo', screen: 'screen-neo-clock', resolve: findFacet });",
    "page": "https://prism.jeremyfhall.com/deck/#screen-neo-clock"
   },
   "preview": {
    "screen": "infobar",
    "device": "neo",
    "w": 232,
    "h": 50,
    "t": 6,
    "svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"8\" height=\"8\"/>"
   }
  },
  {
   "id": "app-cpu-ring",
   "title": "CPU Ring",
   "gallery": "apps",
   "galleryTitle": "Apps",
   "category": "System",
   "description": "CPU load on a 270° spectral ring, live from the system source (simulated when none is wired); the head warms past your thresholds.",
   "tags": [
    "cpu",
    "system",
    "monitor",
    "gauge",
    "ring",
    "percent",
    "live"
   ],
   "surface": "key",
   "span": null,
   "segments": null,
   "screens": null,
   "devices": null,
   "glyph": null,
   "theme": null,
   "animated": true,
   "fps": 4,
   "loop": 12,
   "states": [],
   "tones": null,
   "press": "momentary",
   "params": {
    "label": {
     "label": "Label",
     "type": "text",
     "default": "CPU",
     "maxLength": 10
    },
    "warn": {
     "label": "Warn at",
     "type": "number",
     "default": 0.75,
     "min": 0,
     "max": 1,
     "step": 0.05
    },
    "crit": {
     "label": "Critical at",
     "type": "number",
     "default": 0.9,
     "min": 0,
     "max": 1,
     "step": 0.05
    }
   },
   "data": [
    "cpu"
   ],
   "dataShape": null,
   "targets": [
    {
     "size": {
      "w": 72,
      "h": 72
     }
    },
    {
     "size": {
      "w": 80,
      "h": 80
     }
    },
    {
     "size": {
      "w": 96,
      "h": 96
     }
    },
    {
     "size": {
      "w": 112,
      "h": 112
     }
    },
    {
     "size": {
      "w": 120,
      "h": 120
     }
    },
    {
     "size": {
      "w": 144,
      "h": 112
     }
    },
    {
     "size": {
      "w": 160,
      "h": 160
     }
    }
   ],
   "since": "0.1.0",
   "credits": null,
   "module": "prism-deck/src/facets/apps/cpu-ring.js",
   "imports": [
    "../../scene/index.js",
    "../../scene/noise.js",
    "../../scene/easing.js"
   ],
   "usage": {
    "plugin": "Stream Deck app → Prism Deck → \"Prism Facet\" → CPU Ring",
    "code": "import { render, findFacet } from 'prism-deck';\nconst frame = render(findFacet('app-cpu-ring'), { device: 'mk2', theme: 'prism', t: 1.5 }); // { svg, keys?, segments?, … }",
    "web": "import { mountDevice } from 'prism-deck/web';\nmountDevice(el, { model: 'mk2', keys: ['app-cpu-ring'], resolve: findFacet });",
    "page": "https://prism.jeremyfhall.com/deck/#app-cpu-ring"
   },
   "preview": {
    "size": 72,
    "w": 72,
    "h": 72,
    "t": 4.800000000000001,
    "svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"8\" height=\"8\"/>"
   }
  }
 ],
 "sources": {
  "prism-deck/src/facets/icons/mic.js": "import { iconFacet } from './_icon.js';\n\nexport default iconFacet('mic', { label: 'Mic' });\n"
 }
};
