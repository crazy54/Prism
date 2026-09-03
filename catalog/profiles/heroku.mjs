/* Heroku theme-pack profile (JFH-71) — Phase-2 design system.
   ----------------------------------------------------------------------------
   Brand-inspired (Heroku's identity is its layered "Purple3" palette on soft
   near-white paper / deep purple-charcoal dark surfaces). Component tokens are
   approximated, not lifted from an official component library.

   Feeds BOTH tools off one file:
     • _scaffold_ds.mjs (F6) reads palette.{dark,light} verbatim → heroku-dark /
       heroku-light registry + MCP-mirror entries.
     • _gen_system.mjs (F4) reads ds/dsShort/tokenProfile for the 100 facets.

   Visual language: calm developer-platform purple — Purple3 (#79589f) as the
   through-line across light and dark, faint purple-tinted surfaces, restful
   contrast, friendly humanist type. 100% offline: NO external fonts — the brand
   look is approximated with a neutral system sans stack. Facets reference only
   the GLOBAL tokens below (var(--accent) …), never raw hex, so they re-skin with
   the active theme and pass the token-only gate. */
export default {
  ds: 'Heroku',
  dsShort: 'heroku',
  homeUrl: 'https://www.heroku.com/',
  ticket: 'JFH-71',
  accent: '#79589f',            // Purple3 — the brand primary (advisory; palette wins)

  palette: {
    // Light: soft near-white paper with a faint purple tint, deep aubergine ink,
    // Purple3 accent. Semantic roles use blue-violet / green / amber / rose /
    // magenta hues that sit comfortably beside the purple identity.
    light: {
      '--bg': '#faf9fc', '--panel': '#ffffff', '--panel2': '#f4f1f9', '--card': '#ffffff', '--line': '#e4e0ec',
      '--ink': '#2a2734', '--muted': '#6f6a7d', '--dim': '#a49db3',
      '--accent': '#79589f', '--accent-rgb': '121,88,159', '--accent2': '#79589f',  // Purple3
      '--info': '#6f7bd6', '--info-rgb': '111,123,214',                    // blue-violet
      '--pos': '#3fae6b', '--pos-rgb': '63,174,107',                       // success green
      '--warn': '#e0a13a', '--warn-rgb': '224,161,58',                     // amber
      '--neg': '#d0455f', '--neg-rgb': '208,69,95',                        // rose/danger
      '--crit': '#b5479f', '--crit-rgb': '181,71,159',                     // magenta
      '--cardgrad': 'linear-gradient(157deg,rgba(121,88,159,.06),rgba(121,88,159,0) 55%)',
    },
    // Dark: deep purple-charcoal surfaces (the signature Heroku dark ground) with
    // Purple3 holding steady on top and the semantic hues brightened for contrast.
    dark: {
      '--bg': '#1a1523', '--panel': '#2a2338', '--panel2': '#201a2b', '--card': '#2a2338', '--line': '#3a3350',
      '--ink': '#f2eef8', '--muted': '#b0a6c2', '--dim': '#7a7090',
      '--accent': '#79589f', '--accent-rgb': '121,88,159', '--accent2': '#79589f',  // Purple3
      '--info': '#8b96e2', '--info-rgb': '139,150,226',                    // brightened blue-violet
      '--pos': '#56c483', '--pos-rgb': '86,196,131',
      '--warn': '#edb455', '--warn-rgb': '237,180,85',
      '--neg': '#e26075', '--neg-rgb': '226,96,117',
      '--crit': '#cc63b3', '--crit-rgb': '204,99,179',
      '--cardgrad': 'linear-gradient(157deg,rgba(121,88,159,.08),rgba(121,88,159,0) 55%)',
    },
  },

  // Structural tokens for the F4 facet generator (become .heroku-root custom
  // props). Gently rounded corners + a neutral humanist system-sans stack (no
  // webfonts) approximating the brand's clean developer-platform voice.
  tokenProfile: {
    radius: '8px',   // -> --heroku-radius : soft, gently rounded corners
    font: '"Segoe UI", system-ui, -apple-system, Roboto, Helvetica, Arial, sans-serif', // -> --heroku-font (offline system sans)
  },
};
