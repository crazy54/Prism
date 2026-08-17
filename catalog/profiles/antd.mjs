/* Ant Design theme-pack profile (JFH-46) — Phase-2 design system.
   ----------------------------------------------------------------------------
   Authentic Ant Design v5 seed/map tokens (not brand-inspired): the palette is
   lifted verbatim from AntD's default (light) and dark algorithm outputs — the
   per-mode primary is the real colorPrimary (#1677ff light / #1668dc dark), and
   the surface/border/text/semantic roles are the published colorBg / colorBorder
   / colorText / colorSuccess / colorWarning / colorError tokens.

   Feeds BOTH tools off one file:
     • _scaffold_ds.mjs (F6) reads palette.{dark,light} verbatim → antd-dark /
       antd-light registry + MCP-mirror entries.
     • _gen_system.mjs (F4) reads ds/dsShort/tokenProfile for the 100 facets.

   Visual language: calm, systematic enterprise UI — crisp 6px corners, neutral
   greys, a clear blue primary, six-role semantic scale. 100% offline: NO
   external fonts — AntD's default is already a system font stack. Facets
   reference only the GLOBAL tokens below (var(--accent) …), never raw hex, so
   they re-skin with the active theme and pass the token-only gate. */
export default {
  ds: 'Ant Design',
  dsShort: 'antd',
  homeUrl: 'https://ant.design/',
  ticket: 'JFH-46',
  accent: '#1677ff',            // colorPrimary (light) — the brand primary (advisory; palette wins)

  palette: {
    // Light — AntD v5 default algorithm. Surfaces: colorBgLayout / colorBgContainer
    // / colorBgElevated; colorBorder hairline; text steps at 88% / 65% / 45%.
    light: {
      '--bg': '#f5f5f5', '--panel': '#ffffff', '--panel2': '#fafafa', '--card': '#ffffff', '--line': '#d9d9d9',
      '--ink': '#141414', '--muted': '#595959', '--dim': '#8c8c8c',        // colorText / colorTextSecondary / colorTextTertiary
      '--accent': '#1677ff', '--accent-rgb': '22,119,255', '--accent2': '#1677ff',  // colorPrimary (blue-6)
      '--info': '#1677ff', '--info-rgb': '22,119,255',                     // colorInfo
      '--pos': '#52c41a', '--pos-rgb': '82,196,26',                        // colorSuccess (green-6)
      '--warn': '#faad14', '--warn-rgb': '250,173,20',                     // colorWarning (gold-6)
      '--neg': '#ff4d4f', '--neg-rgb': '255,77,79',                        // colorError (red-5)
      '--crit': '#eb2f96', '--crit-rgb': '235,47,150',                     // magenta-6 (highest-severity)
      '--cardgrad': 'linear-gradient(157deg,rgba(22,119,255,.06),rgba(22,119,255,0) 55%)',
    },
    // Dark — AntD v5 dark algorithm. Surfaces darken to #141414 → #1f1f1f → #262626,
    // border #424242, text rgba(255,255,255,.85) plus its muted/dim steps.
    dark: {
      '--bg': '#141414', '--panel': '#1f1f1f', '--panel2': '#262626', '--card': '#1f1f1f', '--line': '#424242',
      '--ink': '#e6e6e6', '--muted': '#a6a6a6', '--dim': '#737373',        // colorText / colorTextSecondary / colorTextTertiary
      '--accent': '#1668dc', '--accent-rgb': '22,104,220', '--accent2': '#1668dc',  // colorPrimary (dark blue-6)
      '--info': '#1668dc', '--info-rgb': '22,104,220',                     // colorInfo
      '--pos': '#49aa19', '--pos-rgb': '73,170,25',                        // colorSuccess (dark green)
      '--warn': '#d89614', '--warn-rgb': '216,150,20',                     // colorWarning (dark gold)
      '--neg': '#dc4446', '--neg-rgb': '220,68,70',                        // colorError (dark red)
      '--crit': '#cb2b83', '--crit-rgb': '203,43,131',                     // dark magenta (highest-severity)
      '--cardgrad': 'linear-gradient(157deg,rgba(22,104,220,.08),rgba(22,104,220,0) 55%)',
    },
  },

  // Structural tokens for the F4 facet generator (become .antd-root custom
  // props). AntD's default borderRadius + its system-based default font stack
  // (no webfonts).
  tokenProfile: {
    radius: '6px',   // -> --antd-radius : AntD v5 borderRadius
    font: '-apple-system, "Segoe UI", system-ui, Roboto, "Helvetica Neue", Arial, sans-serif', // -> --antd-font (offline system stack)
  },
};
