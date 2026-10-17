using System.Globalization;
using PrismControl.Ai.Apps;
using PrismControl.Ai.Services.StatusPages;
using PrismControl.Ai.Services.Usage;
using PrismControl.Ai.Status;
using PrismControl.Desktop;

namespace PrismControl.Ai.Services.Verbs;

/// <summary>
/// AI2's verbs and readouts for the Smart Deck (SD1's <c>IVerbRegistry</c> contract in PrismControl.Desktop/Smart).
/// <list type="bullet">
/// <item>Verbs: <c>ai.app.&lt;app&gt;.open</c> (focus or launch), <c>ai.ask.&lt;target&gt;</c> (never-auto: copies the selection),
/// <c>ai.dictate.toggle</c>, <c>ai.health.&lt;provider&gt;.open</c> (status page), <c>ai.usage.refresh</c>.</item>
/// <item>Readouts: <c>ai.health.&lt;provider&gt;</c>, <c>ai.health.worst</c>, <c>ai.usage.codex.fiveHour</c> / <c>.week</c>,
/// <c>ai.usage.bedrock.tokensPerMin</c> / <c>.throttles</c>, <c>ai.app.&lt;app&gt;.running</c> / <c>.foreground</c> / <c>.voice</c>.</item>
/// </list>
/// Reading a readout counts as demand (the source warms up for a few minutes); reads themselves never do I/O.
/// Confidence carries over: observed/reported → Observed, inferred → Inferred, stale → Stale, unknown → Unknown.
/// </summary>
public sealed class Ai2VerbPart : IAiVerbPart
{
    private readonly Ai2Services _s;

    public Ai2VerbPart(Ai2Services services)
    {
        _s = services;
        _s.Changed += () => Changed?.Invoke();
        Verbs = BuildVerbs();
        Readouts = BuildReadouts();
    }

    public event Action? Changed;

    public IReadOnlyList<VerbDescriptor> Verbs { get; }
    public IReadOnlyList<ReadoutDescriptor> Readouts { get; }

    public static string AskVerbId(AskTarget t) => "ai.ask." + Camel(t.Id);
    public static string AppVerbId(AppDef a) => $"ai.app.{a.VerbId}.open";
    public static string HealthVerbId(ProviderDef p) => $"ai.health.{p.Id}.open";

    private static IReadOnlyList<VerbDescriptor> BuildVerbs()
    {
        var list = new List<VerbDescriptor>();
        foreach (var a in AppCatalog.Apps)
            list.Add(new VerbDescriptor
            {
                Id = AppVerbId(a), Label = Fit(a.Short), LongLabel = $"Open {a.Name}", Glyph = a.Glyph == AppGlyph.Code ? "code" : "chat",
                Monogram = a.Short[..2], Category = "nav", Priority = 40, Safety = "safe", StateReadout = $"ai.app.{a.VerbId}.running",
            });
        foreach (var t in AskTargets.All)
            list.Add(new VerbDescriptor
            {
                Id = AskVerbId(t), Label = Fit("ASK " + t.Short), LongLabel = $"Ask {t.Name} about the selection (pre-filled, not sent)",
                Glyph = "chat", Monogram = "AI", Category = "primary", Priority = t.Kind == AskLinkKind.Documented ? 60 : 30, Safety = "never-auto",
            });
        list.Add(new VerbDescriptor { Id = "ai.dictate.toggle", Label = "DICTATE", LongLabel = "Dictation (Win+H, or Ctrl+I in VS Code)", Glyph = "mic", Monogram = "MIC", Category = "tool", Priority = 55 });
        foreach (var p in HealthCatalog.Providers)
            list.Add(new VerbDescriptor
            {
                Id = HealthVerbId(p), Label = Fit(p.Short), LongLabel = $"{p.Name} status page", Glyph = "status", Monogram = p.Short[..2],
                Category = "readout", Priority = 20, StateReadout = $"ai.health.{p.Id}",
            });
        list.Add(new VerbDescriptor { Id = "ai.usage.refresh", Label = "REFRESH", LongLabel = "Refresh AI usage (Codex logs; Bedrock at most every 5 min)", Glyph = "refresh", Monogram = "R", Category = "system", Priority = 10 });
        return list;
    }

    private static IReadOnlyList<ReadoutDescriptor> BuildReadouts()
    {
        var list = new List<ReadoutDescriptor>();
        foreach (var p in HealthCatalog.Providers)
            list.Add(new ReadoutDescriptor { Id = $"ai.health.{p.Id}", Label = p.Short, Widget = "badge", RangeMin = 0, RangeMax = 4 });
        list.Add(new ReadoutDescriptor { Id = "ai.health.worst", Label = "AI HEALTH", Widget = "badge", RangeMin = 0, RangeMax = 4 });
        list.Add(new ReadoutDescriptor { Id = "ai.usage.codex.fiveHour", Label = "CODEX 5H", Unit = "%", Format = "{value}%", Widget = "gauge", RangeMin = 0, RangeMax = 100 });
        list.Add(new ReadoutDescriptor { Id = "ai.usage.codex.week", Label = "CODEX WEEK", Unit = "%", Format = "{value}%", Widget = "gauge", RangeMin = 0, RangeMax = 100 });
        list.Add(new ReadoutDescriptor { Id = "ai.usage.bedrock.tokensPerMin", Label = "BEDROCK TOK", Unit = "tok/min", Widget = "number" });
        list.Add(new ReadoutDescriptor { Id = "ai.usage.bedrock.throttles", Label = "THROTTLES", Unit = "/30m", Widget = "number" });
        foreach (var a in AppCatalog.Apps)
        {
            list.Add(new ReadoutDescriptor { Id = $"ai.app.{a.VerbId}.running", Label = a.Short, Widget = "state" });
            list.Add(new ReadoutDescriptor { Id = $"ai.app.{a.VerbId}.foreground", Label = a.Short, Widget = "state" });
            list.Add(new ReadoutDescriptor { Id = $"ai.app.{a.VerbId}.voice", Label = a.Short + " MIC", Widget = "state" });
        }
        return list;
    }

    public VerbStatus? GetStatus(string verbId)
    {
        if (!verbId.StartsWith("ai.", StringComparison.Ordinal)) return null;
        if (AppCatalog.Apps.FirstOrDefault(a => AppVerbId(a) == verbId) is { } app)
        {
            if (_s.SafeMode) return new VerbStatus(VerbAvailability.Unavailable, "safe mode");
            var v = _s.Apps.Get(app.Id);
            return v.Installed || v.IsRunning ? VerbStatus.Ready : new VerbStatus(VerbAvailability.Unavailable, "not installed");
        }
        if (AskTargets.All.FirstOrDefault(t => AskVerbId(t) == verbId) is { } target)
        {
            if (_s.SafeMode) return new VerbStatus(VerbAvailability.Unavailable, "safe mode");
            if (target.IsWeb && _s.OnAir() && !_s.Settings.Current.WebTargetsOnAir) return new VerbStatus(VerbAvailability.Unavailable, "on air");
            return _s.Ask.TargetAvailable(target) ? VerbStatus.Ready : new VerbStatus(VerbAvailability.ModuleMissing, "app not installed");
        }
        if (verbId == "ai.dictate.toggle") return _s.SafeMode ? new VerbStatus(VerbAvailability.Unavailable, "safe mode") : VerbStatus.Ready;
        if (HealthCatalog.Providers.Any(p => HealthVerbId(p) == verbId)) return _s.SafeMode ? new VerbStatus(VerbAvailability.Unavailable, "safe mode") : VerbStatus.Ready;
        if (verbId == "ai.usage.refresh") return VerbStatus.Ready;
        return null;
    }

    public Task<VerbResult>? InvokeAsync(VerbInvocation inv, CancellationToken ct)
    {
        var id = inv.VerbId;
        if (AppCatalog.Apps.FirstOrDefault(a => AppVerbId(a) == id) is { } app) return OpenApp(app, ct);
        if (AskTargets.All.FirstOrDefault(t => AskVerbId(t) == id) is { } target)
        {
            // never-auto: only the user's own key/dial gesture runs it.
            if (!inv.DirectGesture) return Task.FromResult(VerbResult.Failed("only a direct press runs this"));
            return Ask(target, ct);
        }
        if (id == "ai.dictate.toggle") return Dictate(ct);
        if (HealthCatalog.Providers.FirstOrDefault(p => HealthVerbId(p) == id) is { } provider)
            return Task.FromResult(_s.Open(provider.PageUrl) ? VerbResult.Done : VerbResult.Failed("safe mode"));
        if (id == "ai.usage.refresh") return Refresh(ct);
        return null;
    }

    private async Task<VerbResult> OpenApp(AppDef app, CancellationToken ct)
    {
        var r = await _s.Launcher.FocusOrLaunchAsync(_s.Apps.Get(app.Id), ct).ConfigureAwait(false);
        return r is LaunchResult.Focused or LaunchResult.AlreadyFocused or LaunchResult.Launched or LaunchResult.OpenedNewChat
            ? VerbResult.Done : VerbResult.Failed(r.ToString());
    }

    private async Task<VerbResult> Ask(AskTarget t, CancellationToken ct)
    {
        var (r, _) = await _s.Ask.AskAsync(t, "{selection}", 2000, ct).ConfigureAwait(false);
        return r is AskResult.Opened or AskResult.OpenedClipboardChanged ? VerbResult.Done : VerbResult.Failed(r.ToString());
    }

    private async Task<VerbResult> Dictate(CancellationToken ct)
    {
        var r = await _s.Dictation.ToggleAsync(DictateMode.Auto, ct).ConfigureAwait(false);
        return r == DictateResult.Toggled ? VerbResult.Done : VerbResult.Failed(r.ToString());
    }

    private async Task<VerbResult> Refresh(CancellationToken ct)
    {
        await _s.Codex.SeedAsync(ct).ConfigureAwait(false);
        _s.Bedrock.RequestRefresh();
        return VerbResult.Done;
    }

    public bool TryReadReadout(string readoutId, out ReadoutValue value)
    {
        value = ReadoutValue.Unknown;
        if (!readoutId.StartsWith("ai.", StringComparison.Ordinal)) return false;
        var now = _s.Time.GetUtcNow();
        if (readoutId == "ai.health.worst")
        {
            foreach (var p in HealthCatalog.Providers) _s.Health.Touch(p.Id);
            var all = _s.Health.All(now).Where(h => h.Health.IsKnown).ToList();
            if (all.Count == 0) { value = ReadoutValue.Unknown; return true; }
            var worst = all.OrderByDescending(h => HealthLevels.Severity(h.Health.Value)).First();
            value = HealthValue(worst, now) with { Fields = new Dictionary<string, string> { ["provider"] = worst.Short, ["component"] = worst.Worst ?? "" } };
            return true;
        }
        if (readoutId.StartsWith("ai.health.", StringComparison.Ordinal) && HealthCatalog.Find(readoutId["ai.health.".Length..]) is { } provider
            && readoutId == $"ai.health.{provider.Id}")
        {
            _s.Health.Touch(provider.Id);
            value = HealthValue(_s.Health.Get(provider.Id, now)!, now);
            return true;
        }
        if (readoutId is "ai.usage.codex.fiveHour" or "ai.usage.codex.week")
        {
            _s.Codex.Touch();
            var w = _s.Codex.Window(readoutId.EndsWith("fiveHour", StringComparison.Ordinal) ? 300 : 10080, now);
            value = w is null ? ReadoutValue.Unknown : new ReadoutValue
            {
                Number = Math.Round(w.UsedPercent.Value, 1),
                Text = $"{Math.Round(w.UsedPercent.Value):0}%",
                Fields = new Dictionary<string, string> { ["resets"] = w.ResetText(now), ["window"] = w.Label },
                Confidence = Map(w.UsedPercent.At(now)),
                At = w.UsedPercent.ObservedAt,
            };
            return true;
        }
        if (readoutId is "ai.usage.bedrock.tokensPerMin" or "ai.usage.bedrock.throttles")
        {
            _s.Bedrock.Touch();
            var b = _s.Bedrock.Snapshot();
            if (b.State == BedrockState.Off || !b.Series.IsKnown || b.Series.Value is not { } series) { value = ReadoutValue.Unknown; return true; }
            var tokens = (series.LatestInput ?? 0) + (series.LatestOutput ?? 0);
            var number = readoutId.EndsWith("throttles", StringComparison.Ordinal) ? series.ThrottleSum : tokens;
            value = new ReadoutValue
            {
                Number = number,
                Text = number.ToString("0", CultureInfo.InvariantCulture),
                Fields = new Dictionary<string, string> { ["scope"] = "account-wide", ["region"] = b.Region },
                Confidence = Map(b.Series.At(now)),
                At = b.Series.ObservedAt,
            };
            return true;
        }
        foreach (var a in AppCatalog.Apps)
        {
            var prefix = $"ai.app.{a.VerbId}.";
            if (!readoutId.StartsWith(prefix, StringComparison.Ordinal)) continue;
            _s.Apps.Touch();
            var v = _s.Apps.Get(a.Id);
            var fact = readoutId[prefix.Length..] switch { "running" => v.Running, "foreground" => v.Foreground, "voice" => v.VoiceLive, _ => (Fact<bool>?)null };
            if (fact is not { } f) return false;
            value = f.IsKnown ? new ReadoutValue { State = f.Value, Confidence = Map(f.At(now)), At = f.ObservedAt } : ReadoutValue.Unknown;
            return true;
        }
        return false;
    }

    private static ReadoutValue HealthValue(ProviderHealthView h, DateTimeOffset now) => !h.Health.IsKnown ? ReadoutValue.Unknown : new ReadoutValue
    {
        Number = HealthLevels.Severity(h.Health.Value),
        Text = HealthLevels.Word(h.Health.Value),
        Fields = new Dictionary<string, string> { ["component"] = h.Worst ?? "", ["affected"] = h.Affected.ToString(CultureInfo.InvariantCulture) },
        Confidence = Map(h.Health.At(now)),
        At = h.Health.ObservedAt,
    };

    public static ReadoutConfidence Map(Confidence c) => c switch
    {
        Confidence.Observed or Confidence.Reported => ReadoutConfidence.Observed,
        Confidence.Inferred => ReadoutConfidence.Inferred,
        Confidence.Stale => ReadoutConfidence.Stale,
        _ => ReadoutConfidence.Unknown,
    };

    private static string Fit(string s) => s.Length <= 12 ? s : s[..12].TrimEnd();

    /// <summary>"claude-code-desktop" → "claudeCodeDesktop".</summary>
    public static string Camel(string id)
    {
        var parts = id.Split('-', StringSplitOptions.RemoveEmptyEntries);
        return parts[0] + string.Concat(parts.Skip(1).Select(p => char.ToUpperInvariant(p[0]) + p[1..]));
    }
}
