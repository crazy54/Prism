/* Sample design-system profile for the F4 generator (JFH-37).
   ----------------------------------------------------------------------------
   This is a NEUTRAL demonstration system used only to prove the generator +
   validation + merge pipeline end-to-end. The real sample system (Duolingo)
   ships under JFH-67; this profile keeps live Prism.html unchanged while
   exercising every code path.

   A profile only needs { ds, dsShort, tokenProfile }. `accent` is advisory
   (docs). tokenProfile becomes .<dsShort>-root custom properties; keys without
   a leading "--" are namespaced (radius -> --aurora-radius). Facet colors come
   from Prism's GLOBAL tokens (var(--accent) etc.), so the system re-skins with
   the active theme — tokenProfile is for structural tokens (radius, font). */
export default {
  ds: 'Aurora Sample',
  dsShort: 'aurora',
  accent: '#539fe5',
  tokenProfile: {
    radius: '14px',   // -> --aurora-radius, consumed by button/menu/card archetypes
    font: 'inherit',  // -> --aurora-font
  },
};
