using System.Text.Json.Nodes;
using PrismControl.Ai.Actions;
using PrismControl.Ai.Apps;
using PrismControl.Ai.Services.StatusPages;
using PrismControl.Ai.Services.Usage;
using PrismControl.Core.Actions;
using PrismControl.Core.Hosting;
using PrismControl.Core.PropertyInspector;
using PrismControl.Core.Render;
using PrismControl.Core.Render.Tokens;

namespace PrismControl.Ai.Services.Actions;

/// <summary>
/// What every AI2 action shares: resolves <see cref="Ai2Services"/> (and AI1's <see cref="AiServices"/> for ON AIR), re-renders
/// through the mailbox when a layer changes, holds the demand leases that make the pollers run only while visible, and keeps a
/// short flash label on a clock.
/// </summary>
internal sealed class Ai2Binding : IDisposable
{
    private readonly ActionBase _action;
    private readonly Action _render;
    private readonly List<IDisposable> _leases = [];
    private Action? _onChanged;
    private Action<AiSettings>? _onAi1;
    private DateTimeOffset _flashUntil;

    public Ai2Binding(ActionBase action, Action render)
    {
        _action = action;
        _render = render;
    }

    public Ai2Services? S { get; private set; }
    public AiServices? Ai1 { get; private set; }
    public string? Flash { get; private set; }
    public bool FlashBad { get; private set; }

    public DateTimeOffset Now => S?.Time.GetUtcNow() ?? DateTimeOffset.UtcNow;

    public bool Bind(IServiceRegistry services)
    {
        if (!services.TryGet<Ai2Services>(out var s)) return false;
        S = s;
        _onChanged = () => _action.Post(_render);
        s.Changed += _onChanged;
        if (services.TryGet<AiServices>(out var ai1))
        {
            Ai1 = ai1;
            _onAi1 = _ => _action.Post(_render);
            ai1.Settings.Changed += _onAi1;
        }
        return true;
    }

    /// <summary>Replaces the demand leases (a settings change can pick another provider).</summary>
    public void Lease(params IDisposable?[] leases)
    {
        ReleaseLeases();
        foreach (var l in leases) if (l is not null) _leases.Add(l);
    }

    private void ReleaseLeases()
    {
        foreach (var l in _leases) l.Dispose();
        _leases.Clear();
    }

    public void SetFlash(string label, bool bad = false, TimeSpan? duration = null)
    {
        Flash = label;
        FlashBad = bad;
        _flashUntil = Now + (duration ?? TimeSpan.FromSeconds(2));
    }

    public void Expire()
    {
        if (Flash is not null && Now >= _flashUntil) Flash = null;
    }

    public static SvgDocument OfflineKey(RefractionPalette t) => AiBinding.Offline(t);

    public static SvgDocument OfflineDial(RefractionPalette t)
    {
        var d = Core.Art.DialArt.Base(t);
        Ai.Art.AiText.Draw(d, "AI SERVICES OFFLINE", 100, 56, 12, t.Dim, TextAlign.Middle);
        return d;
    }

    public void Dispose()
    {
        ReleaseLeases();
        if (S is not null && _onChanged is not null) S.Changed -= _onChanged;
        if (Ai1 is not null && _onAi1 is not null) Ai1.Settings.Changed -= _onAi1;
        S = null;
        Ai1 = null;
    }
}

/// <summary>
/// The property-inspector side of AI2: provider lists, the opt-in buttons and the admin-key paste. Every opt-in is an explicit
/// button press after the PI explained what runs; keys come from the clipboard on that click (never from a settings field) and
/// only their last 4 characters are ever shown. Nothing here logs a key, a profile name or clipboard content.
/// </summary>
internal static class Ai2Pi
{
    public static IEnumerable<(string Value, string Label)> ProviderOptions => HealthCatalog.Providers.Select(p => (p.Id, p.Name));

    /// <summary>The shared heading + global fields for health surfaces.</summary>
    public static PiForm HealthGlobals(PiForm f) => f
        .Heading("Status pages")
        .Info("What runs", "Public status pages only (Claude, OpenAI, GitHub, Cursor, AWS Health, Google). Fetched while this is visible, never more than once a minute (AWS: 5 min), with conditional requests and backoff.")
        .Range(PiForm.Global(Ai2Settings.Section, "healthPollSeconds"), "Refresh while visible", 60, 900, 30, "s")
        .Checkbox(PiForm.Global(Ai2Settings.Section, "backgroundHealth"), "Keep a slow 10-minute check in the background")
        .Info("Last check", stateKey: "healthStatus");

    /// <param name="providers">
    /// The calling action's own providers: "Check now" refreshes only these (never all eight, which would also enroll every
    /// source in the background poll). Null or empty: nothing is refreshed.
    /// </param>
    public static Task<object?> HandleAsync(Ai2Services? s, string type, JsonNode? data, IReadOnlyList<string>? providers = null) =>
        s is null ? Task.FromResult<object?>(null) : type switch
        {
            "providers.list" => Task.FromResult<object?>(HealthCatalog.Providers.Select(p => new { value = p.Id, label = p.Name })),
            "apps.list" => Task.Run<object?>(() => AppCatalog.Apps.Select(a => new { value = a.Id, label = a.Name + (s.Apps.Get(a.Id).Installed ? "" : " (not seen on this PC)") })),
            "ask.targets" => Task.Run<object?>(() => AskTargets.All.Select(t => new { value = t.Id, label = $"{t.Name} · {t.KindLabel.ToLowerInvariant()}" + (s.Ask.TargetAvailable(t) ? "" : " (not installed)") })),
            _ when type.StartsWith("bedrock.", StringComparison.Ordinal) || type.StartsWith("admin.", StringComparison.Ordinal) || type == "health.refresh"
                => Task.Run<object?>(() => Command(s, type, providers)),
            _ => Task.FromResult<object?>(null),
        };

    /// <summary>"Check now" for one action's providers only. Returns the PI message.</summary>
    internal static string RefreshProviders(Ai2Services s, IReadOnlyList<string>? providers)
    {
        var ids = (providers ?? []).Where(id => HealthCatalog.Find(id) is not null).Distinct(StringComparer.Ordinal).ToList();
        if (ids.Count == 0) return "Nothing to check here.";
        var any = ids.Select(s.Health.RequestRefresh).ToList().Any(x => x);
        return any ? "Checking now." : "Checked moments ago, or the status page asked us to wait. Try again in a minute.";
    }

    private static async Task<object?> Command(Ai2Services s, string type, IReadOnlyList<string>? providers)
    {
        string message;
        switch (type)
        {
            case "health.refresh":
                message = RefreshProviders(s, providers);
                break;
            case "bedrock.enable":
            {
                var cfg = s.Settings.Current;
                if (s.SafeMode) message = "Safe mode: Bedrock usage can't be turned on.";
                else if (cfg.Profile is null) message = "Type your read-only AWS profile name first (letters, digits, - _ . @ +).";
                else if (s.AwsCli?.Locate() is null) message = "The AWS CLI (aws.exe) was not found. Install AWS CLI v2, then try again.";
                else
                {
                    s.Settings.Update(x => x.BedrockUsageEnabled = true);
                    s.Log.Info("Bedrock usage turned on (CloudWatch via the AWS CLI)");
                    message = "On. " + BedrockUsageService.Explain(s.Settings.Current);
                }
                break;
            }
            case "bedrock.disable":
                s.Settings.Update(x => x.BedrockUsageEnabled = false);
                s.Log.Info("Bedrock usage turned off");
                message = "Off. The AWS CLI will not run.";
                break;
            case "bedrock.test":
                message = !s.Settings.Current.BedrockUsageEnabled ? "Turn it on first."
                    : s.Bedrock.RequestRefresh() ? "Reading CloudWatch now." : "Read less than 5 minutes ago (the limit). Try again later.";
                break;
            default:
                message = await Admin(s, type).ConfigureAwait(false);
                break;
        }
        return State(s, message);
    }

    private static async Task<string> Admin(Ai2Services s, string type)
    {
        var parts = type.Split('.');
        if (parts.Length != 3) return "";
        AdminProvider? p = parts[1] switch { "anthropic" => AdminProvider.Anthropic, "openai" => AdminProvider.OpenAi, _ => null };
        if (p is not { } provider) return "";
        var name = AdminUsageService.ProviderName(provider);
        switch (parts[2])
        {
            case "saveKey":
            {
                if (s.SafeMode) return "Safe mode: keys can't be saved.";
                if (s.Clipboard is null) return "The clipboard isn't available.";
                var seq = s.Clipboard.SequenceNumber();
                var text = await s.Clipboard.ReadTextAsync(CancellationToken.None).ConfigureAwait(false);
                var outcome = s.Admin.TrySaveKey(provider, text, out var hint);
                text = null;
                if (outcome == KeyChange.StoreFailed) return $"The {name} key could not be saved (Windows' encrypted store refused it). Nothing was stored.";
                if (outcome != KeyChange.Done)
                    return $"The clipboard doesn't hold a {name} ADMIN key ({(provider == AdminProvider.Anthropic ? "sk-ant-admin…" : "sk-admin-…")}). Copy it, then press again.";
                // The key must not linger on the clipboard: clear it, but only if the clipboard still holds exactly what we read
                // (the sequence number is unchanged: nothing newer was copied meanwhile).
                var cleared = s.Clipboard.SequenceNumber() == seq && await s.Clipboard.ClearAsync(CancellationToken.None).ConfigureAwait(false);
                return $"Saved {hint} (encrypted for your Windows account). " +
                       (cleared ? "The clipboard was cleared. " : "Clear your clipboard now. ") +
                       "Windows clipboard history (Win+V) and the cloud clipboard may still keep a copy: delete it there.";
            }
            case "forget":
                switch (s.Admin.ForgetKey(provider))
                {
                    case KeyChange.SafeMode:
                        return $"Safe mode: nothing was changed. The {name} key was NOT removed.";
                    case KeyChange.StoreFailed:
                        return $"The {name} key could not be removed (Windows' encrypted store refused). Usage is unchanged.";
                }
                SetEnabled(s, provider, false);
                return $"{name} key removed and usage turned off.";
            case "enable":
                if (s.SafeMode) return "Safe mode: no API calls.";
                if (s.Admin.KeyHint(provider) is null) return "Save an admin key first.";
                SetEnabled(s, provider, true);
                return $"{name} usage on: two read-only GETs every 15 minutes while visible.";
            case "disable":
                SetEnabled(s, provider, false);
                return $"{name} usage off.";
            default:
                return "";
        }
    }

    private static void SetEnabled(Ai2Services s, AdminProvider p, bool on) =>
        s.Settings.Update(x => { if (p == AdminProvider.Anthropic) x.AnthropicAdminEnabled = on; else x.OpenAiAdminEnabled = on; });

    /// <summary>The PI's live Info fields.</summary>
    public static object State(Ai2Services s, string? message = null)
    {
        var now = s.Time.GetUtcNow();
        var cfg = s.Settings.Current;
        var b = s.Bedrock.Snapshot();
        string Admin(AdminProvider p)
        {
            var a = s.Admin.Snapshot(p);
            var key = a.KeyHint is null ? "no key" : "key " + a.KeyHint;
            return $"{a.State} · {key}" + (a.LastAttempt is { } l ? $" · checked {Ai2Ago(l, now)}" : "");
        }
        var checkedAt = s.Health.All(now).Where(h => h.LastAttempt is not null).Select(h => h.LastAttempt!.Value).DefaultIfEmpty().Max();
        return new
        {
            healthStatus = checkedAt == default ? "Not checked yet (starts when a health key is visible)." : $"Checked {Ai2Ago(checkedAt, now)}.",
            bedrockStatus = $"{(cfg.BedrockUsageEnabled ? "ON" : "OFF")} · {b.State} · region {cfg.Region}" + (b.LastAttempt is { } la ? $" · read {Ai2Ago(la, now)}" : ""),
            bedrockExplain = BedrockUsageService.Explain(cfg),
            anthropicStatus = Admin(AdminProvider.Anthropic),
            openaiStatus = Admin(AdminProvider.OpenAi),
            safeMode = s.SafeMode,
            message = message ?? "",
        };
    }

    private static string Ai2Ago(DateTimeOffset at, DateTimeOffset now) => Ai.Art.AiPalette.Ago(now - at).ToLowerInvariant();
}
