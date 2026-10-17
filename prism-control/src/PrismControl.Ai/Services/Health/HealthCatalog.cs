using PrismControl.Ai.Status;

namespace PrismControl.Ai.Services.StatusPages;

/// <summary>One public status feed (fetched once for every provider that reads it).</summary>
public sealed record StatusSource(string Id, Uri Url, SourceKind Kind, TimeSpan MinInterval);

/// <summary>
/// One provider row on the deck: which source it reads, which components matter to the user (pinned ids first, names as a
/// fallback when a page renumbers), and its status page for a press.
/// </summary>
public sealed record ProviderDef(
    string Id,
    string Name,
    string Short,
    string SourceId,
    string PageUrl,
    IReadOnlyList<(string Id, string Name, string Label)> Components,
    string? GoogleProduct = null,
    bool AwsBedrock = false);

/// <summary>
/// The providers and endpoints from research/ai-status.md §3.1, each fetched once on 2026-10-16 to confirm the shape
/// (component ids pinned from those fetches). Every endpoint is public, read-only and needs no auth.
/// </summary>
public static class HealthCatalog
{
    public static readonly IReadOnlyList<StatusSource> Sources =
    [
        new("anthropic", new Uri("https://status.claude.com/api/v2/summary.json"), SourceKind.Statuspage, TimeSpan.FromSeconds(60)),
        // components.json, not summary.json: only it lists the Codex components (incident.io's Statuspage-compatible feed).
        new("openai", new Uri("https://status.openai.com/api/v2/components.json"), SourceKind.Statuspage, TimeSpan.FromSeconds(60)),
        new("github", new Uri("https://www.githubstatus.com/api/v2/summary.json"), SourceKind.Statuspage, TimeSpan.FromSeconds(60)),
        new("cursor", new Uri("https://status.cursor.com/api/v2/summary.json"), SourceKind.Statuspage, TimeSpan.FromSeconds(60)),
        // AWS: ~230 KB of UTF-16 with no validators, and its RSS twin says ttl 5: never more often than every 5 minutes.
        new("aws", new Uri("https://health.aws.amazon.com/public/currentevents"), SourceKind.AwsCurrentEvents, TimeSpan.FromMinutes(5)),
        // Google's feeds are 200–350 KB with Last-Modified (If-Modified-Since → 304): 2 minutes at the most.
        new("gworkspace", new Uri("https://www.google.com/appsstatus/dashboard/incidents.json"), SourceKind.GoogleIncidents, TimeSpan.FromMinutes(2)),
        new("gcloud", new Uri("https://status.cloud.google.com/incidents.json"), SourceKind.GoogleIncidents, TimeSpan.FromMinutes(2)),
    ];

    public static readonly IReadOnlyList<ProviderDef> Providers =
    [
        new("claude", "Claude", "CLAUDE", "anthropic", "https://status.claude.com",
        [
            ("yyzkbfz2thpt", "Claude Code", "Claude Code"),
            ("k8w3r06qmzrp", "Claude API (api.anthropic.com)", "Claude API"),
            ("rwppv331jlwc", "claude.ai", "claude.ai"),
            ("0qbwn08sd68x", "Claude Console (platform.claude.com)", "Console"),
        ]),
        new("openai", "OpenAI", "OPENAI", "openai", "https://status.openai.com",
        [
            ("01JMXBRMFE6N2NNT7DG6XZQ6PW", "Chat Completions", "Chat API"),
            ("01JP8CD9JR3HR6Y7G4Q75N4DVW", "Responses", "Responses"),
            ("01JMXBNJXGV1T5GT2M9XA83XNG", "Conversations", "ChatGPT"),
            ("01JMXBNJXGGT5SR5DB9J7GYY48", "Voice mode", "Voice mode"),
        ]),
        new("codex", "Codex", "CODEX", "openai", "https://status.openai.com",
        [
            ("01KMKFAMWKQ81YWSE1Z18R6VHR", "Codex in ChatGPT Desktop", "Codex app"),
            ("01KMKFAMWKNQ84Z1766MV08ZDE", "CLI", "Codex CLI"),
            ("01KMP3KP5MGE23B80K1EK4S8PV", "Codex API", "Codex API"),
            ("01JVCV8YSWZFRSM1G5CVP253SK", "Codex Web", "Codex Web"),
            ("01KMP3KP5M8X0EBTVW6KN327EE", "VS Code extension", "Codex VS Code"),
        ]),
        new("github", "GitHub Copilot", "COPILOT", "github", "https://www.githubstatus.com",
        [
            ("pjmpxvq2cmr2", "Copilot", "Copilot"),
            ("cnnb39dkkk82", "Copilot AI Model Providers", "Model providers"),
            ("brv1bkgrwx7q", "API Requests", "GitHub API"),
        ]),
        new("cursor", "Cursor", "CURSOR", "cursor", "https://status.cursor.com",
        [
            ("rflc60xp5jp2", "IDE", "Cursor IDE"),
            ("vsny1qv7v86c", "CLI", "Cursor CLI"),
            ("mwv1g9sc7kdh", "Cloud Agents", "Cloud Agents"),
        ]),
        new("bedrock", "Amazon Bedrock", "BEDROCK", "aws", "https://health.aws.amazon.com/health/status", [], AwsBedrock: true),
        new("gemini", "Gemini", "GEMINI", "gworkspace", "https://www.google.com/appsstatus/dashboard/", [], GoogleProduct: "Gemini"),
        new("vertex", "Vertex Gemini API", "VERTEX", "gcloud", "https://status.cloud.google.com", [], GoogleProduct: "Vertex Gemini API"),
    ];

    /// <summary>The default strip order (all eight fit the Galleon's 2×4 grid).</summary>
    public static IReadOnlyList<string> DefaultOrder => Providers.Select(p => p.Id).ToList();

    public static ProviderDef? Find(string? id) => Providers.FirstOrDefault(p => string.Equals(p.Id, id, StringComparison.OrdinalIgnoreCase));

    public static StatusSource SourceOf(ProviderDef p) => Sources.First(s => s.Id == p.SourceId);

    /// <summary>
    /// Projects a parsed source onto one provider. Null = the page parsed but none of the provider's components (or an
    /// indicator) could be found: shown as unknown, never as "OK".
    /// </summary>
    public static ProviderReading? Project(ProviderDef p, ParsedPage page, IReadOnlyList<string> awsRegions)
    {
        if (p.AwsBedrock)
        {
            var comps = new List<ServiceComponent>();
            foreach (var r in awsRegions)
            {
                var key = "bedrock-" + r;
                var hit = page.Components.FirstOrDefault(c => string.Equals(c.Id, key, StringComparison.OrdinalIgnoreCase));
                comps.Add(new ServiceComponent(key, r, hit?.Health ?? Health.Operational));   // the region is the label: "us-west-2"
            }
            var keys = comps.Select(c => c.Id).ToHashSet(StringComparer.OrdinalIgnoreCase);
            var incident = page.Incidents.Where(i => i.Affected.Any(keys.Contains)).OrderByDescending(i => HealthLevels.Severity(i.Severity)).FirstOrDefault()?.Name;
            return new ProviderReading(HealthLevels.Worst(comps.Select(c => c.Health)), comps, incident);
        }
        if (p.GoogleProduct is { } product)
        {
            var open = page.Incidents.Where(i => i.Affected.Any(a => string.Equals(a, product, StringComparison.OrdinalIgnoreCase))).ToList();
            var level = HealthLevels.Worst(open.Select(i => i.Severity));
            var top = open.OrderByDescending(i => HealthLevels.Severity(i.Severity)).FirstOrDefault()?.Name;
            return new ProviderReading(level, [new ServiceComponent(product, product, level)], top);
        }

        // Statuspage: pinned ids first; names only if no pinned id is on the page any more (a renumbered page).
        var matched = new List<ServiceComponent>();
        foreach (var (id, _, label) in p.Components)
            if (page.Components.FirstOrDefault(c => c.Id == id) is { Health: { } h }) matched.Add(new ServiceComponent(id, label, h));
        if (matched.Count == 0)
            foreach (var (_, name, label) in p.Components)
                if (page.Components.Where(c => string.Equals(c.Name, name, StringComparison.OrdinalIgnoreCase)).ToList() is [{ Health: { } h } only])
                    matched.Add(new ServiceComponent(only.Id, label, h));
        if (matched.Count == 0)
            return page.Indicator is { } ind ? new ProviderReading(ind, [], page.Incidents.FirstOrDefault()?.Name) : null;

        var ids = matched.Select(m => m.Id).ToHashSet(StringComparer.Ordinal);
        // An incident line: one that names a component that matters, else (when incidents list no components) the first open one
        // while something that matters is not operational.
        var inc = page.Incidents.FirstOrDefault(i => i.Affected.Any(ids.Contains))?.Name
                  ?? (matched.Any(m => m.Health != Health.Operational) ? page.Incidents.FirstOrDefault(i => i.Affected.Count == 0)?.Name : null);
        return new ProviderReading(HealthLevels.Worst(matched.Select(m => m.Health)), matched, inc);
    }
}
