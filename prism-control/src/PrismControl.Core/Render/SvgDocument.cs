using System.Diagnostics;
using System.Text;

namespace PrismControl.Core.Render;

/// <summary>
/// Builds one Stream Deck frame using ONLY the SVG subset the app's Qt renderer draws correctly
/// (hardware-lab results/svg-support.md):
/// hex colors with separate opacity attributes, linear/radial gradients, luminance masks (never clipPath),
/// blur glows, the transform attribute, stroked-path text (never &lt;text&gt;), and embedded PNG/JPEG images.
/// <para>
/// Canvas: <see cref="Key"/> is a square 144-unit viewBox (the app stretches any viewBox to the key, so it must be square);
/// <see cref="Dial"/> is 200×100 for dial/touch-strip/Galleon-widget pixmaps. Send with <see cref="ToDataUri"/>
/// (a raw SVG string is rejected by the app and the key reverts to its manifest image).
/// </para>
/// <para>Frames are capped at <see cref="MaxElements"/> elements (default 300); render cost scales with element count.</para>
/// </summary>
public sealed class SvgDocument
{
    public const int DefaultMaxElements = 300;

    private readonly StringBuilder _defs = new();
    private readonly StringBuilder _body = new();
    private StringBuilder _target;
    private int _openGroups;
    private int _nextId;
    private readonly string _idPrefix;

    public double Width { get; }
    public double Height { get; }
    private int _count;

    /// <summary>Elements in the frame so far (start tags, excluding the root; includes &lt;defs&gt; content).</summary>
    public int ElementCount => _count + (_defs.Length > 0 ? 1 : 0);
    public int MaxElements { get; set; } = DefaultMaxElements;

    public SvgDocument(double width, double height, string idPrefix = "p")
    {
        if (width <= 0 || height <= 0) throw new ArgumentOutOfRangeException(nameof(width));
        Width = width;
        Height = height;
        _target = _body;
        _idPrefix = idPrefix;
    }

    /// <summary>A key frame: square viewBox, 144 units by default (author at @2x; the app scales down).</summary>
    public static SvgDocument Key(double size = 144) => new(size, size);

    /// <summary>A dial pixmap frame: 200×100 (Stream Deck + strip segment and each Galleon screen widget).</summary>
    public static SvgDocument Dial() => new(200, 100);

    // ---------------------------------------------------------------- shapes

    public SvgDocument Rect(double x, double y, double w, double h, Style style, double rx = 0, double? ry = null)
    {
        var sb = Open("rect");
        sb.Append(" x=\"").Append(SvgFormat.N(x)).Append("\" y=\"").Append(SvgFormat.N(y))
          .Append("\" width=\"").Append(SvgFormat.N(Math.Max(0, w))).Append("\" height=\"").Append(SvgFormat.N(Math.Max(0, h))).Append('"');
        if (rx > 0) sb.Append(" rx=\"").Append(SvgFormat.N(rx)).Append('"');
        if (ry is { } r && r > 0) sb.Append(" ry=\"").Append(SvgFormat.N(r)).Append('"');
        return Close(sb, style);
    }

    public SvgDocument Rect(double x, double y, double w, double h, Paint fill, double rx = 0) => Rect(x, y, w, h, new Style { Fill = fill }, rx);

    public SvgDocument Circle(double cx, double cy, double r, Style style)
    {
        var sb = Open("circle");
        sb.Append(" cx=\"").Append(SvgFormat.N(cx)).Append("\" cy=\"").Append(SvgFormat.N(cy)).Append("\" r=\"").Append(SvgFormat.N(Math.Max(0, r))).Append('"');
        return Close(sb, style);
    }

    public SvgDocument Circle(double cx, double cy, double r, Paint fill) => Circle(cx, cy, r, new Style { Fill = fill });

    public SvgDocument Ellipse(double cx, double cy, double rx, double ry, Style style)
    {
        var sb = Open("ellipse");
        sb.Append(" cx=\"").Append(SvgFormat.N(cx)).Append("\" cy=\"").Append(SvgFormat.N(cy))
          .Append("\" rx=\"").Append(SvgFormat.N(rx)).Append("\" ry=\"").Append(SvgFormat.N(ry)).Append('"');
        return Close(sb, style);
    }

    public SvgDocument Line(double x1, double y1, double x2, double y2, Paint stroke, double width, LineCap cap = LineCap.Round, double? opacity = null)
    {
        var sb = Open("line");
        sb.Append(" x1=\"").Append(SvgFormat.N(x1)).Append("\" y1=\"").Append(SvgFormat.N(y1))
          .Append("\" x2=\"").Append(SvgFormat.N(x2)).Append("\" y2=\"").Append(SvgFormat.N(y2)).Append('"');
        return Close(sb, new Style { Stroke = stroke, StrokeWidth = width, LineCap = cap, Opacity = opacity });
    }

    public SvgDocument Path(string d, Style style)
    {
        if (string.IsNullOrEmpty(d)) return this;
        var sb = Open("path");
        sb.Append(" d=\"").Append(SvgFormat.Attr(d)).Append('"');
        return Close(sb, style);
    }

    public SvgDocument Path(PathBuilder path, Style style) => Path(path.ToString(), style);

    public SvgDocument Polygon(IEnumerable<(double X, double Y)> points, Style style)
    {
        var sb = Open("polygon");
        sb.Append(" points=\"").Append(string.Join(' ', points.Select(p => SvgFormat.N(p.X) + "," + SvgFormat.N(p.Y)))).Append('"');
        return Close(sb, style);
    }

    public SvgDocument Polyline(IEnumerable<(double X, double Y)> points, Style style)
    {
        var sb = Open("polyline");
        sb.Append(" points=\"").Append(string.Join(' ', points.Select(p => SvgFormat.N(p.X) + "," + SvgFormat.N(p.Y)))).Append('"');
        return Close(sb, style.Fill.IsSet ? style : style with { Fill = Paint.None });
    }

    // ---------------------------------------------------------------- text (always paths)

    /// <summary>
    /// Draws text as ONE stroked path in the built-in <see cref="StrokeFont"/>.
    /// <paramref name="size"/> is a CSS-like font size (capital height = 0.72 × size). Tracking is in em.
    /// </summary>
    public SvgDocument Text(string text, double x, double y, double size, Paint color,
        TextAlign align = TextAlign.Start, FontWeight weight = FontWeight.Semibold, TextBaseline baseline = TextBaseline.Alphabetic,
        double tracking = 0, TextCase textCase = TextCase.SmallCaps, double? opacity = null, FilterRef? filter = null)
    {
        if (string.IsNullOrEmpty(text)) return this;
        var d = StrokeFont.PathData(text, x, y, size, weight, align, baseline, tracking, textCase);
        if (d.Length == 0) return this;
        return Path(d, new Style
        {
            Fill = Paint.None,
            Stroke = color,
            StrokeWidth = StrokeFont.StrokeWidth(size, weight),
            LineCap = LineCap.Round,
            LineJoin = LineJoin.Round,
            Opacity = opacity,
            Filter = filter,
        });
    }

    // ---------------------------------------------------------------- images

    /// <summary>
    /// Embeds a PNG/JPEG/GIF/WebP as one &lt;image&gt; (data URI). The app ignores preserveAspectRatio and always
    /// stretches, so the box is computed here from the image's real size. <see cref="ImageFit.Contain"/> keeps the whole
    /// image (required for Spotify album art: no cropping, masking or overlays). <see cref="ImageFit.Cover"/> crops with a mask.
    /// </summary>
    public SvgDocument Image(ReadOnlySpan<byte> data, double x, double y, double w, double h, ImageFit fit = ImageFit.Contain, double cornerRadius = 0, double? opacity = null)
    {
        var info = ImageInfo.Probe(data) ?? throw new ArgumentException("Unrecognized image data (expected PNG, JPEG, GIF or WebP).", nameof(data));
        return Image(DataUri.Image(data, info.Mime), info.Width, info.Height, x, y, w, h, fit, cornerRadius, opacity);
    }

    /// <summary>Embeds an image data URI whose pixel size is known.</summary>
    public SvgDocument Image(string dataUri, int pixelWidth, int pixelHeight, double x, double y, double w, double h, ImageFit fit = ImageFit.Contain, double cornerRadius = 0, double? opacity = null)
    {
        if (!dataUri.StartsWith("data:image/", StringComparison.Ordinal)) throw new ArgumentException("Images must be data: URIs (no external references).", nameof(dataUri));
        double ix = x, iy = y, iw = w, ih = h;
        var needsMask = cornerRadius > 0;
        if (fit != ImageFit.Stretch && pixelWidth > 0 && pixelHeight > 0)
        {
            var scale = fit == ImageFit.Cover
                ? Math.Max(w / pixelWidth, h / pixelHeight)
                : Math.Min(w / pixelWidth, h / pixelHeight);
            iw = pixelWidth * scale;
            ih = pixelHeight * scale;
            ix = x + (w - iw) / 2;
            iy = y + (h - ih) / 2;
            if (fit == ImageFit.Cover && (iw > w + 0.01 || ih > h + 0.01)) needsMask = true;
        }
        MaskRef? mask = null;
        if (needsMask)
        {
            var (mx, my, mw, mh) = fit == ImageFit.Contain ? (ix, iy, iw, ih) : (x, y, w, h);
            mask = MaskRoundedRect(mx, my, mw, mh, cornerRadius);
        }
        var sb = Open("image");
        sb.Append(" x=\"").Append(SvgFormat.N(ix)).Append("\" y=\"").Append(SvgFormat.N(iy))
          .Append("\" width=\"").Append(SvgFormat.N(iw)).Append("\" height=\"").Append(SvgFormat.N(ih))
          .Append("\" preserveAspectRatio=\"none\" href=\"").Append(dataUri).Append('"');
        return Close(sb, new Style { Mask = mask, Opacity = opacity });
    }

    // ---------------------------------------------------------------- paint servers, masks, filters

    public Paint LinearGradient(double x1, double y1, double x2, double y2, IEnumerable<GradientStop> stops,
        bool userSpace = false, SpreadMethod spread = SpreadMethod.Pad, Transform? transform = null)
    {
        var id = NextId();
        var sb = _defs;
        sb.Append("<linearGradient id=\"").Append(id).Append("\" x1=\"").Append(SvgFormat.N(x1)).Append("\" y1=\"").Append(SvgFormat.N(y1))
          .Append("\" x2=\"").Append(SvgFormat.N(x2)).Append("\" y2=\"").Append(SvgFormat.N(y2)).Append('"');
        GradientCommon(sb, userSpace, spread, transform);
        Stops(sb, stops);
        sb.Append("</linearGradient>");
        _count++;
        return Paint.Reference(id);
    }

    public Paint RadialGradient(double cx, double cy, double r, IEnumerable<GradientStop> stops, double? fx = null, double? fy = null,
        bool userSpace = false, SpreadMethod spread = SpreadMethod.Pad, Transform? transform = null)
    {
        var id = NextId();
        var sb = _defs;
        sb.Append("<radialGradient id=\"").Append(id).Append("\" cx=\"").Append(SvgFormat.N(cx)).Append("\" cy=\"").Append(SvgFormat.N(cy))
          .Append("\" r=\"").Append(SvgFormat.N(r)).Append('"');
        if (fx is { } vfx) sb.Append(" fx=\"").Append(SvgFormat.N(vfx)).Append('"');
        if (fy is { } vfy) sb.Append(" fy=\"").Append(SvgFormat.N(vfy)).Append('"');
        GradientCommon(sb, userSpace, spread, transform);
        Stops(sb, stops);
        sb.Append("</radialGradient>");
        _count++;
        return Paint.Reference(id);
    }

    private static void GradientCommon(StringBuilder sb, bool userSpace, SpreadMethod spread, Transform? transform)
    {
        if (userSpace) sb.Append(" gradientUnits=\"userSpaceOnUse\"");
        if (spread != SpreadMethod.Pad) sb.Append(" spreadMethod=\"").Append(spread == SpreadMethod.Reflect ? "reflect" : "repeat").Append('"');
        if (transform is { IsIdentity: false } t) sb.Append(" gradientTransform=\"").Append(t.ToString()).Append('"');
        sb.Append('>');
    }

    private void Stops(StringBuilder sb, IEnumerable<GradientStop> stops)
    {
        foreach (var s in stops)
        {
            sb.Append("<stop offset=\"").Append(SvgFormat.Opacity(s.Offset)).Append("\" stop-color=\"").Append(s.Color.Hex).Append('"');
            if (s.Opacity < 1) sb.Append(" stop-opacity=\"").Append(SvgFormat.Opacity(s.Opacity)).Append('"');
            sb.Append("/>");
            _count++;
        }
    }

    /// <summary>
    /// Defines a luminance mask (the app ignores clipPath). Draw WHITE where content should show and black where it
    /// should hide; gradients give soft fades. Never use mask-type="alpha" (treated as luminance).
    /// </summary>
    public MaskRef Mask(Action<SvgDocument> drawWhiteShapes)
    {
        var id = NextId();
        var saved = _target;
        _defs.Append("<mask id=\"").Append(id).Append("\" maskUnits=\"userSpaceOnUse\" x=\"0\" y=\"0\" width=\"")
             .Append(SvgFormat.N(Width)).Append("\" height=\"").Append(SvgFormat.N(Height)).Append("\">");
        _count++;
        _target = _defs;
        try { drawWhiteShapes(this); }
        finally { _target = saved; }
        _defs.Append("</mask>");
        return new MaskRef(id);
    }

    /// <summary>A rectangular (optionally rounded) "clip" implemented as a white luminance mask.</summary>
    public MaskRef MaskRoundedRect(double x, double y, double w, double h, double rx = 0) =>
        Mask(m => m.Rect(x, y, w, h, Color.White, rx));

    public MaskRef MaskCircle(double cx, double cy, double r) => Mask(m => m.Circle(cx, cy, r, Color.White));

    /// <summary>
    /// A glow: feGaussianBlur merged under the source (verified on hardware). Computed in sRGB to match the app.
    /// </summary>
    public FilterRef Glow(double stdDeviation)
    {
        var id = NextId();
        _defs.Append("<filter id=\"").Append(id).Append("\" filterUnits=\"userSpaceOnUse\" x=\"0\" y=\"0\" width=\"").Append(SvgFormat.N(Width))
             .Append("\" height=\"").Append(SvgFormat.N(Height)).Append("\" color-interpolation-filters=\"sRGB\">")
             .Append("<feGaussianBlur in=\"SourceGraphic\" stdDeviation=\"").Append(SvgFormat.N(stdDeviation)).Append("\" result=\"b\"/>")
             .Append("<feMerge><feMergeNode in=\"b\"/><feMergeNode in=\"SourceGraphic\"/></feMerge></filter>");
        _count += 5;
        return new FilterRef(id);
    }

    /// <summary>A plain blur (for halos drawn as separate shapes).</summary>
    public FilterRef Blur(double stdDeviation)
    {
        var id = NextId();
        _defs.Append("<filter id=\"").Append(id).Append("\" filterUnits=\"userSpaceOnUse\" x=\"0\" y=\"0\" width=\"").Append(SvgFormat.N(Width))
             .Append("\" height=\"").Append(SvgFormat.N(Height)).Append("\" color-interpolation-filters=\"sRGB\">")
             .Append("<feGaussianBlur stdDeviation=\"").Append(SvgFormat.N(stdDeviation)).Append("\"/></filter>");
        _count += 2;
        return new FilterRef(id);
    }

    // ---------------------------------------------------------------- groups

    /// <summary>Opens a &lt;g&gt; with the given style; dispose the scope to close it.</summary>
    public GroupScope Group(Style style)
    {
        var sb = Open("g");
        style.Write(sb);
        sb.Append('>');
        _openGroups++;
        return new GroupScope(this, _target);
    }

    public GroupScope Group(Transform transform, double? opacity = null) => Group(new Style { Transform = transform, Opacity = opacity });

    public readonly struct GroupScope : IDisposable
    {
        private readonly SvgDocument _doc;
        private readonly StringBuilder _sb;
        internal GroupScope(SvgDocument doc, StringBuilder sb) { _doc = doc; _sb = sb; }
        public void Dispose()
        {
            if (_doc is null) return;
            _sb.Append("</g>");
            _doc._openGroups--;
        }
    }

    /// <summary>
    /// Escape hatch for hand-written markup. You are responsible for the Qt-safe subset; Debug builds lint the frame.
    /// <paramref name="elementCount"/> is added to the budget.
    /// </summary>
    public SvgDocument Raw(string markup, int elementCount)
    {
        _target.Append(markup);
        _count += Math.Max(0, elementCount);
        return this;
    }

    // ---------------------------------------------------------------- output

    public string ToSvg()
    {
        if (_openGroups != 0) throw new InvalidOperationException("A Group() scope was not disposed.");
        if (ElementCount > MaxElements) throw new SvgBudgetExceededException(ElementCount, MaxElements);
        var sb = new StringBuilder(_defs.Length + _body.Length + 160);
        sb.Append("<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"").Append(SvgFormat.N(Width)).Append("\" height=\"").Append(SvgFormat.N(Height))
          .Append("\" viewBox=\"0 0 ").Append(SvgFormat.N(Width)).Append(' ').Append(SvgFormat.N(Height)).Append("\">");
        if (_defs.Length > 0) sb.Append("<defs>").Append(_defs).Append("</defs>");
        sb.Append(_body).Append("</svg>");
        var svg = sb.ToString();
        DebugLint(svg);
        return svg;
    }

    /// <summary>The <c>data:image/svg+xml,</c> URL to pass to setImage or a layout pixmap.</summary>
    public string ToDataUri() => DataUri.Svg(ToSvg());

    public override string ToString() => ToSvg();

    [Conditional("DEBUG")]
    private void DebugLint(string svg)
    {
        var errors = SvgLint.Check(svg, maxElements: MaxElements).Where(i => i.Severity == LintSeverity.Error).ToList();
        if (errors.Count > 0) throw new SvgLintException(errors);
    }

    private StringBuilder Open(string tag)
    {
        _count++;
        return _target.Append('<').Append(tag);
    }

    private SvgDocument Close(StringBuilder sb, Style style)
    {
        style.Write(sb);
        sb.Append("/>");
        return this;
    }

    private string NextId() => _idPrefix + (_nextId++).ToString(System.Globalization.CultureInfo.InvariantCulture);
}
