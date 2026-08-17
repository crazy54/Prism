/* Stack Overflow (Stacks) theme-pack profile (JFH-69) — Phase-2 design system.
   ----------------------------------------------------------------------------
   Brand-inspired by Stack Overflow's public "Stacks" design system. Palette
   values approximate real Stacks tokens (SO orange, SO blue link, SO green,
   Peacock/near-white surfaces, the dark-mode charcoal set). Component tokens are
   approximated, not lifted from an official component library.

   Feeds BOTH tools off one file:
     • _scaffold_ds.mjs (F6) reads palette.{dark,light} verbatim → stackoverflow-
       dark / stackoverflow-light registry + MCP-mirror entries.
     • _gen_system.mjs (F4) reads ds/dsShort/tokenProfile for the 100 facets.

   Visual language: crisp, information-dense, high-contrast utility UI — the
   signature SO orange accent, a calm SO-blue link, tight 4px corners, and a
   clean humanist sans. 100% offline: NO external fonts — the look is
   approximated with a system humanist-sans stack. Facets reference only the
   GLOBAL tokens below (var(--accent) …), never raw hex, so they re-skin with the
   active theme and pass the token-only gate. */
export default {
  ds: 'Stack Overflow',
  dsShort: 'stackoverflow',
  homeUrl: 'https://stackoverflow.design/',
  ticket: 'JFH-69',
  accent: '#f48024',            // SO Orange — the brand primary (advisory; palette wins)

  palette: {
    // Light: near-white Stacks surfaces, near-black ink (#232629), SO blue link
    // for info, SO green for success, an amber warn distinct from the orange
    // accent, SO red for danger, and a distinct magenta-purple critical hue.
    light: {
      '--bg': '#f8f9f9', '--panel': '#ffffff', '--panel2': '#f1f2f3', '--card': '#ffffff', '--line': '#d6d9dc',
      '--ink': '#232629', '--muted': '#6a737c', '--dim': '#9fa6ad',                 // black-750 / black-500 / black-350
      '--accent': '#f48024', '--accent-rgb': '244,128,36', '--accent2': '#f48024',  // SO Orange
      '--info': '#0074cc', '--info-rgb': '0,116,204',                               // SO blue link (blue-500)
      '--pos': '#2f6f44', '--pos-rgb': '47,111,68',                                 // SO green (accepted)
      '--warn': '#b8860b', '--warn-rgb': '184,134,11',                              // amber (distinct from accent)
      '--neg': '#d1383d', '--neg-rgb': '209,56,61',                                 // SO red (red-500)
      '--crit': '#9c2bad', '--crit-rgb': '156,43,173',                              // distinct critical magenta-purple
      '--cardgrad': 'linear-gradient(157deg,rgba(244,128,36,.06),rgba(244,128,36,0) 55%)',
    },
    // Dark: Stacks dark-mode charcoal surfaces (#1e1e1e / #2d2d2d / #262626) with
    // light ink; info/success/warn/danger/critical brightened to pop on dark.
    dark: {
      '--bg': '#1e1e1e', '--panel': '#2d2d2d', '--panel2': '#262626', '--card': '#2d2d2d', '--line': '#3d3d3d',
      '--ink': '#e7e8eb', '--muted': '#9fa6ad', '--dim': '#6e767d',
      '--accent': '#f48024', '--accent-rgb': '244,128,36', '--accent2': '#f48024',  // SO Orange
      '--info': '#4aa3ff', '--info-rgb': '74,163,255',                              // brightened SO blue
      '--pos': '#5eba7d', '--pos-rgb': '94,186,125',                                // brightened SO green
      '--warn': '#e3b341', '--warn-rgb': '227,179,65',                              // brightened amber
      '--neg': '#f4676c', '--neg-rgb': '244,103,108',                               // brightened red
      '--crit': '#c264d6', '--crit-rgb': '194,100,214',                             // brightened critical purple
      '--cardgrad': 'linear-gradient(157deg,rgba(244,128,36,.08),rgba(244,128,36,0) 55%)',
    },
  },

  // Structural tokens for the F4 facet generator (become .stackoverflow-root
  // custom props). Crisp small corners + a clean humanist system-sans stack (no
  // webfonts) to echo the Stacks utilitarian voice.
  tokenProfile: {
    radius: '4px',   // -> --stackoverflow-radius : Stacks' crisp small corner radius
    font: '-apple-system, "Segoe UI", system-ui, Roboto, Helvetica, Arial, sans-serif', // -> --stackoverflow-font (offline humanist sans)
  },
};
