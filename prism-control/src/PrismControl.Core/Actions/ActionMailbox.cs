using System.Threading.Channels;

namespace PrismControl.Core.Actions;

/// <summary>
/// A per-instance serial work queue. Every event handler, render-loop tick, long-press timer and
/// <see cref="ActionBase.Post"/> callback for one action instance runs here, one at a time, in order,
/// so action code never races with itself. Different instances run concurrently.
/// </summary>
internal sealed class ActionMailbox
{
    private readonly Channel<Func<Task>> _queue = Channel.CreateUnbounded<Func<Task>>(new UnboundedChannelOptions { SingleReader = true });
    private readonly Action<Exception> _onError;
    private readonly Action<TimeSpan>? _onSlow;
    private readonly TaskCompletionSource _completed = new(TaskCreationOptions.RunContinuationsAsynchronously);
    private int _outstanding;
    private TaskCompletionSource _idle = NewIdle(true);

    public ActionMailbox(Action<Exception> onError, Action<TimeSpan>? onSlow = null)
    {
        _onError = onError;
        _onSlow = onSlow;
        _ = Task.Run(PumpAsync);
    }

    public TimeSpan SlowThreshold { get; init; } = TimeSpan.FromSeconds(2);

    public bool Post(Func<Task> work)
    {
        lock (_queue)
        {
            if (Interlocked.Increment(ref _outstanding) == 1 && _idle.Task.IsCompleted) _idle = NewIdle(false);
        }
        if (_queue.Writer.TryWrite(work)) return true;
        Done();
        return false;
    }

    /// <summary>Completes when nothing is queued or running.</summary>
    public Task WhenIdleAsync()
    {
        lock (_queue) return _idle.Task;
    }

    /// <summary>Stops accepting work; queued work still runs. Completes when the pump has drained.</summary>
    public Task CompleteAsync()
    {
        _queue.Writer.TryComplete();
        return _completed.Task;
    }

    private async Task PumpAsync()
    {
        try
        {
            await foreach (var work in _queue.Reader.ReadAllAsync().ConfigureAwait(false))
            {
                var started = System.Diagnostics.Stopwatch.GetTimestamp();
                try { await work().ConfigureAwait(false); }
                catch (Exception ex) { SafeError(ex); }
                finally
                {
                    var elapsed = System.Diagnostics.Stopwatch.GetElapsedTime(started);
                    if (elapsed > SlowThreshold) _onSlow?.Invoke(elapsed);
                    Done();
                }
            }
        }
        finally { _completed.TrySetResult(); }
    }

    private void Done()
    {
        lock (_queue)
        {
            if (Interlocked.Decrement(ref _outstanding) == 0) _idle.TrySetResult();
        }
    }

    private void SafeError(Exception ex)
    {
        try { _onError(ex); } catch { /* never let logging kill the pump */ }
    }

    private static TaskCompletionSource NewIdle(bool completed)
    {
        var t = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        if (completed) t.SetResult();
        return t;
    }
}
