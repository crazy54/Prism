using System.Text.Json.Nodes;
using PrismControl.Ai.Services.Art;
using PrismControl.Ai.Services.StatusPages;
using PrismControl.Core.Actions;
using PrismControl.Core.Layouts;
using PrismControl.Core.PropertyInspector;
using PrismControl.Core.Scheduling;

namespace PrismControl.Ai.Services.Actions;

public sealed class HealthKeySettings
{
    /// <summary>claude · openai · codex · github · cursor · bedrock · gemini · vertex.</summary>
    public string Provider { get; set; } = "claude";
}

/// <summary>
/// One provider's health from its public status page: a colored glyph + word (OK / DEGRADED / PARTIAL / OUTAGE / MAINT, or "—" when
/// unknown), the worst component or the check's age, a ring for degraded-or-worse, 40 % ink + a clock badge when stale.
/// Press = open the status page. Hold (500 ms, every device) = the components for 4 s and a re-check (≥ 60 s since the last).
/// </summary>
[StreamDeckAction(Ai2Ids.Health, Name = "AI Provider Health", Controllers = Controllers.Keypad,
    Tooltip = "An AI provider's status from its public status page. Press to open the page; hold for the components.",
    Icon = "imgs/actions/ai/health/icon", KeyImage = "imgs/actions/ai/health/key")]
public sealed class HealthKeyAction : KeyAction<HealthKeySettings>, IDisposable
{
    public static readonly TimeSpan DetailsTime = TimeSpan.FromSeconds(4);
    private Ai2Binding? _b;
    private DateTimeOffset _detailsUntil;

    public string ProviderId => HealthCatalog.Find(Settings.Provider)?.Id ?? "claude";

    protected override Task OnWillAppearAsync(WillAppearEvent e)
    {
        DefaultPriority = UpdatePriority.Background;
        _b = new Ai2Binding(this, Render);
        if (_b.Bind(Services)) Lease();
        StartRenderLoop(Render, TimeSpan.FromSeconds(10));
        Render();
        return Task.CompletedTask;
    }

    private void Lease() => _b?.Lease(_b.S?.Health.Demand([ProviderId]));

    protected override Task OnWillDisappearAsync(WillDisappearEvent e)
    {
        Dispose();
        return Task.CompletedTask;
    }

    protected override Task OnSettingsChangedAsync(HealthKeySettings settings)
    {
        Lease();
        Render();
        return Task.CompletedTask;
    }

    protected override Task OnKeyPressAsync(KeyUpEvent e)
    {
        if (_b?.S is not { } s) { ShowAlert(); return Task.CompletedTask; }
        if (Time.GetUtcNow() < _detailsUntil) { _detailsUntil = default; Render(); return Task.CompletedTask; }
        var page = HealthCatalog.Find(ProviderId)!.PageUrl;
        if (s.Open(page)) _b.SetFlash("OPENED");
        else _b.SetFlash("SAFE MODE", bad: true);
        Render();
        return Task.CompletedTask;
    }

    protected override Task OnKeyLongPressAsync(KeyDownEvent e)
    {
        if (_b?.S is not { } s) return Task.CompletedTask;
        _detailsUntil = Time.GetUtcNow() + DetailsTime;
        s.Health.RequestRefresh(ProviderId);
        Render();
        return Task.CompletedTask;
    }

    protected override PiForm? DescribeForm() => Ai2Pi.HealthGlobals(new PiForm()
            .Heading("Provider")
            .Select("provider", "Provider", Ai2Pi.ProviderOptions)
            .Info("Keys", "Press: open the status page. Hold: the components that matter, and a re-check."))
        .Button("health.refresh", "Check now");

    protected override object? DescribeState() => _b?.S is { } s ? Ai2Pi.State(s) : null;

    protected override async Task<object?> OnPiMessageAsync(string type, JsonNode? data)
    {
        var r = await Ai2Pi.HandleAsync(_b?.S, type, data, [ProviderId]).ConfigureAwait(false);
        if (type == "health.refresh" && r is not null) Post(() => SendToPropertyInspector("pi.state", r));
        return r;
    }

    private void Render()
    {
        if (_b?.S is not { } s) { SetImage(Ai2Binding.OfflineKey(Theme)); return; }
        _b.Expire();
        var now = Time.GetUtcNow();
        var view = s.Health.Get(ProviderId, now)!;
        SetImage(now < _detailsUntil ? HealthArt.Details(Theme, view, now) : HealthArt.Key(Theme, view, now, _b.Flash, _b.FlashBad));
    }

    public void Dispose()
    {
        _b?.Dispose();
        _b = null;
    }
}

public sealed class HealthStripSettings
{
    /// <summary>The providers shown, in order (empty = all eight).</summary>
    public List<string> Providers { get; set; } = [];
}

/// <summary>
/// The health strip on a Galleon widget (all eight providers, 4×2, status glyphs) or a Stream Deck + segment (2×2 with words, the page follows the selection).
/// Turn = select a provider (Galleon ±12 ticks: one provider per tick, wrapping). Push = open its status page. S+ extras: tap a cell
/// to open its page; hold the dial to re-check now.
/// </summary>
[StreamDeckAction(Ai2Ids.HealthStrip, Name = "AI Health Strip", Controllers = Controllers.Encoder,
    Tooltip = "Every AI provider's status at a glance. Turn to pick one, push to open its status page.",
    Icon = "imgs/actions/ai/healthstrip/icon", KeyImage = "imgs/actions/ai/healthstrip/key", Layout = Layouts.Canvas.Path,
    TriggerRotate = "Select provider", TriggerPush = "Open status page", TriggerTouch = "Open the tapped provider", TriggerLongTouch = "Open")]
public sealed class HealthStripAction : DialAction<HealthStripSettings>, IDisposable
{
    private Ai2Binding? _b;
    private int _selected;

    public int Rows => Device.IsGalleon ? 4 : 2;

    public static IReadOnlyList<string> Resolve(IEnumerable<string>? ids)
    {
        var list = (ids ?? []).Select(i => HealthCatalog.Find(i)?.Id).Where(i => i is not null).Select(i => i!).Distinct().ToList();
        return list.Count == 0 ? HealthCatalog.DefaultOrder : list;
    }

    public IReadOnlyList<string> Ids => Resolve(Settings.Providers);

    protected override Task OnWillAppearAsync(WillAppearEvent e)
    {
        DefaultPriority = UpdatePriority.Background;
        SetFeedbackLayout(Layouts.Canvas.Path);
        _b = new Ai2Binding(this, Render);
        if (_b.Bind(Services)) _b.Lease(_b.S!.Health.Demand(Ids));
        StartRenderLoop(Render, TimeSpan.FromSeconds(10), TimeSpan.FromMilliseconds(100));
        Render();
        return Task.CompletedTask;
    }

    protected override Task OnWillDisappearAsync(WillDisappearEvent e)
    {
        Dispose();
        return Task.CompletedTask;
    }

    protected override Task OnSettingsChangedAsync(HealthStripSettings settings)
    {
        if (_b?.S is { } s) _b.Lease(s.Health.Demand(Ids));
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

    protected override Task OnDialPressAsync(DialUpEvent e) => OpenAsync(_selected);

    protected override Task OnTouchTapAsync(TouchTapEvent e)
    {
        var perPage = 2 * Rows;
        var start = _selected / perPage * perPage;
        var col = e.X < 100 ? 0 : 1;
        var row = Math.Clamp((int)((e.Y - 22) / (72.0 / Rows)), 0, Rows - 1);
        var idx = start + row * 2 + col;
        if (idx < Ids.Count) _selected = idx;
        return OpenAsync(_selected);
    }

    protected override Task OnDialLongPressAsync(DialDownEvent e)
    {
        if (_b?.S is not { } s) return Task.CompletedTask;
        var any = Ids.Select(s.Health.RequestRefresh).ToList().Any(x => x);
        _b.SetFlash(any ? "CHECKING" : "UP TO DATE");
        Render();
        return Task.CompletedTask;
    }

    private Task OpenAsync(int index)
    {
        if (_b?.S is not { } s) { ShowAlert(); return Task.CompletedTask; }
        var p = HealthCatalog.Find(Ids[Math.Clamp(index, 0, Ids.Count - 1)])!;
        _b.SetFlash(s.Open(p.PageUrl) ? $"OPENED {p.Short}" : "SAFE MODE", bad: s.SafeMode);
        Render();
        return Task.CompletedTask;
    }

    protected override PiForm? DescribeForm() => Ai2Pi.HealthGlobals(new PiForm()
            .Heading("Strip")
            .MultiSelect("providers", "Providers (none checked = all)", Ai2Pi.ProviderOptions, ordered: true, max: 8)
            .Info("Controls", "Turn to pick a provider, push to open its status page. Stream Deck +: tap a cell to open it; hold the dial to check now."))
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
        SetFeedback(new Feedback().Pixmap(Layouts.Canvas.Frame, HealthArt.Strip(Theme, views, _selected, Device.IsGalleon, now, _b.Flash)));
    }

    public void Dispose()
    {
        _b?.Dispose();
        _b = null;
    }
}
