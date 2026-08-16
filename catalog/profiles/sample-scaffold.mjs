/* Sample theme-pack profile for the F6 scaffolder (JFH-39).
   ----------------------------------------------------------------------------
   A NEUTRAL demonstration system used to prove _scaffold_ds.mjs end-to-end
   without touching any real brand. Real systems ship under their own tickets
   (JFH-67 Duolingo, JFH-68 Mailchimp, …); this keeps the demo brand-free.

   Minimal profile: { ds, dsShort, accent }. From `accent` the scaffolder derives
   a coherent starter palette for BOTH color modes (over the Cloudscape base). To
   hand-author a palette instead, add:
     palette: { dark: { '--accent': '…', '--bg': '…', … }, light: { … } }
   tokenProfile (structural tokens: radius/font) flows into the emitted F4
   facet-gen stub. homeUrl/ticket are advisory (used by F7 Showcase + docs). */
export default {
  ds: 'Sample Pack',
  dsShort: 'samplepack',
  homeUrl: 'https://example.com',
  accent: '#7c5cff',        // derives --accent / --accent-rgb / --info for both modes
  tokenProfile: {
    radius: '12px',         // -> --samplepack-radius in the facet-gen stub
    font: 'inherit',        // -> --samplepack-font
  },
};
