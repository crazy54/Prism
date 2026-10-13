// An `npm ls --all` dependency tree that prints line by line, then `npm audit`
// lights the path to a vulnerable transitive package (a fictional one).
import { ATTR, glyphs, uni, phase, blink, clip, stringWidth } from '../callouts/_kit.js';

// [name, version, children, flag] — flag: 'deduped' | 'vuln'
const ROOT = ['@checkout/api', '2.14.1', [
  ['express', '4.21.2', [['body-parser', '1.20.3'], ['send', '0.19.0', [['ms', '2.1.3']]], ['qs', '6.13.0']]],
  ['pg', '8.13.1', [['pg-pool', '3.7.0'], ['pg-protocol', '1.7.0']]],
  ['@checkout/telemetry', '1.4.0', [['left-padder', '1.0.2', null, 'vuln'], ['ms', '2.1.3', null, 'deduped']]],
  ['ioredis', '5.4.1'],
  ['zod', '3.23.8'],
]];
const PRINT = [0.3, 2.6], EXPLAIN = 3.4;

function flatten() {
  const rows = [];
  const walk = (node, guides, last, depth, path) => {
    const [name, ver, kids, flag] = node;
    rows.push({ name, ver, flag, guides, last, depth, hasKids: !!(kids && kids.length), path: [...path, name] });
    (kids || []).forEach((k, i) => walk(k, depth ? [...guides, !last] : [], i === kids.length - 1, depth + 1, [...path, name]));
  };
  walk(ROOT, [], true, 0, []);
  return rows;
}
const ROWS = flatten();
const VULN = ROWS.find((r) => r.flag === 'vuln');

export default {
  id: 'diagrams-dependency-tree',
  title: 'Dependency Tree',
  category: 'Trees & Hierarchies',
  description: 'An npm ls --all tree printing line by line with deduped markers, then npm audit lights the path from the root to a vulnerable transitive dependency.',
  tags: ['dependencies', 'npm ls', 'tree', 'supply chain', 'vulnerability'],
  kind: 'diagram',
  size: { w: 60, h: 20 },
  minSize: { w: 44, h: 10 },
  loop: 8,
  color: '16',
  order: 30,
  setup(ctx) {
    const th = ctx.theme;
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height, g = glyphs(ctx), u = uni(ctx);
      const p = phase(t, 8);
      const G = u ? { pipe: '│ ', gap: '  ', tee: '├─', end: '└─', kid: '┬ ', leaf: '─ ' } : { pipe: '| ', gap: '  ', tee: '+-', end: '`-', kid: '+ ', leaf: '- ' };
      const explaining = p >= EXPLAIN;
      const shown = Math.min(ROWS.length, Math.max(0, Math.floor(((p - PRINT[0]) / (PRINT[1] - PRINT[0])) * ROWS.length)));
      const lines = [];
      const prompt = (cmd) => lines.push([[`$ `, th.pos, ATTR.BOLD], [cmd, th.ink, ATTR.BOLD]]);
      prompt('npm ls --all');
      ROWS.slice(0, explaining ? ROWS.length : shown).forEach((r) => {
        const onPath = explaining && VULN.path.slice(0, r.depth + 1).join('/') === r.path.join('/');
        const dim = explaining && !onPath;
        const lc = onPath ? th.neg : th.line;
        const segs = [];
        if (r.depth > 0) {
          segs.push([r.guides.map((more) => (more ? G.pipe : G.gap)).join(''), dim ? th.dim : th.line]);
          segs.push([(r.last ? G.end : G.tee) + (r.hasKids ? G.kid : G.leaf), lc]);
        }
        segs.push([r.name, dim ? th.dim : r.flag === 'vuln' ? th.neg : th.ink, r.flag === 'vuln' || onPath ? ATTR.BOLD : 0]);
        segs.push([`@${r.ver}`, dim ? th.dim : r.flag === 'vuln' ? th.neg : th.muted]);
        if (r.depth === 0) segs.push([' /srv/checkout', th.dim]);
        if (r.flag === 'deduped') segs.push([' deduped', th.dim, ATTR.ITALIC]);
        if (r.flag === 'vuln' && (explaining || shown === ROWS.length)) segs.push([` ${g.warn} high`, th.neg, ATTR.BOLD]);
        lines.push(segs);
      });
      if (explaining) {
        prompt('npm audit');
        lines.push([[`${g.warn} 1 high severity vulnerability`, th.neg, ATTR.BOLD]]);
        lines.push([[`  left-padder <1.0.3 ${g.mid} prototype pollution`, th.muted]]);
        lines.push([[`  fix: npm i @checkout/telemetry@1.4.1`, th.pos]]);
      } else if (p >= PRINT[1] + 0.1) {
        lines.push([]);
        lines.push([[`$ `, th.pos, ATTR.BOLD], [blink(t, 0.8) ? (u ? '▏' : '_') : ' ', th.ink]]);
      }
      // Keep the newest lines (or the vulnerable path) in view.
      const first = Math.max(0, lines.length - H);
      for (let r = 0; r < Math.min(H, lines.length - first); r++) {
        let x = 0;
        for (const [text, fg, attr] of lines[first + r]) {
          const room = Math.max(0, W - x);
          x = b.text(x, r, stringWidth(text) <= room ? text : clip(ctx, text, room), fg, undefined, attr);
        }
      }
    };
  },
};
