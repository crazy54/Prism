// A tiny deterministic terminal catalog (same shape as
// prism-term/catalog/terminal-catalog.json) for fast, isolated tests.
const usage = (id) => ({
  cli: `prism-term play ${id}`,
  npx: `npx -y --package=https://prism.example/dl/prism-term.tgz prism-term play ${id}`,
  snapshot: `prism-term snapshot ${id}`,
  code: `import { play, findFacet } from 'prism-term';\nawait play(findFacet('${id}'));`,
  curl: `curl -sL https://prism.example/f/${id}`,
});

const facet = (o) => ({
  galleryTitle: null,
  size: { w: 80, h: 24 },
  minSize: { w: 20, h: 6 },
  animated: true,
  loop: 8,
  canvas: null,
  palette: null,
  params: {},
  since: '0.1.0',
  credits: null,
  module: `prism-term/src/facets/${o.gallery}/${o.id}.js`,
  imports: ['../../canvas.js'],
  source: `// ${o.id}\nexport default { setup() { return () => {}; } };\n`,
  usage: usage(o.id),
  preview: { w: 20, h: 2, text: `${o.id}\n....` },
  ...o,
});

export const TERMINAL_FIXTURE = {
  _ai: { what: 'Prism terminal catalog (fixture)', count: 5, island: '<script type="application/json" id="prism-terminal-catalog">' },
  engine: { package: 'prism-term', version: '0.2.0', repo: 'https://github.com/example/prism-term', npx: 'npx -y --package=https://prism.example/dl/prism-term.tgz prism-term', curl: 'curl -sL https://prism.example/tty', web: 'https://prism.example/terminal/' },
  galleries: [
    { id: 'fx', title: 'FX Store', icon: '✺', blurb: 'Full-field effects.', count: 2, categories: [{ name: 'Fields', count: 1 }, { name: 'Glitch & Noise', count: 1 }] },
    { id: 'loaders', title: 'Spinners & Loaders', icon: '⠿', blurb: 'Working indicators.', count: 2, categories: [{ name: 'Braille Spinners', count: 1 }, { name: 'Classic Spinners', count: 1 }] },
    { id: 'progress', title: 'Progress & Counters', icon: '▰', blurb: 'Progress bars and counters.', count: 1, categories: [{ name: 'Transfers & ETA', count: 1 }] },
  ],
  facets: [
    facet({ id: 'plasma', title: 'Plasma', gallery: 'fx', galleryTitle: 'FX Store', category: 'Fields', kind: 'scene', description: 'Four interfering sine fields cycling through an Oklab palette.', tags: ['plasma', 'demoscene', 'sine'], glyphs: 'unicode', color: 'truecolor', canvas: 'field', palette: 'prism', params: { speed: { default: 1, min: 0.1, max: 4, label: 'Speed' } } }),
    facet({ id: 'matrix', title: 'Digital Rain', gallery: 'fx', galleryTitle: 'FX Store', category: 'Glitch & Noise', kind: 'scene', description: 'Matrix digital rain in halfwidth katakana with white-hot heads.', tags: ['matrix', 'digital rain', 'katakana'], glyphs: 'unicode', color: '256' }),
    facet({ id: 'loaders-braille-orbit', title: 'Braille Orbit', gallery: 'loaders', galleryTitle: 'Spinners & Loaders', category: 'Braille Spinners', kind: 'spinner', description: 'A dot orbiting inside one braille cell — a spinner that never jitters.', tags: ['spinner', 'braille', 'orbit'], glyphs: 'braille', color: '16', size: { w: 12, h: 1 }, minSize: { w: 2, h: 1 } }),
    facet({ id: 'loaders-ascii-line', title: 'Classic Line', gallery: 'loaders', galleryTitle: 'Spinners & Loaders', category: 'Classic Spinners', kind: 'spinner', description: 'The original - \\ | / spinner that works on any terminal ever made.', tags: ['spinner', 'ascii', 'classic'], glyphs: 'ascii', color: 'mono', size: { w: 10, h: 1 }, minSize: { w: 1, h: 1 } }),
    facet({ id: 'progress-download', title: 'Download Progress', gallery: 'progress', galleryTitle: 'Progress & Counters', category: 'Transfers & ETA', kind: 'progress', description: 'A transfer meter with rate, ETA and an eighth-block bar, like curl or wget.', tags: ['progress', 'download', 'eta'], glyphs: 'unicode', color: '256', animated: false, size: { w: 60, h: 3 }, minSize: { w: 30, h: 2 } }),
  ],
};

// The same catalog in schema 2: module code lives once in top-level `sources`
// (with the "_" gallery helpers); facet records carry no `source`. Both loaders
// facets live in one module, whose helper re-exports a helper from another
// gallery; progress-download imports a helper that isn't in `sources`, and an
// engine module that slipped into `sources` must never be returned as a helper.
const P = 'prism-term/src/facets/';
export const V2_MODULES = {
  plasma: `${P}fx/plasma.js`,
  matrix: `${P}fx/matrix.js`,
  loaders: `${P}loaders/spinners.js`,
  progress: `${P}progress/download.js`,
};
const v2 = {
  'loaders-braille-orbit': { module: V2_MODULES.loaders, imports: ['./_frames.js', '../../canvas.js'] },
  'loaders-ascii-line': { module: V2_MODULES.loaders, imports: ['./_frames.js', '../../canvas.js'] },
  plasma: { module: V2_MODULES.plasma, imports: ['./_kit.js', '../../color.js'] },
  matrix: { module: V2_MODULES.matrix, imports: ['../../canvas.js'] },
  'progress-download': { module: V2_MODULES.progress, imports: ['./_missing.js', '../../widgets/index.js'] },
};

export const TERMINAL_FIXTURE_V2 = {
  ...TERMINAL_FIXTURE,
  _ai: { ...TERMINAL_FIXTURE._ai, schema: 2 },
  facets: TERMINAL_FIXTURE.facets.map(({ source, ...f }) => ({ ...f, ...v2[f.id] })),
  sources: {
    [`${P}fx/_kit.js`]: "// fx kit\nexport const wave = (x) => Math.sin(x);\n",
    [`${P}fx/matrix.js`]: "// matrix module\nimport { Canvas } from '../../canvas.js';\nexport default { setup() { return () => {}; } };\n",
    [`${P}fx/plasma.js`]: "// plasma module\nimport { wave } from './_kit.js';\nimport { oklab } from '../../color.js';\nexport default { setup() { return () => wave(1); } };\n",
    [`${P}loaders/_frames.js`]: "// loader frames\nexport * from '../fx/_kit.js';\nexport const FRAMES = ['-', '|', '/'];\n",
    [`${P}loaders/spinners.js`]: "// spinners module: two facets, one file\nimport { FRAMES } from './_frames.js';\nimport { Canvas } from '../../canvas.js';\nconst s = \"</script>\";\nexport const orbit = { id: 'loaders-braille-orbit' };\nexport const line = { id: 'loaders-ascii-line' };\n",
    [`${P}progress/download.js`]: "// download meter\nimport { bar } from './_missing.js';\nimport { Meter } from '../../widgets/index.js';\nexport default { setup() { return () => {}; } };\n",
    'prism-term/src/canvas.js': '// engine module: never a helper\nexport class Canvas {}\n',
  },
};
