// Connecting to tool servers: handshakes resolve, each lists its tools, one fails auth with a 401 and reconnects
// after a token refresh.
import { ATTR, uni, phase, spin } from './_ai.js';
import { sub, inv, mark, runs, flow, fitRows } from './_kit7.js';

const LOOP = 14, R0 = 12.8, R1 = 13.5, PICK = 6.2;
// [name, address, connects at, tools, fails auth at]
const SERVERS = [
  ['files', './bin/fs-tools', 1.2, ['read_file', 'write_file', 'list_dir', 'move', 'delete', 'search', 'apply_patch', 'stat', 'glob', 'diff', 'tail', 'watch']],
  ['tickets', 'tickets.internal', 2.4, ['create_ticket', 'get_ticket', 'update_ticket', 'search_tickets', 'add_comment']],
  ['metrics', 'metrics.internal', 5.4, ['query_metrics', 'list_series', 'get_alerts', 'silence_alert', 'describe_slo', 'top_errors', 'compare_windows', 'annotate'], 3.0],
];

export default {
  id: 'ai-tool-server',
  since: '0.3.0',
  title: 'Tool Server Connect',
  category: 'Tool Calls',
  description: 'Connecting to tool servers: handshakes resolve and list their tools, one fails auth with a 401 and reconnects after a token refresh.',
  tags: ['tool server', 'connection', 'auth', 'tools', 'handshake', 'agent'],
  kind: 'tui',
  size: { w: 64, h: 10 },
  minSize: { w: 44, h: 7 },
  loop: LOOP,
  color: '16',
  order: 240,
  setup(ctx) {
    const th = ctx.theme;
    const draw = (b, at) => {
      const kb = at >= R0 && at < R1 ? (at - R0) / (R1 - R0) : -1;
      if (kb >= 0.9) return draw(b, 0);
      const p = kb >= 0 ? R0 : at;
      const W = b.width, H = b.height, u = uni(ctx), MID = u ? '·' : '-';
      const up = SERVERS.filter((s) => p >= s[2]), tools = up.reduce((n, s) => n + s[3].length, 0), sel = p >= PICK ? 2 : 0, cur = SERVERS[sel];
      const names = p >= cur[2] ? flow(cur[3].map((t, i) => ({ t: (i ? '  ' : '') + t, fg: th.ink })), W - 2) : [];
      const want = flow(cur[3].map((t, i) => ({ t: (i ? '  ' : '') + t })), W - 2).length;
      const rows = fitRows([{ k: 'head' }, { k: 'gap', drop: 4 }, ...SERVERS.map((s, i) => ({ k: 'srv', i })), { k: 'gap', drop: 3 }, { k: 'list' },
        ...Array.from({ length: want }, (_, i) => ({ k: 'tools', i, drop: 2 + i / 100 }))], H);
      // names that don't fit fold into a count on the last row that does
      const avail = rows.filter((r) => r.k === 'tools').length;
      if (avail && names.length > avail) {
        const lastRow = names[avail - 1];
        let hidden = names.slice(avail).reduce((n, row) => n + row.length, 0);
        const end = () => (lastRow.length ? lastRow[lastRow.length - 1].x + lastRow[lastRow.length - 1].t.length : 0);
        while (lastRow.length && end() + `  +${hidden + 1} more`.length > W - 2) { lastRow.pop(); hidden++; }
        lastRow.push({ x: end() + (lastRow.length ? 2 : 0), t: `+${hidden} more`, fg: sub(th) });
      }
      rows.forEach((r, y) => {
        if (r.k === 'head') runs(ctx, b, 0, y, W, [['tool servers', th.ink, ATTR.BOLD], [kb >= 0 ? ` ${MID} disconnect all` : ` ${MID} 3 configured ${MID} ${tools} tools`, th.ink]]);
        else if (r.k === 'srv') {
          // rows arrive one by one after t=0; in the beat each goes to a ring, then the list clears
          if (kb >= 0.6 || (kb < 0 && p < 0.2 + r.i * 0.15)) return;
          const [name, where, at, list, fails] = SERVERS[r.i], on = r.i === sel && kb < 0, off = kb >= 0 && kb > 0.1 + r.i * 0.15;
          if (on) mark(ctx, b, 0, y, '›', '>', th.accent);
          let gx;
          if (off) gx = mark(ctx, b, 2, y, '○', 'o', th.muted);
          else if (p >= at) gx = mark(ctx, b, 2, y, '●', '*', th.pos);
          else if (fails !== undefined && p >= fails && p < fails + 1.2) gx = mark(ctx, b, 2, y, '✖', 'x', th.neg);
          else { b.set(2, y, spin(ctx, p + r.i * 0.3), th.warn, undefined, ATTR.BOLD); gx = 3; }
          const nx = on ? inv(ctx, b, gx + 1, y, ` ${name} `) : b.text(gx + 2, y, name, th.ink, undefined, ATTR.BOLD) + 1;
          const state = off ? 'disconnected' : p >= at ? `connected ${MID} ${list.length} tools` : fails !== undefined && p >= fails ? (p < fails + 1.2 ? '401 auth failed' : 'refreshing token') : 'connecting';
          // addresses show on every row or on none
          const sw = state.length, wx = Math.max(nx + 1, 15);
          if (15 + 16 + 2 + 20 <= W) runs(ctx, b, wx, y, where.length, [[where, sub(th)]]);
          runs(ctx, b, W - sw, y, sw, [[state, th.ink]]);
        } else if (r.k === 'list') {
          if (kb >= 0.45 || (kb < 0 && p < 0.2)) return;
          const n = p >= cur[2] ? `${cur[3].length} tools` : 'waiting for the handshake';
          runs(ctx, b, 0, y, W, [[cur[0], th.ink, ATTR.BOLD], [` ${MID} ${n}`, th.ink]]);
        } else if (r.k === 'tools' && names[r.i] && kb < 0.45) names[r.i].forEach((it) => runs(ctx, b, 2 + it.x, y, W - 2 - it.x, [[it.t, it.fg]]));
      });
    };
    return (t) => { const p = phase(t, LOOP); draw(ctx.buffer, p >= R1 ? 0 : p); };
  },
};
