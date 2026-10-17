using System.Globalization;
using System.Text.RegularExpressions;

namespace PrismControl.Core.Render;

public enum PaintKind
{
    /// <summary>default(Paint): the attribute is not written at all.</summary>
    Unset = 0,
    /// <summary><c>none</c>.</summary>
    None,
    Solid,
    /// <summary>A gradient (or other paint server) in &lt;defs&gt;, written as <c>url(#id)</c>.</summary>
    Reference,
}

/// <summary>
/// A fill/stroke value that is always Qt-safe: a hex color (or url(#gradient)) plus a separate opacity.
/// Strings convert implicitly through <see cref="Parse"/>, which accepts <c>rgba()</c> and <c>#rrggbbaa</c>
/// and moves the alpha into the opacity attribute, so the emitted SVG never contains them.
/// </summary>
public readonly partial struct Paint : IEquatable<Paint>
{
    public PaintKind Kind { get; }
    public Color Color { get; }
    public string? RefId { get; }
    private readonly double _opacityComplement; // stored as 1 - opacity so default(Paint) has opacity 1

    private Paint(PaintKind kind, Color color, string? refId, double opacity)
    {
        Kind = kind;
        Color = color;
        RefId = refId;
        _opacityComplement = 1 - Math.Clamp(opacity, 0, 1);
    }

    public double Opacity => 1 - _opacityComplement;
    public bool IsSet => Kind != PaintKind.Unset;

    public static Paint None => new(PaintKind.None, default, null, 1);
    public static Paint Solid(Color color, double opacity = 1) => new(PaintKind.Solid, color, null, opacity);
    internal static Paint Reference(string id, double opacity = 1) => new(PaintKind.Reference, default, id, opacity);

    public Paint WithOpacity(double opacity) => new(Kind, Color, RefId, opacity);
    /// <summary>Multiplies the existing opacity.</summary>
    public Paint Fade(double factor) => new(Kind, Color, RefId, Opacity * factor);

    /// <summary>The value for a fill/stroke attribute.</summary>
    public string AttributeValue => Kind switch
    {
        PaintKind.None => "none",
        PaintKind.Solid => Color.Hex,
        PaintKind.Reference => $"url(#{RefId})",
        _ => "",
    };

    [GeneratedRegex(@"^rgba?\(\s*([0-9.]+%?)\s*[, ]\s*([0-9.]+%?)\s*[, ]\s*([0-9.]+%?)\s*(?:[,/]\s*([0-9.]+%?)\s*)?\)$", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex RgbRegex();

    private static readonly Dictionary<string, Color> Named = new(StringComparer.OrdinalIgnoreCase)
    {
        ["white"] = Color.White,
        ["black"] = Color.Black,
        ["red"] = new(255, 0, 0),
        ["lime"] = new(0, 255, 0),
        ["blue"] = new(0, 0, 255),
        ["gray"] = new(128, 128, 128),
        ["grey"] = new(128, 128, 128),
    };

    /// <summary>
    /// Parses #rgb, #rgba, #rrggbb, #rrggbbaa, rgb(), rgba(), none, transparent and a few named colors.
    /// hsl()/hsla() are rejected (convert at build time; the tokens generator already does).
    /// </summary>
    public static Paint Parse(string css)
    {
        if (TryParse(css, out var p)) return p;
        throw new FormatException($"Unsupported color '{css}'. Use hex or rgb()/rgba(); hsl() is not allowed (it renders black on Stream Deck).");
    }

    public static bool TryParse(string? css, out Paint paint)
    {
        paint = default;
        if (string.IsNullOrWhiteSpace(css)) return false;
        var s = css.Trim();
        if (s.Equals("none", StringComparison.OrdinalIgnoreCase)) { paint = None; return true; }
        if (s.Equals("transparent", StringComparison.OrdinalIgnoreCase)) { paint = Solid(Color.Black, 0); return true; }
        if (Named.TryGetValue(s, out var named)) { paint = Solid(named); return true; }
        if (s.StartsWith('#'))
        {
            var h = s.AsSpan(1);
            if (!Color.IsHex(h)) return false;
            if (h.Length is 3 or 6) { paint = Solid(Color.FromHex(s)); return true; }
            if (h.Length == 4)
            {
                var c = Color.FromHex("#" + h[..3].ToString());
                var a = Convert.ToByte(new string(h[3], 2), 16) / 255.0;
                paint = Solid(c, Math.Round(a, 3));
                return true;
            }
            if (h.Length == 8)
            {
                var c = Color.FromHex("#" + h[..6].ToString());
                var a = byte.Parse(h.Slice(6, 2), NumberStyles.HexNumber, CultureInfo.InvariantCulture) / 255.0;
                paint = Solid(c, Math.Round(a, 3));
                return true;
            }
            return false;
        }
        var m = RgbRegex().Match(s);
        if (m.Success)
        {
            static byte Channel(string v) => v.EndsWith('%')
                ? (byte)Math.Round(Math.Clamp(double.Parse(v.TrimEnd('%'), CultureInfo.InvariantCulture), 0, 100) * 2.55)
                : (byte)Math.Round(Math.Clamp(double.Parse(v, CultureInfo.InvariantCulture), 0, 255));
            var color = new Color(Channel(m.Groups[1].Value), Channel(m.Groups[2].Value), Channel(m.Groups[3].Value));
            double alpha = 1;
            if (m.Groups[4].Success)
            {
                var av = m.Groups[4].Value;
                alpha = av.EndsWith('%')
                    ? double.Parse(av.TrimEnd('%'), CultureInfo.InvariantCulture) / 100
                    : double.Parse(av, CultureInfo.InvariantCulture);
            }
            paint = Solid(color, Math.Clamp(alpha, 0, 1));
            return true;
        }
        return false;
    }

    public static implicit operator Paint(string css) => Parse(css);

    public override string ToString() => Kind switch
    {
        PaintKind.Unset => "(unset)",
        _ when Opacity < 1 => $"{AttributeValue} @ {Opacity.ToString("0.###", CultureInfo.InvariantCulture)}",
        _ => AttributeValue,
    };

    public bool Equals(Paint other) => Kind == other.Kind && Color == other.Color && RefId == other.RefId && Opacity.Equals(other.Opacity);
    public override bool Equals(object? obj) => obj is Paint p && Equals(p);
    public override int GetHashCode() => HashCode.Combine(Kind, Color, RefId, Opacity);
    public static bool operator ==(Paint a, Paint b) => a.Equals(b);
    public static bool operator !=(Paint a, Paint b) => !a.Equals(b);
}
