using System.Text.Json.Nodes;
using PrismControl.Ai.Approvals;
using PrismControl.Ai.Art;
using PrismControl.Ai.Sessions;
using PrismControl.Core.Actions;
using PrismControl.Core.Layouts;
using PrismControl.Core.Scheduling;

namespace PrismControl.Ai.Actions;

/// <summary>
/// The card's native text for a request (review M2): the display plan's exact text (<see cref="ApprovalText.Plan"/>) laid out over
/// the layout's three lines with MEASURED worst-case widths (<see cref="CardFit"/>), never a character count.
/// </summary>
public static class CardText
{
    /// <summary>The three lines to draw and what the card shows of the request (None = all of it: Approve may arm).</summary>
    public static (string Line1, string Line2, string Line3, DetailsLock Shown) Lay(ApprovalView? r)
    {
        if (r is not { DetailsComplete: true, Known: true }) return ("", "", "", DetailsLock.Hidden);
        var plan = r.Plan;
        if (plan.Lock != DetailsLock.None) return ("", "", "", plan.Lock);
        var (lines, complete) = CardFit.Lay(plan.Text);
        var l = lines.ToList();
        if (!complete)
        {
            // Too long: show what fits and mark the cut (the native item ellipsizes the last line); Approve stays locked.
            while (l.Count < CardFit.Lines) l.Add("");
            l[^1] += " …";
        }
        while (l.Count < CardFit.Lines) l.Add("");
        return (l[0], l[1], l[2], complete ? DetailsLock.None : DetailsLock.TooLong);
    }
}

/// <summary>
/// The approval request details: a Galleon screen widget, a Stream Deck + strip segment, or (keys-only decks) a details key.
/// Shows agent alias + hue, tool, the bounded command summary (Reveal only; native text so "-r" and "-R" stay distinct),
/// permission mode, a countdown and what the keys do. It reports what it shows to the broker: Approve works only while
/// complete details have been on screen, on the same device, for at least 600 ms.
/// Turn = next pending request (aborts a running hold); push / touch / key press = "review in terminal": answers "no
/// decision" at once so the agent's own prompt appears, and jumps there. This action can never approve.
/// </summary>
[StreamDeckAction(AiIds.Request, Name = "Approval Card", Controllers = Controllers.Encoder | Controllers.Keypad,
    Tooltip = "The pending AI permission request. Turn to see the next one; push to review it in the terminal.",
    Icon = "imgs/actions/ai/request/icon", KeyImage = "imgs/actions/ai/request/key", Layout = AiIds.CardLayout,
    TriggerRotate = "Next request", TriggerPush = "Review in terminal", TriggerTouch = "Review in terminal", TriggerLongTouch = "Review in terminal",
    PropertyInspector = AiIds.PropertyInspector)]
public sealed class RequestCardAction : DialAction, IDisposable
{
    private AiBinding? _b;

    protected override Task OnWillAppearAsync(WillAppearEvent e)
    {
        DefaultPriority = UpdatePriority.Normal;
        if (IsDial) SetFeedbackLayout(AiIds.CardLayout);
        _b = new AiBinding(this, Render);
        if (_b.Bind(Services)) _b.S!.Presence.Register(Context, SurfaceKind.Details, Device.Id, IsInMultiAction);
        StartRenderLoop(Render, TimeSpan.FromMilliseconds(500), TimeSpan.FromMilliseconds(100));
        Render();
        return Task.CompletedTask;
    }

    protected override Task OnWillDisappearAsync(WillDisappearEvent e)
    {
        Dispose();
        return Task.CompletedTask;
    }

    protected override Task OnDialRotateAsync(DialRotateEvent e)
    {
        _b?.NoteInput();
        _b?.S?.Approvals.Select(Math.Sign(e.Ticks));
        Render();
        return Task.CompletedTask;
    }

    protected override Task OnDialPressAsync(DialUpEvent e) => ReviewAsync();
    protected override Task OnTouchTapAsync(TouchTapEvent e) => ReviewAsync();
    protected override Task OnKeyPressAsync(KeyUpEvent e) => ReviewAsync();

    /// <summary>"Review in terminal": no decision now (the agent's own prompt takes over), then jump to the session.</summary>
    private async Task ReviewAsync()
    {
        if (_b?.S is not { } s || IsInMultiAction) return;
        _b.NoteInput();
        var key = s.Approvals.ReviewInTerminal();
        if (key is null) { Render(); return; }
        var view = s.Sessions.Find(key.Value, s.Privacy);
        var r = await s.Jumper.JumpAsync(view, CancellationToken.None).ConfigureAwait(false);
        if (!r.Succeeded) ShowAlert();
        Render();
    }

    protected override Task<object?> OnPiMessageAsync(string type, JsonNode? data) => AiPi.HandleAsync(_b?.S, type, data);

    private void Render()
    {
        if (_b?.S is not { } s)
        {
            if (IsKey) SetImage(AiBinding.Offline(Theme));
            return;
        }
        var now = s.Time.GetUtcNow();
        var r = s.Approvals.Selected();
        if (r is not null) s.LastRequestAt = r.CreatedAt;
        // Review L4: while a request is pending the card is served first (interactive priority), so what it reports as shown
        // reaches the device within the broker's display-latency allowance.
        DefaultPriority = r is null ? UpdatePriority.Normal : UpdatePriority.Interactive;
        var session = r is null ? null : s.Sessions.Find(r.Session, s.Privacy);
        DetailsLock shown;
        if (IsDial)
        {
            var approveVisible = s.Presence.DevicesWith(SurfaceKind.Approve).Contains(Device.Id);
            var (l1, l2, l3, lockState) = CardText.Lay(r);
            shown = lockState;
            var canvas = AiDialArt.Card(Theme, r, session, now, _b.PulseOn, s.LastRequestAt, approveVisible, shown);
            // Native text in the theme's ink (the layout's default color is Night's): legible on Day too.
            SetFeedback(new Feedback().Pixmap("canvas", canvas)
                .Text("line1", l1, color: Theme.KeyInk).Text("line2", l2, color: Theme.KeyInk).Text("line3", l3, color: Theme.KeyInk));
        }
        else
        {
            var (doc, lockState) = AiKeyArt.Details(Theme, r, session, now, _b.PulseOn);
            shown = r is { DetailsComplete: true, Known: true } ? lockState : DetailsLock.Hidden;
            SetImage(doc);
        }
        // What this surface shows right now (the 600 ms clock restarts when it changes). Multi-action copies never count.
        if (!IsInMultiAction) s.Approvals.ReportShown(Context, Device.Id, r?.Id, shown == DetailsLock.None, shown);
    }

    public void Dispose()
    {
        if (_b?.S is { } s)
        {
            s.Approvals.ReportHidden(Context);
            s.Presence.Unregister(Context);
        }
        _b?.Dispose();
        _b = null;
    }
}
