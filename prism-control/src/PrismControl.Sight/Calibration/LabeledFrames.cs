using System.Text.Json;
using System.Text.Json.Serialization;

namespace PrismControl.Sight.Calibration;

/// <summary>
/// The labeled-frame format for calibration and regression: a folder holding <c>frame.png</c> + <c>expected.json</c>
/// (what the calibration recorder writes, one folder per moment), or a flat pair <c>name.png</c> + <c>name.expected.json</c>.
/// </summary>
public sealed class ExpectedFrame
{
    public int V { get; set; } = 1;
    public string? Recipe { get; set; }
    public string? Game { get; set; }
    /// <summary>The game's UI scale when the frame was taken (null = the recipe's).</summary>
    public double? HudScale { get; set; }
    /// <summary>The context that must be active (null = don't check; "" = none).</summary>
    public string? Context { get; set; }
    public Dictionary<string, ExpectedReadout> Readouts { get; set; } = new(StringComparer.Ordinal);
    /// <summary>Exact on-screen texts per OCR detector ("bankText": "-30°"), used by harvest-glyphs.</summary>
    public Dictionary<string, string>? Texts { get; set; }
    /// <summary>Controls that must be located (true) or must not be (false).</summary>
    public Dictionary<string, bool>? Controls { get; set; }
    /// <summary>False until a person checked the values (drafts from the recorder are prefilled with what Sight read).</summary>
    public bool Verified { get; set; }
    public CaptureInfo? Capture { get; set; }
    public string? CapturedAt { get; set; }
    public string? Notes { get; set; }
}

public sealed class CaptureInfo
{
    public string? Format { get; set; }
    public double? PaperWhite { get; set; }
    public int? Width { get; set; }
    public int? Height { get; set; }
}

public sealed class ExpectedReadout
{
    /// <summary>A number, true/false, a label/text, or null (= the readout must be unknown/absent).</summary>
    public JsonElement? Value { get; set; }
    /// <summary>Numbers: allowed absolute error. Default 0 (exact after the readout's precision).</summary>
    public double? Tolerance { get; set; }
    /// <summary>What Sight reported when the draft was written (information only).</summary>
    public string? Observed { get; set; }
}

public sealed record LabeledFrame(string Name, string FramePath, string ExpectedPath, ExpectedFrame Expected);

public static class LabeledFrames
{
    public static readonly JsonSerializerOptions Json = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = true,
        ReadCommentHandling = JsonCommentHandling.Skip,
        AllowTrailingCommas = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    /// <summary>Every labeled frame under <paramref name="dir"/> (recursive), sorted by name.</summary>
    public static IReadOnlyList<LabeledFrame> Discover(string dir)
    {
        var list = new List<LabeledFrame>();
        foreach (var exp in Directory.EnumerateFiles(dir, "*.json", SearchOption.AllDirectories))
        {
            var name = Path.GetFileName(exp);
            string? png = null;
            if (name.Equals("expected.json", StringComparison.OrdinalIgnoreCase)) png = Path.Combine(Path.GetDirectoryName(exp)!, "frame.png");
            else if (name.EndsWith(".expected.json", StringComparison.OrdinalIgnoreCase)) png = exp[..^".expected.json".Length] + ".png";
            if (png is null || !File.Exists(png)) continue;
            var e = JsonSerializer.Deserialize<ExpectedFrame>(File.ReadAllText(exp), Json) ?? new ExpectedFrame();
            list.Add(new LabeledFrame(Path.GetRelativePath(dir, png), png, exp, e));
        }
        return list.OrderBy(l => l.Name, StringComparer.Ordinal).ToList();
    }

    public static string Serialize(ExpectedFrame e) => JsonSerializer.Serialize(e, Json);

    public static JsonElement Value(object? v) => JsonSerializer.SerializeToElement(v, Json);
}
