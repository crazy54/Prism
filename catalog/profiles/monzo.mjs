/* Monzo theme-pack profile (JFH-70) — Phase-2 design system.
   ----------------------------------------------------------------------------
   Brand-inspired (Monzo's public identity, not an official component library):
   the well-known fintech look — signature Hot Coral on deep near-black navy,
   confident geometric sans, generous rounded cards. Component tokens are
   approximated, not lifted from an internal design system.

   Feeds BOTH tools off one file:
     • _scaffold_ds.mjs (F6) reads palette.{dark,light} verbatim → monzo-dark /
       monzo-light registry + MCP-mirror entries.
     • _gen_system.mjs (F4) reads ds/dsShort/tokenProfile for the 100 facets.

   Visual language: dark-first — deep charcoal/navy surfaces with Hot Coral
   popping on top; a light mode on clean white with Monzo navy ink. 100%
   offline: NO external fonts — the brand's geometric sans is approximated with
   a system-font stack. Facets reference only the GLOBAL tokens below
   (var(--accent) …), never raw hex, so they re-skin with the active theme and
   pass the token-only gate. */
export default {
  ds: 'Monzo',
  dsShort: 'monzo',
  homeUrl: 'https://monzo.com/',
  ticket: 'JFH-70',
  accent: '#ff4f40',            // Hot Coral — the brand primary (advisory; palette wins)

  palette: {
    // Light: clean white paper, Monzo navy ink, Hot Coral accent. Semantic roles
    // use brand-adjacent hues (Monzo teal, a fresh green, warm amber, coral-red,
    // a distinct critical purple) so the generated facet variants read as a
    // real system.
    light: {
      '--bg': '#fafbfc', '--panel': '#ffffff', '--panel2': '#f2f4f8', '--card': '#ffffff', '--line': '#e6e9ef',
      '--ink': '#14233c', '--muted': '#6b7385', '--dim': '#9aa2b1',          // Monzo navy ink family
      '--accent': '#ff4f40', '--accent-rgb': '255,79,64', '--accent2': '#ff4f40',   // Hot Coral
      '--info': '#00a4b3', '--info-rgb': '0,164,179',                        // Monzo teal
      '--pos': '#52b03a', '--pos-rgb': '82,176,58',                          // fresh green
      '--warn': '#ffb74a', '--warn-rgb': '255,183,74',                       // warm amber
      '--neg': '#e5484d', '--neg-rgb': '229,72,77',                          // coral-adjacent red
      '--crit': '#9d4edd', '--crit-rgb': '157,78,221',                       // critical purple
      '--cardgrad': 'linear-gradient(157deg,rgba(255,79,64,.06),rgba(255,79,64,0) 55%)',
    },
    // Dark: Monzo's signature deep near-black navy/charcoal surfaces (the brand
    // ground) with Hot Coral popping on top; semantic hues brightened for the
    // dark surface.
    dark: {
      '--bg': '#06060a', '--panel': '#14161c', '--panel2': '#1c1f27', '--card': '#14161c', '--line': '#2a2e38',
      '--ink': '#f4f5f7', '--muted': '#a2a7b3', '--dim': '#6b7280',
      '--accent': '#ff4f40', '--accent-rgb': '255,79,64', '--accent2': '#ff4f40',   // Hot Coral
      '--info': '#1fc7d6', '--info-rgb': '31,199,214',                       // brightened teal on dark
      '--pos': '#6cc551', '--pos-rgb': '108,197,81',
      '--warn': '#ffc266', '--warn-rgb': '255,194,102',
      '--neg': '#f2555a', '--neg-rgb': '242,85,90',
      '--crit': '#b46ce6', '--crit-rgb': '180,108,230',
      '--cardgrad': 'linear-gradient(157deg,rgba(255,79,64,.08),rgba(255,79,64,0) 55%)',
    },
  },

  // Structural tokens for the F4 facet generator (become .monzo-root custom
  // props). Generous rounded corners + a geometric-sans system stack (no
  // webfonts) to echo Monzo's confident, friendly type.
  tokenProfile: {
    radius: '12px',   // -> --monzo-radius : Monzo's generous rounded corners
    font: '"Segoe UI", system-ui, -apple-system, Roboto, Helvetica, Arial, sans-serif', // -> --monzo-font (offline geometric-sans stack)
  },
};
