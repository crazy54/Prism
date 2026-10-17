using System.Collections.Concurrent;
using System.Runtime.InteropServices;

namespace PrismControl.WinShell.Shared;

/// <summary>
/// One STA thread with a message pump, per-monitor-v2 DPI aware for its whole life (research/windows.md §1.3). It owns
/// WinEvent hooks (WINEVENT_OUTOFCONTEXT needs a message loop on the hooking thread) and shell/COM calls. Work is queued
/// with <see cref="InvokeAsync{T}"/>; nothing here blocks a caller's mailbox.
/// </summary>
public sealed unsafe partial class StaPump : IDisposable
{
    private const uint WM_APP_RUN = 0x8000 + 0x51;
    private const uint WM_QUIT = 0x0012;

    private readonly Thread _thread;
    private readonly ConcurrentQueue<Action> _work = new();
    private readonly TaskCompletionSource _started = new(TaskCreationOptions.RunContinuationsAsynchronously);
    private uint _threadId;
    private volatile bool _disposed;

    public StaPump(string name = "prism-windows-shell")
    {
        _thread = new Thread(Run) { IsBackground = true, Name = name };
        _thread.SetApartmentState(ApartmentState.STA);
        _thread.Start();
        _started.Task.Wait(TimeSpan.FromSeconds(5));
    }

    public bool IsCurrent => Environment.CurrentManagedThreadId == _thread.ManagedThreadId;

    /// <summary>Runs <paramref name="work"/> on the shell thread.</summary>
    public Task<T> InvokeAsync<T>(Func<T> work)
    {
        if (_disposed) return Task.FromException<T>(new ObjectDisposedException(nameof(StaPump)));
        if (IsCurrent)
        {
            try { return Task.FromResult(work()); }
            catch (Exception ex) { return Task.FromException<T>(ex); }
        }
        var tcs = new TaskCompletionSource<T>(TaskCreationOptions.RunContinuationsAsynchronously);
        _work.Enqueue(() =>
        {
            try { tcs.TrySetResult(work()); }
            catch (Exception ex) { tcs.TrySetException(ex); }
        });
        if (PostThreadMessageW(_threadId, WM_APP_RUN, 0, 0) == 0)
        {
            // The queue is drained on the next message anyway; this only happens before the loop starts.
        }
        return tcs.Task;
    }

    public Task InvokeAsync(Action work) => InvokeAsync(() => { work(); return true; });

    private void Run()
    {
        _threadId = Native.GetCurrentThreadId();
        Native.SetThreadDpiAwarenessContext(Native.DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
        CoInitializeEx(0, 0x2 /* COINIT_APARTMENTTHREADED */);
        // Force the message queue to exist before anyone posts to it.
        PeekMessageW(out _, 0, 0, 0, 0);
        _started.TrySetResult();
        while (GetMessageW(out var msg, 0, 0, 0) > 0)
        {
            if (msg.hwnd == 0 && msg.message == WM_APP_RUN) Drain();
            else
            {
                TranslateMessage(msg);
                DispatchMessageW(msg);
            }
            if (!_work.IsEmpty) Drain();
        }
        Drain();
        CoUninitialize();
    }

    private void Drain()
    {
        while (_work.TryDequeue(out var a))
        {
            try { a(); }
            catch { /* each item completes its own task */ }
        }
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        PostThreadMessageW(_threadId, WM_QUIT, 0, 0);
        _thread.Join(TimeSpan.FromSeconds(2));
    }

    [LibraryImport("user32.dll")] private static partial int GetMessageW(out MSG m, nint h, uint min, uint max);
    [LibraryImport("user32.dll")] private static partial int PeekMessageW(out MSG m, nint h, uint min, uint max, uint remove);
    [LibraryImport("user32.dll")] private static partial int TranslateMessage(in MSG m);
    [LibraryImport("user32.dll")] private static partial nint DispatchMessageW(in MSG m);
    [LibraryImport("user32.dll")] private static partial int PostThreadMessageW(uint tid, uint msg, nint wp, nint lp);
    [LibraryImport("ole32.dll")] private static partial int CoInitializeEx(nint reserved, uint coinit);
    [LibraryImport("ole32.dll")] private static partial void CoUninitialize();
}
