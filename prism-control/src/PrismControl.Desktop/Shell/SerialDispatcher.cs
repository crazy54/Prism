using System.Threading.Channels;
using PrismControl.Core.Hosting;

namespace PrismControl.Desktop;

/// <summary>
/// Runs posted callbacks one at a time, in order, on the thread pool. Used to raise events that originate on the shell
/// thread (WinEvents, broadcasts) without ever running subscriber code on it, and without reordering them.
/// A throwing callback is logged and the queue keeps going.
/// </summary>
internal sealed class SerialDispatcher : IDisposable
{
    private readonly Channel<Action> _queue = Channel.CreateUnbounded<Action>(new UnboundedChannelOptions { SingleReader = true });
    private readonly ILog _log;
    private readonly Task _pump;

    public SerialDispatcher(ILog log)
    {
        _log = log;
        _pump = Task.Run(PumpAsync);
    }

    public void Post(Action work) => _queue.Writer.TryWrite(work);

    private async Task PumpAsync()
    {
        await foreach (var work in _queue.Reader.ReadAllAsync().ConfigureAwait(false))
        {
            try { work(); }
            catch (Exception ex) { _log.Warn("A desktop event handler threw: " + ex.GetType().Name + ": " + ex.Message, ex); }
        }
    }

    /// <summary>Completes once every callback posted so far has run (tests).</summary>
    public Task DrainAsync()
    {
        var tcs = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        if (!_queue.Writer.TryWrite(() => tcs.TrySetResult())) tcs.TrySetResult();
        return tcs.Task;
    }

    public void Dispose() => _queue.Writer.TryComplete();
}
