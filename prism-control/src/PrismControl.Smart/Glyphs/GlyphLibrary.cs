using System.Text.Json;
using PrismControl.Core.Render;

namespace PrismControl.Smart.Glyphs;

/// <summary>One primitive of a Prism Deck glyph (48-unit grid, absolute path data).</summary>
public sealed record GlyphPrim(string D, string Role, bool Fill, double Weight, double Opacity, string? Cap, string? Join, double[]? Dash);

public sealed record GlyphDef(string Id, string Title, string Category, IReadOnlyDictionary<string, string> States, string DefaultState,
    IReadOnlyDictionary<string, IReadOnlyList<GlyphPrim>> Frames)
{
    /// <summary>The glyph this id is another name for (prism-deck's alias table: "trash" → delete), or null.</summary>
    public string? Alias { get; init; }
}

/// <summary>The colors a glyph is painted with (Prism Control's grammar: ink at rest, accents and sparks in the hue).</summary>
public readonly record struct GlyphInk(Color Line, Color Accent, Color Dim, Color Spark, double Opacity = 1, double Weight = 1);

/// <summary>
/// Prism Deck's role-based glyph library as data (Glyphs/prism-glyphs.json, exported by export-glyphs.mjs from
/// Prism-ds/prism-deck/src/glyphs), painted with <see cref="SvgDocument"/> in Prism Control's Qt-safe subset: one
/// group with a translate+scale, one path per primitive (≤ ~17 per glyph). Unknown ids fall back to a monogram tile.
/// </summary>
public sealed class GlyphLibrary
{
    public const double Grid = 48;
    private readonly Dictionary<string, GlyphDef> _glyphs;
    private readonly Dictionary<string, (double Width, double Opacity)> _roles;

    private GlyphLibrary(Dictionary<string, GlyphDef> glyphs, Dictionary<string, (double, double)> roles, string source)
    {
        _glyphs = glyphs;
        _roles = roles;
        Source = source;
    }

    public string Source { get; }
    public IReadOnlyCollection<string> Ids => _glyphs.Keys;
    public int Count => _glyphs.Count;

    private static readonly Lazy<GlyphLibrary> Embedded = new(() =>
    {
        using var s = typeof(GlyphLibrary).Assembly.GetManifestResourceStream("smart/prism-glyphs.json")
            ?? throw new InvalidOperationException("smart/prism-glyphs.json is not embedded");
        return Load(s);
    });

    /// <summary>The library embedded in this assembly.</summary>
    public static GlyphLibrary Default => Embedded.Value;

    public static GlyphLibrary Load(Stream json)
    {
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;
        var roles = new Dictionary<string, (double, double)>(StringComparer.Ordinal);
        foreach (var r in root.GetProperty("roles").EnumerateObject())
            roles[r.Name] = (r.Value.TryGetProperty("width", out var w) ? w.GetDouble() : 2.6, r.Value.TryGetProperty("opacity", out var o) ? o.GetDouble() : 1);
        var glyphs = new Dictionary<string, GlyphDef>(StringComparer.Ordinal);
        foreach (var g in root.GetProperty("glyphs").EnumerateObject())
        {
            var states = g.Value.GetProperty("states").EnumerateObject().ToDictionary(p => p.Name, p => p.Value.GetString() ?? "idle", StringComparer.Ordinal);
            var frames = new Dictionary<string, IReadOnlyList<GlyphPrim>>(StringComparer.Ordinal);
            foreach (var f in g.Value.GetProperty("frames").EnumerateObject())
            {
                var prims = new List<GlyphPrim>();
                foreach (var p in f.Value.EnumerateArray())
                {
                    prims.Add(new GlyphPrim(
                        p.GetProperty("d").GetString() ?? "",
                        p.GetProperty("role").GetString() ?? "line",
                        p.TryGetProperty("fill", out var fl) && fl.GetBoolean(),
                        p.TryGetProperty("w", out var w) ? w.GetDouble() : 1,
                        p.TryGetProperty("o", out var o) ? o.GetDouble() : 1,
                        p.TryGetProperty("cap", out var c) ? c.GetString() : null,
                        p.TryGetProperty("join", out var j) ? j.GetString() : null,
                        p.TryGetProperty("dash", out var da) ? [.. da.EnumerateArray().Select(x => x.GetDouble())] : null));
                }
                frames[f.Name] = prims;
            }
            glyphs[g.Name] = new GlyphDef(g.Name, g.Value.GetProperty("title").GetString() ?? g.Name, g.Value.GetProperty("category").GetString() ?? "",
                states, g.Value.GetProperty("defaultState").GetString() ?? states.Keys.First(), frames)
            { Alias = g.Value.TryGetProperty("alias", out var al) ? al.GetString() : null };
        }
        return new GlyphLibrary(glyphs, roles, root.TryGetProperty("source", out var src) ? src.GetString() ?? "" : "");
    }

    public bool Has(string? id) => id is not null && _glyphs.ContainsKey(id);

    public GlyphDef? Get(string id) => _glyphs.GetValueOrDefault(id);

    /// <summary>The state to draw for an on/off value (the glyph's own vocabulary: "on", "playing", "live", …).</summary>
    public string StateFor(GlyphDef g, bool? on)
    {
        if (on is null) return g.DefaultState;
        // An alias that names a state of its glyph ("pause" = play-pause showing its pause bars, "eye-off" = the eye
        // hidden) always draws that state: the name is the picture. A toggle shows on/off through its lit key instead.
        if (g.Alias is { } target && _glyphs.TryGetValue(target, out var t) && t.DefaultState != g.DefaultState) return g.DefaultState;
        foreach (var (name, tone) in g.States)
            if (on.Value ? tone is "active" or "ok" : tone is "idle" or "off" or "neg") return name;
        return g.DefaultState;
    }

    /// <summary>Draws glyph <paramref name="id"/> with its 48-grid top-left at (x, y), <paramref name="size"/> units wide. False when unknown.</summary>
    public bool Draw(SvgDocument d, string id, string? state, double x, double y, double size, GlyphInk ink)
    {
        if (!_glyphs.TryGetValue(id, out var g)) return false;
        var frame = state is not null && g.Frames.TryGetValue(state, out var f) ? f : g.Frames[g.DefaultState];
        var group = new Style { Transform = Transform.Translate(x, y).Scale2(size / Grid), Opacity = ink.Opacity < 0.999 ? ink.Opacity : null };
        using (d.Group(group))
        {
            foreach (var p in frame)
            {
                var color = p.Role switch { "accent" => ink.Accent, "dim" => ink.Dim, "spark" => ink.Spark, _ => ink.Line };
                var (width, roleOpacity) = _roles.GetValueOrDefault(p.Role, (2.6, 1));
                var opacity = p.Opacity * roleOpacity;
                if (p.Fill)
                {
                    d.Path(p.D, new Style { Fill = Paint.Solid(color, opacity), Stroke = Paint.None });
                }
                else
                {
                    d.Path(p.D, new Style
                    {
                        Fill = Paint.None,
                        Stroke = Paint.Solid(color, opacity),
                        StrokeWidth = width * p.Weight * (ink.Weight > 0 ? ink.Weight : 1),
                        LineCap = p.Cap switch { "butt" => LineCap.Butt, "square" => LineCap.Square, _ => LineCap.Round },
                        LineJoin = p.Join switch { "miter" => LineJoin.Miter, "bevel" => LineJoin.Bevel, _ => LineJoin.Round },
                        Dash = p.Dash,
                    });
                }
            }
        }
        return true;
    }

    /// <summary>
    /// The fallback for glyph names the library doesn't have: a rounded tile with 1–3 letters (the verb's monogram, or the
    /// initials of its label), drawn in the same weights as the glyphs.
    /// </summary>
    public static void DrawMonogram(SvgDocument d, string text, double x, double y, double size, GlyphInk ink)
    {
        var s = size / Grid;
        var inset = 7 * s;
        var r = 9 * s;
        d.Rect(x + inset, y + inset, size - inset * 2, size - inset * 2, new Style { Fill = Paint.Solid(ink.Accent, 0.12 * ink.Opacity), Stroke = Paint.Solid(ink.Line, 0.8 * ink.Opacity), StrokeWidth = 2.4 * s * (ink.Weight > 0 ? ink.Weight : 1) }, rx: r);
        var letters = text.Length > 3 ? text[..3] : text;
        var box = size - inset * 2 - 10 * s;
        var fs = StrokeFont.FitSize(letters, box, 22 * s * 1.3, 8, FontWeight.Bold, textCase: TextCase.Upper);
        d.Text(letters, x + size / 2, y + size / 2, fs, ink.Line, TextAlign.Middle, FontWeight.Bold, TextBaseline.Middle, textCase: TextCase.Upper, opacity: ink.Opacity < 0.999 ? ink.Opacity : null);
    }

    /// <summary>A monogram for a label: the given one, else initials (<c>CHAIN LIFT</c> → <c>CL</c>), else the first letters.</summary>
    public static string MonogramFor(string? monogram, string label)
    {
        if (!string.IsNullOrWhiteSpace(monogram)) return monogram.Trim();
        var words = label.Split([' ', '-', '/', '+'], StringSplitOptions.RemoveEmptyEntries);
        if (words.Length >= 2) return string.Concat(words.Take(3).Select(w => char.ToUpperInvariant(w[0])));
        var w0 = words.Length == 1 ? words[0] : label;
        return w0.Length <= 2 ? w0.ToUpperInvariant() : w0[..2].ToUpperInvariant();
    }
}
