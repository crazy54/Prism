using System.Collections.Concurrent;
using PrismControl.Core.Hosting;

namespace PrismControl.Audio;

/// <summary>
/// One dedicated MTA thread that owns every Core Audio COM object and makes every COM call. COM callbacks
/// (audio-service RPC threads) only copy their arguments and <see cref="Post"/> here, so nothing ever registers,
/// unregisters or blocks inside a callback (windows.md §1.5), and the engine's COM state needs no locks.
/// </summary>
internal sealed class ComWorker : IDisposable
{
    private readonly BlockingCollection<Action> _queue = new();
    private readonly Thread _thread;
    private readonly ILog _log;
    private volatile bool _stopped;

    public ComWorker(ILog log, string name = "PrismControl.Audio COM")
    {
        _log = log;
        _thread = new Thread(Run) { IsBackground = true, Name = name };
        _thread.SetApartmentState(ApartmentState.MTA);
        _thread.Start();
    }

    public bool IsCurrentThread => Thread.CurrentThread == _thread;

    /// <summary>Queues work; returns false after shutdown.</summary>
    public bool Post(Action work)
    {
        if (_stopped) return false;
        try { _queue.Add(work); return true; }
        catch (InvalidOperationException) { return false; }
    }

    public Task InvokeAsync(Action work) => InvokeAsync(() => { work(); return true; });

    public Task<T> InvokeAsync<T>(Func<T> work)
    {
        var tcs = new TaskCompletionSource<T>(TaskCreationOptions.RunContinuationsAsynchronously);
        if (IsCurrentThread)
        {
            try { tcs.SetResult(work()); } catch (Exception ex) { tcs.SetException(ex); }
            return tcs.Task;
        }
        if (!Post(() =>
            {
                try { tcs.TrySetResult(work()); }
                catch (Exception ex) { tcs.TrySetException(ex); }
            }))
            tcs.TrySetException(new ObjectDisposedException(nameof(ComWorker)));
        return tcs.Task;
    }

    private void Run()
    {
        foreach (var work in _queue.GetConsumingEnumerable())
        {
            try { work(); }
            catch (Exception ex) { _log.Error("audio worker task failed", ex); }
        }
    }

    /// <summary>Stops accepting work, lets queued work finish (bounded), and ends the thread.</summary>
    public void Stop(TimeSpan timeout)
    {
        if (_stopped) return;
        _stopped = true;
        _queue.CompleteAdding();
        if (!IsCurrentThread) _thread.Join(timeout);
    }

    public void Dispose() => Stop(TimeSpan.FromSeconds(2));
}
