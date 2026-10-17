using PrismControl.Core.Render;

namespace PrismControl.Ai.Art;

/// <summary>
/// Every word the AI faces draw goes through here (one stroked path per run, like SvgDocument.Text). Tests can capture the
/// strings drawn (frames are paths, so they cannot be searched for words): privacy tests prove what never reaches a key.
/// </summary>
public static class AiText
{
    private static readonly object Gate = new();
    private static List<string>? _sink;

    public static void Draw(SvgDocument d, string text, double x, double y, double size, Paint color, TextAlign align = TextAlign.Start,
        FontWeight weight = FontWeight.Semibold, TextBaseline baseline = TextBaseline.Alphabetic, double tracking = 0, TextCase textCase = TextCase.SmallCaps)
    {
        if (string.IsNullOrEmpty(text)) return;
        lock (Gate) _sink?.Add(text);
        d.Text(text, x, y, size, color, align, weight, baseline, tracking, textCase);
    }

    /// <summary>Starts capturing (tests run one at a time). Dispose to stop.</summary>
    public static Capture Record()
    {
        lock (Gate) _sink = [];
        return new Capture();
    }

    public sealed class Capture : IDisposable
    {
        public IReadOnlyList<string> Lines { get { lock (Gate) return _sink is null ? [] : [.. _sink]; } }
        public string All => string.Join(" | ", Lines);
        public void Clear() { lock (Gate) _sink?.Clear(); }
        public bool Has(string s) => Lines.Any(l => l.Contains(s, StringComparison.Ordinal));
        public void Dispose() { lock (Gate) _sink = null; }
    }
}
