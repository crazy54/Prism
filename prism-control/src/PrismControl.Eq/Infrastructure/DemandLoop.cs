using PrismControl.Core.Hosting;

namespace PrismControl.Eq.Infrastructure;

/// <summary>
/// A background loop that runs only while someone holds a lease (visible actions call <see cref="Acquire"/> in
/// willAppear and dispose it in willDisappear). One loop for the whole plugin, never one per action.
/// </summary>
public sealed class DemandLoop : IAsyncDisposable
{
    private readonly object _gate = new();
    private readonly TimeProvider _time;
    private readonly Func<CancellationToken, Task> _work;
    private readonly Func<TimeSpan> _delay;
    private readonly ILog _log;
    private readonly string _name;
    private readonly CancellationToken _shutdown;
    private int _leases;
    private CancellationTokenSource? _cts;
    private Task? _task;
    private CancellationTokenSource _wake = new();

    public DemandLoop(string name, TimeProvider time, Func<CancellationToken, Task> work, Func<TimeSpan> delay, ILog log, CancellationToken shutdown = default)
    {
        _name = name;
        _time = time;
        _work = work;
        _delay = delay;
        _log = log;
        _shutdown = shutdown;
    }

    public int Leases { get { lock (_gate) return _leases; } }
    public bool IsRunning { get { lock (_gate) return _task is { IsCompleted: false }; } }

    /// <summary>Starts the loop if it is not running; dispose the lease to release it.</summary>
    public IDisposable Acquire()
    {
        lock (_gate)
        {
            _leases++;
            if (_cts is null) // stopped (or never started); a stopping loop is replaced, not revived
            {
                _cts = CancellationTokenSource.CreateLinkedTokenSource(_shutdown);
                var token = _cts.Token;
                _task = Task.Run(() => RunAsync(token));
            }
        }
        return new Lease(this);
    }

    /// <summary>Skips the current wait (e.g. a PI opened and wants fresh data).</summary>
    public void WakeNow()
    {
        CancellationTokenSource old;
        lock (_gate) { old = _wake; _wake = new CancellationTokenSource(); }
        try { old.Cancel(); } catch (ObjectDisposedException) { }
        old.Dispose();
    }

    private void Release()
    {
        CancellationTokenSource? stop = null;
        lock (_gate)
        {
            if (_leases == 0) return;
            if (--_leases == 0) { stop = _cts; _cts = null; }
        }
        stop?.Cancel();
    }

    private async Task RunAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            try { await _work(ct).ConfigureAwait(false); }
            catch (OperationCanceledException) when (ct.IsCancellationRequested) { return; }
            catch (Exception ex) { _log.Warn($"{_name} poll failed: {ex.Message}"); }
            CancellationToken wake;
            lock (_gate) wake = _wake.Token;
            using var linked = CancellationTokenSource.CreateLinkedTokenSource(ct, wake);
            try { await Task.Delay(_delay(), _time, linked.Token).ConfigureAwait(false); }
            catch (OperationCanceledException) when (!ct.IsCancellationRequested) { /* woken early */ }
            catch (OperationCanceledException) { return; }
        }
    }

    public async ValueTask DisposeAsync()
    {
        Task? t;
        lock (_gate)
        {
            _leases = 0;
            _cts?.Cancel();
            t = _task;
        }
        if (t is not null) { try { await t.WaitAsync(TimeSpan.FromSeconds(2)).ConfigureAwait(false); } catch { } }
    }

    private sealed class Lease(DemandLoop owner) : IDisposable
    {
        private int _done;
        public void Dispose() { if (Interlocked.Exchange(ref _done, 1) == 0) owner.Release(); }
    }
}
