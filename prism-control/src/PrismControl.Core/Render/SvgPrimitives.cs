using System.Globalization;
using System.Text;

namespace PrismControl.Core.Render;

internal static class SvgFormat
{
    /// <summary>Invariant, at most 2 decimals, no "-0". Throws on NaN/Infinity (they produce broken SVG).</summary>
    public static string N(double v)
    {
        if (double.IsNaN(v) || double.IsInfinity(v)) throw new ArgumentOutOfRangeException(nameof(v), v, "SVG numbers must be finite.");
        var r = Math.Round(v, 2, MidpointRounding.AwayFromZero);
        if (r == 0) return "0";
        return r.ToString("0.##", CultureInfo.InvariantCulture);
    }

    public static string Opacity(double v) => Math.Round(Math.Clamp(v, 0, 1), 3).ToString("0.###", CultureInfo.InvariantCulture);

    public static string Attr(string value)
    {
        if (value.AsSpan().IndexOfAny("<>&\"") < 0) return value;
        var sb = new StringBuilder(value.Length + 16);
        foreach (var ch in value)
        {
            sb.Append(ch switch
            {
                '<' => "&lt;",
                '>' => "&gt;",
                '&' => "&amp;",
                '"' => "&quot;",
                _ => ch.ToString(),
            });
        }
        return sb.ToString();
    }
}

public enum LineCap { Butt, Round, Square }
public enum LineJoin { Miter, Round, Bevel }
public enum FillRule { NonZero, EvenOdd }
public enum SpreadMethod { Pad, Reflect, Repeat }

/// <summary>A reference to a luminance mask in &lt;defs&gt; (white shows, black hides). Use instead of clipPath, which the app ignores.</summary>
public readonly record struct MaskRef(string Id);

/// <summary>A reference to a filter in &lt;defs&gt; (only blur-based glows are safe).</summary>
public readonly record struct FilterRef(string Id);

/// <summary>Presentation attributes for one element or group. Unset members are not written.</summary>
public readonly record struct Style
{
    public Paint Fill { get; init; }
    public Paint Stroke { get; init; }
    public double StrokeWidth { get; init; }
    public LineCap? LineCap { get; init; }
    public LineJoin? LineJoin { get; init; }
    public double[]? Dash { get; init; }
    public double DashOffset { get; init; }
    /// <summary>Element/group opacity (1 = not written).</summary>
    public double? Opacity { get; init; }
    public FilterRef? Filter { get; init; }
    public MaskRef? Mask { get; init; }
    public Transform? Transform { get; init; }
    public FillRule? FillRule { get; init; }
    public bool NonScalingStroke { get; init; }

    public static Style Filled(Paint fill) => new() { Fill = fill };
    public static Style Stroked(Paint stroke, double width, LineCap cap = Render.LineCap.Round) =>
        new() { Fill = Paint.None, Stroke = stroke, StrokeWidth = width, LineCap = cap, LineJoin = Render.LineJoin.Round };

    internal void Write(StringBuilder sb)
    {
        if (Fill.IsSet)
        {
            sb.Append(" fill=\"").Append(Fill.AttributeValue).Append('"');
            if (Fill.Kind != PaintKind.None && Fill.Opacity < 1) sb.Append(" fill-opacity=\"").Append(SvgFormat.Opacity(Fill.Opacity)).Append('"');
        }
        if (FillRule == Render.FillRule.EvenOdd) sb.Append(" fill-rule=\"evenodd\"");
        if (Stroke.IsSet)
        {
            sb.Append(" stroke=\"").Append(Stroke.AttributeValue).Append('"');
            if (Stroke.Kind != PaintKind.None && Stroke.Opacity < 1) sb.Append(" stroke-opacity=\"").Append(SvgFormat.Opacity(Stroke.Opacity)).Append('"');
        }
        if (StrokeWidth > 0) sb.Append(" stroke-width=\"").Append(SvgFormat.N(StrokeWidth)).Append('"');
        if (LineCap is { } cap && cap != Render.LineCap.Butt) sb.Append(" stroke-linecap=\"").Append(cap == Render.LineCap.Round ? "round" : "square").Append('"');
        if (LineJoin is { } join && join != Render.LineJoin.Miter) sb.Append(" stroke-linejoin=\"").Append(join == Render.LineJoin.Round ? "round" : "bevel").Append('"');
        if (Dash is { Length: > 0 } dash)
        {
            sb.Append(" stroke-dasharray=\"").Append(string.Join(' ', dash.Select(SvgFormat.N))).Append('"');
            if (DashOffset != 0) sb.Append(" stroke-dashoffset=\"").Append(SvgFormat.N(DashOffset)).Append('"');
        }
        if (NonScalingStroke) sb.Append(" vector-effect=\"non-scaling-stroke\"");
        if (Opacity is { } op && op < 1) sb.Append(" opacity=\"").Append(SvgFormat.Opacity(op)).Append('"');
        if (Filter is { } f) sb.Append(" filter=\"url(#").Append(f.Id).Append(")\"");
        if (Mask is { } m) sb.Append(" mask=\"url(#").Append(m.Id).Append(")\"");
        if (Transform is { } t && !t.IsIdentity) sb.Append(" transform=\"").Append(t.ToString()).Append('"');
    }
}

/// <summary>An SVG <c>transform</c> attribute value (the attribute form; the CSS transform property is ignored by the app).</summary>
public readonly struct Transform
{
    private readonly string? _value;
    private Transform(string? value) => _value = value;

    public bool IsIdentity => string.IsNullOrEmpty(_value);
    public static Transform Identity => default;

    public static Transform Translate(double x, double y) => new($"translate({SvgFormat.N(x)} {SvgFormat.N(y)})");
    public static Transform Scale(double s) => new($"scale({SvgFormat.N(s)})");
    public static Transform Scale(double sx, double sy) => new($"scale({SvgFormat.N(sx)} {SvgFormat.N(sy)})");
    public static Transform Rotate(double degrees) => new($"rotate({SvgFormat.N(degrees)})");
    public static Transform Rotate(double degrees, double cx, double cy) => new($"rotate({SvgFormat.N(degrees)} {SvgFormat.N(cx)} {SvgFormat.N(cy)})");
    public static Transform Matrix(double a, double b, double c, double d, double e, double f) =>
        new($"matrix({SvgFormat.N(a)} {SvgFormat.N(b)} {SvgFormat.N(c)} {SvgFormat.N(d)} {SvgFormat.N(e)} {SvgFormat.N(f)})");

    /// <summary>Appends another transform (applied after this one in SVG's right-to-left sense: <c>this then other</c> as written).</summary>
    public Transform Then(Transform other) => IsIdentity ? other : other.IsIdentity ? this : new($"{_value} {other._value}");
    public Transform Translate2(double x, double y) => Then(Translate(x, y));
    public Transform Scale2(double s) => Then(Scale(s));
    public Transform Rotate2(double deg, double cx, double cy) => Then(Rotate(deg, cx, cy));

    public override string ToString() => _value ?? "";
}

public readonly record struct GradientStop(double Offset, Color Color, double Opacity = 1)
{
    public static implicit operator GradientStop((double offset, Color color) t) => new(t.offset, t.color);
    public static implicit operator GradientStop((double offset, Color color, double opacity) t) => new(t.offset, t.color, t.opacity);
}

public enum TextAlign { Start, Middle, End }

/// <summary>Where <c>y</c> sits on the text (the app ignores dominant-baseline, so the builder positions glyphs itself).</summary>
public enum TextBaseline
{
    /// <summary>y is the baseline.</summary>
    Alphabetic,
    /// <summary>y is the vertical center of the capitals (good for centering a value in a key).</summary>
    Middle,
    /// <summary>y is the top of the ink.</summary>
    Top,
}

public enum FontWeight { Light = 300, Regular = 400, Medium = 500, Semibold = 600, Bold = 700 }

public enum TextCase
{
    /// <summary>Lowercase letters render as small capitals (the stroke font has no lowercase).</summary>
    SmallCaps,
    /// <summary>Everything renders as full-size capitals.</summary>
    Upper,
}

public enum ImageFit
{
    /// <summary>Fill the box and crop the overflow (cropped with a luminance mask, never clipPath).</summary>
    Cover,
    /// <summary>Fit inside the box, keeping the aspect ratio (letterboxed).</summary>
    Contain,
    /// <summary>Stretch to the box (what the app does with preserveAspectRatio anyway).</summary>
    Stretch,
}

/// <summary>Thrown when a frame exceeds the per-frame element budget (render cost scales with element count; the lab saw collapse at 1,200).</summary>
public sealed class SvgBudgetExceededException(int count, int max)
    : InvalidOperationException($"SVG frame has {count} elements; the budget is {max}. Merge shapes into fewer <path>s (render cost scales with element count).")
{
    public int Count { get; } = count;
    public int Max { get; } = max;
}
