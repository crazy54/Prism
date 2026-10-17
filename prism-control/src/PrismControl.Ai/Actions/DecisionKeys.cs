using System.Text.Json.Nodes;
using PrismControl.Ai.Approvals;
using PrismControl.Ai.Art;
using PrismControl.Ai.Sessions;
using PrismControl.Core.Actions;
using PrismControl.Core.Scheduling;

namespace PrismControl.Ai.Actions;

/// <summary>
/// Approve: the ONLY way an allow is ever produced (ai-apps.md §6). A physical keyDown binds the gesture to the request
/// shown at that moment; holding the key for the threshold (default 1.2 s, 0.8–3 s) approves while it is still held;
/// releasing early cancels. The broker re-validates everything at the threshold: same request, nothing changed during the
/// hold, details visible on this device for ≥ 600 ms before the keyDown, not Private, not an unknown session.
/// Disabled in multi-actions (it never registers there and refuses the gesture). No dial, touch, PI message or deep link
/// reaches it. Pulses (2 Hz) while a request is approvable, so the user never has to switch Galleon layers to act.
/// </summary>
[StreamDeckAction(AiIds.Approve, Name = "Approve (Hold)", Controllers = Controllers.Keypad,
    Tooltip = "Hold to allow the AI permission request shown on the approval card. Release early to cancel.",
    Icon = "imgs/actions/ai/approve/icon", KeyImage = "imgs/actions/ai/approve/key", PropertyInspector = AiIds.PropertyInspector,
    SupportedInMultiActions = false)]
public sealed class ApproveKeyAction : KeyAction, IDisposable
{
    private AiBinding? _b;
    private HoldTicket? _ticket;
    private ITimer? _holdTimer;
    private long _holdStart;
    private bool _held;

    protected override Task OnWillAppearAsync(WillAppearEvent e)
    {
        DefaultPriority = UpdatePriority.Normal;
        ActiveWindow = TimeSpan.FromSeconds(3.5);   // the progress ring stays at the interactive rate for the longest hold (3 s)
        _b = new AiBinding(this, Render);
        if (_b.Bind(Services)) _b.S!.Presence.Register(Context, SurfaceKind.Approve, Device.Id, IsInMultiAction);
        StartRenderLoop(Render, TimeSpan.FromMilliseconds(500), TimeSpan.FromMilliseconds(33));
        Render();
        return Task.CompletedTask;
    }

    protected override Task OnWillDisappearAsync(WillDisappearEvent e)
    {
        Dispose();
        return Task.CompletedTask;
    }

    protected override Task OnKeyDownAsync(KeyDownEvent e)
    {
        _held = true;
        if (_b?.S is not { } s) return Task.CompletedTask;
        _b.NoteInput();
        var (ticket, block) = s.Approvals.BeginApproveHold(Context, Device.Id, IsInMultiAction || e.IsInMultiAction);
        if (ticket is null)
        {
            if (block != ApproveBlock.NoRequest) ShowAlert();
            _b.SetFlash(AiKeyArt.BlockLabel(block), bad: true, TimeSpan.FromSeconds(1.2));
            Render();
            return Task.CompletedTask;
        }
        _ticket = ticket;
        _holdStart = Time.GetTimestamp();
        var hold = s.Settings.Current.HoldDuration;
        _holdTimer?.Dispose();
        _holdTimer = Time.CreateTimer(_ => Post(OnThreshold), null, hold, Timeout.InfiniteTimeSpan);
        Render();
        return Task.CompletedTask;
    }

    /// <summary>The threshold fired. Approve only if the same physical press is still down.</summary>
    private void OnThreshold()
    {
        if (_b?.S is not { } s || _ticket is not { } t) return;
        _ticket = null;
        if (!_held)
        {
            s.Approvals.CancelHold(t);
            return;
        }
        var outcome = s.Approvals.CompleteApproveHold(t);
        if (outcome == ApproveBlock.None)
        {
            _b.SetFlash("ALLOWED", bad: false);
            ShowOk();
        }
        else
        {
            _b.SetFlash(AiKeyArt.BlockLabel(outcome), bad: true);
            ShowAlert();
        }
        Render();
    }

    protected override Task OnKeyUpAsync(KeyUpEvent e)
    {
        _held = false;
        _holdTimer?.Dispose();
        _holdTimer = null;
        if (_ticket is { } t && _b?.S is { } s)
        {
            s.Approvals.CancelHold(t);
            _b.SetFlash("HOLD LONGER", bad: true, TimeSpan.FromSeconds(1));
        }
        _ticket = null;
        Render();
        return Task.CompletedTask;
    }

    protected override Task<object?> OnPiMessageAsync(string type, JsonNode? data) => AiPi.HandleAsync(_b?.S, type, data);

    private void Render()
    {
        if (_b?.S is not { } s) { SetImage(AiBinding.Offline(Theme)); return; }
        _b.Expire();
        var hold = s.Settings.Current.HoldDuration;
        double? progress = null;
        if (_ticket is { } t)
        {
            if (!s.Approvals.IsHoldValid(t))
            {
                // The shown request changed during the hold: abort now, visibly.
                s.Approvals.CancelHold(t);
                _ticket = null;
                _holdTimer?.Dispose();
                _holdTimer = null;
                _b.SetFlash("CHANGED", bad: true);
                ShowAlert();
            }
            else progress = Time.GetElapsedTime(_holdStart).TotalSeconds / hold.TotalSeconds;
        }
        var block = IsInMultiAction ? ApproveBlock.MultiAction : s.Approvals.ApproveState(Device.Id);
        SetImage(AiKeyArt.Approve(Theme, block, progress, _b.PulseOn, _b.Flash, _b.FlashBad, hold));
    }

    public void Dispose()
    {
        _holdTimer?.Dispose();
        _holdTimer = null;
        if (_b?.S is { } s)
        {
            if (_ticket is { } t) s.Approvals.CancelHold(t);
            s.Presence.Unregister(Context);
        }
        _ticket = null;
        _b?.Dispose();
        _b = null;
    }
}

/// <summary>
/// Deny: the safe direction is easy. A press denies the request shown at keyDown ("Denied from Stream Deck"); holding past
/// the threshold denies and stops the agent (interrupt: Claude only; Codex reserves it, so it gets a plain deny). Works in
/// Private mode and for unknown sessions. Multi-action copies never decide anything.
/// </summary>
[StreamDeckAction(AiIds.Deny, Name = "Deny", Controllers = Controllers.Keypad,
    Tooltip = "Press to deny the AI permission request. Hold to deny and stop the agent (Claude Code).",
    Icon = "imgs/actions/ai/deny/icon", KeyImage = "imgs/actions/ai/deny/key", PropertyInspector = AiIds.PropertyInspector,
    SupportedInMultiActions = false)]
public sealed class DenyKeyAction : KeyAction, IDisposable
{
    private AiBinding? _b;
    private HoldTicket? _ticket;
    private ITimer? _holdTimer;
    private long _holdStart;
    private bool _held;

    protected override Task OnWillAppearAsync(WillAppearEvent e)
    {
        ActiveWindow = TimeSpan.FromSeconds(3.5);
        _b = new AiBinding(this, Render);
        if (_b.Bind(Services)) _b.S!.Presence.Register(Context, SurfaceKind.Deny, Device.Id, IsInMultiAction);
        StartRenderLoop(Render, TimeSpan.FromMilliseconds(500), TimeSpan.FromMilliseconds(33));
        Render();
        return Task.CompletedTask;
    }

    protected override Task OnWillDisappearAsync(WillDisappearEvent e)
    {
        Dispose();
        return Task.CompletedTask;
    }

    protected override Task OnKeyDownAsync(KeyDownEvent e)
    {
        _held = true;
        if (_b?.S is not { } s) return Task.CompletedTask;
        _b.NoteInput();
        _ticket = s.Approvals.BeginDeny(Context, Device.Id, IsInMultiAction || e.IsInMultiAction);
        if (_ticket is null) { Render(); return Task.CompletedTask; }
        _ticketIsClaude = s.Approvals.Selected()?.Tool == AgentKind.Claude;
        _holdStart = Time.GetTimestamp();
        _holdTimer?.Dispose();
        _holdTimer = Time.CreateTimer(_ => Post(() => Finish(interrupt: true)), null, s.Settings.Current.HoldDuration, Timeout.InfiniteTimeSpan);
        Render();
        return Task.CompletedTask;
    }

    protected override Task OnKeyUpAsync(KeyUpEvent e)
    {
        _held = false;
        _holdTimer?.Dispose();
        _holdTimer = null;
        if (_ticket is not null) Finish(interrupt: false);
        return Task.CompletedTask;
    }

    private void Finish(bool interrupt)
    {
        if (_b?.S is not { } s || _ticket is not { } t) return;
        if (interrupt && !_held) return;
        _ticket = null;
        var r = s.Approvals.CompleteDeny(t, interrupt);
        if (r == ApproveBlock.None)
        {
            _b.SetFlash(interrupt && _ticketIsClaude ? "STOPPED" : "DENIED", bad: false);
            ShowOk();
        }
        else
        {
            _b.SetFlash(AiKeyArt.BlockLabel(r), bad: true);
            ShowAlert();
        }
        Render();
    }

    private bool _ticketIsClaude;

    protected override Task<object?> OnPiMessageAsync(string type, JsonNode? data) => AiPi.HandleAsync(_b?.S, type, data);

    private void Render()
    {
        if (_b?.S is not { } s) { SetImage(AiBinding.Offline(Theme)); return; }
        _b.Expire();
        var selected = s.Approvals.Selected();
        double? progress = null;
        if (_ticket is { } t)
        {
            if (!s.Approvals.IsHoldValid(t))
            {
                s.Approvals.CancelHold(t);
                _ticket = null;
                _holdTimer?.Dispose();
                _holdTimer = null;
                _b.SetFlash("CHANGED", bad: true);
                ShowAlert();
            }
            else if (selected?.Tool == AgentKind.Claude)
            {
                var p = Time.GetElapsedTime(_holdStart).TotalSeconds / s.Settings.Current.HoldDuration.TotalSeconds;
                if (p > 0.25) progress = p;   // a quick press never shows the stop ring
            }
        }
        var enabled = selected is not null && !IsInMultiAction && !s.SafeMode;
        SetImage(AiKeyArt.Deny(Theme, enabled, selected?.Tool == AgentKind.Claude, progress, _b.Flash, _b.FlashBad));
    }

    public void Dispose()
    {
        _holdTimer?.Dispose();
        _holdTimer = null;
        if (_b?.S is { } s)
        {
            if (_ticket is { } t) s.Approvals.CancelHold(t);
            s.Presence.Unregister(Context);
        }
        _ticket = null;
        _b?.Dispose();
        _b = null;
    }
}

/// <summary>
/// Privacy / ON AIR: press toggles ON AIR, which forces Private (no aliases, workspaces, commands or titles on any key) and
/// lights a red "ON AIR" face. It only ever tightens privacy: Reveal is chosen in the settings page, never from a key.
/// </summary>
[StreamDeckAction(AiIds.Privacy, Name = "Privacy / On Air", Controllers = Controllers.Keypad,
    Tooltip = "Press for ON AIR: hides every alias, workspace and command on the deck while you stream.",
    Icon = "imgs/actions/ai/privacy/icon", KeyImage = "imgs/actions/ai/privacy/key", PropertyInspector = AiIds.PropertyInspector)]
public sealed class PrivacyKeyAction : KeyAction, IDisposable
{
    private AiBinding? _b;

    protected override Task OnWillAppearAsync(WillAppearEvent e)
    {
        _b = new AiBinding(this, Render);
        _b.Bind(Services);
        Render();
        return Task.CompletedTask;
    }

    protected override Task OnWillDisappearAsync(WillDisappearEvent e)
    {
        Dispose();
        return Task.CompletedTask;
    }

    protected override Task OnKeyPressAsync(KeyUpEvent e)
    {
        if (_b?.S is not { } s) { ShowAlert(); return Task.CompletedTask; }
        s.Settings.Update(x => { x.OnAir = !x.OnAir; return x; });
        Render();
        return Task.CompletedTask;
    }

    protected override Task<object?> OnPiMessageAsync(string type, JsonNode? data) => AiPi.HandleAsync(_b?.S, type, data);

    private void Render()
    {
        if (_b?.S is not { } s) { SetImage(AiBinding.Offline(Theme)); return; }
        SetImage(AiKeyArt.Privacy(Theme, s.Settings.Current));
    }

    public void Dispose()
    {
        _b?.Dispose();
        _b = null;
    }
}
