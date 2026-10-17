using System.Collections.Concurrent;
using System.Globalization;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using PrismControl.Desktop;
using PrismControl.Smart.Packs;

namespace PrismControl.Smart.Context;

/// <summary>Everything detectors and match rules look at, captured once per evaluation.</summary>
public sealed record ContextInputs(ForegroundApp? App, PrismControl.Desktop.Sight.SightSnapshot Sight, IFieldSource Fields);

/// <summary>Which pack matched the app, by which rule.</summary>
public sealed record PackHit(ContextPack Pack, int RuleIndex, MatchRule Rule, string Reason);

internal static class Regexes
{
    private static readonly ConcurrentDictionary<(string, string), Regex?> Cache = new();

    /// <summary>ECMAScript-style flags from the pack (<c>i</c>, <c>m</c>, <c>s</c>; <c>u</c> is implied in .NET).</summary>
    public static bool IsMatch(string pattern, string? input, string? flags = null)
    {
        if (input is null) return false;
        var rx = Cache.GetOrAdd((pattern, flags ?? ""), k =>
        {
            var opts = RegexOptions.CultureInvariant;
            if (k.Item2.Contains('i')) opts |= RegexOptions.IgnoreCase;
            if (k.Item2.Contains('m')) opts |= RegexOptions.Multiline;
            if (k.Item2.Contains('s')) opts |= RegexOptions.Singleline;
            try { return new Regex(k.Item1, opts, TimeSpan.FromMilliseconds(25)); }
            catch (ArgumentException) { return null; }
        });
        if (rx is null) return false;
        try { return rx.IsMatch(input); }
        catch (RegexMatchTimeoutException) { return false; }
    }
}

/// <summary>Pack match rules (OR of rules, AND inside one; <c>exclude</c> vetoes). Pure.</summary>
public static class PackMatcher
{
    public static bool RuleMatches(MatchRule r, ContextInputs inputs)
    {
        var app = inputs.App;
        if (app is null) return false;
        if (r.Process is { } p && !string.Equals(p, app.ProcessName, StringComparison.OrdinalIgnoreCase)) return false;
        if (r.ProcessPathRegex is { } ppr && !Regexes.IsMatch(ppr, app.ExePath, "i")) return false;   // Windows paths: case-insensitive
        if (r.Aumid is { } a && !string.Equals(a, app.Aumid, StringComparison.OrdinalIgnoreCase)) return false;
        if (r.WindowClass is { } wc && !string.Equals(wc, app.WindowClass, StringComparison.Ordinal)) return false;
        if (r.TitleRegex is { } tr && !Regexes.IsMatch(tr, app.Title, r.TitleFlags)) return false;
        if (r.Site is { } site)
        {
            var host = inputs.Fields.TryRead(FieldNames.SiteHost, out var hv) && hv.Confidence != ReadoutConfidence.Unknown ? hv.Text : null;
            if (host is null) return false;
            if (site.Host is { } h && !string.Equals(h, host, StringComparison.OrdinalIgnoreCase)) return false;
            if (site.HostSuffix is { } hs && !(host.Equals(hs.TrimStart('.'), StringComparison.OrdinalIgnoreCase) || host.EndsWith(hs.StartsWith('.') ? hs : "." + hs, StringComparison.OrdinalIgnoreCase))) return false;
            if (site.PathRegex is { } pr)
            {
                var path = inputs.Fields.TryRead(FieldNames.SitePath, out var pv) ? pv.Text : null;
                if (!Regexes.IsMatch(pr, path)) return false;
            }
        }
        // steamAppId can't be observed from a window; it documents the rule and never vetoes it.
        return true;
    }

    /// <summary>The best pack for the app: site packs over others, then the most specific rule, then the pack id (deterministic).</summary>
    public static PackHit? Best(IReadOnlyList<ContextPack> packs, ContextInputs inputs)
    {
        if (inputs.App is null) return null;
        PackHit? best = null;
        var bestScore = int.MinValue;
        foreach (var pack in packs)
        {
            if (pack.Activation == "always") continue;   // module-only packs never own the foreground
            if (pack.Match.Exclude.Any(r => RuleMatches(r, inputs))) continue;
            for (var i = 0; i < pack.Match.Any.Count; i++)
            {
                var rule = pack.Match.Any[i];
                if (!RuleMatches(rule, inputs)) continue;
                // Site/overlay packs beat their browser; base (underlay) packs lose to any app pack.
                var score = (pack.Kind == PackKind.Site || pack.Layer == PackLayer.Overlay ? 1000 : 0) - (pack.Layer == PackLayer.Base ? 500 : 0) + rule.Specificity * 10;
                if (score > bestScore || (score == bestScore && best is not null && string.CompareOrdinal(pack.Id, best.Pack.Id) < 0))
                {
                    bestScore = score;
                    best = new PackHit(pack, i, rule, Describe(rule, inputs.App));
                }
                break;
            }
        }
        return best;
    }

    private static string Describe(MatchRule r, ForegroundApp app)
    {
        var parts = new List<string>();
        if (r.Process is not null) parts.Add("process " + app.ProcessName);
        if (r.Aumid is not null) parts.Add("AUMID");
        if (r.WindowClass is not null) parts.Add("window class " + r.WindowClass);
        if (r.TitleRegex is not null) parts.Add("window title");
        if (r.ProcessPathRegex is not null) parts.Add("exe path");
        if (r.Site is not null) parts.Add("site " + (r.Site.Host ?? r.Site.HostSuffix ?? "path"));
        return string.Join(" + ", parts);
    }
}

/// <summary>Sub-context detectors. Pure: the same inputs always give the same answer.</summary>
public static class DetectorEvaluator
{
    /// <summary>Whether a group holds, and (when it does) a short reason naming the detector that decided it.</summary>
    public static bool Holds(DetectGroup g, ContextInputs inputs, out string reason)
    {
        reason = "";
        if (g.All)
        {
            var reasons = new List<string>();
            foreach (var d in g.Detectors)
            {
                if (!Holds(d, inputs, out var r)) return false;
                reasons.Add(r);
            }
            reason = string.Join(" and ", reasons);
            return true;
        }
        foreach (var d in g.Detectors)
        {
            if (Holds(d, inputs, out var r)) { reason = r; return true; }
        }
        return false;
    }

    public static bool Holds(Detector d, ContextInputs inputs, out string reason)
    {
        var (raw, why) = Raw(d, inputs);
        var ok = d.Negate ? !raw : raw;
        reason = d.Negate ? "not " + why : why;
        return ok;
    }

    private static (bool, string) Raw(Detector d, ContextInputs i)
    {
        switch (d.Type)
        {
            case DetectorType.Always:
                return (true, "always");
            case DetectorType.WindowTitle:
                return (d.Regex is { } rx && Regexes.IsMatch(rx, i.App?.Title, d.Flags), "window title");
            case DetectorType.WindowClass:
            {
                var cls = i.App?.WindowClass;
                var ok = d.Regex is { } crx ? Regexes.IsMatch(crx, cls, d.Flags)
                    : d.EqualsValue is JsonValue cv && cv.TryGetValue<string>(out var cs) ? string.Equals(cs, cls, StringComparison.Ordinal) : cls is not null;
                return (ok, "window class " + cls);
            }
            case DetectorType.Process:
            {
                var name = i.App?.ProcessName;
                var ok = d.Regex is { } prx ? Regexes.IsMatch(prx, name, d.Flags ?? "i")
                    : d.EqualsValue is JsonValue ev && ev.TryGetValue<string>(out var s) ? string.Equals(s, name, StringComparison.OrdinalIgnoreCase)
                    : name is not null;
                return (ok, "process " + name);
            }
            case DetectorType.Sight:
            {
                if (d.Region is not { } region) return (false, "sight");
                if (d.State == SightState.Value)
                {
                    var v = SightReader.Value(i.Sight, region);
                    return (Compare(d, v), $"sight {region} value");
                }
                var present = SightReader.Presence(i.Sight, region);
                return d.State == SightState.Hidden ? (present == false, $"sight {region} hidden") : (present == true, $"sight {region} visible");
            }
            case DetectorType.Extension:
                return Field(d, i, d.Field is null ? null : FieldNames.Extension(d.Field));
            case DetectorType.GameLink:
                return Field(d, i, d.Field is null ? null : FieldNames.GameLink(d.Field));
            case DetectorType.Module:
                return Field(d, i, d.Field);
            case DetectorType.FocusedControl:
                return Field(d, i, d.Field is null ? null : FieldNames.FocusedControl(d.Field));
            default:
                return (false, d.Type.ToString());
        }
    }

    private static (bool, string) Field(Detector d, ContextInputs i, string? field)
    {
        if (field is null) return (false, "field");
        var known = (BuiltIn(field, i.App, out var v) || i.Fields.TryRead(field, out v)) && v.Confidence is not ReadoutConfidence.Unknown;
        if (d.Exists is { } ex) return (known == ex, $"{field} {(ex ? "exists" : "missing")}");
        if (!known) return (false, field);
        return (Compare(d, v), field);
    }

    /// <summary>Fields the engine answers itself from the foreground window: <c>windows.foreground.windowClass|process|title</c>.</summary>
    internal static bool BuiltIn(string field, ForegroundApp? app, out ReadoutValue v)
    {
        v = ReadoutValue.Unknown;
        if (app is null || !field.StartsWith("windows.foreground.", StringComparison.Ordinal)) return false;
        var text = field["windows.foreground.".Length..] switch { "windowClass" => app.WindowClass, "process" => app.ProcessName, "title" => app.Title, _ => null };
        if (text is null) return false;
        v = new ReadoutValue { Text = text, Confidence = ReadoutConfidence.Observed };
        return true;
    }

    /// <summary>equals (string/number/bool) or regex against a value; neither = "has a truthy value".</summary>
    internal static bool Compare(Detector d, ReadoutValue v)
    {
        if (v.Confidence is ReadoutConfidence.Unknown) return d.Exists == false;
        if (d.EqualsValue is JsonValue e)
        {
            if (e.TryGetValue<bool>(out var b)) return v.State == b || (v.State is null && v.Text is { } t && bool.TryParse(t, out var tb) && tb == b);
            if (e.TryGetValue<double>(out var n)) return v.Number is { } vn && Math.Abs(vn - n) < 1e-9 || (v.Text is { } tn && double.TryParse(tn, NumberStyles.Float, CultureInfo.InvariantCulture, out var p) && Math.Abs(p - n) < 1e-9);
            if (e.TryGetValue<string>(out var s)) return string.Equals(v.Text ?? v.Number?.ToString(CultureInfo.InvariantCulture) ?? v.State?.ToString().ToLowerInvariant(), s, StringComparison.OrdinalIgnoreCase);
            return false;
        }
        if (d.Regex is { } rx) return Regexes.IsMatch(rx, v.Text ?? v.Number?.ToString(CultureInfo.InvariantCulture) ?? v.State?.ToString().ToLowerInvariant(), d.Flags);
        return v.State ?? (v.Number is { } num ? num != 0 : !string.IsNullOrEmpty(v.Text));
    }
}
