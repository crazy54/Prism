namespace PrismControl.Core.Hosting;

/// <summary>
/// One plugin-wide gate around synthetic input, so two modules' SendInput batches (a Macros chord, the Smart Deck's
/// secure keypad, a Smart verb) never interleave and each one's foreground check still holds when its keys go out.
/// Registered in the service registry by the module that owns the input stack (Desktop); absent means no gate.
/// <list type="bullet">
/// <item>Hold it around ONE batch only: the foreground/elevation check plus its SendInput call. Never across a delay, a
/// held chord or an await on anything else.</item>
/// <item>It is not re-entrant: acquiring it again while holding it deadlocks.</item>
/// <item><c>owner</c> is a constant module name ("macros"), used for diagnostics only. Never pass keys or text.</item>
/// <item>Key releases (key-ups) may go out without it: they can't type, and a cancel must never wait to release.</item>
/// </list>
/// </summary>
public interface IInputGate
{
    ValueTask<IAsyncDisposable> AcquireAsync(string owner, CancellationToken cancellationToken = default);
}
