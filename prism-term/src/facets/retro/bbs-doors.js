// After the login: the doors. A LORD-era door game playing itself, a file
// area grinding a ZIP down the wire over Zmodem, and the burning ANSI banner
// a door greets you with. VGA colors (or --set colors=theme), 1993 manners.
import { textMask, maskAt, bbsPalette, hash2, lerpc } from './_kit.js';
import { blockLogo, frame, ansify } from './_bbs.js';
import { monoHint } from '../../canvas.js';

const typed = (lt, from, text, cps = 22) =>
  lt <= from ? '' : text.slice(0, Math.min(text.length, Math.floor((lt - from) * cps)));

const sep = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

const COLORS_PARAM = { colors: { default: 'vga', options: ['vga', 'theme'], label: 'Colors' } };

export default [
  {
    id: 'retro-door-game',
    since: '0.3.0',
    title: 'Door Game Night',
    gallery: 'retro',
    category: 'BBS & ANSI Art',
    kind: 'art',
    tags: ['bbs', 'door game', 'lord', 'rpg', 'forest', 'combat', 'ansi', '1993'],
    order: 200,
    description: 'An evening in a LORD-era door game: block-letter title, hero stats in a frame, and a forest fight that plays itself.',
    size: { w: 80, h: 24 },
    minSize: { w: 40, h: 12 },
    loop: 16,
    color: '16',
    credits: 'after Legend of the Red Dragon (Seth Robinson, 1992)',
    params: COLORS_PARAM,
    setup(ctx) {
      const P = bbsPalette(ctx);
      const b = ctx.buffer;
      const W = ctx.width, H = ctx.height;
      const logo = textMask('SERPENT', { font: 'bold' });
      const sx = logo.w * 2 + 2 <= W ? 2 : 1;
      const showLogo = H >= 20 && logo.w * sx + 2 <= W;
      const ramp = (v) => (v < 0.25 ? P[15] : v < 0.5 ? P[10] : v < 0.8 ? P[2] : P[6]);
      const fight = [
        [4.4, 'You stride into the murky forest...', 7],
        [5.6, 'A Giant Mosquito buzzes out of the gloom!', 12],
        [7.0, '> attack', 15],
        [8.0, 'Your rusty blade bites deep -- 11 damage!', 10],
        [9.4, 'The mosquito stings you for 4 hit points.', 12],
        [10.8, 'You have slain the Giant Mosquito!', 14],
        [12.0, 'You gain 120 experience and 35 gold pieces.', 11],
        [13.4, '(F)ight again, (R)eturn to the board?', 3],
      ];
      return (t) => {
        const lt = t % 16;
        const blink = Math.floor(t * 2.5) % 2 === 0;
        b.fill(0, 0, W, H, ' ', P[7], P[0]);
        b.fill(0, 0, W, 1, ' ', P[0], P[3]);
        const title = W >= 66 ? ' LEGEND OF THE EMERALD SERPENT · door 4 · PRISM BBS node 3' : ' EMERALD SERPENT · door 4';
        b.text(1, 0, title.slice(0, Math.max(0, W - 10)), P[0], P[3]);
        b.text(Math.max(0, W - 9), 0, `${32 - (Math.floor(t / 60) % 28)}m left`, P[0], P[3]);
        let y = 2;
        if (showLogo) {
          blockLogo(b, Math.floor((W - logo.w * sx) / 2), y, logo, { sx, ramp, shadow: P[8] });
          y += Math.ceil(logo.h / 2) + 1;
          const tag = '(C) 1992 SEROSOFT · v3.2 · registered to PRISM BBS';
          if (tag.length < W) b.text(Math.floor((W - tag.length) / 2), y - 1, tag, P[6]);
          y += 1;
        }
        if (H - y >= 13 && W >= 52) {
          const fw = Math.min(W - 4, 46), fx = 2;
          frame(b, fx, y, fw, 6, P[2], 'LIGHTMAN THE BOLD', P[14]);
          const rows = [
            ['Level', '7 (Warrior)'],
            ['Hit points', '34 of 41'],
            ['Gold', '1,204 · bank 5,000'],
            ['Forest fights', '9 of 15 left today'],
          ];
          rows.forEach(([k, v], i) => {
            const dots = '.'.repeat(Math.max(2, 15 - k.length));
            b.text(fx + 2, y + 1 + i, `${k} ${dots}`, P[7]);
            b.text(fx + 19, y + 1 + i, v.slice(0, Math.max(0, fw - 21)), P[15]);
          });
          y += 7;
        } else if (H - y >= 3) {
          b.text(2, y, 'Lv 7 · HP 34/41 · Gold 1,204 · Fights 9'.slice(0, Math.max(0, W - 3)), P[11]);
          y += 2;
        }
        if (y < H - 1) {
          const menu = W >= 64 ? 'Your move, brave one?  (F)orest  (S)tats  (B)ank  (I)nn  (Q)uit' : '(F)orest (S)tats (B)ank (Q)uit';
          b.text(2, y, menu.slice(0, Math.max(0, W - 3)), P[3]);
          const ex = b.text(2 + Math.min(menu.length, W - 6) + 1, y, lt >= 3.4 ? 'F' : '', P[15]);
          if (lt < 4.2 && blink) b.set(ex, y, '█', P[7]);
          y += 2;
        }
        const avail = Math.max(0, H - 1 - y);
        const started = fight.filter(([at]) => lt >= at);
        let lastEnd = -1, lastY = -1;
        for (const [at, text, col] of started.slice(-avail)) {
          const s = typed(lt, at, text);
          lastEnd = b.text(3, y, s.slice(0, Math.max(0, W - 4)), P[col]);
          lastY = y;
          y++;
        }
        if (lastY >= 0 && blink) b.set(lastEnd + 1, lastY, '█', P[7]);
        if (H > 13) {
          const foot = 'SEROSOFT door engine · (L)ist warriors · daily reset 03:00';
          b.text(Math.max(1, Math.floor((W - foot.length) / 2)), H - 1, foot.slice(0, Math.max(0, W - 1)), P[8]);
        }
      };
    },
  },

  {
    id: 'retro-file-area',
    since: '0.3.0',
    title: 'File Area',
    gallery: 'retro',
    category: 'BBS & ANSI Art',
    kind: 'art',
    tags: ['bbs', 'files', 'zmodem', 'download', 'light bar', 'ansi', '1993'],
    order: 210,
    description: 'Browsing file area 9 on a 2400 bps night: the light bar settles on a ZIP and Zmodem grinds it down the wire.',
    size: { w: 80, h: 24 },
    minSize: { w: 42, h: 12 },
    loop: 16,
    color: '16',
    params: COLORS_PARAM,
    setup(ctx) {
      const P = bbsPalette(ctx);
      const b = ctx.buffer;
      const W = ctx.width, H = ctx.height;
      const FILES = [
        ['SERPENT.ZIP', '318K', '10-12-93', 'Emerald Serpent door game v3.2 (reg)'],
        ['INTRO4K.ZIP', '  4K', '09-28-93', '4k intro: sine dots over copper bars'],
        ['PRISM-04.ZIP', ' 96K', '10-02-93', 'PRiSM artpack #4 · 23 ansis, 2 lits'],
        ['MODMHELP.TXT', ' 11K', '08-14-93', 'Hayes init strings that actually work'],
        ['FLAMES.EXE', ' 29K', '10-05-93', '320x200 fire routine, asm source incl.'],
        ['TRAKMODS.ZIP', '214K', '09-19-93', '12 four-channel protracker modules'],
        ['QWKMAIL.ZIP', ' 58K', '10-11-93', 'Offline mail reader v1.9 (shareware)'],
        ['ELITE2.ANS', '  9K', '10-10-93', 'Fire door banner by ckr/prism'],
      ];
      const seq = [0, 1, 2, 3, 2, 1, 0];
      const BYTES = 318471;
      return (t) => {
        const lt = t % 16;
        const blink = Math.floor(t * 2.5) % 2 === 0;
        b.fill(0, 0, W, H, ' ', P[7], P[0]);
        b.fill(0, 0, W, 1, ' ', P[15], P[1]);
        b.text(1, 0, (W >= 64 ? ' PRISM BBS · File Area 9: DEMOS & INTROS · 42 files · 2400 bps' : ' Area 9: DEMOS & INTROS').slice(0, Math.max(0, W - 1)), P[15], P[1]);
        const nRows = Math.min(FILES.length, Math.max(2, H - 7));
        const sel = lt < 4 ? seq[Math.min(seq.length - 1, Math.floor(lt / 0.55))] : 0;
        const tagged = lt >= 3.9;
        b.text(2, 2, (W >= 60 ? ' #  Filename       Size  Date      Description' : ' #  Filename       Size').slice(0, Math.max(0, W - 3)), P[3]);
        b.text(2, 3, '─'.repeat(Math.max(4, Math.min(W - 4, 74))), P[8]);
        for (let i = 0; i < nRows; i++) {
          const yy = 4 + i;
          const [name, size, date, desc] = FILES[i];
          const hot = i === sel && lt < 4.6;
          if (hot) b.fill(1, yy, W - 2, 1, ' ', P[0], P[3]);
          const fg = hot ? P[0] : P[15], dm = hot ? P[0] : P[7];
          b.text(2, yy, (i === 0 && tagged ? '*' : ' ') + (i + 1), i === 0 && tagged && !hot ? P[14] : dm);
          b.text(5, yy, name.padEnd(14).slice(0, Math.max(0, W - 6)), fg);
          if (W >= 28) b.text(19, yy, size, dm);
          if (W >= 60) {
            b.text(25, yy, date, dm);
            b.text(35, yy, desc.slice(0, Math.max(0, W - 36)), hot ? P[0] : P[3]);
          }
        }
        if (lt >= 4.8) {
          const pw = Math.min(W - 4, 56), fx = Math.floor((W - pw) / 2);
          const fy = H >= 18 ? H - 8 : 2;
          const p = Math.min(1, Math.max(0, (lt - 5.2) / 8.4));
          b.fill(fx, fy, pw, 7, ' ', P[7], P[0]);
          frame(b, fx, fy, pw, 7, P[1], 'ZMODEM DOWNLOAD', P[14]);
          b.text(fx + 2, fy + 1, `File: SERPENT.ZIP (${sep(BYTES)} bytes)`.slice(0, pw - 4), P[15]);
          const bw = Math.max(4, pw - 12);
          const fill = Math.round(p * bw);
          b.text(fx + 2, fy + 2, '[', P[7]);
          b.text(fx + 3, fy + 2, '█'.repeat(fill), P[11]);
          b.text(fx + 3 + fill, fy + 2, '░'.repeat(Math.max(0, bw - fill)), P[8]);
          b.text(fx + 3 + bw, fy + 2, `] ${String(Math.floor(p * 100)).padStart(3)}%`, P[7]);
          const cps = 228 + Math.floor(hash2(Math.floor(t * 2), 5) * 14);
          const rem = Math.max(0, (1 - p) * 1378);
          const eta = `${Math.floor(rem / 60)}:${String(Math.floor(rem % 60)).padStart(2, '0')}`;
          b.text(fx + 2, fy + 3, `${sep(Math.floor(BYTES * p))} bytes · CPS ${cps} · errors 0 · ETA ${eta}`.slice(0, pw - 4), P[7]);
          b.text(fx + 2, fy + 4, 'Protocol: Zmodem · 1,024-byte blocks · CRC-32'.slice(0, pw - 4), P[8]);
          if (p >= 1) b.text(fx + 2, fy + 5, 'Transfer complete · logged to DOWNLOAD.LOG'.slice(0, pw - 4), P[10]);
          else if (fy + 5 < H) b.text(fx + 2, fy + 5, `Streaming${'.'.repeat(1 + (Math.floor(lt * 3) % 3))}`.slice(0, pw - 4), P[8]);
        }
        if (H > 13) {
          const foot = '[SPACE] tag · [D]ownload · [V]iew · [Q]uit · 23:41 online';
          b.text(Math.max(1, Math.floor((W - foot.length) / 2)), H - 1, foot.slice(0, Math.max(0, W - 1)), P[8]);
        }
        if (blink && lt < 4.8) b.set(1, H - 1, '█', P[7]);
      };
    },
  },

  {
    id: 'retro-ansi-firedoor',
    since: '0.3.0',
    title: 'ANSI Fire Door',
    gallery: 'retro',
    category: 'BBS & ANSI Art',
    kind: 'art',
    tags: ['ansi', 'fire', 'flames', 'door', 'banner', 'bbs', 'dos', 'demo effect'],
    order: 240,
    description: 'A door banner ablaze: the classic bottom-seeded fire licks up through a block-letter word, encoded as 16-color ANSI.',
    size: { w: 78, h: 20 },
    minSize: { w: 36, h: 10 },
    loop: 8,
    color: '16',
    credits: 'after the classic DOS fire effect (Jare/Iguana, 1993)',
    params: {
      text: { default: 'INFERNO', label: 'Word' },
      colors: { default: 'vga', options: ['vga', 'theme'], label: 'Colors' },
    },
    setup(ctx) {
      const P = bbsPalette(ctx);
      const b = ctx.buffer;
      const W = ctx.width, H = ctx.height;
      const fw = W, fh = H * 2;
      const heat = new Float32Array(fw * (fh + 2));
      const img = new Int32Array(fw * fh);
      let word = String(ctx.param('text', 'INFERNO')).toUpperCase();
      let mask = textMask(word, { font: 'bold' });
      if (mask.w > fw - 2 && word.length > 4) { word = 'FIRE'; mask = textMask(word, { font: 'bold' }); }
      const L = Math.max(1, Math.min((fw - 4) / mask.w, (fh * 0.5) / mask.h));
      const mw = Math.floor(mask.w * L), mh = Math.floor(mask.h * L);
      const mx = Math.max(0, Math.floor((fw - mw) / 2));
      const my = Math.max(0, Math.floor(fh * 0.58 - mh / 2));
      const stops = [0x000000, 0x5a0000, 0xb42500, 0xf07800, 0xffc832, 0xfff9d0];
      const F = new Int32Array(65);
      for (let i = 0; i <= 64; i++) {
        const v = (i / 64) * (stops.length - 1), a = Math.min(stops.length - 2, Math.floor(v));
        F[i] = lerpc(stops[a], stops[a + 1], v - a);
      }
      const COOL = 3.1 / fh;
      // At mono depth half-block ANSI carries no picture, so the heat field
      // paints as a luminance glyph ramp instead (rule: no walls of half blocks).
      const hint = monoHint(b) || (ctx.caps?.depth === 'mono' ? { ramp: ' \u2591\u2592\u2593\u2588' } : null);
      return (t) => {
        const fk = Math.floor(t * 24);
        for (let x = 0; x < fw; x++) {
          heat[fh * fw + x] = 0.85 + 0.75 * hash2(x, fk);
          heat[(fh + 1) * fw + x] = 0.85 + 0.75 * hash2(x, fk + 7777);
        }
        for (let pass = 0; pass < 2; pass++) {
          for (let y = 0; y < fh; y++) {
            const row = y * fw, b1 = row + fw, b2 = row + fw * 2;
            for (let x = 0; x < fw; x++) {
              const xl = x > 0 ? x - 1 : 0, xr = x < fw - 1 ? x + 1 : fw - 1;
              const v = (heat[b1 + xl] + heat[b1 + x] + heat[b1 + xr] + heat[b2 + x]) * 0.2495 - COOL;
              heat[row + x] = v > 0 ? v : 0;
            }
          }
        }
        // the word smoulders hotter than the fire around it
        for (let yy = 0; yy < mh; yy++) {
          const ty = my + yy;
          if (ty >= fh) break;
          for (let xx = 0; xx < mw; xx++) {
            if (!maskAt(mask, xx, yy, L, L)) continue;
            const tx = mx + xx;
            if (tx >= fw) break;
            const g = 0.85 + 0.45 * hash2(tx, fk * 3 + ty);
            const i = ty * fw + tx;
            if (heat[i] < g) heat[i] = g;
          }
        }
        if (hint) {
          const ramp = hint.ramp || ' \u2591\u2592\u2593\u2588';
          const n = ramp.length - 1;
          for (let cy = 0; cy < H; cy++) {
            for (let cx = 0; cx < fw; cx++) {
              const v = (heat[cy * 2 * fw + cx] + heat[(cy * 2 + 1) * fw + cx]) * 0.5;
              b.set(cx, cy, ramp[Math.round(Math.min(1, v) * n)], ctx.theme.ink, ctx.theme.bg);
            }
          }
        } else {
          for (let i = 0; i < img.length; i++) {
            const h = heat[i];
            img[i] = F[h >= 1 ? 64 : (h * 64) | 0];
          }
          ansify(b, img, fw, H, 0, 0, P);
        }
        const prompt = '-=[ PRESS ANY KEY TO ENTER THE PIT ]=-';
        if (W > prompt.length + 2 && H > 8) {
          b.text(Math.floor((W - prompt.length) / 2), H - 2, prompt, Math.floor(t * 3) % 2 ? P[14] : P[12]);
        }
        const credit = 'ansi-fire door · ckr/prism · oct 93';
        if (W > credit.length + 2) b.text(Math.floor((W - credit.length) / 2), H - 1, credit, P[8]);
      };
    },
  },
];
