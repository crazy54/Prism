using System.Text.Json.Nodes;
using PrismControl.Ai.Art;
using PrismControl.Ai.Sessions;
using PrismControl.Core.Actions;
using PrismControl.Core.Layouts;
using PrismControl.Core.PropertyInspector;
using PrismControl.Core.Scheduling;

namespace PrismControl.Ai.Actions;

public sealed class FleetSettings
{
    /// <summary>The first slot the grid shows (1, 13: a second widget can show slots 13–24).</summary>
    public int FirstSlot { get; set; } = 1;
}

/// <summary>
/// The fleet overview on a Galleon screen widget (12 cells, 6×2) or a Stream Deck + strip segment (8 cells, 4×2):
/// a header of counts, one state-colored cell per slot, a selection ring, a pulsing cell for a pending approval, and a
/// 4 s banner when a session starts needing you. Turn = select; push = jump; touch (S+) = jump to the tapped cell;
/// S+ dial long-press = pin/unpin the selected session. Never decides an approval.
/// </summary>
[StreamDeckAction(AiIds.Fleet, Name = "Agent Fleet", Controllers = Controllers.Encoder,
    Tooltip = "Every AI agent session at a glance. Turn to pick one, push to jump to it.",
    Icon = "imgs/actions/ai/fleet/icon", KeyImage = "imgs/actions/ai/fleet/key", Layout = Layouts.Canvas.Path,
    TriggerRotate = "Select session", TriggerPush = "Jump to it", TriggerTouch = "Jump to the tapped session", TriggerLongTouch = "Jump",
    PropertyInspector = AiIds.PropertyInspector)]
public sealed class FleetDialAction : DialAction<FleetSettings>, IDisposable
{
    public static readonly TimeSpan BannerTime = TimeSpan.FromSeconds(4);
    private AiBinding? _b;
    private int _selected = 1;
    private SessionTransition? _banner;
    private DateTimeOffset _bannerUntil;

    public int Columns => Device.IsGalleon ? 6 : 4;
    public int Cells => Columns * 2;
    private int First => Math.Clamp(Settings.FirstSlot, 1, SlotTable.MaxSlots - Cells + 1);

    protected override Task OnWillAppearAsync(WillAppearEvent e)
    {
        DefaultPriority = UpdatePriority.Background;
        SetFeedbackLayout(Layouts.Canvas.Path);
        _selected = First;
        _b = new AiBinding(this, Render) { FleetChanged = OnFleet };
        _b.Bind(Services);
        StartRenderLoop(Render, TimeSpan.FromMilliseconds(500), TimeSpan.FromMilliseconds(100));
        Render();
        return Task.CompletedTask;
    }

    protected override Task OnWillDisappearAsync(WillDisappearEvent e)
    {
        Dispose();
        return Task.CompletedTask;
    }

    private void OnFleet(FleetUpdate u)
    {
        if (_b?.S is not { } s) return;
        var now = s.Time.GetUtcNow();
        // Only fresh transitions raise the banner (a catch-up of old rollout history must not).
        var t = u.Transitions.LastOrDefault(x => x.IntoNeedsYou && now - x.At < TimeSpan.FromSeconds(5) && x.Slot >= First && x.Slot < First + Cells);
        if (t is null) return;
        _banner = t;
        _bannerUntil = now + BannerTime;
    }

    protected override Task OnDialRotateAsync(DialRotateEvent e)
    {
        _b?.NoteInput();
        // Galleon sends up to ±12 aggregated ticks: treat it as a magnitude, one cell per tick, clamped to the grid.
        var step = Math.Clamp(e.Ticks, -Cells, Cells);
        _selected = First + (((_selected - First + step) % Cells) + Cells) % Cells;
        _banner = null;
        Render();
        return Task.CompletedTask;
    }

    protected override Task OnDialPressAsync(DialUpEvent e) => JumpAsync(_selected);

    protected override Task OnTouchTapAsync(TouchTapEvent e)
    {
        // Map the tap to a cell of the 4×2 grid (y 24–94, x 8–192).
        var col = Math.Clamp((int)((e.X - 8) / (184.0 / Columns)), 0, Columns - 1);
        var row = e.Y < 59 ? 0 : 1;
        _selected = First + row * Columns + col;
        return JumpAsync(_selected);
    }

    protected override Task OnDialLongPressAsync(DialDownEvent e)
    {
        if (_b?.S is not { } s) return Task.CompletedTask;
        var pinned = s.Sessions.TogglePin(_selected);
        if (pinned is null) ShowAlert();
        Render();
        return Task.CompletedTask;
    }

    private async Task JumpAsync(int slot)
    {
        if (_b?.S is not { } s) return;
        var view = s.Sessions.BySlot(slot, s.Privacy);
        if (view is null) { ShowAlert(); Render(); return; }
        var r = await s.Jumper.JumpAsync(view, CancellationToken.None).ConfigureAwait(false);
        if (!r.Succeeded) ShowAlert();
        Render();
    }

    protected override PiForm? DescribeForm() => new PiForm()
        .Heading("Fleet")
        .Select("firstSlot", "First slot", [("1", "Slots 1 and up"), ("9", "Slots 9 and up"), ("13", "Slots 13 and up")])
        .Info("Controls", "Turn to select a session, push to jump to it. Stream Deck +: tap a cell to jump; hold the dial to pin.");

    protected override Task<object?> OnPiMessageAsync(string type, JsonNode? data) => AiPi.HandleAsync(_b?.S, type, data);

    private void Render()
    {
        if (_b?.S is not { } s) { SetFeedback(new Feedback().Pixmap(Layouts.Canvas.Frame, AiBinding.OfflineDial(Theme))); return; }
        var now = s.Time.GetUtcNow();
        if (_banner is not null && now >= _bannerUntil) _banner = null;
        var sessions = s.Sessions.Snapshot(s.Privacy);
        var frame = AiDialArt.Fleet(Theme, sessions, Columns, First, _selected, now, _b.PulseOn, _banner);
        SetFeedback(new Feedback().Pixmap(Layouts.Canvas.Frame, frame));
    }

    public void Dispose()
    {
        _b?.Dispose();
        _b = null;
    }
}
