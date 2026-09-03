/* GitHub Primer theme-pack profile (JFH-47) — Phase-2 design system.
   ----------------------------------------------------------------------------
   Palette values are lifted verbatim from Primer Primitives (GitHub's official
   design system): canvas / border / fg surfaces + the semantic fg roles
   (accent, success, attention, danger, done) for both color modes. Primer
   authentically ships a DIFFERENT accent blue per mode — accent.fg #0969da in
   light, #2f81f7 in dark — so each mode's --accent is set to its real token
   (this is intentional, not a mismatch).

   Feeds BOTH tools off one file:
     • _scaffold_ds.mjs (F6) reads palette.{dark,light} verbatim → primer-dark /
       primer-light registry + MCP-mirror entries.
     • _gen_system.mjs (F4) reads ds/dsShort/tokenProfile for the 100 facets.

   Visual language: clean, functional, information-dense; crisp 6px corners and
   GitHub's system-font stack. 100% offline: NO external fonts — Primer uses the
   OS system font stack, reproduced below. Facets reference only the GLOBAL
   tokens (var(--accent) …), never raw hex, so they re-skin with the active
   theme and pass the token-only gate. */
export default {
  ds: 'GitHub Primer',
  dsShort: 'primer',
  homeUrl: 'https://primer.style/',
  ticket: 'JFH-47',
  accent: '#0969da',            // accent.fg (light) — the brand primary (advisory; palette wins)

  palette: {
    // Light: canvas.default white ground, canvas.subtle panels, Primer's neutral
    // border + fg scale, and the light-mode semantic fg tokens.
    light: {
      '--bg': '#ffffff', '--panel': '#f6f8fa', '--panel2': '#f6f8fa', '--card': '#ffffff', '--line': '#d1d9e0',
      '--ink': '#1f2328', '--muted': '#59636e', '--dim': '#6e7781',              // fg.default / fg.muted / fg.subtle
      '--accent': '#0969da', '--accent-rgb': '9,105,218', '--accent2': '#0969da',  // accent.fg
      '--info': '#0969da', '--info-rgb': '9,105,218',                            // accent.fg (info)
      '--pos': '#1a7f37', '--pos-rgb': '26,127,55',                              // success.fg
      '--warn': '#9a6700', '--warn-rgb': '154,103,0',                            // attention.fg
      '--neg': '#cf222e', '--neg-rgb': '207,34,46',                              // danger.fg
      '--crit': '#8250df', '--crit-rgb': '130,80,223',                           // done.fg
      '--cardgrad': 'linear-gradient(157deg,rgba(9,105,218,.06),rgba(9,105,218,0) 55%)',
    },
    // Dark: canvas.default #0d1117 ground, canvas.subtle #161b22 panels, Primer's
    // dark border + fg scale, and the brighter dark-mode semantic fg tokens
    // (including the authentic #2f81f7 dark accent blue).
    dark: {
      '--bg': '#0d1117', '--panel': '#161b22', '--panel2': '#161b22', '--card': '#161b22', '--line': '#30363d',
      '--ink': '#e6edf3', '--muted': '#7d8590', '--dim': '#6e7681',              // fg.default / fg.muted / fg.subtle
      '--accent': '#2f81f7', '--accent-rgb': '47,129,247', '--accent2': '#2f81f7', // accent.fg (dark — authentic per-mode blue)
      '--info': '#2f81f7', '--info-rgb': '47,129,247',                           // accent.fg (info)
      '--pos': '#3fb950', '--pos-rgb': '63,185,80',                              // success.fg
      '--warn': '#d29922', '--warn-rgb': '210,153,34',                           // attention.fg
      '--neg': '#f85149', '--neg-rgb': '248,81,73',                              // danger.fg
      '--crit': '#a371f7', '--crit-rgb': '163,113,247',                          // done.fg
      '--cardgrad': 'linear-gradient(157deg,rgba(47,129,247,.08),rgba(47,129,247,0) 55%)',
    },
  },

  // Structural tokens for the F4 facet generator (become .primer-root custom
  // props). Primer's crisp 6px corners + GitHub's OS system-font stack (no
  // webfonts, fully offline).
  tokenProfile: {
    radius: '6px',   // -> --primer-radius : Primer's standard corner radius
    font: '-apple-system, "Segoe UI", system-ui, "Noto Sans", Helvetica, Arial, sans-serif', // -> --primer-font (offline system stack)
  },
};
