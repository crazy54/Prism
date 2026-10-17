using System.Globalization;
using System.Text.RegularExpressions;

namespace PrismControl.Core.Render;

public enum LintSeverity { Error, Warning }

public sealed record LintIssue(LintSeverity Severity, string Rule, string Message)
{
    public override string ToString() => $"{Severity.ToString().ToLowerInvariant()} {Rule}: {Message}";
}

public enum SvgCanvas
{
    Any,
    /// <summary>A key image: the viewBox must be square (the app stretches the viewBox to the key).</summary>
    Key,
    /// <summary>A 2:1 dial / touch-strip / Galleon-widget pixmap (200×100).</summary>
    Dial,
}

public sealed class SvgLintException(IReadOnlyList<LintIssue> issues)
    : InvalidOperationException("SVG is not Stream Deck safe:\n  " + string.Join("\n  ", issues))
{
    public IReadOnlyList<LintIssue> Issues { get; } = issues;
}

/// <summary>
/// Checks SVG markup (or a data URL) against the hardware-lab rules for the Stream Deck app's Qt renderer.
/// Errors are things that render wrong on the device (black colors, ignored clips, dropped filters, rejected payloads);
/// warnings are things that are silently ignored. Use it in tests on every frame your action renders.
/// </summary>
public static partial class SvgLint
{
    private sealed record Rule(string Id, LintSeverity Severity, Regex Pattern, string Message);

    private static readonly Rule[] Rules =
    [
        new("color-rgba", LintSeverity.Error, RgbaRe(), "rgba() renders opaque black; use a hex color plus fill-opacity/stroke-opacity/stop-opacity."),
        new("color-hsl", LintSeverity.Error, HslRe(), "hsl()/hsla() renders opaque black; convert to hex at build time."),
        new("color-hex-alpha", LintSeverity.Error, HexAlphaRe(), "#rrggbbaa / #rgba renders opaque black; use 6-digit hex plus an opacity attribute."),
        new("clip-path", LintSeverity.Error, ClipRe(), "clipPath is ignored (full shapes are drawn); use a luminance <mask> with white shapes."),
        new("mask-type-alpha", LintSeverity.Error, MaskAlphaRe(), "mask-type=\"alpha\" is treated as luminance; draw the mask in white."),
        new("foreign-object", LintSeverity.Error, ForeignRe(), "foreignObject is not rendered."),
        new("unsupported-filter", LintSeverity.Error, BadFilterRe(), "feDropShadow, feTurbulence, feMorphology and feComponentTransfer are dropped (the element is drawn unfiltered)."),
        new("mix-blend-mode", LintSeverity.Error, BlendRe(), "mix-blend-mode is ignored; precompute blended colors."),
        new("paint-order", LintSeverity.Error, PaintOrderRe(), "paint-order is ignored; draw the stroked copy first and the fill copy on top."),
        new("css-transform", LintSeverity.Error, CssTransformRe(), "The CSS transform property is ignored; use the transform attribute."),
        new("marker-mid", LintSeverity.Error, MarkerMidRe(), "marker-mid is dropped; draw vertex marks as shapes."),
        new("live-text", LintSeverity.Warning, TextRe(), "<text> falls back to one sans face with RGB fringes; use SvgDocument.Text (stroked paths)."),
        new("letter-spacing", LintSeverity.Warning, LetterSpacingRe(), "letter-spacing is ignored."),
        new("dominant-baseline", LintSeverity.Warning, BaselineRe(), "dominant-baseline is ignored."),
        new("tspan-dy", LintSeverity.Warning, TspanDyRe(), "tspan dy is ignored."),
        new("shape-rendering", LintSeverity.Warning, ShapeRenderingRe(), "shape-rendering / image-rendering are ignored."),
        new("pattern-transform", LintSeverity.Warning, PatternRe(), "patternTransform / pattern href inheritance draws nothing; use userSpaceOnUse patterns or geometry."),
        new("symbol-viewbox", LintSeverity.Warning, SymbolRe(), "<symbol viewBox> is not scaled to the <use> size; use <g> + <use transform>."),
        new("filter-fr", LintSeverity.Warning, FrRe(), "The radial gradient fr attribute is ignored."),
    ];

    public static IReadOnlyList<LintIssue> Check(string svgOrDataUri, SvgCanvas canvas = SvgCanvas.Any, int maxElements = SvgDocument.DefaultMaxElements)
    {
        var issues = new List<LintIssue>();
        string svg;
        if (svgOrDataUri.StartsWith("data:", StringComparison.Ordinal))
        {
            if (!DataUri.TryDecodeSvg(svgOrDataUri, out svg))
            {
                issues.Add(new(LintSeverity.Error, "payload", "Not a decodable data:image/svg+xml URL."));
                return issues;
            }
        }
        else svg = svgOrDataUri; // markup (what you send must still be DataUri.Svg(markup))

        foreach (var r in Rules)
            if (r.Pattern.IsMatch(svg)) issues.Add(new(r.Severity, r.Id, r.Message));

        var svgTags = SvgOpenRe().Matches(svg).Count;
        if (svgTags > 1) issues.Add(new(LintSeverity.Error, "nested-svg", "Nested <svg> is not drawn; flatten to <g transform>."));

        var filterTags = FilterOpenRe().Matches(svg);
        foreach (Match m in filterTags)
        {
            if (!m.Value.Contains("color-interpolation-filters=\"sRGB\"", StringComparison.Ordinal))
            {
                issues.Add(new(LintSeverity.Warning, "filter-srgb", "Add color-interpolation-filters=\"sRGB\" so Chrome previews match the app (it computes filters in sRGB)."));
                break;
            }
        }

        var root = RootRe().Match(svg);
        if (!root.Success)
        {
            issues.Add(new(LintSeverity.Error, "no-root", "No <svg> root element."));
        }
        else
        {
            var tag = root.Value;
            if (PreserveRe().IsMatch(tag))
                issues.Add(new(LintSeverity.Warning, "preserve-aspect-ratio", "preserveAspectRatio is ignored; the viewBox is always stretched to the key."));
            var vb = ViewBoxRe().Match(tag);
            if (!vb.Success)
            {
                issues.Add(new(LintSeverity.Error, "viewbox-missing", "The root needs a viewBox (the app stretches it to the key/pixmap)."));
            }
            else
            {
                var parts = vb.Groups[1].Value.Split([' ', ','], StringSplitOptions.RemoveEmptyEntries);
                if (parts.Length == 4 && double.TryParse(parts[2], NumberStyles.Float, CultureInfo.InvariantCulture, out var vw)
                    && double.TryParse(parts[3], NumberStyles.Float, CultureInfo.InvariantCulture, out var vh) && vw > 0 && vh > 0)
                {
                    var aspect = vw / vh;
                    if (canvas == SvgCanvas.Key && Math.Abs(aspect - 1) > 0.001)
                        issues.Add(new(LintSeverity.Error, "viewbox-aspect", $"Key images need a square viewBox (got {vw}x{vh}); the app stretches it."));
                    if (canvas == SvgCanvas.Dial && Math.Abs(aspect - 2) > 0.001)
                        issues.Add(new(LintSeverity.Error, "viewbox-aspect", $"Dial pixmaps need a 2:1 viewBox such as 200x100 (got {vw}x{vh})."));
                    var w = WidthRe().Match(tag);
                    var h = HeightRe().Match(tag);
                    if (w.Success && h.Success
                        && double.TryParse(w.Groups[1].Value, NumberStyles.Float, CultureInfo.InvariantCulture, out var ww)
                        && double.TryParse(h.Groups[1].Value, NumberStyles.Float, CultureInfo.InvariantCulture, out var hh) && hh > 0
                        && Math.Abs(ww / hh - aspect) > 0.01)
                        issues.Add(new(LintSeverity.Error, "viewbox-aspect", "width/height aspect differs from the viewBox aspect (preserveAspectRatio is ignored, so it would be distorted)."));
                }
                else issues.Add(new(LintSeverity.Error, "viewbox-invalid", "Unparseable viewBox."));
            }
        }

        var count = CountElements(svg);
        if (count > maxElements)
            issues.Add(new(LintSeverity.Error, "element-budget", $"{count} elements > budget {maxElements}; merge shapes into fewer paths."));

        foreach (Match href in HrefRe().Matches(svg))
        {
            if (!href.Groups[1].Value.StartsWith("data:", StringComparison.Ordinal) && !href.Groups[1].Value.StartsWith('#'))
            {
                issues.Add(new(LintSeverity.Error, "external-href", "External image/href references are not allowed; embed a data: URI."));
                break;
            }
        }
        return issues;
    }

    public static void ThrowIfErrors(string svgOrDataUri, SvgCanvas canvas = SvgCanvas.Any, int maxElements = SvgDocument.DefaultMaxElements)
    {
        var errors = Check(svgOrDataUri, canvas, maxElements).Where(i => i.Severity == LintSeverity.Error).ToList();
        if (errors.Count > 0) throw new SvgLintException(errors);
    }

    /// <summary>Counts element start tags (the measure of render cost).</summary>
    public static int CountElements(string svg)
    {
        var n = 0;
        for (var i = 0; i < svg.Length - 1; i++)
        {
            if (svg[i] != '<') continue;
            var c = svg[i + 1];
            if (c is '/' or '!' or '?') continue;
            n++;
        }
        return Math.Max(0, n - 1); // exclude the root <svg>
    }

    [GeneratedRegex(@"rgba\s*\(", RegexOptions.IgnoreCase)] private static partial Regex RgbaRe();
    [GeneratedRegex(@"hsla?\s*\(", RegexOptions.IgnoreCase)] private static partial Regex HslRe();
    [GeneratedRegex(@"(?:fill|stroke|stop-color|flood-color|lighting-color|color)\s*[=:]\s*[""']?\s*#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{4})(?![0-9a-fA-F])", RegexOptions.IgnoreCase)] private static partial Regex HexAlphaRe();
    [GeneratedRegex(@"<clipPath\b|clip-path\s*[=:]", RegexOptions.IgnoreCase)] private static partial Regex ClipRe();
    [GeneratedRegex(@"mask-type\s*[=:]\s*[""']?\s*alpha", RegexOptions.IgnoreCase)] private static partial Regex MaskAlphaRe();
    [GeneratedRegex(@"<foreignObject\b", RegexOptions.IgnoreCase)] private static partial Regex ForeignRe();
    [GeneratedRegex(@"<fe(?:DropShadow|Turbulence|Morphology|ComponentTransfer)\b", RegexOptions.IgnoreCase)] private static partial Regex BadFilterRe();
    [GeneratedRegex(@"mix-blend-mode", RegexOptions.IgnoreCase)] private static partial Regex BlendRe();
    [GeneratedRegex(@"paint-order", RegexOptions.IgnoreCase)] private static partial Regex PaintOrderRe();
    [GeneratedRegex(@"style\s*=\s*""[^""]*\btransform\s*:", RegexOptions.IgnoreCase)] private static partial Regex CssTransformRe();
    [GeneratedRegex(@"marker-mid", RegexOptions.IgnoreCase)] private static partial Regex MarkerMidRe();
    [GeneratedRegex(@"<text\b", RegexOptions.IgnoreCase)] private static partial Regex TextRe();
    [GeneratedRegex(@"letter-spacing", RegexOptions.IgnoreCase)] private static partial Regex LetterSpacingRe();
    [GeneratedRegex(@"dominant-baseline", RegexOptions.IgnoreCase)] private static partial Regex BaselineRe();
    [GeneratedRegex(@"<tspan\b[^>]*\bdy\s*=", RegexOptions.IgnoreCase)] private static partial Regex TspanDyRe();
    [GeneratedRegex(@"(?:shape|image)-rendering", RegexOptions.IgnoreCase)] private static partial Regex ShapeRenderingRe();
    [GeneratedRegex(@"patternTransform|<pattern\b[^>]*\bhref\s*=", RegexOptions.IgnoreCase)] private static partial Regex PatternRe();
    [GeneratedRegex(@"<symbol\b[^>]*\bviewBox", RegexOptions.IgnoreCase)] private static partial Regex SymbolRe();
    [GeneratedRegex(@"<radialGradient\b[^>]*\sfr\s*=", RegexOptions.IgnoreCase)] private static partial Regex FrRe();
    [GeneratedRegex(@"<svg\b", RegexOptions.IgnoreCase)] private static partial Regex SvgOpenRe();
    [GeneratedRegex(@"<filter\b[^>]*>", RegexOptions.IgnoreCase)] private static partial Regex FilterOpenRe();
    [GeneratedRegex(@"<svg\b[^>]*>", RegexOptions.IgnoreCase)] private static partial Regex RootRe();
    [GeneratedRegex(@"\spreserveAspectRatio\s*=", RegexOptions.IgnoreCase)] private static partial Regex PreserveRe();
    [GeneratedRegex(@"\sviewBox\s*=\s*""([^""]*)""", RegexOptions.IgnoreCase)] private static partial Regex ViewBoxRe();
    [GeneratedRegex(@"\swidth\s*=\s*""([0-9.]+)(?:px)?""", RegexOptions.IgnoreCase)] private static partial Regex WidthRe();
    [GeneratedRegex(@"\sheight\s*=\s*""([0-9.]+)(?:px)?""", RegexOptions.IgnoreCase)] private static partial Regex HeightRe();
    [GeneratedRegex(@"\s(?:xlink:)?href\s*=\s*""([^""]*)""", RegexOptions.IgnoreCase)] private static partial Regex HrefRe();
}
