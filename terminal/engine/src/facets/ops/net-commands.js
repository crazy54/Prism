// Typed network commands with authentic output: `ss -tulpn`, `ip -br -c addr`, and a hop-by-hop traceroute.
import { C, ATTR, writer, session, drawSession, typed, hash, pad, lpad, fixed } from './_kit.js';

const looped = (t, len) => t % len;

const ss = {
  id: 'ops-ss-listen',
  title: 'ss -tulpn',
  category: 'Network',
  description: 'Typing `sudo ss -tulpn` and getting the listening sockets: Netid, State, queues, local/peer addresses and the owning processes.',
  tags: ['ss', 'sockets', 'ports', 'listening', 'netstat', 'network'],
  kind: 'tui',
  size: { w: 80, h: 13 },
  minSize: { w: 60, h: 5 },
  loop: 12,
  glyphs: 'ascii',
  color: '16',
  setup(ctx) {
    const w = writer(ctx), c = C(ctx);
    const rows = [
      ['udp', 'UNCONN', '0', '0', '127.0.0.53%lo:53', '0.0.0.0:*', 'systemd-resolve', 581],
      ['udp', 'UNCONN', '0', '0', '0.0.0.0:51820', '0.0.0.0:*', 'wg-quick', 0],
      ['tcp', 'LISTEN', '0', '4096', '127.0.0.53%lo:53', '0.0.0.0:*', 'systemd-resolve', 581],
      ['tcp', 'LISTEN', '0', '128', '0.0.0.0:22', '0.0.0.0:*', 'sshd', 941],
      ['tcp', 'LISTEN', '0', '511', '0.0.0.0:80', '0.0.0.0:*', 'nginx', 1287],
      ['tcp', 'LISTEN', '0', '511', '0.0.0.0:443', '0.0.0.0:*', 'nginx', 1287],
      ['tcp', 'LISTEN', '0', '200', '127.0.0.1:5432', '0.0.0.0:*', 'postgres', 2040],
      ['tcp', 'LISTEN', '0', '511', '127.0.0.1:6379', '0.0.0.0:*', 'redis-server', 3390],
      ['tcp', 'LISTEN', '0', '4096', '*:9100', '*:*', 'node_exporter', 5562],
    ];
    const out = () => [
      [[`${pad('Netid', 6)}${pad('State', 7)}${lpad('Recv-Q', 7)}${lpad('Send-Q', 7)} ${lpad('Local Address:Port', 22)} ${pad('Peer Address:Port', 18)}Process`, c.fg, ATTR.BOLD]],
      ...rows.map(([n, s, rq, sq, l, p, proc, pid]) => [[pad(n, 6), n === 'tcp' ? c.cyan : c.magenta], [pad(s, 7), s === 'LISTEN' ? c.green : c.yellow], [`${lpad(rq, 7)}${lpad(sq, 7)} ${lpad(l, 22)} ${pad(p, 18)}`, c.fg], [`users:(("${proc}"${pid ? `,pid=${pid}` : ''},fd=${3 + (pid % 9)}))`, c.muted]]),
    ];
    return (t) => {
      const lines = session(ctx, looped(t, 12), [{ cmd: 'sudo ss -tulpn', out, dur: 9 }]);
      drawSession(w, ctx, lines, 0, 0, ctx.height);
    };
  },
};

const ipbr = {
  id: 'ops-ip-brief',
  title: 'ip -br -c addr',
  category: 'Network',
  description: 'Typing `ip -br -c addr` then `ip -br -c link`: interfaces in color, UP green, DOWN red, IPv4 and IPv6 addresses and MACs.',
  tags: ['ip', 'iproute2', 'interfaces', 'addresses', 'network'],
  kind: 'tui',
  size: { w: 76, h: 13 },
  minSize: { w: 56, h: 5 },
  loop: 14,
  glyphs: 'ascii',
  color: '16',
  setup(ctx) {
    const w = writer(ctx), c = C(ctx);
    const ifs = [['lo', 'UNKNOWN', '127.0.0.1/8 ::1/128', '00:00:00:00:00:00'], ['eth0', 'UP', '10.20.2.31/24 fe80::5054:ff:fe3a:21c4/64', '52:54:00:3a:21:c4'],
      ['eth1', 'DOWN', '', '52:54:00:9b:07:11'], ['docker0', 'DOWN', '172.17.0.1/16', '02:42:6c:1e:8f:2a'], ['wg0', 'UNKNOWN', '10.99.0.3/24', '']];
    const stc = (s) => (s === 'UP' ? c.green : s === 'DOWN' ? c.red : c.fg);
    const addr = () => ifs.map(([n, s, a]) => [[pad(n, 17), c.cyan], [pad(s, 15), stc(s), ATTR.BOLD], ...a.split(' ').filter(Boolean).map((x) => [x + ' ', x.includes(':') ? c.blue : c.magenta])]);
    const link = () => ifs.map(([n, s, , mac]) => [[pad(n, 17), c.cyan], [pad(s, 15), stc(s), ATTR.BOLD], [mac ? pad(mac, 18) : pad('none', 18), c.yellow], [`<${n === 'lo' ? 'LOOPBACK,UP,LOWER_UP' : s === 'UP' ? 'BROADCAST,MULTICAST,UP,LOWER_UP' : s === 'DOWN' ? 'NO-CARRIER,BROADCAST,MULTICAST,UP' : 'POINTOPOINT,NOARP,UP,LOWER_UP'}>`, c.fg]]);
    return (t) => {
      const lines = session(ctx, looped(t, 14), [{ cmd: 'ip -br -c addr', out: addr, dur: 3 }, { cmd: 'ip -br -c link', out: link, dur: 5 }]);
      drawSession(w, ctx, lines, 0, 0, ctx.height);
    };
  },
};

const trace = {
  id: 'ops-traceroute',
  title: 'traceroute',
  category: 'Network',
  description: 'traceroute revealing the path hop by hop: three probe times per hop as they return, with * * * for a router that won\'t answer.',
  tags: ['traceroute', 'hops', 'routing', 'latency', 'network'],
  kind: 'tui',
  size: { w: 78, h: 13 },
  minSize: { w: 56, h: 5 },
  loop: 16,
  glyphs: 'ascii',
  color: '16',
  setup(ctx) {
    const w = writer(ctx), c = C(ctx);
    const hops = [['_gateway', '10.20.2.1', 0.4], ['10.20.0.1', '10.20.0.1', 0.9], ['100.64.12.1', '100.64.12.1', 3.1], [null, null, 0],
      ['edge1.transit.example', '198.51.100.17', 6.8], ['core4.transit.example', '198.51.100.94', 7.4], ['203.0.113.6', '203.0.113.6', 12.4],
      ['lb2.api.example', '203.0.113.41', 18.9], ['api.example', '192.0.2.80', 22.6]];
    return (t) => {
      const T = t % 16;
      const H = ctx.height;
      const head = typed('traceroute api.example', T, 0.2, 20);
      let y = 0;
      const lines = [[['ops@node03', c.green, ATTR.BOLD], [':', c.fg], ['~', c.blue, ATTR.BOLD], ['$ ', c.fg], [head.text, c.fg]]];
      if (head.done) {
        lines.push([['traceroute to api.example (192.0.2.80), 30 hops max, 60 byte packets', c.fg]]);
        hops.forEach(([name, ip, base], i) => {
          const at = head.at + 0.6 + i * 1.1;
          if (T < at) return;
          const parts = [[`${lpad(i + 1, 2)}  `, c.fg]];
          if (!name) { const n = Math.min(3, 1 + Math.floor((T - at) / 0.5)); parts.push(['* '.repeat(n).trim(), c.red]); lines.push(parts); return; }
          parts.push([`${name} `, c.cyan], [`(${ip}) `, c.fg]);
          for (let p = 0; p < 3; p++) if (T >= at + p * 0.25) parts.push([` ${fixed(base * (0.92 + hash(i * 3 + p, 4) * 0.2), 3)} ms`, c.fg]);
          lines.push(parts);
        });
      }
      lines.slice(-H).forEach((parts) => w.seg(0, y++, parts));
    };
  },
};

export default [ss, ipbr, trace];
