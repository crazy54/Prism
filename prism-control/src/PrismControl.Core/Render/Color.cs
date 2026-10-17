using System.Globalization;

namespace PrismControl.Core.Render;

/// <summary>
/// An opaque sRGB color. It always serializes as <c>#rrggbb</c>: the Stream Deck app's Qt SVG
/// renderer draws <c>rgba()</c>, <c>hsl()</c> and <c>#rrggbbaa</c> as opaque black, so translucency
/// is carried separately by <see cref="Paint.Opacity"/> (fill-opacity / stroke-opacity / stop-opacity).
/// </summary>
public readonly struct Color : IEquatable<Color>
{
    public byte R { get; }
    public byte G { get; }
    public byte B { get; }

    public Color(byte r, byte g, byte b)
    {
        R = r;
        G = g;
        B = b;
    }

    public static readonly Color White = new(255, 255, 255);
    public static readonly Color Black = new(0, 0, 0);

    /// <summary>Six-digit lowercase hex, e.g. <c>#b8a2f2</c>.</summary>
    public string Hex => string.Create(7, this, static (span, c) =>
    {
        span[0] = '#';
        c.R.TryFormat(span[1..], out _, "x2", CultureInfo.InvariantCulture);
        c.G.TryFormat(span[3..], out _, "x2", CultureInfo.InvariantCulture);
        c.B.TryFormat(span[5..], out _, "x2", CultureInfo.InvariantCulture);
    });

    public override string ToString() => Hex;

    /// <summary>Parses <c>#rgb</c> or <c>#rrggbb</c>. Use <see cref="Paint.Parse"/> for forms that carry alpha.</summary>
    public static Color FromHex(string hex)
    {
        if (!TryFromHex(hex, out var c))
            throw new FormatException($"'{hex}' is not a #rgb or #rrggbb color. (rgba()/hsl()/#rrggbbaa render black on Stream Deck; use Paint.Parse, which moves alpha into an opacity attribute.)");
        return c;
    }

    public static bool TryFromHex(string? hex, out Color color)
    {
        color = default;
        if (string.IsNullOrEmpty(hex)) return false;
        var s = hex.Trim();
        if (s.StartsWith('#')) s = s[1..];
        if (s.Length == 3)
        {
            if (!IsHex(s)) return false;
            color = new Color(Dup(s[0]), Dup(s[1]), Dup(s[2]));
            return true;
        }
        if (s.Length == 6)
        {
            if (!IsHex(s)) return false;
            color = new Color(
                byte.Parse(s.AsSpan(0, 2), NumberStyles.HexNumber, CultureInfo.InvariantCulture),
                byte.Parse(s.AsSpan(2, 2), NumberStyles.HexNumber, CultureInfo.InvariantCulture),
                byte.Parse(s.AsSpan(4, 2), NumberStyles.HexNumber, CultureInfo.InvariantCulture));
            return true;
        }
        return false;

        static byte Dup(char ch)
        {
            var v = Convert.ToByte(ch.ToString(), 16);
            return (byte)(v * 17);
        }
    }

    internal static bool IsHex(ReadOnlySpan<char> s)
    {
        foreach (var ch in s)
            if (!char.IsAsciiHexDigit(ch)) return false;
        return true;
    }

    /// <summary>Linear interpolation in sRGB space (t = 0 gives this, t = 1 gives <paramref name="other"/>).</summary>
    public Color Mix(Color other, double t)
    {
        t = Math.Clamp(t, 0, 1);
        return new Color(
            (byte)Math.Round(R + (other.R - R) * t),
            (byte)Math.Round(G + (other.G - G) * t),
            (byte)Math.Round(B + (other.B - B) * t));
    }

    /// <summary>The color composited over <paramref name="background"/> at <paramref name="opacity"/> (for precomputing blends; mix-blend-mode is ignored by the app).</summary>
    public Color Over(Color background, double opacity) => background.Mix(this, opacity);

    /// <summary>WCAG relative luminance (0..1).</summary>
    public double RelativeLuminance
    {
        get
        {
            static double Lin(byte v)
            {
                var c = v / 255.0;
                return c <= 0.04045 ? c / 12.92 : Math.Pow((c + 0.055) / 1.055, 2.4);
            }
            return 0.2126 * Lin(R) + 0.7152 * Lin(G) + 0.0722 * Lin(B);
        }
    }

    /// <summary>WCAG contrast ratio between two colors (1..21).</summary>
    public static double Contrast(Color a, Color b)
    {
        var la = a.RelativeLuminance;
        var lb = b.RelativeLuminance;
        if (la < lb) (la, lb) = (lb, la);
        return (la + 0.05) / (lb + 0.05);
    }

    public Paint WithOpacity(double opacity) => Paint.Solid(this, opacity);

    public static implicit operator Paint(Color c) => Paint.Solid(c);

    public bool Equals(Color other) => R == other.R && G == other.G && B == other.B;
    public override bool Equals(object? obj) => obj is Color c && Equals(c);
    public override int GetHashCode() => (R << 16) | (G << 8) | B;
    public static bool operator ==(Color a, Color b) => a.Equals(b);
    public static bool operator !=(Color a, Color b) => !a.Equals(b);
}
