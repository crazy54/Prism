// A 4-channel tracker playing the shared chiptune: hex row numbers, note /
// instrument / effect columns, the play row locked in the middle while the
// pattern scrolls under it, per-channel VU strips and an instrument list.
import { lerpc } from './_kit.js';
import { PATTERN, ROWS, ROW, BPM, SONG, INSTRUMENTS, songAt, levels, noteName } from './_music.js';

const CHANNELS = ['DRUMS', 'BASS', 'LEAD', 'HATS'];
const BAR = ' ▏▎▍▌▋▊▉█';
const hex = (n) => n.toString(16).toUpperCase().padStart(2, '0');

export default {
  title: 'Tracker Pattern',
  gallery: 'retro',
  category: 'Chiptune Visuals',
  kind: 'scene',
  tags: ['tracker', 'mod', 'protracker', 'pattern', 'chiptune', 'music', 'amiga'],
  order: 40,
  description: 'A 4-channel tracker playing a chiptune: hex rows, note/instrument/effect columns and a locked play row with VUs.',
  size: { w: 76, h: 22 },
  minSize: { w: 40, h: 10 },
  loop: ROW * ROWS,
  setup(ctx) {
    const { theme } = ctx;
    const b = ctx.buffer;
    const W = ctx.width, H = ctx.height;
    const side = W >= 70 ? 22 : 0;
    const avail = W - side - 3;
    const full = avail >= 4 * 11;
    const cw = full ? 11 : Math.max(9, Math.floor(avail / 4));
    const body = Math.max(3, H - 4);
    const bar = lerpc(theme.bg, theme.accent, 0.38);
    const beatRow = lerpc(theme.bg, theme.panel, 0.7);
    const cell = (ev) => {
      if (!ev) return full ? ['---', ' --', ' ---'] : ['---', '--', '---'];
      const inst = String(ev.inst).padStart(2, '0');
      return full ? [noteName(ev.note), ` ${inst}`, ` ${ev.eff}`] : [noteName(ev.note), inst, ev.eff];
    };
    return (t) => {
      b.fill(0, 0, W, H, ' ', theme.ink, theme.bg);
      const s = songAt(t), lv = levels(s);
      // Title bar.
      b.fill(0, 0, W, 1, ' ', theme.bg, theme.panel);
      const secs = s.t;
      const clock = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${secs.toFixed(2).padStart(5, '0')}`;
      const left = ` ▶ PRiSMTRACKER · ${SONG}`;
      const right = W >= 60 ? `POS 00 PAT 00  BPM ${BPM} SPD 06  ${clock} ` : `${clock} `;
      b.text(0, 0, left.slice(0, W - right.length - 1), theme.ink, theme.panel);
      b.text(W - right.length, 0, right, theme.muted, theme.panel);
      // Channel headers with VU strips.
      for (let c = 0; c < 4; c++) {
        const x = 3 + c * cw;
        const name = `${c + 1} ${CHANNELS[c]}`.slice(0, cw - 2);
        b.text(x + 1, 1, name, theme.muted);
        const n = (cw - 2) * lv[c];
        for (let i = 0; i < cw - 2; i++) {
          const f = Math.min(1, Math.max(0, n - i));
          b.set(x + 1 + i, 2, f > 0 ? BAR[Math.round(f * 8)] : ' ', i / (cw - 2) < 0.7 ? theme.pos : theme.warn);
        }
      }
      // Pattern body: play row fixed in the middle.
      const mid = 3 + Math.floor(body / 2);
      for (let y = 3; y < 3 + body; y++) {
        const r = s.row + (y - mid);
        if (r < 0 || r >= ROWS) continue;
        const play = y === mid;
        const bg = play ? bar : r % 16 === 0 ? beatRow : undefined;
        if (bg !== undefined) b.fill(0, y, 3 + 4 * cw, 1, ' ', theme.ink, bg);
        b.text(0, y, hex(r), play ? theme.ink : r % 4 === 0 ? theme.warn : theme.muted, bg);
        for (let c = 0; c < 4; c++) {
          const x = 3 + c * cw;
          b.set(x - 1, y, '│', lerpc(theme.bg, theme.line, 0.9), bg);
          const ev = PATTERN[r][c];
          const [nt, ins, ef] = cell(ev);
          const fresh = play && ev && s.frac < 0.5;
          let cx = b.text(x, y, nt, ev ? (fresh ? 0xffffff : theme.ink) : theme.dim, bg);
          cx = b.text(cx, y, ins, ev ? theme.info : theme.dim, bg);
          b.text(cx, y, ef, ev ? theme.accent2 ?? theme.warn : theme.dim, bg);
        }
      }
      b.text(3 + 4 * cw - 1, mid, '◀', theme.accent, bar);
      // Instrument list, with the ones just struck lit up.
      if (side) {
        const sx = W - side + 1;
        b.text(sx, 1, 'INSTRUMENTS', theme.muted);
        const hot = new Set(PATTERN[s.row].filter(Boolean).map((e) => e.inst));
        for (let i = 1; i < INSTRUMENTS.length && 2 + i < H - 1; i++) {
          const on = hot.has(i) && s.frac < 0.6;
          b.text(sx, 2 + i, hex(i), on ? theme.bg : theme.info, on ? theme.accent : undefined);
          b.text(sx + 3, 2 + i, INSTRUMENTS[i].slice(0, side - 5), on ? theme.ink : theme.muted);
        }
        const y0 = 4 + INSTRUMENTS.length;
        if (y0 + 3 < H) {
          b.text(sx, y0, 'BAR', theme.muted);
          b.text(sx + 4, y0, `${s.bar + 1}/4  beat ${(s.beat % 4) + 1}`, theme.ink);
          const chord = ['Am', 'F', 'C', 'G'][s.bar];
          b.text(sx, y0 + 1, 'KEY', theme.muted);
          b.text(sx + 4, y0 + 1, `A minor · ${chord}`, theme.ink);
        }
      }
      // Footer hint.
      b.text(0, H - 1, (W >= 60 ? ' F1 help  F5 play  F8 stop  ←→ channel  ↑↓ row  Space edit' : ' F5 play  F8 stop  Space edit').slice(0, W), theme.dim);
    };
  },
};
