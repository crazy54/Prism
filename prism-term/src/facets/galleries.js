// Terminal facet taxonomy — galleries and their categories.
//
// Mirrors Prism's web galleries (FX Store, Charts & Metrics, AI Working, Text
// Effects, Animated Objects, Notifications & Status, Architecture Diagrams,
// Callouts, Input Methods + Menus & Actions, Maps & Geo, Animation Lab) and adds
// what a terminal catalog needs that the web one doesn't: Spinners & Loaders,
// Progress & Counters, Linux & Ops, Retro & Demoscene, and Pure ASCII.
//
// Every facet names one gallery and one of that gallery's categories; the
// registry rejects anything else, so the catalog stays sorted.

export const GALLERIES = [
  {
    id: 'fx', title: 'FX Store', icon: '✺',
    blurb: 'Full-field effects: plasma, fire, fractals, water and light.',
    categories: ['Fields', 'Fractals', 'Fire & Water', 'Light & Sky', 'Glitch & Noise'],
  },
  {
    id: 'objects', title: 'Animated Objects', icon: '◈',
    blurb: '3D solids, wireframes, globes and mechanical things that move.',
    categories: ['3D Solids', 'Wireframes', 'Globes & Planets', 'Mechanical', 'Icons & Logos'],
  },
  {
    id: 'sim', title: 'Particles & Simulations', icon: '✦',
    blurb: 'Particles, cellular automata, physics, flocking and weather.',
    categories: ['Particles', 'Cellular Automata', 'Physics', 'Life & Flocking', 'Weather'],
  },
  {
    id: 'retro', title: 'Retro & Demoscene', icon: '▚',
    blurb: 'Cracktro scrollers, copper bars, BBS-era ANSI art and chiptune visuals.',
    categories: ['Intros & Scrollers', 'Raster & Copper', 'BBS & ANSI Art', 'Chiptune Visuals', 'Outrun'],
  },
  {
    id: 'text', title: 'Text Effects', icon: 'Aa',
    blurb: 'Banners, bitmap fonts, reveals, glitches and color on type.',
    categories: ['Banners & Fonts', 'Reveal & Type', 'Glitch & Distort', 'Color & Light', 'Motion'],
  },
  {
    id: 'loaders', title: 'Spinners & Loaders', icon: '⠿',
    blurb: 'Every way to say "working…" in one or two cells.',
    categories: ['Classic Spinners', 'Braille Spinners', 'Bars & Pulses', 'Orbits & Shapes', 'Truecolor Spinners'],
  },
  {
    id: 'progress', title: 'Progress & Counters', icon: '▰',
    blurb: 'Progress bars, multi-step pipelines, counters, timers and transfer meters.',
    categories: ['Progress Bars', 'Steps & Pipelines', 'Counters & Odometers', 'Timers & Countdowns', 'Transfers & ETA'],
  },
  {
    id: 'charts', title: 'Charts & Metrics', icon: '▁▃▆',
    blurb: 'Sparklines, line and bar charts, gauges, heatmaps and KPI tiles.',
    categories: ['Sparklines', 'Line & Area', 'Bars & Histograms', 'Gauges & Meters', 'Heatmaps & Matrices', 'KPI Tiles'],
  },
  {
    id: 'ai', title: 'AI Working', icon: '✳',
    blurb: 'Thinking states, token streams, tool calls and agent pipelines.',
    categories: ['Thinking States', 'Token Streams', 'Tool Calls', 'Agents & Pipelines', 'Model Internals'],
  },
  {
    id: 'status', title: 'Notifications & Status', icon: '●',
    blurb: 'Toasts, status lines, badges, health indicators and log lines.',
    categories: ['Toasts & Alerts', 'Status Lines', 'Badges & Pills', 'Health & Uptime', 'Log Lines'],
  },
  {
    id: 'ops', title: 'Linux & Ops', icon: '$_',
    blurb: 'What you see on a real box: monitors, disks, network, services, containers and logins.',
    categories: ['System Monitors', 'Disk & Storage', 'Network', 'Processes & Services', 'Containers & Clusters', 'Logs & Journals', 'Login & MOTD', 'Shell Prompts'],
  },
  {
    id: 'diagrams', title: 'Architecture Diagrams', icon: '┌┐',
    blurb: 'Box-drawing flows, trees, topologies, sequences and git graphs.',
    categories: ['Boxes & Flows', 'Trees & Hierarchies', 'Networks & Topologies', 'Sequence & Timelines', 'Git Graphs'],
  },
  {
    id: 'callouts', title: 'Callouts & Layout', icon: '▌',
    blurb: 'Panels, borders, admonitions, tables, dividers and key-value blocks.',
    categories: ['Panels & Borders', 'Admonitions', 'Tables', 'Dividers & Headers', 'Key-Value'],
  },
  {
    id: 'input', title: 'Input & Menus', icon: '❯',
    blurb: 'TUI controls: selects, checkboxes, text fields, palettes, dialogs and tab bars.',
    categories: ['Selects & Lists', 'Toggles & Checkboxes', 'Text Fields', 'Command Palettes', 'Dialogs & Prompts', 'Tabs & Bars'],
  },
  {
    id: 'maps', title: 'Maps & Geo', icon: '◍',
    blurb: 'World maps, radar sweeps, routes, arcs and floorplans in braille and blocks.',
    categories: ['World Maps', 'Radar & Sonar', 'Routes & Arcs', 'Grids & Floorplans'],
  },
  {
    id: 'lab', title: 'Animation Lab', icon: '∿',
    blurb: 'Motion studies: easing curves, springs, timing and the building blocks of animation.',
    categories: ['Easing & Timing', 'Springs & Physics', 'Loops & Cycles', 'Transitions'],
  },
  {
    id: 'ascii', title: 'Pure ASCII', icon: '#',
    blurb: '7-bit only — no Unicode, no color required. Runs on a VT100, a serial console, anything.',
    categories: ['ASCII Animations', 'ASCII Art', 'ASCII Spinners & Bars', 'Classics'],
  },
];

export const GALLERY_IDS = GALLERIES.map((g) => g.id);
const BY_ID = new Map(GALLERIES.map((g) => [g.id, g]));
export const getGallery = (id) => BY_ID.get(id) || null;
