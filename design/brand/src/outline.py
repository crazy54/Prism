# scratch: outline "prism" from Inter 600 → SVG path data (font units → 1000 upm scale)
import sys, json
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
f = TTFont(sys.argv[1])
gs = f.getGlyphSet(); cmap = f.getBestCmap(); upm = f['head'].unitsPerEm
text = sys.argv[2]; track = float(sys.argv[3])   # tracking in em
x = 0; out = []
kern = {}
for ch in text:
    g = cmap[ord(ch)]
    pen = SVGPathPen(gs)
    tp = TransformPen(pen, (1, 0, 0, -1, x, 0))
    gs[g].draw(tp)
    out.append({'ch': ch, 'd': pen.getCommands(), 'x': x, 'adv': gs[g].width})
    x += gs[g].width + track * upm
os2 = f['OS/2']
print(json.dumps({'upm': upm, 'glyphs': out, 'width': x - track * upm, 'xHeight': getattr(os2, 'sxHeight', 0), 'cap': getattr(os2, 'sCapHeight', 0), 'asc': f['hhea'].ascent, 'desc': f['hhea'].descent}))
