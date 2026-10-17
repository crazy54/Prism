using System.Text.Json.Nodes;
using PrismControl.Ai.Art;
using PrismControl.Ai.Hooks;
using PrismControl.Ai.Sessions;
using PrismControl.Core.Actions;
using PrismControl.Core.Art;
using PrismControl.Core.Hosting;
using PrismControl.Core.Render;
using PrismControl.Core.Render.Tokens;

namespace PrismControl.Ai.Actions;

/// <summary>Action UUIDs (prefix com.jeremyfhall.prismcontrol.ai.) and asset paths. Never change a UUID after release.</summary>
public static class AiIds
{
    public const string Prefix = "com.jeremyfhall.prismcontrol.ai.";
    public const string Session = Prefix + "session";
    public const string Next = Prefix + "next";
    public const string Fleet = Prefix + "fleet";
    public const string Request = Prefix + "request";
    public const string Approve = Prefix + "approve";
    public const string Deny = Prefix + "deny";
    public const string Privacy = Prefix + "privacy";

    public const string PropertyInspector = "pi/ai.html";
    public const string CardLayout = "layouts/ai-card.json";

    public static string Icon(string id) => $"imgs/actions/ai/{id}/icon";
    public static string Key(string id) => $"imgs/actions/ai/{id}/key";
}

/// <summary>
/// Composition helper every AI action uses: resolves <see cref="AiServices"/>, counts the action as visible (the pollers run
/// only while some AI action is), re-renders on fleet / approval / settings changes (through the mailbox), and keeps a short
/// flash label ("FOCUSED", "DENIED") on a clock.
/// </summary>
internal sealed class AiBinding : IDisposable
{
    private readonly ActionBase _action;
    private readonly Action _render;
    private Action<FleetUpdate>? _onFleet;
    private Action? _onApprovals;
    private Action<AiSettings>? _onSettings;
    private DateTimeOffset _flashUntil;

    public AiBinding(ActionBase action, Action render)
    {
        _action = action;
        _render = render;
    }

    public AiServices? S { get; private set; }
    public string? Flash { get; private set; }
    public bool FlashBad { get; private set; }

    /// <summary>Raised (in the mailbox) for every fleet update, before the render.</summary>
    public Action<FleetUpdate>? FleetChanged { get; set; }

    public bool Bind(IServiceRegistry services)
    {
        if (!services.TryGet<AiServices>(out var s)) return false;
        S = s;
        if (!_action.IsInMultiAction) s.ActionAppeared();
        _onFleet = u => _action.Post(() => { FleetChanged?.Invoke(u); _render(); });
        _onApprovals = () => _action.Post(_render);
        _onSettings = _ => _action.Post(_render);
        s.Sessions.Changed += _onFleet;
        s.Approvals.Changed += _onApprovals;
        s.Settings.Changed += _onSettings;
        return true;
    }

    public void SetFlash(string label, bool bad, TimeSpan? duration = null)
    {
        if (S is null) return;
        Flash = label;
        FlashBad = bad;
        _flashUntil = S.Time.GetUtcNow() + (duration ?? TimeSpan.FromSeconds(1.5));
    }

    /// <summary>Clears an expired flash; call at the start of each render.</summary>
    public void Expire()
    {
        if (Flash is not null && S is not null && S.Time.GetUtcNow() >= _flashUntil) Flash = null;
    }

    /// <summary>A physical key / dial / touch on this action: the deck is in use (review M5: not "away").</summary>
    public void NoteInput() => S?.Presence.NoteInput(S.Time.GetUtcNow());

    /// <summary>The 2 Hz "needs you" pulse phase.</summary>
    public bool PulseOn => S is not null && S.Time.GetUtcNow().ToUnixTimeMilliseconds() / 500 % 2 == 0;

    public void Dispose()
    {
        if (S is null) return;
        if (_onFleet is not null) S.Sessions.Changed -= _onFleet;
        if (_onApprovals is not null) S.Approvals.Changed -= _onApprovals;
        if (_onSettings is not null) S.Settings.Changed -= _onSettings;
        if (!_action.IsInMultiAction) S.ActionDisappeared();
        S = null;
    }

    /// <summary>The face shown when the AI module did not load.</summary>
    public static SvgDocument Offline(RefractionPalette t)
    {
        var d = KeyArt.Base(t);
        AiText.Draw(d, "AI", 72, 62, 30, t.Faint, TextAlign.Middle, baseline: TextBaseline.Middle);
        AiText.Draw(d, "OFFLINE", 72, 100, 18, t.Dim, TextAlign.Middle);
        return d;
    }

    /// <summary>The dial face shown when the AI module did not load (a dial must always draw something).</summary>
    public static SvgDocument OfflineDial(RefractionPalette t)
    {
        var d = DialArt.Base(t);
        AiText.Draw(d, "AI", 100, 44, 22, t.Faint, TextAlign.Middle, baseline: TextBaseline.Middle);
        AiText.Draw(d, "OFFLINE", 100, 72, 14, t.Dim, TextAlign.Middle);
        return d;
    }
}

/// <summary>
/// The property inspector's Prism-hooks section (pi/ai.html). Read-only previews; the only writes are
/// <c>hooks.apply</c> with the consent token of the preview the user just saw. Nothing here can approve anything.
/// </summary>
internal static class AiPi
{
    /// <summary>Runs off the mailbox (file reads and writes): never blocks the action.</summary>
    public static Task<object?> HandleAsync(AiServices? s, string type, JsonNode? data) =>
        type.StartsWith("hooks.", StringComparison.Ordinal) ? Task.Run(() => Handle(s, type, data)) : Task.FromResult<object?>(null);

    private static async Task<object?> Handle(AiServices? s, string type, JsonNode? data)
    {
        if (s is null) return new { error = "The AI module is not running." };
        var hooks = s.Hooks;
        switch (type)
        {
            case "hooks.status":
            {
                var drift = hooks.CheckDrift();
                return new
                {
                    installed = drift.Installed,
                    drifted = drift.Drifted,
                    safeMode = hooks.SafeMode,
                    files = drift.Files.Select(f => new { kind = f.Kind.ToString(), present = f.Present.Count, missing = f.Missing, readable = f.Readable }),
                    lastEvent = s.Ingress?.Stats.LastEventAt?.ToString("O"),
                    events = s.Ingress?.Stats.Events ?? 0,
                    agentList = s.AgentList?.Status,
                    codexLogs = s.Rollout?.Active ?? false,
                    orca = s.Orca?.Present ?? false,
                    sessions = s.Sessions.Snapshot(PrivacyMode.Private).Count,
                };
            }
            case "hooks.preview": return PlanJson(hooks.Preview());
            case "hooks.previewUninstall": return PlanJson(hooks.PreviewUninstall());
            case "hooks.previewRestore":
                return data?["path"] is JsonValue v && v.TryGetValue<string>(out var path) && hooks.Backups().Contains(path)
                    ? PlanJson(hooks.PreviewRestore(path))
                    : new { error = "Pick one of the listed backups." };
            case "hooks.backups": return hooks.Backups().Select(b => new { value = b, label = Path.GetFileName(b) });
            case "hooks.apply":
            {
                var token = data?["token"] is JsonValue t && t.TryGetValue<string>(out var tok) ? tok : null;
                var r = await hooks.ApplyAsync(token, CancellationToken.None).ConfigureAwait(false);
                return new { ok = r.Ok, message = r.Message, backups = r.Backups.Select(Path.GetFileName) };
            }
            default:
                return null;
        }
    }

    private static object PlanJson(HookPlan p) => new
    {
        action = p.Action,
        canApply = p.CanApply,
        token = p.ConsentToken,
        relay = p.RelayPath,
        relaySha256 = p.RelaySha256,
        notes = p.Notes,
        files = p.Files.Select(f => new
        {
            kind = f.Kind.ToString(),
            path = f.Path,
            exists = f.Exists,
            events = f.EventsToAdd,
            already = f.AlreadyOurs,
            foreign = f.ForeignHandlers,
            refusal = f.Refusal,
        }),
    };
}
