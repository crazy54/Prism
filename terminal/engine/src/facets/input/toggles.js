// A settings pane of switches that flip with a sliding knob.
import { ATTR, uni, glyphs, phase, ease, panel, tint, mix, fit } from './_input.js';

const SETTINGS = [
  ['Auto-approve diagnostics', true, 1.0, 'Read-only checks run unasked; fixes still ask.'],
  ['Stream reasoning summaries', false, 1.8, 'Show a short summary while the model works.'],
  ['Page on-call for sev1', true, 0, 'Locked by your org policy.'],
  ['Compact log view', false, 2.6, 'One line per event; expand with enter.'],
  ['Telemetry to OTLP', true, 3.4, 'Export spans to 127.0.0.1:4318.'],
];

export default {
  id: 'input-toggles',
  title: 'Toggle Switches',
  category: 'Toggles & Checkboxes',
  description: 'A settings pane of on/off switches whose knobs slide across with color easing as a scripted user flips them, labels dimming when off.',
  tags: ['toggle', 'switch', 'settings', 'preferences', 'on off'],
  kind: 'tui',
  size: { w: 52, h: 13 },
  minSize: { w: 34, h: 6 },
  loop: 6,
  color: '256',
  order: 20,
  setup(ctx) {
    const th = ctx.theme;
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height, u = uni(ctx), g = glyphs(ctx);
      const p = phase(t, 6);
      const inner = panel(ctx, b, 0, 0, W, H, { title: 'Settings', footer: `space toggle ${g.mid} ${g.up}/${g.down} move`, color: th.line });
      const rows = Math.min(SETTINGS.length, Math.floor(inner.height / (inner.height >= SETTINGS.length * 2 ? 2 : 1)));
      const step = inner.height >= SETTINGS.length * 2 ? 2 : 1;
      let focus = 0;
      SETTINGS.forEach(([, , at], i) => { if (at && p >= at - 0.3) focus = i; });
      for (let i = 0; i < rows; i++) {
        const [label, init, at] = SETTINGS[i];
        const k = at ? ease(p, at, at + 0.25) * (1 - ease(p, 5.4, 5.7)) : 0;
        const val = init ? 1 - k : k; // 0 off → 1 on
        const y = i * step;
        const on = i === focus;
        const sw = u ? 6 : 5;
        const sx = inner.width - sw - 1;
        if (on) inner.fill(0, y, inner.width, 1, ' ', undefined, tint(ctx, th.accent, 0.1));
        inner.text(1, y, fit(label, Math.max(0, sx - 2), undefined, ctx), val > 0.5 ? th.ink : th.muted, undefined, on ? ATTR.BOLD : 0);
        const track = mix(th.line, th.pos, val);
        if (u) {
          for (let x = 0; x < sw; x++) inner.set(sx + x, y, '━', track);
          inner.set(sx + Math.round(val * (sw - 1)), y, '●', val > 0.5 ? th.ink : th.muted, undefined, ATTR.BOLD);
        } else inner.text(sx, y, val > 0.5 ? '[ON ]' : '[OFF]', val > 0.5 ? th.pos : th.dim, undefined, ATTR.BOLD);
        if (!at && label.length + 3 < sx - 7) inner.text(sx - 7, y, 'locked', th.dim, undefined, ATTR.ITALIC);
      }
      // Help for the focused row, when there's room under the list.
      if (inner.height - 1 > (rows - 1) * step + 1) inner.text(1, inner.height - 1, fit(SETTINGS[focus][3], inner.width - 2, undefined, ctx), th.dim, undefined, ATTR.ITALIC);
    };
  },
};
