/* Material Design 3 theme-pack profile (JFH-31) — Phase-2 design system.
   ----------------------------------------------------------------------------
   Palette values are the published M3 *baseline* schemes (the Material Theme
   Builder default, seed #6750A4), mapped onto Prism's flat token set. The
   role -> token mapping the ticket asks to be documented:

     M3 role                         Prism token   light      dark
     ------------------------------  ------------  ---------  ---------
     surface / background            --bg          #fffbfe    #1c1b1f
     surface-container-low           --panel       #f7f2fa    #1d1b20
     surface-container-high          --panel2      #ece6f0    #2b2930
     surface-container               --card        #f3edf7    #211f26
     outline-variant                 --line        #cac4d0    #49454f
     on-surface                      --ink         #1c1b1f    #e6e1e5
     on-surface-variant              --muted       #49454f    #cac4d0
     outline                         --dim         #79747e    #938f99
     primary                         --accent      #6750a4    #d0bcff
     tertiary                        --accent2     #7d5260    #efb8c8
     error                           --neg         #b3261e    #f2b8b5
     tertiary                        --crit        #7d5260    #efb8c8
     surface-container (top app bar) --cs-topnav-* #f3edf7    #211f26

   ELEVATION VIA TINT (ticket: "elevation via tint, not just shadow"). M3 raises a
   surface by overlaying primary at increasing opacity rather than by darkening.
   That is why --bg -> --panel -> --card -> --panel2 walk *up* M3's
   surface-container ramp (each step is the same neutral with more primary tint
   baked in) instead of being flat greys, and why --cardgrad is a primary-tinted
   wash. The --elev-* shadows are M3's level-1 and level-3 umbra/penumbra pairs,
   kept subtle so the tint carries the depth cue.

   ROLES M3 DOES NOT DEFINE. M3 ships exactly one semantic role (error). Prism
   also needs info / success / warning, so those are tonal-palette extensions
   authored to M3's own recipe — chroma held near the baseline hues at tone 40
   (light) and tone 80 (dark), the same tones M3 uses for its light/dark role
   pairs. --neg is the authentic M3 error, and --crit reuses the real tertiary
   role rather than inventing a sixth hue.

   TYPE. M3 ships Roboto, which is network-loaded and therefore banned by the
   epic's offline constraint. The stack names Roboto first so it is used when
   locally installed (common on Android/ChromeOS and many Linux installs) and
   falls back to a tuned system stack everywhere else. Nothing is fetched.
   --head-w is 500 (M3's title/label medium) rather than Prism's default 700:
   M3's headline styles are notably lighter than a typical console UI, and this
   is the single token that most makes the shell read as Material.

   Feeds BOTH tools off one file:
     • _scaffold_ds.mjs (F6) reads palette.{dark,light} verbatim -> material3-dark
       / material3-light registry + MCP-mirror entries.
     • _gen_system.mjs (F4) reads ds/dsShort/tokenProfile for the 100 facets.

   Visual language: tonal, soft, generous corners, tint-based elevation, gentle
   emphasized motion. 100% offline: no webfont, and facets reference only the
   GLOBAL tokens (var(--accent) …), never raw hex, so they re-skin with the
   active theme and pass the token-only gate. */
export default {
  ds: 'Material Design 3',
  dsShort: 'material3',
  homeUrl: 'https://m3.material.io',
  ticket: 'JFH-31',
  accent: '#6750A4',            // M3 baseline primary (advisory; palette wins)

  palette: {
    // Light — M3 baseline light scheme. Surfaces walk the surface-container ramp
    // so elevation reads as primary tint, per M3, not as a grey step.
    light: {
      '--bg': '#fffbfe', '--panel': '#f7f2fa', '--panel2': '#ece6f0', '--card': '#f3edf7', '--line': '#cac4d0',
      '--ink': '#1c1b1f', '--muted': '#49454f', '--dim': '#79747e',                  // on-surface / on-surface-variant / outline
      '--accent': '#6750a4', '--accent-rgb': '103,80,164', '--accent2': '#7d5260',    // primary + tertiary (gradient pair)
      '--info': '#35618e', '--info-rgb': '53,97,142',                                // tonal blue, tone 40 (M3 defines no info)
      '--pos': '#146c2e', '--pos-rgb': '20,108,46',                                  // tonal green, tone 40 (no M3 success)
      '--warn': '#7d5700', '--warn-rgb': '125,87,0',                                 // tonal yellow, tone 40 (no M3 warning)
      '--neg': '#b3261e', '--neg-rgb': '179,38,30',                                  // error (authentic M3 role)
      '--crit': '#7d5260', '--crit-rgb': '125,82,96',                                // tertiary (authentic M3 role)
      '--cardgrad': 'linear-gradient(157deg,rgba(103,80,164,.06),rgba(103,80,164,0) 55%)', // primary surface-tint wash
      // feel — M3 elevation level 1 / level 3, standard easing, medium heads
      '--elev-1': '0 1px 2px rgba(28,27,31,.20), 0 1px 3px 1px rgba(28,27,31,.10)',
      '--elev-2': '0 1px 3px rgba(28,27,31,.20), 0 4px 8px 3px rgba(28,27,31,.12)',
      '--dur': '.2s', '--ease': 'cubic-bezier(.2,0,0,1)', '--bd': '1px', '--head-w': '500', '--dens': '1.15',
      // topnav chrome — M3 top app bar sits on surface-container; hover is the
      // real M3 state layer (primary @ 8%), not a neutral wash.
      '--cs-topnav-bg': '#f3edf7', '--cs-topnav-line': '#cac4d0', '--cs-topnav-ink': '#1c1b1f',
      '--cs-topnav-dim': '#49454f', '--cs-topnav-hover': 'rgba(103,80,164,.08)',
    },
    // Dark — M3 baseline dark scheme. Same tint ramp, darker tones; primary
    // lightens to #d0bcff (M3 flips primary to tone 80 in dark).
    dark: {
      '--bg': '#1c1b1f', '--panel': '#1d1b20', '--panel2': '#2b2930', '--card': '#211f26', '--line': '#49454f',
      '--ink': '#e6e1e5', '--muted': '#cac4d0', '--dim': '#938f99',                  // on-surface / on-surface-variant / outline
      '--accent': '#d0bcff', '--accent-rgb': '208,188,255', '--accent2': '#efb8c8',   // primary + tertiary (gradient pair)
      '--info': '#9fcaff', '--info-rgb': '159,202,255',                              // tonal blue, tone 80
      '--pos': '#6edd8a', '--pos-rgb': '110,221,138',                                // tonal green, tone 80
      '--warn': '#f5bd3f', '--warn-rgb': '245,189,63',                               // tonal yellow, tone 80
      '--neg': '#f2b8b5', '--neg-rgb': '242,184,181',                                // error (authentic M3 role)
      '--crit': '#efb8c8', '--crit-rgb': '239,184,200',                              // tertiary (authentic M3 role)
      '--cardgrad': 'linear-gradient(157deg,rgba(208,188,255,.08),rgba(208,188,255,0) 55%)', // primary surface-tint wash
      // feel — M3 elevation level 1 / level 3 on dark, standard easing, medium heads
      '--elev-1': '0 1px 2px rgba(0,0,0,.30), 0 1px 3px 1px rgba(0,0,0,.15)',
      '--elev-2': '0 1px 3px rgba(0,0,0,.30), 0 4px 8px 3px rgba(0,0,0,.15)',
      '--dur': '.2s', '--ease': 'cubic-bezier(.2,0,0,1)', '--bd': '1px', '--head-w': '500', '--dens': '1.15',
      // topnav chrome — dark M3 top app bar; state layer is dark-mode primary @ 8%
      '--cs-topnav-bg': '#211f26', '--cs-topnav-line': '#49454f', '--cs-topnav-ink': '#e6e1e5',
      '--cs-topnav-dim': '#cac4d0', '--cs-topnav-hover': 'rgba(208,188,255,.08)',
    },
  },

  // Structural tokens for the F4 facet generator (become .material3-root custom
  // props) and the shell chrome radius scale. 12px is M3's shape-scale "medium",
  // the radius M3 uses for cards/containers, and the scaffolder's x0.5/x1.5/x2
  // derivation turns it into 6/12/18/24 — a consistent step set in the spirit of
  // M3's extra-small -> extra-large scale.
  tokenProfile: {
    radius: '12px',  // -> --material3-radius : M3 shape-scale medium (cards/containers)
    font: 'Roboto, -apple-system, "Segoe UI", system-ui, "Helvetica Neue", Arial, sans-serif', // -> --material3-font (no webfont fetched)
  },
};
