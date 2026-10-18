using System.Collections.Concurrent;
using PrismControl.Core.Hosting;

namespace PrismControl.Audio;

/// <summary>
/// One dedicated MTA thread that owns every Core Audio COM object and makes every COM call. COM callbacks
/// (audio-service RPC threads) only copy their arguments and <see cref="Post"/> here, so nothing ever registers,
/// unregisters or blocks inside a callback (windows.md §1.5), and the engine's COM state needs no locks.
/// <para>
/// The idle thread sleeps on a kernel event, not a spinning wait: meters and the spectrum post work ~30 times a second,
/// and spin-then-block waits (BlockingCollection, SemaphoreSlim, Monitor) would burn ~100 µs of CPU per wake-up.
/// </para>
/// </summary>
internal sealed class ComWorker : IDisposable
{
    private readonly ConcurrentQueue<Action> _queue = new();
    private readonly AutoResetEvent _signal = new(false);
    private readonly object _gate = new();
    private readonly Thread _thread;
    private readonly ILog _log;
    private bool _stopped; // under _gate

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
        lock (_gate)
        {
            if (_stopped) return false;
            _queue.Enqueue(work);
        }
        _signal.Set();
        return true;
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
        while (true)
        {
            while (_queue.TryDequeue(out var work))
            {
                try { work(); }
                catch (Exception ex) { _log.Error("audio worker task failed", ex); }
            }
            lock (_gate)
            {
                // Post enqueues under the same lock, so nothing can slip in after this check.
                if (_stopped && _queue.IsEmpty) return;
            }
            _signal.WaitOne();
        }
    }

    /// <summary>Stops accepting work, lets queued work finish (bounded), and ends the thread.</summary>
    public void Stop(TimeSpan timeout)
    {
        lock (_gate)
        {
            if (_stopped) return;
            _stopped = true;
        }
        _signal.Set();
        if (!IsCurrentThread) _thread.Join(timeout);
    }

    public void Dispose() => Stop(TimeSpan.FromSeconds(2));
}
