using PrismControl.Core.Actions;
using PrismControl.Core.Devices;
using PrismControl.Desktop;
using PrismControl.Desktop.Sight;
using PrismControl.Smart.Context;
using PrismControl.Smart.Execution;
using PrismControl.Smart.Layout;
using PrismControl.Smart.Packs;

namespace PrismControl.Smart.Runtime;

/// <summary>Runs async work one item at a time, in order, off the action mailbox (holds must release after they press).</summary>
internal sealed class SerialQueue(Action<Exception> onError)
{
    private readonly object _gate = new();
    private Task _tail = Task.CompletedTask;
    private int _pending;

    public bool Busy => Volatile.Read(ref _pending) > 0;

    public void Enqueue(Func<Task> work)
    {
        lock (_gate)
        {
            Interlocked.Increment(ref _pending);
            _tail = _tail.ContinueWith(async _ =>
            {
                try { await work().ConfigureAwait(false); }
                catch (Exception ex) { onError(ex); }
                finally { Interlocked.Decrement(ref _pending); }
            }, CancellationToken.None, TaskContinuationOptions.None, TaskScheduler.Default).Unwrap();
        }
    }

    public Task WhenIdle { get { lock (_gate) return _tail; } }
}

/// <summary>One placed Smart Key or Smart Dial instance, and its live interaction state (engine-owned, lock-protected).</summary>
public sealed class SmartSlot
{
    internal SmartSlot(string context, DeviceInfo device, Controller controller, Coordinates coordinates, DeviceGeometry geometry, Action invalidate, Action<Exception> onError)
    {
        Context = context;
        Device = device;
        Controller = controller;
        Coordinates = coordinates;
        Invalidate = invalidate;
        Key = new KeySlot(coordinates.Column, coordinates.Row);
        Dial = geometry.DialFromCoordinates(coordinates);
        Queue = new SerialQueue(onError);
    }

    public string Context { get; }
    public DeviceInfo Device { get; }
    public Controller Controller { get; }
    public Coordinates Coordinates { get; }
    public bool IsKey => Controller == Controller.Keypad;
    /// <summary>A fixed "lock page" key (settings role "lock"): never filled by the generator.</summary>
    public bool IsUtility { get; internal init; }
    public KeySlot Key { get; }
    public DialSlot Dial { get; }
    internal Action Invalidate { get; }
    internal SerialQueue Queue { get; }

    // ---- interaction state (guarded by the engine's lock)
    internal bool KeyHeld;
    internal KeyAssignment? HeldAssignment;
    internal DateTimeOffset HeldSince;
    internal HoldBinding? ActiveHold;
    /// <summary>The app the active whilePressed hold went to: when it leaves the front the hold is released (E5).</summary>
    internal ForegroundApp? HoldApp;
    /// <summary>The key is down on a verb with an AI proposal waiting (REVIEW): the hold approves it, nothing else runs.</summary>
    internal bool ReviewPending;
    internal ITimer? ReviewTimer;
    /// <summary>The last time this slot ran a never-auto verb (no repeats: a second press within the gap is ignored).</summary>
    internal DateTimeOffset LastNeverAutoAt;
    internal string? LastNeverAutoVerb;
    internal bool ConfirmPending;
    internal bool HoldFired;
    internal string? Flash;
    internal bool FlashIsError;
    internal DateTimeOffset FlashUntil;
    internal DateTimeOffset ArmedUntil;
    internal string? ArmedVerb;
    /// <summary>Dial events not sent yet, each kept with its own magnitude (E2).</summary>
    internal readonly List<int> PendingEvents = [];
    internal bool HasPendingTicks => PendingEvents.Count > 0;
    internal DeckGesture? PendingToken;
    internal DateTimeOffset PendingAt;
    internal bool Draining;
    internal DateTimeOffset LastTurnAt;
    internal bool DialPressed;
    internal ContextPack? DialPack;
    internal PackControl? DialControl;
    /// <summary>The app the queued turn belongs to (E11: a drain never sends into another context).</summary>
    internal ForegroundApp? DialApp;

    public override string ToString() => IsKey ? $"key {Key} on {Device.Name}" : $"{Dial} on {Device.Name}";
}

public enum SlotKind { Idle, Verb, More, Readout, Empty, Control, Lock }

/// <summary>Why a verb can't run right now, with the pack's face for it.</summary>
public sealed record SlotAvailability(bool Ready, string? Reason, string? Label, string? Hint, string Style)
{
    public static SlotAvailability Go { get; } = new(true, null, null, null, "none");
}

/// <summary>Everything a smart key/dial draws, computed fresh on every render.</summary>
public sealed record SlotView
{
    public SlotKind Kind { get; init; }
    public string Label { get; init; } = "";
    public string? Eyebrow { get; init; }
    public string Glyph { get; init; } = "";
    public string? Monogram { get; init; }
    public int Hue { get; init; }
    public bool? On { get; init; }
    public ReadoutConfidence StateConfidence { get; init; } = ReadoutConfidence.Unknown;
    public bool IsToggle { get; init; }
    public string? Badge { get; init; }
    public SlotAvailability Availability { get; init; } = SlotAvailability.Go;
    public string? Flash { get; init; }
    public bool FlashIsError { get; init; }
    public double? HoldProgress { get; init; }
    public bool Armed { get; init; }
    public double ArmedSecondsLeft { get; init; }
    public Safety Safety { get; init; }
    /// <summary>An AI proposal waits for the user's approval (REVIEW badge): the proposed chord, e.g. "Ctrl+Alt+F12".</summary>
    public string? Review { get; init; }
    /// <summary>While the REVIEW key is held: how far the approval hold is (0..1).</summary>
    public double? ReviewProgress { get; init; }
    /// <summary>The binding came from an approved AI proposal ("AI" badge; always confirm).</summary>
    public bool AiBound { get; init; }
    public ReadoutView? Readout { get; init; }
    public string? PushLabel { get; init; }
    public int Page { get; init; }
    public int PageCount { get; init; } = 1;
    public bool Locked { get; init; }
    public string PackName { get; init; } = "";
    public string ContextLabel { get; init; } = "";
    public string Why { get; init; } = "";
    public string LabelSize { get; init; } = "normal";
    public bool BigIcons { get; init; }
    /// <summary>A short identity for change detection (the action skips identical frames anyway).</summary>
    public string? ItemId { get; init; }
}
