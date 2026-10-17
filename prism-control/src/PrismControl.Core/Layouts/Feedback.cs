using System.Globalization;
using System.Text.Json.Nodes;
using PrismControl.Core.Render;

namespace PrismControl.Core.Layouts;

/// <summary>
/// Builds a setFeedback payload: an object keyed by layout item key. Send only what changed (the scheduler also
/// drops keys whose value equals what was last sent). Implicit values: string for text/pixmap, number for bar/gbar.
/// Explicit values are objects with any item property except key/type/rect.
/// </summary>
public sealed class Feedback
{
    private readonly JsonObject _payload = new();

    public bool IsEmpty => _payload.Count == 0;

    /// <summary>A text item's value (implicit form).</summary>
    public Feedback Text(string key, string value)
    {
        _payload[key] = value;
        return this;
    }

    /// <summary>A text item with styling (explicit form). Colors are validated hex.</summary>
    public Feedback Text(string key, string value, Color? color = null, double? opacity = null, int? fontSize = null, int? fontWeight = null, bool? enabled = null)
    {
        var o = new JsonObject { ["value"] = value };
        if (color is { } c) o["color"] = c.Hex;
        if (opacity is { } op) o["opacity"] = LayoutOpacity(op);
        if (fontSize is not null || fontWeight is not null)
        {
            var f = new JsonObject();
            if (fontSize is { } fs) f["size"] = fs;
            if (fontWeight is { } fw) f["weight"] = Math.Clamp(fw, 100, 1000);
            o["font"] = f;
        }
        if (enabled is { } en) o["enabled"] = en;
        _payload[key] = o;
        return this;
    }

    /// <summary>A bar/gbar value (implicit form).</summary>
    public Feedback Bar(string key, double value)
    {
        _payload[key] = Math.Round(value, 2);
        return this;
    }

    /// <summary>A bar with colors. <paramref name="fill"/> may be a gradient built with <see cref="Gradient"/>.</summary>
    public Feedback Bar(string key, double value, string? fill = null, Color? background = null, (double Min, double Max)? range = null, bool? enabled = null)
    {
        var o = new JsonObject { ["value"] = Math.Round(value, 2) };
        if (fill is not null) o["bar_fill_c"] = ValidateColorString(fill);
        if (background is { } bg) o["bar_bg_c"] = bg.Hex;
        if (range is { } r) o["range"] = new JsonObject { ["min"] = r.Min, ["max"] = r.Max };
        if (enabled is { } en) o["enabled"] = en;
        _payload[key] = o;
        return this;
    }

    /// <summary>A pixmap item from an SVG frame (encoded as a data URL).</summary>
    public Feedback Pixmap(string key, SvgDocument svg)
    {
        _payload[key] = svg.ToDataUri();
        return this;
    }

    /// <summary>A pixmap item from a data URL or plugin-relative path. Raw SVG markup is converted to a data URL.</summary>
    public Feedback Pixmap(string key, string value)
    {
        _payload[key] = value.TrimStart().StartsWith('<') ? DataUri.Svg(value) : value;
        return this;
    }

    public Feedback Show(string key, bool visible = true)
    {
        _payload[key] = new JsonObject { ["enabled"] = visible };
        return this;
    }

    public Feedback Hide(string key) => Show(key, false);

    /// <summary>Sets an arbitrary explicit item object (escape hatch).</summary>
    public Feedback Item(string key, JsonObject item)
    {
        if (item.ContainsKey("key") || item.ContainsKey("type") || item.ContainsKey("rect"))
            throw new ArgumentException("key, type and rect cannot change at runtime.", nameof(item));
        _payload[key] = item;
        return this;
    }

    public JsonObject ToJson() => (JsonObject)_payload.DeepClone();

    /// <summary>A layout gradient string, e.g. "0:#b8a2f2,1:#7fc4fb" (hex only).</summary>
    public static string Gradient(params (double Offset, Color Color)[] stops) =>
        string.Join(',', stops.Select(s => s.Offset.ToString("0.###", CultureInfo.InvariantCulture) + ":" + s.Color.Hex));

    /// <summary>Layout opacity must be one of 0, 0.1 … 0.9, 1.</summary>
    public static double LayoutOpacity(double opacity) => Math.Round(Math.Clamp(opacity, 0, 1), 1);

    private static string ValidateColorString(string value)
    {
        if (value.Contains("rgba", StringComparison.OrdinalIgnoreCase) || value.Contains("hsl", StringComparison.OrdinalIgnoreCase))
            throw new FormatException("Layout colors must be hex (#rrggbb) or gradient strings of hex stops.");
        return value;
    }
}

/// <summary>
/// The shared dial layouts shipped in layouts/ (200×100, validated against plugin-layout.schema.json by the tests).
/// Item keys avoid "title" and "icon", which the app lets the user override.
/// </summary>
public static class Layouts
{
    /// <summary>One full-canvas pixmap: draw the whole 200×100 frame yourself with <see cref="SvgDocument.Dial"/> (best Refraction fidelity).</summary>
    public static class Canvas
    {
        public const string Path = "layouts/prism-canvas.json";
        public const string Frame = "canvas";
    }

    /// <summary>Background pixmap + label + value text + bar (native text: the app's fallback sans).</summary>
    public static class Value
    {
        public const string Path = "layouts/prism-value.json";
        public const string Background = "bg";
        public const string Label = "label";
        public const string ValueText = "value";
        public const string Bar = "bar";
    }

    /// <summary>Now playing: background + square art (left) + two text lines + progress bar.</summary>
    public static class Media
    {
        public const string Path = "layouts/prism-media.json";
        public const string Background = "bg";
        public const string Art = "art";
        public const string Line1 = "line1";
        public const string Line2 = "line2";
        public const string Progress = "progress";
    }

    /// <summary>Background + label + two bars (e.g. L/R levels, CPU/GPU).</summary>
    public static class Dual
    {
        public const string Path = "layouts/prism-dual.json";
        public const string Background = "bg";
        public const string Label = "label";
        public const string BarA = "bar_a";
        public const string BarB = "bar_b";
    }

    /// <summary>Elgato's built-in layouts.</summary>
    public static class BuiltIn
    {
        public const string Icon = "$X1";
        public const string Canvas = "$A0";
        public const string Value = "$A1";
        public const string Indicator = "$B1";
        public const string GradientIndicator = "$B2";
        public const string DoubleIndicator = "$C1";
    }

    public static readonly IReadOnlyList<string> Shipped = [Canvas.Path, Value.Path, Media.Path, Dual.Path];
}
