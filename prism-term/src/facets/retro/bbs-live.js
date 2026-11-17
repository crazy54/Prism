// The live side of a 1993 board: the oneliner wall filling up with user
// quips, and the heart-stopping moment the SysOp breaks into your session
// for a chat. VGA colors (or --set colors=theme).
import { bbsPalette, hash2 } from './_kit.js';
import { frame } from './_bbs.js';

const typed = (lt, from, text, cps = 22) =>
  lt <= from ? '' : text.slice(0, Math.min(text.length, Math.floor((lt - from) * cps)));

const COLORS_PARAM = { colors: { default: 'vga', options: ['vga', 'theme'], label: 'Colors' } };

export default [
  {
    id: 'retro-oneliner-wall',
    since: '0.3.0',
    title: 'Oneliner Wall',
    gallery: 'retro',
    category: 'BBS & ANSI Art',
    kind: 'art',
    tags: ['bbs', 'oneliners', 'wall', 'graffiti', 'community', 'ansi', '1993'],
    order: 220,
    description: 'The board oneliner wall: a scroll of user quips in VGA colors while the next one types itself at the prompt.',
    size: { w: 80, h: 24 },
    minSize: { w: 40, h: 12 },
    loop: 18,
    color: '16',
    params: COLORS_PARAM,
    setup(ctx) {
      const P = bbsPalette(ctx);
      const b = ctx.buffer;
      const W = ctx.width, H = ctx.height;
      const ONE = [
        ['Phantom', 'greets to all node 7 lurkers... you know who you are'],
        ['Acid Burn', 'trade wars resets tonight -- fedspace campers beware'],
        ['CKR', 'PRISM-04 artpack now in area 9. 23 ansis, zero rips'],
        ['Lightman', 'who keeps dropping carrier in the middle of chat?!'],
        ['Zer0 Cool', '2400 and proud. the 14.4 fund went to pizza again'],
        ['SysOp', 'board down sunday 3am: modem transplant, wish us luck'],
        ['The Mentor', 'ansi > ascii. this is not a debate, this is physics'],
        ['Razor', 'LORD bracket tonight: me vs phantom, forest, high noon'],
        ['Nikki', 'uploaded 12 new mods. 4ch protracker only, no screamers'],
        ['Crash', 'no carrier is just the modem saying goodbye'],
      ];
      const HUE = [9, 10, 11, 12, 13, 14];
      const STEP = 1.8; // 10 posts per 18 s loop
      return (t) => {
        const k = Math.floor(t / STEP);
        const blink = Math.floor(t * 2.5) % 2 === 0;
        b.fill(0, 0, W, H, ' ', P[7], P[0]);
        b.fill(0, 0, W, 1, ' ', P[15], P[5]);
        b.text(1, 0, (W >= 62 ? ' PRISM BBS · ONELINERS — leave your mark · door: WALL v1.2' : ' ONELINERS · leave your mark').slice(0, Math.max(0, W - 1)), P[15], P[5]);
        const inY = H - 2;
        // the wall opens with six quips already on it and shows the classic "last 10"
        for (let r = 0; r < 10; r++) {
          const idx = k + 5 - r;
          const yy = inY - 2 - r;
          if (idx < 0 || yy < 2) break;
          const [who, msg] = ONE[idx % ONE.length];
          const hue = P[HUE[Math.floor(hash2(idx, 3) * HUE.length)]];
          const end = b.text(2, yy, `<${who}>`.slice(0, Math.max(0, W - 4)), hue);
          b.text(end + 1, yy, msg.slice(0, Math.max(0, W - 3 - (end + 1))), idx % 3 === 1 ? P[15] : P[7]);
        }
        b.text(1, inY - 1, '─'.repeat(Math.max(0, W - 2)), P[8]);
        const [nw, nm] = ONE[(k + 6) % ONE.length];
        const chars = Math.min(nm.length, Math.floor((t - k * STEP) * 31));
        const e1 = b.text(2, inY, `${nw}> `.slice(0, Math.max(0, W - 3)), P[11]);
        const e2 = b.text(e1, inY, nm.slice(0, Math.max(0, Math.min(chars, W - 2 - e1))), P[15]);
        if (blink) b.set(e2, inY, '█', P[7]);
        if (H > 12) {
          const foot = '[ENTER] post · [Q]uit · 78 chars max · the sysop reads these';
          b.text(Math.max(1, Math.floor((W - foot.length) / 2)), H - 1, foot.slice(0, Math.max(0, W - 1)), P[8]);
        }
      };
    },
  },

  {
    id: 'retro-sysop-chat',
    since: '0.3.0',
    title: 'SysOp Chat',
    gallery: 'retro',
    category: 'BBS & ANSI Art',
    kind: 'art',
    tags: ['bbs', 'sysop', 'chat', 'page', 'break-in', 'ansi', '1993'],
    order: 230,
    description: 'You page the SysOp, the bell rings, and a two-color break-in chat types itself before you drop back to the board.',
    size: { w: 80, h: 24 },
    minSize: { w: 40, h: 12 },
    loop: 20,
    color: '16',
    params: COLORS_PARAM,
    setup(ctx) {
      const P = bbsPalette(ctx);
      const b = ctx.buffer;
      const W = ctx.width, H = ctx.height;
      const CHAT = [
        [4.6, 'SysOp', 'hey lightman -- make it quick, dinner is on the stove', 14],
        [7.2, 'You', 'any chance of a time bump? big upload for area 9 tonight', 15],
        [9.8, 'SysOp', 'done, +30 mins. what are you sending?', 14],
        [11.8, 'You', 'the PRISM-04 artpack and a 4k intro, fresh from the meet', 15],
        [14.2, 'SysOp', 'good man. drop a oneliner so the lurkers know. gotta run', 14],
      ];
      return (t) => {
        const lt = t % 20;
        const blink = Math.floor(t * 2.5) % 2 === 0;
        b.fill(0, 0, W, H, ' ', P[7], P[0]);
        b.fill(0, 0, W, 1, ' ', P[0], P[6]);
        b.text(1, 0, (W >= 58 ? ' PRISM BBS · chat mode · node 3 · 2400 bps · capture ON' : ' chat mode · node 3').slice(0, Math.max(0, W - 1)), P[0], P[6]);
        if (lt < 4.2) {
          const att = 1 + Math.min(2, Math.floor(lt / 1.3));
          const fw = Math.min(W - 4, 46), fx = Math.floor((W - fw) / 2);
          const fy = Math.max(2, Math.floor(H / 2) - 3);
          const fh = Math.min(7, H - fy - 1);
          frame(b, fx, fy, fw, fh, P[4], 'PAGING SYSOP', P[14]);
          if (fy + 1 < H - 1) b.text(fx + 2, fy + 1, `Reason: ${typed(lt, 0.2, 'time bump + upload?', 14)}`.slice(0, Math.max(0, fw - 4)), P[7]);
          if (fy + 2 < H - 1 && fh > 3) b.text(fx + 2, fy + 2, `Attempt ${att} of 3 ${'.'.repeat(1 + (Math.floor(lt * 4) % 3))}`.slice(0, Math.max(0, fw - 4)), P[7]);
          if (fy + 4 < H - 1 && fh > 5 && Math.floor(lt * 3) % 2 === 0) {
            const bell = '* BEEP *';
            b.text(fx + Math.max(1, Math.floor((fw - bell.length) / 2)), fy + 4, bell, P[14]);
          }
        } else {
          const lines = [[null, '*** The SysOp is breaking in for chat ***', 10]];
          for (const [at, who, msg, col] of CHAT) {
            if (lt < at) break;
            lines.push([who, typed(lt, at, msg), col]);
          }
          if (lt >= 17.2) lines.push([null, typed(lt, 17.2, '*** Chat ended -- returning you to the board ***', 30), 13]);
          let y = 2;
          const avail = Math.max(1, H - 3 - y);
          let lastEnd = -1, lastY = -1;
          for (const [who, msg, col] of lines.slice(-avail)) {
            if (y >= H - 1) break;
            if (who) {
              const e = b.text(2, y, `${who}> `, who === 'You' ? P[11] : P[6]);
              lastEnd = b.text(e, y, msg.slice(0, Math.max(0, W - 3 - e)), P[col]);
              lastY = y;
            } else {
              b.text(Math.max(1, Math.floor((W - msg.length) / 2)), y, msg.slice(0, Math.max(0, W - 2)), P[col]);
            }
            y++;
          }
          if (lastY >= 0 && lt < 17.2 && blink) b.set(lastEnd, lastY, '█', P[7]);
        }
        if (H > 12) {
          const foot = '[ESC] end chat · scroll lock off · 28 min remain';
          b.text(Math.max(1, Math.floor((W - foot.length) / 2)), H - 1, foot.slice(0, Math.max(0, W - 1)), P[8]);
        }
      };
    },
  },
];
