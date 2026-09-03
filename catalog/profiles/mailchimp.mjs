/* Mailchimp theme-pack profile (JFH-68) — Phase-2 design system.
   ----------------------------------------------------------------------------
   Brand-inspired (Mailchimp's public system is a Voice & Tone guide; this pack
   adopts the well-known BRAND identity — Cavendish yellow on Peppercorn near-
   black, quirky retro warmth, editorial display type). Component tokens are
   approximated, not lifted from an official component library.

   Feeds BOTH tools off one file:
     • _scaffold_ds.mjs (F6) reads palette.{dark,light} verbatim → mailchimp-dark
       / mailchimp-light registry + MCP-mirror entries.
     • _gen_system.mjs (F4) reads ds/dsShort/tokenProfile for the 100 facets.

   Visual language: signature Cavendish yellow, high-contrast on warm near-black,
   generous whitespace, characterful editorial headings, a dry human voice. 100%
   offline: NO external fonts — the brand's Cooper-style display face is
   approximated with a serif system stack. Facets reference only the GLOBAL
   tokens below (var(--accent) …), never raw hex, so they re-skin with the active
   theme and pass the token-only gate. */
export default {
  ds: 'Mailchimp',
  dsShort: 'mailchimp',
  homeUrl: 'https://styleguide.mailchimp.com/',
  ticket: 'JFH-68',
  accent: '#ffe01b',            // Cavendish Yellow — the brand primary (advisory; palette wins)

  palette: {
    // Light: warm off-white paper, Peppercorn ink, yellow accent. Because pure
    // #ffe01b is illegible as text/fill-on-white, the accent role stays yellow
    // (used as fills/underlines behind dark ink in facets) while text contrast
    // comes from --ink. Semantic roles use warm, high-contrast brand-adjacent hues.
    light: {
      '--bg': '#fbf9f4', '--panel': '#ffffff', '--panel2': '#f6f2e9', '--card': '#ffffff', '--line': '#e6e0d3',
      '--ink': '#241c15', '--muted': '#6b6357', '--dim': '#a89f90',        // Peppercorn family
      '--accent': '#ffe01b', '--accent-rgb': '255,224,27', '--accent2': '#ffe01b',  // Cavendish Yellow
      '--info': '#007c89', '--info-rgb': '0,124,137',                       // Mailchimp teal
      '--pos': '#3caa3c', '--pos-rgb': '60,170,60',                         // warm green
      '--warn': '#ff9d1c', '--warn-rgb': '255,157,28',                      // Squash orange
      '--neg': '#e0503f', '--neg-rgb': '224,80,63',                         // warm brick red
      '--crit': '#c8467c', '--crit-rgb': '200,70,124',                      // warm magenta
      '--cardgrad': 'linear-gradient(157deg,rgba(255,224,27,.10),rgba(255,224,27,0) 55%)',
    },
    // Dark: Peppercorn near-black surfaces (the signature Mailchimp brand ground)
    // with Cavendish yellow popping on top.
    dark: {
      '--bg': '#241c15', '--panel': '#302720', '--panel2': '#2a221b', '--card': '#302720', '--line': '#463b30',
      '--ink': '#f7f3ea', '--muted': '#c2b6a4', '--dim': '#8a7d6c',
      '--accent': '#ffe01b', '--accent-rgb': '255,224,27', '--accent2': '#ffe01b',  // Cavendish Yellow
      '--info': '#3fb6c3', '--info-rgb': '63,182,195',                      // brightened teal on dark
      '--pos': '#5cc95c', '--pos-rgb': '92,201,92',
      '--warn': '#ffab3f', '--warn-rgb': '255,171,63',
      '--neg': '#f0685a', '--neg-rgb': '240,104,90',
      '--crit': '#e069a0', '--crit-rgb': '224,105,160',
      '--cardgrad': 'linear-gradient(157deg,rgba(255,224,27,.12),rgba(255,224,27,0) 55%)',
    },
  },

  // Structural tokens for the F4 facet generator (become .mailchimp-root custom
  // props). Crisp, near-square corners + an editorial serif system stack (no
  // webfonts) to echo the Cooper-style display voice.
  tokenProfile: {
    radius: '6px',   // -> --mailchimp-radius : crisp, characterful corners (not pill-round)
    font: 'Cooper, "Cooper Black", Rockwell, Georgia, "Times New Roman", serif', // -> --mailchimp-font (offline serif stack)
  },
};
