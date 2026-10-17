using System.Text.Json;
using PrismControl.Ai.Status;

namespace PrismControl.Ai.Services.StatusPages;

public enum SourceKind
{
    /// <summary>Atlassian Statuspage <c>summary.json</c> / <c>components.json</c> (Anthropic, GitHub, Cursor; OpenAI's incident.io compatibility feed).</summary>
    Statuspage,
    /// <summary>Google's <c>incidents.json</c> (Cloud and Workspace dashboards): an array of incidents; open = no end.</summary>
    GoogleIncidents,
    /// <summary>AWS Health Dashboard <c>public/currentevents</c>: UTF-16 BE JSON with a BOM, an array of current events.</summary>
    AwsCurrentEvents,
}

/// <summary>
/// Lenient parsers for the public status feeds (ai-status.md §3.1). They read only status words, component ids/names, open
/// incident names (public text) and affected products; long bodies and update texts are never read. A document that isn't the
/// expected shape returns null, so the cache is kept and the fetch counts as an error.
/// </summary>
public static class StatusParsers
{
    public const int MaxIncidentName = 96;

    public static ParsedPage? Parse(SourceKind kind, ReadOnlySpan<byte> body, string? contentType, DateTimeOffset now)
    {
        if (body.IsEmpty) return null;
        try
        {
            var text = HttpText.Decode(body, contentType);
            using var doc = JsonDocument.Parse(text, new JsonDocumentOptions { MaxDepth = 32, AllowTrailingCommas = true });
            return kind switch
            {
                SourceKind.Statuspage => Statuspage(doc.RootElement),
                SourceKind.GoogleIncidents => Google(doc.RootElement, now),
                SourceKind.AwsCurrentEvents => Aws(doc.RootElement),
                _ => null,
            };
        }
        catch (JsonException) { return null; }
        catch (ArgumentException) { return null; }
    }

    private static ParsedPage? Statuspage(JsonElement root)
    {
        if (root.ValueKind != JsonValueKind.Object || !root.TryGetProperty("components", out var comps) || comps.ValueKind != JsonValueKind.Array) return null;
        var components = new List<PageComponent>();
        foreach (var c in comps.EnumerateArray())
        {
            if (c.ValueKind != JsonValueKind.Object) continue;
            if (c.TryGetProperty("group", out var g) && g.ValueKind == JsonValueKind.True) continue;   // a group's status is an aggregate
            var id = Str(c, "id");
            var name = Str(c, "name");
            if (id is null || name is null) continue;
            components.Add(new PageComponent(id, name, HealthLevels.FromStatuspage(Str(c, "status"))));
        }
        Health? indicator = root.TryGetProperty("status", out var st) && st.ValueKind == JsonValueKind.Object ? HealthLevels.FromIndicator(Str(st, "indicator")) : null;
        var incidents = new List<PageIncident>();
        if (root.TryGetProperty("incidents", out var incs) && incs.ValueKind == JsonValueKind.Array)
        {
            foreach (var i in incs.EnumerateArray())
            {
                if (i.ValueKind != JsonValueKind.Object) continue;
                var status = Str(i, "status");
                if (status is "resolved" or "postmortem" or "completed") continue;
                var sev = Str(i, "impact") switch
                {
                    "critical" => Health.MajorOutage,
                    "major" => Health.PartialOutage,
                    "maintenance" => Health.Maintenance,
                    _ => Health.Degraded,
                };
                incidents.Add(new PageIncident(Name(Str(i, "name")), sev, ComponentIds(i)));
            }
        }
        if (root.TryGetProperty("scheduled_maintenances", out var maint) && maint.ValueKind == JsonValueKind.Array)
        {
            foreach (var m in maint.EnumerateArray())
                if (m.ValueKind == JsonValueKind.Object && Str(m, "status") is "in_progress" or "verifying")
                    incidents.Add(new PageIncident(Name(Str(m, "name")), Health.Maintenance, ComponentIds(m)));
        }
        return new ParsedPage(components, indicator, incidents);
    }

    private static List<string> ComponentIds(JsonElement incident)
    {
        var ids = new List<string>();
        if (incident.TryGetProperty("components", out var cs) && cs.ValueKind == JsonValueKind.Array)
            foreach (var c in cs.EnumerateArray())
                if (c.ValueKind == JsonValueKind.Object && Str(c, "id") is { } id) ids.Add(id);
        return ids;
    }

    private static ParsedPage? Google(JsonElement root, DateTimeOffset now)
    {
        if (root.ValueKind != JsonValueKind.Array) return null;
        var incidents = new List<PageIncident>();
        foreach (var i in root.EnumerateArray())
        {
            if (i.ValueKind != JsonValueKind.Object) continue;
            var end = Str(i, "end");
            if (!string.IsNullOrEmpty(end) && DateTimeOffset.TryParse(end, out var e) && e <= now) continue;   // closed
            var products = new List<string>();
            if (i.TryGetProperty("affected_products", out var ps) && ps.ValueKind == JsonValueKind.Array)
                foreach (var p in ps.EnumerateArray())
                    if (p.ValueKind == JsonValueKind.Object && Str(p, "title") is { } t) products.Add(t);
            incidents.Add(new PageIncident(Name(Str(i, "external_desc") ?? Str(i, "service_name")), HealthLevels.FromGoogleSeverity(Str(i, "severity")), products));
        }
        return new ParsedPage([], null, incidents);
    }

    private static ParsedPage? Aws(JsonElement root)
    {
        if (root.ValueKind != JsonValueKind.Array) return null;
        var worst = new Dictionary<string, PageComponent>(StringComparer.OrdinalIgnoreCase);
        var incidents = new List<PageIncident>();
        foreach (var ev in root.EnumerateArray())
        {
            if (ev.ValueKind != JsonValueKind.Object) continue;
            var keys = new List<string>();
            void Add(string key, string? name, Health? h)
            {
                if (h is not { } level) return;
                keys.Add(key);
                if (!worst.TryGetValue(key, out var cur) || HealthLevels.Severity(level) > HealthLevels.Severity(cur.Health ?? Health.Operational))
                    worst[key] = new PageComponent(key, name ?? key, level);
            }
            if (Str(ev, "service") is { } svc && !svc.StartsWith("multipleservices", StringComparison.OrdinalIgnoreCase))
                Add(svc, Str(ev, "service_name"), HealthLevels.FromAws(Str(ev, "status")));
            if (ev.TryGetProperty("impacted_services", out var imp) && imp.ValueKind == JsonValueKind.Object)
                foreach (var p in imp.EnumerateObject())
                    if (p.Value.ValueKind == JsonValueKind.Object) Add(p.Name, Str(p.Value, "service_name"), HealthLevels.FromAws(Str(p.Value, "current")));
            if (keys.Count > 0)
                incidents.Add(new PageIncident(Name(Str(ev, "summary")), HealthLevels.Worst(keys.Select(k => worst[k].Health ?? Health.Operational)), keys));
        }
        return new ParsedPage([.. worst.Values], null, incidents);
    }

    private static string? Str(JsonElement o, string name) =>
        o.TryGetProperty(name, out var v) ? v.ValueKind switch
        {
            JsonValueKind.String => v.GetString(),
            JsonValueKind.Number => v.GetRawText(),
            _ => null,
        } : null;

    /// <summary>Public incident names are capped and stripped of control characters (they are drawn on keys).</summary>
    private static string Name(string? s)
    {
        if (string.IsNullOrWhiteSpace(s)) return "Incident";
        var clean = new string(s.Where(ch => !char.IsControl(ch)).ToArray()).Trim();
        return clean.Length <= MaxIncidentName ? clean : clean[..(MaxIncidentName - 1)].TrimEnd() + "…";
    }
}
