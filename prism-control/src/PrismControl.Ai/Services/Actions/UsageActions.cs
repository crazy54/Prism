using System.Text.Json.Nodes;
using PrismControl.Ai.Services.Art;
using PrismControl.Ai.Services.StatusPages;
using PrismControl.Ai.Services.Usage;
using PrismControl.Core.Actions;
using PrismControl.Core.Layouts;
using PrismControl.Core.PropertyInspector;
using PrismControl.Core.Scheduling;

namespace PrismControl.Ai.Services.Actions;

public sealed class UsageSettings
{
    /// <summary>codex (plan limits from Codex's logs) · bedrock (CloudWatch, opt-in) · anthropic / openai (admin APIs, opt-in).</summary>
    public string Provider { get; set; } = "codex";
    /// <summary>Codex window shown large: 300 (5 h) or 10080 (weekly).</summary>
    public int Window { get; set; } = 300;
    /// <summary>Bedrock: 0 tokens · 1 calls · 2 throttles. Admin: 0 cost · 1 tokens.</summary>
    public int View { get; set; }
}

/// <summary>
/// A usage dial per provider (Galleon widget / S+ strip segment, or a key):
/// <list type="bullet">
/// <item>Codex: 5 h + weekly rings, the selected window's % and its reset countdown. Turn = window; push = reload from the logs.</item>
/// <item>Bedrock (opt-in): tokens per minute over 30 min, throttle ticks, "account-wide". Turn = tokens / calls / throttles; push = read
/// now (at most every 5 minutes).</item>
/// <item>Anthropic / OpenAI admin (opt-in): month-to-date cost or 24 h tokens, labeled NOT REAL-TIME. Turn = cost / tokens; push = refresh.</item>
/// </list>
/// On a key: press = the next window / view's refresh (Codex: switch window); hold = reload / refresh.
/// </summary>
[StreamDeckAction(Ai2Ids.Usage, Name = "AI Usage", Controllers = Controllers.Encoder | Controllers.Keypad,
    Tooltip = "Codex 5-hour and weekly limits, or (opt-in) Bedrock tokens or API cost. Turn to switch, push to refresh.",
    Icon = "imgs/actions/ai/usage/icon", KeyImage = "imgs/actions/ai/usage/key", Layout = Layouts.Canvas.Path,
    TriggerRotate = "Switch window / view", TriggerPush = "Refresh", TriggerTouch = "Refresh")]
public sealed class UsageAction : DialAction<UsageSettings>, IDisposable
{
    private Ai2Binding? _b;

    public string Kind => Settings.Provider?.Trim().ToLowerInvariant() switch
    {
        "bedrock" => "bedrock",
        "anthropic" => "anthropic",
        "openai" => "openai",
        _ => "codex",
    };

    private AdminProvider AdminKind => Kind == "openai" ? AdminProvider.OpenAi : AdminProvider.Anthropic;
    private int CodexWindow => Settings.Window == 10080 ? 10080 : 300;

    protected override Task OnWillAppearAsync(WillAppearEvent e)
    {
        DefaultPriority = UpdatePriority.Background;
        if (IsDial) SetFeedbackLayout(Layouts.Canvas.Path);
        _b = new Ai2Binding(this, Render);
        if (_b.Bind(Services)) Lease();
        StartRenderLoop(Render, TimeSpan.FromSeconds(15), TimeSpan.FromMilliseconds(100));
        Render();
        return Task.CompletedTask;
    }

    private void Lease()
    {
        if (_b?.S is not { } s) return;
        _b.Lease(Kind switch
        {
            "bedrock" => s.Bedrock.Demand(),
            "anthropic" or "openai" => s.Admin.Demand(AdminKind),
            _ => s.Codex.Demand(),
        });
    }

    protected override Task OnWillDisappearAsync(WillDisappearEvent e)
    {
        Dispose();
        return Task.CompletedTask;
    }

    protected override Task OnSettingsChangedAsync(UsageSettings settings)
    {
        Lease();
        RefreshPropertyInspectorForm();
        Render();
        return Task.CompletedTask;
    }

    protected override Task OnDialRotateAsync(DialRotateEvent e)
    {
        var dir = Math.Sign(e.Ticks);
        if (dir == 0) return Task.CompletedTask;
        switch (Kind)
        {
            case "codex": Settings.Window = CodexWindow == 300 ? 10080 : 300; break;
            case "bedrock": Settings.View = ((Settings.View + dir) % 3 + 3) % 3; break;
            default: Settings.View = Settings.View == 1 ? 0 : 1; break;
        }
        SaveSettings();
        Render();
        return Task.CompletedTask;
    }

    protected override Task OnDialPressAsync(DialUpEvent e) => RefreshAsync();
    protected override Task OnTouchTapAsync(TouchTapEvent e) => RefreshAsync();

    protected override Task OnKeyPressAsync(KeyUpEvent e)
    {
        if (Kind == "codex")
        {
            Settings.Window = CodexWindow == 300 ? 10080 : 300;
            SaveSettings();
            Render();
            return Task.CompletedTask;
        }
        return RefreshAsync();
    }

    protected override Task OnKeyLongPressAsync(KeyDownEvent e) => RefreshAsync();

    private async Task RefreshAsync()
    {
        if (_b?.S is not { } s) { ShowAlert(); return; }
        switch (Kind)
        {
            case "codex":
                _b.SetFlash("RELOADING");
                Render();
                var found = await s.Codex.SeedAsync(CancellationToken.None).ConfigureAwait(false);
                Post(() => { _b?.SetFlash(found ? "RELOADED" : "NO NEW DATA", !found); Render(); });
                return;
            case "bedrock":
            {
                var snap = s.Bedrock.Snapshot();
                if (snap.State is BedrockState.Off or BedrockState.SafeMode or BedrockState.NeedsProfile)
                    _b.SetFlash(IsDial ? UsageArt.BedrockStateText(snap.State).Line1 : UsageArt.BedrockKeyText(snap.State).Line1, true);
                else if (s.Bedrock.RequestRefresh()) _b.SetFlash("READING");
                else _b.SetFlash(snap.NextAllowed is { } n ? "NEXT IN " + CodexLimitsService.Countdown(n - Time.GetUtcNow()) : "UP TO DATE");
                break;
            }
            default:
            {
                var snap = s.Admin.Snapshot(AdminKind);
                if (snap.State is AdminState.Off or AdminState.SafeMode or AdminState.NoKey)
                    _b.SetFlash(IsDial ? UsageArt.AdminStateText(snap.State).Line1 : UsageArt.AdminKeyText(snap.State).Line1, true);
                else _b.SetFlash(s.Admin.RequestRefresh(AdminKind) ? "REFRESHING" : "UP TO DATE");
                break;
            }
        }
        Render();
    }

    protected override PiForm? DescribeForm()
    {
        var f = new PiForm()
            .Heading("Usage")
            .Select("provider", "Show", [
                ("codex", "Codex 5-hour / weekly limits (from Codex's own logs)"),
                ("bedrock", "Amazon Bedrock tokens (CloudWatch · opt-in)"),
                ("anthropic", "Anthropic API cost (admin key · opt-in)"),
                ("openai", "OpenAI API cost (admin key · opt-in)"),
            ]);
        var g = (string key) => PiForm.Global(Ai2Settings.Section, key);
        switch (Kind)
        {
            case "bedrock":
                f.Heading("Bedrock usage (off until you turn it on)")
                    .Info("What runs", stateKey: "bedrockExplain")
                    .Text(g("awsProfile"), "AWS profile (read-only)", "PrismReadOnly")
                    .Text(g("awsRegion"), "Region (empty = AWS_REGION, else us-east-1)", "us-east-1")
                    .Range(g("bedrockPollMinutes"), "Read every", 5, 60, 5, "min")
                    .Info("Permission", "The profile needs only cloudwatch:GetMetricData. A dedicated read-only permission set is best.")
                    .Button("bedrock.enable", "Turn on Bedrock usage")
                    .Button("bedrock.test", "Read now")
                    .Button("bedrock.disable", "Turn off")
                    .Info("Status", stateKey: "bedrockStatus")
                    .Info("Result", stateKey: "message")
                    .Info("Signing in", "Prism never signs in and never prompts. If your SSO session expired, the dial says so: run aws sso login --profile <name> in a terminal.");
                break;
            case "anthropic":
            case "openai":
            {
                var id = Kind;
                var name = Kind == "anthropic" ? "Anthropic" : "OpenAI";
                f.Heading($"{name} admin usage (off until you turn it on)")
                    .Info("Warning", "Admin keys are full-power and unscoped. Don't store an organization admin key on a streaming PC.")
                    .Info("How", $"Copy your {name} ADMIN key ({(Kind == "anthropic" ? "sk-ant-admin…" : "sk-admin-…")}), then press Save key from clipboard. It is encrypted for your Windows account (DPAPI), never logged, and only its last 4 characters are shown. Prism then clears the clipboard (if it still holds the key).")
                    .Info("Clipboard history", "Copying a key also puts it in Windows clipboard history (Win+V) and, if you turned it on, the cloud clipboard. Prism can't remove it from there: open Win+V and delete the entry, or copy the key with history turned off.")
                    .Button($"admin.{id}.saveKey", "Save key from clipboard")
                    .Button($"admin.{id}.enable", "Turn on")
                    .Button($"admin.{id}.disable", "Turn off")
                    .Button($"admin.{id}.forget", "Forget key")
                    .Info("Status", stateKey: $"{id}Status")
                    .Info("Result", stateKey: "message")
                    .Info("Freshness", "Daily data, not real-time: two read-only GETs every 15 minutes while visible.");
                if (Kind == "anthropic") f.Info("Note", "Anthropic's admin API doesn't cover Claude Code on Amazon Bedrock (use the Bedrock view for that).");
                break;
            }
            default:
                f.Select("window", "Window shown large", [("300", "5-hour"), ("10080", "Weekly")])
                    .Info("Source", "Codex records its plan limits in ~/.codex/sessions (rollout logs). Prism reads only the limit fields (used %, window, reset time), never messages. The numbers update when Codex runs; after a reset with no newer record the dial shows ~0% (inferred).");
                break;
        }
        return f;
    }

    protected override object? DescribeState() => _b?.S is { } s ? Ai2Pi.State(s) : null;

    protected override async Task<object?> OnPiMessageAsync(string type, JsonNode? data)
    {
        var r = await Ai2Pi.HandleAsync(_b?.S, type, data).ConfigureAwait(false);
        if (r is not null && (type.StartsWith("bedrock.", StringComparison.Ordinal) || type.StartsWith("admin.", StringComparison.Ordinal)))
            Post(() => { SendToPropertyInspector("pi.state", r); Render(); });
        return r;
    }

    private void Render()
    {
        if (_b?.S is not { } s)
        {
            if (IsDial) SetFeedback(new Feedback().Pixmap(Layouts.Canvas.Frame, Ai2Binding.OfflineDial(Theme)));
            else SetImage(Ai2Binding.OfflineKey(Theme));
            return;
        }
        _b.Expire();
        var now = Time.GetUtcNow();
        var t = Theme;
        Core.Render.SvgDocument frame = Kind switch
        {
            "bedrock" => IsDial ? UsageArt.BedrockDial(t, s.Bedrock.Snapshot(), Settings.View, now, _b.Flash) : UsageArt.BedrockKey(t, s.Bedrock.Snapshot(), now, _b.Flash),
            "anthropic" or "openai" => IsDial ? UsageArt.AdminDial(t, s.Admin.Snapshot(AdminKind), Settings.View, now, _b.Flash) : UsageArt.AdminKey(t, s.Admin.Snapshot(AdminKind), now, _b.Flash),
            _ => IsDial ? UsageArt.CodexDial(t, s.Codex.Windows(now), CodexWindow, now, s.Codex.LastRecordAt, _b.Flash) : UsageArt.CodexKey(t, s.Codex.Window(CodexWindow, now), now, _b.Flash),
        };
        if (IsDial) SetFeedback(new Feedback().Pixmap(Layouts.Canvas.Frame, frame));
        else SetImage(frame);
    }

    public void Dispose()
    {
        _b?.Dispose();
        _b = null;
    }
}

public sealed class OpsSettings
{
    /// <summary>The providers in the pill row (empty = all eight).</summary>
    public List<string> Providers { get; set; } = [];
}

/// <summary>
/// "AI OPS" (made for the Galleon screen; works on an S+ segment): a pill per provider, the Codex 5H / WEEK bars, and one line for
/// the selected provider (Bedrock adds tokens/min when opted in). Turn = select a provider; push = open its status page.
/// S+ extras: tap a pill to open it; hold the dial to re-check.
/// </summary>
[StreamDeckAction(Ai2Ids.Ops, Name = "AI OPS", Controllers = Controllers.Encoder,
    Tooltip = "AI health and usage in one widget. Turn to pick a provider, push to open its status page.",
    Icon = "imgs/actions/ai/ops/icon", KeyImage = "imgs/actions/ai/ops/key", Layout = Layouts.Canvas.Path,
    TriggerRotate = "Select provider", TriggerPush = "Open status page", TriggerTouch = "Open the tapped provider", TriggerLongTouch = "Open")]
public sealed class OpsAction : DialAction<OpsSettings>, IDisposable
{
    private Ai2Binding? _b;
    private int _selected;

    public IReadOnlyList<string> Ids => HealthStripAction.Resolve(Settings.Providers);

    protected override Task OnWillAppearAsync(WillAppearEvent e)
    {
        DefaultPriority = UpdatePriority.Background;
        SetFeedbackLayout(Layouts.Canvas.Path);
        _b = new Ai2Binding(this, Render);
        if (_b.Bind(Services)) Lease();
        StartRenderLoop(Render, TimeSpan.FromSeconds(10), TimeSpan.FromMilliseconds(100));
        Render();
        return Task.CompletedTask;
    }

    private void Lease()
    {
        if (_b?.S is not { } s) return;
        _b.Lease(s.Health.Demand(Ids), s.Codex.Demand(), s.Bedrock.Demand());
    }

    protected override Task OnWillDisappearAsync(WillDisappearEvent e)
    {
        Dispose();
        return Task.CompletedTask;
    }

    protected override Task OnSettingsChangedAsync(OpsSettings settings)
    {
        Lease();
        _selected = Math.Clamp(_selected, 0, Ids.Count - 1);
        Render();
        return Task.CompletedTask;
    }

    protected override Task OnDialRotateAsync(DialRotateEvent e)
    {
        // Galleon spins arrive as one event of up to ±12 ticks: move that many, wrapping.
        var n = Ids.Count;
        _selected = ((_selected + e.Ticks) % n + n) % n;
        Render();
        return Task.CompletedTask;
    }

    protected override Task OnDialPressAsync(DialUpEvent e) => OpenAsync();

    protected override Task OnTouchTapAsync(TouchTapEvent e)
    {
        if (e.Y < 50)
        {
            var n = Ids.Count;
            _selected = Math.Clamp((int)((e.X - 8) / (184.0 / n)), 0, n - 1);
        }
        return OpenAsync();
    }

    protected override Task OnDialLongPressAsync(DialDownEvent e)
    {
        if (_b?.S is not { } s) return Task.CompletedTask;
        _b.SetFlash(s.Health.RequestRefresh(Ids[_selected]) ? "CHECKING" : "UP TO DATE");
        Render();
        return Task.CompletedTask;
    }

    private Task OpenAsync()
    {
        if (_b?.S is not { } s) { ShowAlert(); return Task.CompletedTask; }
        var p = HealthCatalog.Find(Ids[Math.Clamp(_selected, 0, Ids.Count - 1)])!;
        _b.SetFlash(s.Open(p.PageUrl) ? $"OPENED {p.Name.ToUpperInvariant()} STATUS" : "SAFE MODE", bad: s.SafeMode);
        Render();
        return Task.CompletedTask;
    }

    protected override PiForm? DescribeForm() => Ai2Pi.HealthGlobals(new PiForm()
            .Heading("AI OPS")
            .MultiSelect("providers", "Providers (none checked = all)", Ai2Pi.ProviderOptions, ordered: true, max: 8)
            .Info("Usage", "The Codex bars come from Codex's own logs. Bedrock tokens appear only after you turn Bedrock usage on (in an AI Usage dial's settings)."))
        .Button("health.refresh", "Check now");

    protected override object? DescribeState() => _b?.S is { } s ? Ai2Pi.State(s) : null;

    protected override async Task<object?> OnPiMessageAsync(string type, JsonNode? data)
    {
        var r = await Ai2Pi.HandleAsync(_b?.S, type, data, Ids).ConfigureAwait(false);
        if (type == "health.refresh" && r is not null) Post(() => SendToPropertyInspector("pi.state", r));
        return r;
    }

    private void Render()
    {
        if (_b?.S is not { } s) { SetFeedback(new Feedback().Pixmap(Layouts.Canvas.Frame, Ai2Binding.OfflineDial(Theme))); return; }
        _b.Expire();
        var now = Time.GetUtcNow();
        var views = Ids.Select(id => s.Health.Get(id, now)!).ToList();
        SetFeedback(new Feedback().Pixmap(Layouts.Canvas.Frame, OpsArt.Widget(Theme, views, _selected, s.Codex.Windows(now), s.Bedrock.Snapshot(), now, _b.Flash)));
    }

    public void Dispose()
    {
        _b?.Dispose();
        _b = null;
    }
}
