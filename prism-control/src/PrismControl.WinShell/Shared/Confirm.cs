using PrismControl.Core.Actions;

namespace PrismControl.WinShell.Shared;

/// <summary>
/// Hold-to-confirm for keys (spec principle 3, windows.md §1.6): KeyDown starts a 1.5 s hold, the key redraws a filling
/// ring at 10 Hz with the target named, and the action fires only when the ring is full. KeyUp before that cancels.
/// Everything runs in the owner's mailbox (timer ticks are Posted). Call <see cref="Down"/> from OnKeyDownAsync and
/// <see cref="Up"/> from OnKeyUpAsync; ignore OnKeyPressAsync for confirmed actions.
/// </summary>
public sealed class HoldConfirm(ActionBase owner, TimeProvider time, Action redraw, Func<Task> fire) : IDisposable
{
    public static readonly TimeSpan Duration = TimeSpan.FromMilliseconds(1500);
    public static readonly TimeSpan Tick = TimeSpan.FromMilliseconds(100);

    private ITimer? _timer;
    private long _start;
    private int _token;

    public bool IsHolding { get; private set; }
    /// <summary>True from the moment the hold completed until the key is released.</summary>
    public bool Fired { get; private set; }

    /// <summary>0..1 while holding.</summary>
    public double Progress => IsHolding ? Math.Clamp(time.GetElapsedTime(_start).TotalMilliseconds / Duration.TotalMilliseconds, 0, 1) : 0;

    public void Down()
    {
        Stop();
        IsHolding = true;
        Fired = false;
        _start = time.GetTimestamp();
        var token = ++_token;
        _timer = time.CreateTimer(_ => owner.Post(() => OnTickAsync(token)), null, Tick, Tick);
        redraw();
    }

    /// <summary>Returns true if the hold had completed (the action already fired).</summary>
    public bool Up()
    {
        var fired = Fired;
        Stop();
        IsHolding = false;
        Fired = false;
        redraw();
        return fired;
    }

    private async Task OnTickAsync(int token)
    {
        if (token != _token || !IsHolding || Fired) return;
        if (time.GetElapsedTime(_start) >= Duration)
        {
            Fired = true;
            IsHolding = false;
            Stop();
            await fire().ConfigureAwait(false);
        }
        redraw();
    }

    private void Stop()
    {
        _timer?.Dispose();
        _timer = null;
    }

    public void Dispose() => Stop();
}

/// <summary>
/// Arm-then-confirm for dials (Galleon dials never deliver holds): the first push arms for 3 s ("PUSH AGAIN"), a second
/// push within that window fires, otherwise it disarms by itself and redraws.
/// </summary>
public sealed class ArmConfirm(ActionBase owner, TimeProvider time, Action redraw) : IDisposable
{
    public static readonly TimeSpan Window = TimeSpan.FromSeconds(3);

    private ITimer? _timer;
    private long _armedAt;
    private int _token;

    public bool IsArmed { get; private set; }
    public TimeSpan Remaining => IsArmed ? Window - time.GetElapsedTime(_armedAt) : TimeSpan.Zero;

    /// <summary>A push. Returns true when this push confirms (fire now); false when it only armed.</summary>
    public bool Push()
    {
        if (IsArmed && time.GetElapsedTime(_armedAt) <= Window)
        {
            Disarm();
            return true;
        }
        IsArmed = true;
        _armedAt = time.GetTimestamp();
        var token = ++_token;
        _timer?.Dispose();
        _timer = time.CreateTimer(_ => owner.Post(() =>
        {
            if (token != _token || !IsArmed) return;
            Disarm();
            redraw();
        }), null, Window, Timeout.InfiniteTimeSpan);
        return false;
    }

    /// <summary>Turning the dial or a settings change cancels a pending confirmation.</summary>
    public void Disarm()
    {
        IsArmed = false;
        _token++;
        _timer?.Dispose();
        _timer = null;
    }

    public void Dispose() => Disarm();
}

/// <summary>A short status message shown on a key or dial for a while (an outcome after a press), then cleared.</summary>
public sealed class Flash(ActionBase owner, TimeProvider time, Action redraw, TimeSpan? defaultDuration = null) : IDisposable
{
    private ITimer? _timer;
    private int _token;

    public string? Text { get; private set; }
    public bool IsAlert { get; private set; }

    public void Show(string text, bool alert = false, TimeSpan? duration = null)
    {
        Text = text;
        IsAlert = alert;
        var token = ++_token;
        _timer?.Dispose();
        _timer = time.CreateTimer(_ => owner.Post(() =>
        {
            if (token != _token) return;
            Text = null;
            IsAlert = false;
            redraw();
        }), null, duration ?? defaultDuration ?? TimeSpan.FromSeconds(1.6), Timeout.InfiniteTimeSpan);
        redraw();
    }

    public void Clear()
    {
        _token++;
        _timer?.Dispose();
        _timer = null;
        Text = null;
        IsAlert = false;
    }

    public void Dispose() => Clear();
}
