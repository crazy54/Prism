/* Duolingo theme-pack profile (JFH-67) — Phase-2 design system.
   ----------------------------------------------------------------------------
   Feeds BOTH tools off one file:
     • catalog/_scaffold_ds.mjs (F6) reads palette.{dark,light} verbatim as the
       :root token overrides layered over the Cloudscape base → duolingo-dark /
       duolingo-light registry + MCP-mirror entries.
     • catalog/_gen_system.mjs (F4) reads ds/dsShort/tokenProfile to author the
       100 native facets tagged data-spectrum="duolingo".

   Visual language: playful ed-tech — bold Feather-green primary, big chunky
   rounded shapes, friendly type, celebratory color. Palette values are
   Duolingo's own named brand colors (Feather Green, Macaw, Fox, Cardinal,
   Beetle) + its real dark-mode surfaces. 100% offline: NO external fonts — the
   brand's rounded look is approximated with a system rounded-font stack. Facets
   only ever reference the GLOBAL tokens below (var(--accent) …), never raw hex,
   so they re-skin with whatever theme is active and pass the token-only gate. */
export default {
  ds: 'Duolingo',
  dsShort: 'duolingo',
  homeUrl: 'https://design.duolingo.com/',
  ticket: 'JFH-67',
  accent: '#58cc02',            // Feather Green — the brand primary (advisory; palette wins)

  // Hand-authored palette for both modes (author-controlled; the scaffolder uses
  // these verbatim). Every surface/text/accent token is set so nothing bleeds
  // through from the Cloudscape base. Six distinct, authentic brand hues map onto
  // the six semantic roles so the generated facet variants read as a real system.
  palette: {
    light: {
      // surfaces — Polar/Snow with the classic Swan hairline border
      '--bg': '#f7f7f7', '--panel': '#ffffff', '--panel2': '#fbfbfb', '--card': '#ffffff', '--line': '#e5e5e5',
      // text — Eel/Wolf/Hare (Duolingo never uses pure black)
      '--ink': '#3c3c3c', '--muted': '#777777', '--dim': '#afafaf',
      // brand roles
      '--accent': '#58cc02', '--accent-rgb': '88,204,2', '--accent2': '#58cc02',   // Feather Green
      '--info': '#1cb0f6', '--info-rgb': '28,176,246',                              // Macaw
      '--pos': '#89e219', '--pos-rgb': '137,226,25',                               // Mask Green (streak/XP)
      '--warn': '#ff9600', '--warn-rgb': '255,150,0',                              // Fox
      '--neg': '#ff4b4b', '--neg-rgb': '255,75,75',                                // Cardinal
      '--crit': '#ce82ff', '--crit-rgb': '206,130,255',                            // Beetle
      '--cardgrad': 'linear-gradient(157deg,rgba(88,204,2,.06),rgba(88,204,2,0) 55%)',
    },
    dark: {
      // surfaces — Duolingo's real dark-mode charcoal/teal set
      '--bg': '#131f24', '--panel': '#202f36', '--panel2': '#1b2a30', '--card': '#202f36', '--line': '#37464f',
      // text — Snow-ish ink on the dark surfaces
      '--ink': '#f1f7fb', '--muted': '#a5b4bd', '--dim': '#6b7c85',
      // brand roles — vivid, unchanged so they pop on the dark surface
      '--accent': '#58cc02', '--accent-rgb': '88,204,2', '--accent2': '#58cc02',   // Feather Green
      '--info': '#1cb0f6', '--info-rgb': '28,176,246',                              // Macaw
      '--pos': '#89e219', '--pos-rgb': '137,226,25',                               // Mask Green
      '--warn': '#ff9600', '--warn-rgb': '255,150,0',                              // Fox
      '--neg': '#ff4b4b', '--neg-rgb': '255,75,75',                                // Cardinal
      '--crit': '#ce82ff', '--crit-rgb': '206,130,255',                            // Beetle
      '--cardgrad': 'linear-gradient(157deg,rgba(88,204,2,.08),rgba(88,204,2,0) 55%)',
    },
  },

  // Structural tokens for the F4 facet generator (become .duolingo-root custom
  // props). Chunky rounded geometry + a rounded system-font stack (no webfonts).
  tokenProfile: {
    radius: '16px',   // -> --duolingo-radius : Duolingo's chunky corner radius
    font: 'ui-rounded, "SF Pro Rounded", "Segoe UI", system-ui, -apple-system, sans-serif', // -> --duolingo-font (offline, rounded)
  },
};
