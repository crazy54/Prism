using PrismControl.Desktop.Sight;

namespace PrismControl.Sight.Control;

/// <summary>What a gesture is being used for (which deck event kinds fit it).</summary>
public enum GestureUse
{
    /// <summary>Click an on-screen button: a press (key down/up, dial down/up, touch tap). Never a dial turn.</summary>
    Click,
    /// <summary>Step a control or press step chords: a turn or a press.</summary>
    Adjust,
    /// <summary>A closed loop (push-to-level): a press, not a turn.</summary>
    Drive,
    /// <summary>Start or stop calibration capture: a key press.</summary>
    Calibrate,
}

/// <summary>
/// Validates <see cref="GestureToken"/>s against the gesture registry (<see cref="Gestures"/>): present, minted there for a
/// registered gesture, of a kind that fits the use, not a multi-action step, at most <see cref="MaxAge"/> after the
/// gesture's RECORDED arrival (and not from the future), within the per-gesture cap, and never used before (one-shot
/// across every guard). The only door from the deck to input.
/// </summary>
public sealed class GestureGuard(TimeProvider time, TimeSpan? maxAge = null)
{
    private long _accepted, _rejected;

    /// <summary>At most <see cref="Gestures.MaxAge"/> (1 s): a guard can be stricter, never looser.</summary>
    public TimeSpan MaxAge { get; } = maxAge is { } m && m < Gestures.MaxAge ? m : Gestures.MaxAge;
    public long Accepted => Interlocked.Read(ref _accepted);
    public long Rejected => Interlocked.Read(ref _rejected);

    public static bool Fits(GestureKind kind, GestureUse use) => use switch
    {
        GestureUse.Click => kind is GestureKind.KeyDown or GestureKind.KeyUp or GestureKind.DialDown or GestureKind.DialUp or GestureKind.TouchTap,
        GestureUse.Adjust => kind is GestureKind.DialRotate or GestureKind.KeyDown or GestureKind.KeyUp or GestureKind.TouchTap,
        GestureUse.Drive => kind is GestureKind.KeyDown or GestureKind.KeyUp or GestureKind.DialDown or GestureKind.DialUp or GestureKind.TouchTap,
        GestureUse.Calibrate => kind is GestureKind.KeyDown or GestureKind.KeyUp,
        _ => false,
    };

    /// <summary>Accepts (and consumes) the token, or says why not. Thread-safe; a token is accepted at most once.</summary>
    public bool TryAccept(GestureToken? token, GestureUse use, out string reason)
    {
        if (token is null) return Reject("no gesture: Sight acts only on a deck press or turn", out reason);
        if (!Gestures.IsRegistered(token)) return Reject("not a registered deck gesture", out reason);
        if (!Fits(token.Kind, use)) return Reject($"a {token.Kind} gesture cannot {use.ToString().ToLowerInvariant()}", out reason);
        if (token.Gesture.InMultiAction) return Reject("a multi-action step is not a direct deck press", out reason);
        var now = time.GetUtcNow();
        // Age is measured from the gesture's recorded arrival: a macro's later steps, a queued handler or a copied event
        // cannot outlive the press.
        var age = now - token.Gesture.ArrivedAt;
        if (age > MaxAge) return Reject($"the gesture is {age.TotalMilliseconds:F0} ms old (max {MaxAge.TotalMilliseconds:F0})", out reason);
        if (age < TimeSpan.FromMilliseconds(-50)) return Reject("the gesture is from the future", out reason);
        if (token.Sequence > Gestures.MaxTokens) return Reject($"more than {Gestures.MaxTokens} actions from one deck gesture", out reason);
        if (!Gestures.Consume(token)) return Reject("the gesture was already used", out reason);
        Interlocked.Increment(ref _accepted);
        reason = "ok";
        return true;
    }

    private bool Reject(string why, out string reason)
    {
        Interlocked.Increment(ref _rejected);
        reason = why;
        return false;
    }
}
