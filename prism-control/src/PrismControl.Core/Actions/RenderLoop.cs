namespace PrismControl.Core.Actions;

/// <summary>
/// A per-instance render timer. Ticks run in the action's mailbox (never concurrently with its event handlers),
/// never pile up (a tick is skipped while the previous one is still queued or running), and switch between
/// <see cref="ActiveInterval"/> (while the user is interacting) and <see cref="IdleInterval"/> (slow polling) on their own.
/// Frames go through the update scheduler, so a fast loop costs CPU but can never flood the Stream Deck app.
/// Create with <see cref="ActionBase.StartRenderLoop"/>; it stops automatically on willDisappear.
/// </summary>
public sealed class RenderLoop : IDisposable
{
    private readonly ActionBase _owner;
    private readonly Func<CancellationToken, Task> _render;
    private readonly ITimer _timer;
    private readonly CancellationTokenSource _cts = new();
    private int _queued;
    private TimeSpan _idle;
    private TimeSpan _active;
    private volatile bool _stopped;

    internal RenderLoop(ActionBase owner, Func<CancellationToken, Task> render, TimeSpan idleInterval, TimeSpan activeInterval, TimeProvider time)
    {
        _owner = owner;
        _render = render;
        _idle = Clamp(idleInterval);
        _active = Clamp(activeInterval);
        _timer = time.CreateTimer(_ => Tick(), null, TimeSpan.Zero, Timeout.InfiniteTimeSpan);
    }

    /// <summary>Interval when nobody is touching the control (e.g. 1 s for stats).</summary>
    public TimeSpan IdleInterval
    {
        get => _idle;
        set { _idle = Clamp(value); Reschedule(); }
    }

    /// <summary>Interval within <see cref="ActionBase.ActiveWindow"/> of the last input (e.g. 33 ms while a dial turns).</summary>
    public TimeSpan ActiveInterval
    {
        get => _active;
        set { _active = Clamp(value); Reschedule(); }
    }

    public bool IsStopped => _stopped;
    public TimeSpan CurrentInterval => _owner.IsInteractive ? _active : _idle;

    /// <summary>Render as soon as possible (coalesced with any queued tick).</summary>
    public void Invalidate()
    {
        if (_stopped) return;
        _timer.Change(TimeSpan.Zero, Timeout.InfiniteTimeSpan);
    }

    internal void OnInput()
    {
        if (_stopped) return;
        // Jump to the active cadence right away.
        _timer.Change(TimeSpan.Zero, Timeout.InfiniteTimeSpan);
    }

    public void Stop()
    {
        if (_stopped) return;
        _stopped = true;
        _cts.Cancel();
        _timer.Dispose();
    }

    public void Dispose() => Stop();

    private void Tick()
    {
        if (_stopped) return;
        if (Interlocked.Exchange(ref _queued, 1) == 1)
        {
            Reschedule();
            return;
        }
        var posted = _owner.Post(async () =>
        {
            try
            {
                if (!_stopped) await _render(_cts.Token).ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (_cts.IsCancellationRequested) { }
            finally
            {
                Volatile.Write(ref _queued, 0);
                Reschedule();
            }
        });
        if (!posted) Volatile.Write(ref _queued, 0);
    }

    private void Reschedule()
    {
        if (_stopped) return;
        try { _timer.Change(CurrentInterval, Timeout.InfiniteTimeSpan); }
        catch (ObjectDisposedException) { }
    }

    private static TimeSpan Clamp(TimeSpan t) => t < TimeSpan.FromMilliseconds(16) ? TimeSpan.FromMilliseconds(16) : t;
}
