using System.Text.Json.Nodes;
using PrismControl.Ai.Art;
using PrismControl.Ai.Sessions;
using PrismControl.Core.Actions;
using PrismControl.Core.PropertyInspector;
using PrismControl.Core.Scheduling;

namespace PrismControl.Ai.Actions;

public sealed class SessionKeySettings
{
    /// <summary>Which fleet slot this key shows (1–24). Slots, not session ids, so a profile works every day.</summary>
    public int Slot { get; set; } = 1;
}

/// <summary>
/// A fleet slot key: state color + glyph, agent, alias, elapsed time, and a 2 Hz "needs you" ring.
/// Press = jump to the session (window focus; WT tab by title as a labeled best effort; vscode:// for VS Code sessions).
/// Long-press (500 ms) = pin / unpin the session to this key. Never decides an approval.
/// </summary>
[StreamDeckAction(AiIds.Session, Name = "Agent Session", Controllers = Controllers.Keypad,
    Tooltip = "One AI agent session: its state, agent and elapsed time. Press to jump to it; hold to pin it here.",
    Icon = "imgs/actions/ai/session/icon", KeyImage = "imgs/actions/ai/session/key", PropertyInspector = AiIds.PropertyInspector)]
public sealed class SessionKeyAction : KeyAction<SessionKeySettings>, IDisposable
{
    private AiBinding? _b;

    private int Slot => Math.Clamp(Settings.Slot, 1, SlotTable.MaxSlots);

    protected override Task OnWillAppearAsync(WillAppearEvent e)
    {
        DefaultPriority = UpdatePriority.Background;
        _b = new AiBinding(this, Render);
        _b.Bind(Services);
        StartRenderLoop(Render, TimeSpan.FromMilliseconds(500));
        Render();
        return Task.CompletedTask;
    }

    protected override Task OnWillDisappearAsync(WillDisappearEvent e)
    {
        Dispose();
        return Task.CompletedTask;
    }

    protected override Task OnSettingsChangedAsync(SessionKeySettings settings)
    {
        Render();
        return Task.CompletedTask;
    }

    protected override async Task OnKeyPressAsync(KeyUpEvent e)
    {
        if (_b?.S is not { } s) { ShowAlert(); return; }
        var view = s.Sessions.BySlot(Slot, s.Privacy);
        if (view is null) { ShowAlert(); return; }
        var result = await s.Jumper.JumpAsync(view, CancellationToken.None).ConfigureAwait(false);
        _b.SetFlash(result.Label, !result.Succeeded);
        if (!result.Succeeded) ShowAlert();
        Render();
    }

    protected override Task OnKeyLongPressAsync(KeyDownEvent e)
    {
        if (_b?.S is not { } s) return Task.CompletedTask;
        var pinned = s.Sessions.TogglePin(Slot);
        if (pinned is null) ShowAlert();
        else
        {
            _b.SetFlash(pinned.Value ? "PINNED" : "UNPINNED", false);
            ShowOk();
        }
        Render();
        return Task.CompletedTask;
    }

    protected override PiForm? DescribeForm() => new PiForm()
        .Heading("Session key")
        .Select("slot", "Slot", Enumerable.Range(1, SlotTable.MaxSlots).Select(i => (i.ToString(System.Globalization.CultureInfo.InvariantCulture), $"Slot {i}")))
        .Info("Tip", "Press to jump to the session. Hold to pin the session to this key.");

    protected override Task<object?> OnPiMessageAsync(string type, JsonNode? data) => AiPi.HandleAsync(_b?.S, type, data);

    private void Render()
    {
        if (_b?.S is not { } s) { SetImage(AiBinding.Offline(Theme)); return; }
        _b.Expire();
        var view = s.Sessions.BySlot(Slot, s.Privacy);
        SetImage(AiKeyArt.Session(Theme, new SessionKeyModel(Slot, view, s.Time.GetUtcNow(), _b.PulseOn, _b.Flash, _b.FlashBad)));
    }

    public void Dispose()
    {
        _b?.Dispose();
        _b = null;
    }
}

/// <summary>
/// "Next needs me": a count of sessions that need you, and a press that jumps to the oldest one in NeedsPermission, then
/// NeedsInput, then Error. Never decides an approval.
/// </summary>
[StreamDeckAction(AiIds.Next, Name = "Next Needs Me", Controllers = Controllers.Keypad,
    Tooltip = "How many AI sessions need you. Press to jump to the one that has waited longest.",
    Icon = "imgs/actions/ai/next/icon", KeyImage = "imgs/actions/ai/next/key", PropertyInspector = AiIds.PropertyInspector)]
public sealed class NextNeedsMeAction : KeyAction, IDisposable
{
    private AiBinding? _b;

    protected override Task OnWillAppearAsync(WillAppearEvent e)
    {
        DefaultPriority = UpdatePriority.Background;
        _b = new AiBinding(this, Render);
        _b.Bind(Services);
        StartRenderLoop(Render, TimeSpan.FromSeconds(1));
        Render();
        return Task.CompletedTask;
    }

    protected override Task OnWillDisappearAsync(WillDisappearEvent e)
    {
        Dispose();
        return Task.CompletedTask;
    }

    protected override async Task OnKeyPressAsync(KeyUpEvent e)
    {
        if (_b?.S is not { } s) { ShowAlert(); return; }
        var next = s.Sessions.NextNeedsMe(s.Privacy);
        if (next is null) { _b.SetFlash("ALL CLEAR", false); Render(); return; }
        var result = await s.Jumper.JumpAsync(next, CancellationToken.None).ConfigureAwait(false);
        _b.SetFlash(result.Label, !result.Succeeded);
        if (!result.Succeeded) ShowAlert();
        Render();
    }

    protected override Task<object?> OnPiMessageAsync(string type, JsonNode? data) => AiPi.HandleAsync(_b?.S, type, data);

    private void Render()
    {
        if (_b?.S is not { } s) { SetImage(AiBinding.Offline(Theme)); return; }
        _b.Expire();
        var all = s.Sessions.Snapshot(s.Privacy);
        SetImage(AiKeyArt.Next(Theme, s.Sessions.NextNeedsMe(s.Privacy), all.Count(v => v.NeedsYou), s.Time.GetUtcNow(), _b.Flash, _b.FlashBad));
    }

    public void Dispose()
    {
        _b?.Dispose();
        _b = null;
    }
}
