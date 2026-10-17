using System.Globalization;
using System.Text.RegularExpressions;
using System.Xml;
using PrismControl.Desktop;
using PrismControl.Smart.Context;
using PrismControl.Smart.Packs;
using PrismControl.Smart.Rebinds;

namespace PrismControl.Smart.Execution;

/// <summary>One labeled part of a multi-value readout ("E" 7.2).</summary>
public sealed record ReadoutCell(string Label, string Value);

/// <summary>A readout value ready to draw: the value, its text, and how much to trust it.</summary>
public sealed record ReadoutView(PackReadout Readout, ReadoutValue Value, string Text, double? Fraction)
{
    public bool IsKnown => Value.Confidence != ReadoutConfidence.Unknown;
    /// <summary>Gauges for signed values grow from zero.</summary>
    public bool Centered { get; init; }
    /// <summary>Where zero sits on the range (0..1) when <see cref="Centered"/>.</summary>
    public double ZeroFraction { get; init; } = 0.5;
    /// <summary>Multi-value readouts (E / F / N) as cells, or null.</summary>
    public IReadOnlyList<ReadoutCell>? Cells { get; init; }
}

/// <summary>
/// Reads pack readouts from their sources (Sight, modules via the verb registry, our counted steps, the window title,
/// a config file) and formats them. Values older than a few refresh periods become <c>stale</c>; nothing is invented.
/// </summary>
public sealed partial class ReadoutResolver
{
    private readonly ISmartSight _sight;
    private readonly IFieldSource _fields;
    private readonly CountedSteps _counted;
    private readonly TimeProvider _time;
    private readonly FileFieldReader _files;

    public ReadoutResolver(ISmartSight sight, IFieldSource fields, CountedSteps counted, TimeProvider time, FileFieldReader? files = null)
    {
        _sight = sight;
        _fields = fields;
        _counted = counted;
        _time = time;
        _files = files ?? new FileFieldReader(new RebindPaths());
    }

    public ReadoutView Read(ContextPack pack, PackReadout r, ForegroundApp? app)
    {
        var v = Age(Raw(pack, r, app), r);
        var (fraction, centered, zero) = Fraction(r, v);
        return new ReadoutView(r, v, Format(r, v), fraction) { Centered = centered, ZeroFraction = zero, Cells = Cells(r, v) };
    }

    private ReadoutValue Raw(ContextPack pack, PackReadout r, ForegroundApp? app)
    {
        var s = r.Source;
        switch (s.Kind)
        {
            case ReadoutSourceKind.Sight when s.Region is { } region:
            {
                var snap = _sight.Current;
                var v = SightReader.Value(snap, region);
                // Multi-value readouts ("E {excitement} · F {fear} · N {nausea}") read sub-readouts region.name.
                var names = Placeholders(r.Format).Where(n => n != "value").ToList();
                if (names.Count > 0)
                {
                    var fields = new Dictionary<string, string>(StringComparer.Ordinal);
                    var worst = ReadoutConfidence.Observed;
                    var at = DateTimeOffset.MinValue;
                    foreach (var n in names)
                    {
                        var sub = SightReader.Value(snap, region + "." + n);
                        if (sub.Confidence == ReadoutConfidence.Unknown) continue;
                        fields[n] = NumText(sub);
                        if (sub.Confidence > worst) worst = sub.Confidence;
                        if (sub.At > at) at = sub.At;
                    }
                    if (fields.Count > 0) return new ReadoutValue { Fields = fields, Confidence = worst, At = at };
                }
                return v;
            }
            case ReadoutSourceKind.Counted when s.Control is { } controlId:
            {
                var ctl = pack.FindControl(controlId);
                // Sight-stepped controls: Sight's own ledger of the steps it sent.
                var sightCtl = ctl?.Turn.Right is SightAdjustBinding sa ? sa.Sight : null;
                if (sightCtl is not null && _sight.Current.Controls.TryGetValue(sightCtl, out var cs))
                    return new ReadoutValue { Number = cs.CountedSteps, Confidence = ReadoutConfidence.Inferred, At = cs.At ?? _time.GetUtcNow() };
                return new ReadoutValue { Number = _counted.Get(pack.Id, controlId), Confidence = ReadoutConfidence.Inferred, At = _time.GetUtcNow() };
            }
            case ReadoutSourceKind.Window:
                return app is null ? ReadoutValue.Unknown : WindowTitle.Parse(app.Title, pack, r.Widget == "badge", _time.GetUtcNow());
            case ReadoutSourceKind.Module or ReadoutSourceKind.Extension or ReadoutSourceKind.GameLink:
            {
                var field = s.Field ?? s.Topic;
                if (field is null) return ReadoutValue.Unknown;
                field = s.Kind switch
                {
                    ReadoutSourceKind.Extension => FieldNames.Extension(field),
                    ReadoutSourceKind.GameLink => FieldNames.GameLink(field),
                    _ => field,
                };
                return _fields.TryRead(field, out var v) ? v : ReadoutValue.Unknown;
            }
            case ReadoutSourceKind.File when s.Field is { } spec:
                return _files.Read(pack, spec, _time.GetUtcNow());
            default:
                return ReadoutValue.Unknown;
        }
    }

    private ReadoutValue Age(ReadoutValue v, PackReadout r)
    {
        if (v.Confidence is not (ReadoutConfidence.Observed or ReadoutConfidence.Inferred) || v.At == default) return v;
        if (r.Source.Kind is ReadoutSourceKind.Counted or ReadoutSourceKind.File or ReadoutSourceKind.Window) return v;
        var period = r.RefreshHz is > 0 ? TimeSpan.FromSeconds(1 / r.RefreshHz.Value) : TimeSpan.FromSeconds(1);
        var maxAge = TimeSpan.FromTicks(Math.Max(TimeSpan.FromSeconds(3).Ticks, period.Ticks * 4));
        return _time.GetUtcNow() - v.At > maxAge ? v with { Confidence = ReadoutConfidence.Stale } : v;
    }

    /// <summary>Formats with the pack's format string: <c>{value}</c>, <c>{value:+d}</c>, <c>{name}</c> for multi-value readouts.</summary>
    public static string Format(PackReadout r, ReadoutValue v)
    {
        if (v.Confidence == ReadoutConfidence.Unknown) return "—";
        var valueText = v.Number is { } n ? Num(n) : v.State is { } b ? (r.Widget == "badge" ? (b ? "●" : "○") : b ? "ON" : "OFF") : v.Text ?? "—";
        if (string.IsNullOrEmpty(r.Format))
        {
            if (v.Number is null) return valueText;
            var unit = r.Unit is { Length: > 0 } u ? (u is "deg" or "°" ? "°" : u is "$" ? "" : u is "%" ? "%" : " " + u) : "";
            return (r.Unit == "$" ? "$" : "") + valueText + unit;
        }
        return PlaceholderRx().Replace(r.Format, m =>
        {
            var name = m.Groups[1].Value;
            var spec = m.Groups[2].Success ? m.Groups[2].Value : null;
            if (name == "value")
            {
                if (v.Number is { } num && spec == "+d") return ((int)Math.Round(num)).ToString("+0;−0;0", CultureInfo.InvariantCulture);
                return valueText;
            }
            return v.Fields is not null && v.Fields.TryGetValue(name, out var f) ? f : "—";
        });
    }

    /// <summary>"E {excitement} · F {fear} · N {nausea}" → cells E/F/N with the values (null for single-value readouts).</summary>
    private static IReadOnlyList<ReadoutCell>? Cells(PackReadout r, ReadoutValue v)
    {
        if (string.IsNullOrEmpty(r.Format) || v.Fields is null) return null;
        var parts = r.Format.Split('·', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);
        var cells = new List<ReadoutCell>();
        foreach (var part in parts)
        {
            var m = PlaceholderRx().Match(part);
            if (!m.Success) continue;
            var name = m.Groups[1].Value;
            var label = part[..m.Index].Trim();
            if (label.Length == 0) label = part[(m.Index + m.Length)..].Trim();
            if (label.Length == 0) label = name;
            cells.Add(new ReadoutCell(label, v.Fields.TryGetValue(name, out var val) ? val : "—"));
        }
        return cells.Count >= 2 ? cells : null;
    }

    private static (double?, bool, double) Fraction(PackReadout r, ReadoutValue v)
    {
        if (v.Number is not { } n) return (null, false, 0.5);
        double lo, hi;
        if (r.RangeMin is { } a && r.RangeMax is { } b && b > a) (lo, hi) = (a, b);
        else if (r.Unit is "deg" or "°") (lo, hi) = (-90, 90);
        else if (r.Unit is "%" || n is >= 0 and <= 100 && r.Widget is "gauge" or "bar" or "meter") (lo, hi) = (0, 100);
        else return (null, false, 0.5);
        return (Math.Clamp((n - lo) / (hi - lo), 0, 1), lo < 0 && hi > 0, (0 - lo) / (hi - lo));
    }

    private static string NumText(ReadoutValue v) => v.Number is { } n ? Num(n) : v.Text ?? (v.State is { } b ? (b ? "ON" : "OFF") : "—");

    /// <summary>Whole numbers without decimals, one decimal below 100, thousands grouped from 10,000, a real minus sign.</summary>
    public static string Num(double n)
    {
        var s = Math.Abs(n) >= 10_000 ? Math.Round(n).ToString("#,0", CultureInfo.InvariantCulture)
            : Math.Abs(n - Math.Round(n)) < 0.05 ? Math.Round(n).ToString("0", CultureInfo.InvariantCulture)
            : Math.Abs(n) >= 100 ? n.ToString("0", CultureInfo.InvariantCulture) : n.ToString("0.0", CultureInfo.InvariantCulture);
        return s.StartsWith('-') ? "−" + s[1..] : s;
    }

    private static IEnumerable<string> Placeholders(string? format) =>
        format is null ? [] : PlaceholderRx().Matches(format).Select(m => m.Groups[1].Value).Distinct();

    [GeneratedRegex(@"\{([a-zA-Z][a-zA-Z0-9]*)(?::([^}]+))?\}")]
    private static partial Regex PlaceholderRx();

    /// <summary>Toggle state from a readout: true on, false off, null unknown.</summary>
    public static bool? StateOf(ReadoutValue v)
    {
        if (v.Confidence == ReadoutConfidence.Unknown) return null;
        if (v.State is { } b) return b;
        if (v.Number is { } n) return n != 0;
        return v.Text?.Trim().ToLowerInvariant() switch
        {
            "on" or "true" or "yes" or "enabled" or "active" or "world" => true,
            "off" or "false" or "no" or "disabled" or "inactive" or "relative" => false,
            _ => null,
        };
    }
}

/// <summary>
/// Window titles as readouts: the "●" dirty mark (VS Code), trailing app names (" - Visual Studio Code",
/// " - Google Docs - Google Chrome") dropped, and the " - " segments as fields (<c>activeEditorShort</c>, <c>rootName</c>,
/// <c>appName</c>) for pack formats.
/// </summary>
public static class WindowTitle
{
    private static readonly string[] AppSuffixes = ["Visual Studio Code", "Google Chrome", "Microsoft Edge", "Edge", "Mozilla Firefox", "Google Docs", "File Explorer", "Notepad", "Discord"];

    public static ReadoutValue Parse(string title, ContextPack pack, bool badge, DateTimeOffset at)
    {
        var dirty = title.StartsWith('●');
        var clean = title.TrimStart('●', ' ').Trim();
        var segs = clean.Split(" - ").Select(s => s.Trim()).Where(s => s.Length > 0).ToList();
        var app = "";
        while (segs.Count > 1 && (AppSuffixes.Any(a => segs[^1].EndsWith(a, StringComparison.OrdinalIgnoreCase)) || segs[^1].Equals(pack.Name, StringComparison.OrdinalIgnoreCase)))
        {
            app = segs[^1];
            segs.RemoveAt(segs.Count - 1);
        }
        var text = segs.Count == 0 ? clean : string.Join(" - ", segs);
        var fields = new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["activeEditorShort"] = segs.Count > 0 ? segs[0] : clean,
            ["rootName"] = segs.Count > 1 ? segs[1] : "",
            ["appName"] = app,
        };
        return new ReadoutValue { Text = text, State = badge ? dirty : null, Fields = fields, Confidence = ReadoutConfidence.Observed, At = at };
    }
}

/// <summary>
/// <c>file</c> readouts: <c>"Game_remote.config.xml TrackEditFalloffModifier"</c> = the text of the first element of
/// that name in that file, next to the pack's rebind file. Read-only, cached by write time. Inferred (the app may only
/// write it on save).
/// </summary>
public sealed class FileFieldReader(RebindPaths paths)
{
    private readonly Dictionary<string, (DateTime Mtime, XmlDocument? Doc)> _cache = new(StringComparer.OrdinalIgnoreCase);
    private readonly object _gate = new();

    public ReadoutValue Read(ContextPack pack, string spec, DateTimeOffset now)
    {
        // A pack whose user files also hold secrets (Discord's login token) is never read, whatever its readouts say (E8).
        if (pack.UserBindings.NeverRead) return ReadoutValue.Unknown;
        var parts = spec.Split(' ', 2, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (parts.Length != 2) return ReadoutValue.Unknown;
        var fileName = parts[0];
        // A bare file name next to the pack's own rebind file: no folders, no "..", no rooted or drive paths (E8).
        if (!IsBareFileName(fileName)) return ReadoutValue.Unknown;
        var element = parts[1].Split('+')[0].Trim();
        foreach (var loc in pack.UserBindings.Locations)
        {
            var dir = Path.GetDirectoryName(loc.Path);
            if (dir is null) continue;
            foreach (var f in paths.Resolve(Path.Combine(dir, fileName)))
            {
                var doc = Load(f);
                var node = doc?.GetElementsByTagName(element).OfType<XmlElement>().FirstOrDefault();
                if (node is null) continue;
                var text = node.HasAttribute("value") ? node.GetAttribute("value") : node.InnerText.Trim();
                return new ReadoutValue { Text = text, Confidence = ReadoutConfidence.Inferred, At = now };
            }
        }
        return ReadoutValue.Unknown;
    }

    /// <summary>"Game_remote.config.xml" yes; "..\x.xml", "C:\x.xml", "sub\x.xml", "x.xml:stream" no.</summary>
    public static bool IsBareFileName(string name) =>
        name.Length is > 0 and <= 128 && name is not ("." or "..") && !name.Contains("..", StringComparison.Ordinal)
        && name.IndexOfAny(['\\', '/', ':']) < 0 && name.IndexOfAny(Path.GetInvalidFileNameChars()) < 0 && !Path.IsPathRooted(name);

    private XmlDocument? Load(string file)
    {
        DateTime mtime;
        try { mtime = File.GetLastWriteTimeUtc(file); }
        catch { return null; }
        lock (_gate)
        {
            if (_cache.TryGetValue(file, out var c) && c.Mtime == mtime) return c.Doc;
            XmlDocument? doc = null;
            try
            {
                if (new FileInfo(file).Length <= 2 * 1024 * 1024)
                {
                    using var fs = new FileStream(file, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
                    using var reader = XmlReader.Create(fs, new XmlReaderSettings { DtdProcessing = DtdProcessing.Prohibit, XmlResolver = null });
                    doc = new XmlDocument { XmlResolver = null };
                    doc.Load(reader);
                }
            }
            catch { doc = null; }
            _cache[file] = (mtime, doc);
            return doc;
        }
    }
}
