using PrismControl.Core.Actions;

namespace PrismControl.Desktop.Sight;

// The Prism Sight contract (owner: the Sight engineer). The Sight module (src/PrismControl.Sight) implements these and
// registers them in IModuleContext.Services; other modules (Smart Deck) resolve them at use time and never reference
// the Sight assembly. Everything here is data plus two interfaces; no behavior lives in Desktop.
// Rules carried by the contract:
//   - readings never send input on their own: ISightControl acts only with a fresh GestureToken minted from a gesture the
//     registry (Gestures.Begin, first line of a deck handler) recorded (≤ 1 s from its arrival, one-shot, ≤ 8 per gesture,
//     a kind that fits the operation), and only for games on the safe-offline allowlist that are in front;
//   - the foreground window and its elevation are re-checked before EVERY chord, click and wheel notch (WindowChanged);
//   - closed loops act only on full-confidence reads (no dropped characters; a calibrated read or both OCR engines agree);
//   - every value carries a confidence; null/unknown is never dressed up as a value.

/// <summary>How much a value can be trusted.</summary>
public enum SightConfidence
{
    /// <summary>Never read, or reset (new game, new recipe, resolution change).</summary>
    Unknown = 0,
    /// <summary>The last good value, but too old, out of its context, or the capture is paused.</summary>
    Stale = 1,
    /// <summary>Derived, not read: an unconfirmed new reading, or counted from Sight's own steps.</summary>
    Inferred = 2,
    /// <summary>Read from the current frame and validated (range, confirmation).</summary>
    Observed = 3,
}

public enum SightValueKind { Number, Percent, Bool, Label, Text }

/// <summary>One readout ("bankAngle"). <see cref="Region"/> is the Sight region it reads ("pc2.builder.bankValue").</summary>
public sealed record SightReadout(
    string Id,
    string Label,
    SightValueKind Kind,
    double? Number,
    string? Text,
    bool? Flag,
    string? Unit,
    SightConfidence Confidence,
    double Score,
    DateTimeOffset? ObservedAt,
    DateTimeOffset UpdatedAt,
    string? Region)
{
    public bool HasValue => Confidence != SightConfidence.Unknown && (Number is not null || Text is not null || Flag is not null);
}

/// <summary>The active context ("coasterBuilder") and every context whose rule currently holds.</summary>
public sealed record SightContext(string? Id, string? Label, SightConfidence Confidence, DateTimeOffset? Since, IReadOnlyList<string> Active)
{
    public static SightContext None { get; } = new(null, null, SightConfidence.Unknown, null, []);
}

/// <summary>
/// Whether an on-screen control was found in the latest frame (keys show "sightLost" when not), and the net steps Sight
/// itself sent to it since the ledger was reset (the "counted" fallback readout; relative, not absolute).
/// </summary>
public sealed record SightControlState(string Id, bool Located, double Score, DateTimeOffset? At, int CountedSteps = 0);

public enum SightRunState
{
    /// <summary>Sight is disabled by the user.</summary>
    Off,
    /// <summary>No supported game in front.</summary>
    Idle,
    /// <summary>A game is in front but reading it is not allowed (denylist, anti-cheat, unknown and not enabled).</summary>
    Blocked,
    /// <summary>The game window is minimized, hidden or closed: values go stale.</summary>
    Paused,
    /// <summary>Capturing and reading.</summary>
    Running,
    /// <summary>Capture failed (see Reason).</summary>
    Error,
}

/// <summary>Everything Sight knows right now. Immutable; a new one is published on every change.</summary>
public sealed record SightSnapshot(
    long Seq,
    DateTimeOffset At,
    SightRunState State,
    string? GameId,
    string? RecipeId,
    string? ProcessName,
    SightContext Context,
    IReadOnlyDictionary<string, SightReadout> Readouts,
    IReadOnlyDictionary<string, SightControlState> Controls,
    bool Recording,
    string? Reason)
{
    public static SightSnapshot Empty { get; } = new(0, DateTimeOffset.UnixEpoch, SightRunState.Idle, null, null, null, SightContext.None,
        new Dictionary<string, SightReadout>(), new Dictionary<string, SightControlState>(), false, null);

    /// <summary>A readout by id or by its Sight region name.</summary>
    public SightReadout? Readout(string idOrRegion) =>
        Readouts.TryGetValue(idOrRegion, out var r) ? r : Readouts.Values.FirstOrDefault(x => x.Region == idOrRegion);
}

/// <summary>A discrete happening: "context" (value), "paused", "resumed", "recStart", "recStop", "blocked".</summary>
public sealed record SightEvent(string Type, DateTimeOffset At, IReadOnlyDictionary<string, object?> Fields);

/// <summary>What the policy says about one game (for the PI and the deck's "policyBlocked" face).</summary>
public sealed record SightGameAccess(string ProcessName, string? GameId, bool ReadAllowed, bool InputAllowed, string Verdict, string Reason);

/// <summary>Read side: the Smart Deck engine subscribes to context and readouts.</summary>
public interface ISightService
{
    SightSnapshot Current { get; }

    /// <summary>
    /// Calls <paramref name="onSnapshot"/> now with <see cref="Current"/> and then on every change (thread pool, in order),
    /// and <paramref name="onEvent"/> for events. Dispose to unsubscribe. Handlers must be quick and must not throw.
    /// </summary>
    IDisposable Subscribe(Action<SightSnapshot> onSnapshot, Action<SightEvent>? onEvent = null);

    /// <summary>The policy verdict for a process (exe name), without starting anything.</summary>
    SightGameAccess Access(string processName);
}

public enum SightAdjustDirection { Increase, Decrease }

public enum SightAdjustMethod { Auto, Buttons, Drag, Wheel }

/// <summary>How a closed loop steps the value.</summary>
public abstract record SightStepVia;

/// <summary>
/// Step with keyboard chords (one press = one step). Scancode mode for games that read raw keys. <paramref name="HoldMs"/>:
/// how long each press is held, down then up (0–500; null = the pack default: 50 ms in scancode mode, where engines such
/// as Cobra drop instant taps, else 0 = one SendInput tap). Smart passes the pack's <c>keyHoldMs</c>.
/// </summary>
public sealed record SightChordSteps(IReadOnlyList<VirtualKey> Increase, IReadOnlyList<VirtualKey> Decrease, KeyMode Mode = KeyMode.VirtualKey,
    int IntervalMs = 40, int? HoldMs = null) : SightStepVia
{
    /// <summary>The effective hold per press in ms (see <see cref="HoldMs"/>).</summary>
    public int EffectiveHoldMs => Math.Clamp(HoldMs ?? (Mode == KeyMode.Scancode ? 50 : 0), 0, 500);
}

/// <summary>Step an on-screen control Sight located (± buttons, slider drag, wheel), e.g. "pc2.builder.bankControl".</summary>
public sealed record SightControlSteps(string ControlId, SightAdjustMethod Method = SightAdjustMethod.Auto) : SightStepVia;

public enum SightDriveFallback
{
    /// <summary>No reading: do nothing.</summary>
    Refuse,
    /// <summary>No reading: undo the steps Sight itself sent on this control since the ledger was last reset.</summary>
    Counted,
}

public sealed record SightDriveOptions(
    double Tolerance = 0.5,
    double? StepSize = null,
    int MaxSteps = 48,
    int SettleMs = 80,
    int TimeoutMs = 4000,
    SightDriveFallback Fallback = SightDriveFallback.Refuse);

public enum SightActStatus
{
    /// <summary>Done and confirmed by a re-read.</summary>
    Verified,
    /// <summary>Done; nothing to verify it against (no readout or verify rule).</summary>
    Done,
    /// <summary>Done, but the re-read did not show the expected change.</summary>
    NotVerified,
    /// <summary>The element was not found with enough confidence: nothing was sent.</summary>
    NotFound,
    /// <summary>Refused before acting (token, policy, game not in front, elevated, unknown control). Nothing was sent.</summary>
    Refused,
    /// <summary>Safe mode: the input was logged, not sent.</summary>
    SafeMode,
    /// <summary>The input could not be sent (no mouse/keyboard sender, Windows refused).</summary>
    Failed,
    Cancelled,
    /// <summary>
    /// WINDOW CHANGED: the game lost the foreground (Alt-Tab, a popup) or became elevated between two presses. Stopped
    /// before the next press; <see cref="SightActResult.Steps"/> says how many went to the game first.
    /// </summary>
    WindowChanged,
}

public sealed record SightActResult(SightActStatus Status, string? Reason = null, int Steps = 0, double? Before = null, double? After = null, string? Method = null)
{
    public bool Acted => Status is SightActStatus.Verified or SightActStatus.Done or SightActStatus.NotVerified;
}

public enum SightDriveStatus
{
    Converged,
    AlreadyThere,
    /// <summary>Time or step budget ran out before the target.</summary>
    Timeout,
    /// <summary>The value stopped changing while stepping (end of range, or the steps don't register).</summary>
    Stalled,
    /// <summary>The value moved the wrong way (the step bindings are reversed?): stopped.</summary>
    Diverged,
    /// <summary>No fresh, confident reading to start from.</summary>
    NoReading,
    NotFound,
    Refused,
    SafeMode,
    Cancelled,
    InputFailed,
    /// <summary>No reading: Sight undid its own counted steps (the result is inferred, not observed).</summary>
    CountedFallback,
    /// <summary>WINDOW CHANGED: the game lost the foreground or became elevated mid-drive. Stopped before the next press.</summary>
    WindowChanged,
    /// <summary>The error grew after a step (overshoot: the step is larger than the distance, or the estimate was wrong). Stopped there.</summary>
    Overshot,
}

public sealed record SightDriveResult(SightDriveStatus Status, double? Start, double? Final, int StepsSent, string? Reason, TimeSpan Elapsed)
{
    public bool Succeeded => Status is SightDriveStatus.Converged or SightDriveStatus.AlreadyThere;
}

/// <summary>
/// Act side. Every call needs a fresh <see cref="GestureToken"/> (minted from <see cref="Gestures"/>: ≤ 1 s from the
/// gesture's arrival, one-shot, a fitting kind) and runs only for a game on the safe-offline allowlist that is in front.
/// The foreground window and its elevation are re-verified before every chord, click and wheel notch: a change stops
/// the call with <c>WindowChanged</c>. Calls never act on a weakly located element (NotFound). After acting they re-read
/// to verify.
/// </summary>
public interface ISightControl
{
    /// <summary>Click a located on-screen control ("pc2.builder.btn.test"). Kinds: key down/up, dial down/up, touch tap.</summary>
    Task<SightActResult> ClickAsync(string controlId, GestureToken gesture, CancellationToken ct = default);

    /// <summary>Step a located control (± buttons, slider, wheel) <paramref name="steps"/> times. Kinds: dial rotate, key down/up, touch tap.</summary>
    Task<SightActResult> AdjustAsync(string controlId, SightAdjustDirection direction, int steps, SightAdjustMethod method, GestureToken gesture, CancellationToken ct = default);

    /// <summary>Press step chords <paramref name="steps"/> times (no reading involved). Kinds: dial rotate, key down/up, touch tap.</summary>
    Task<SightActResult> StepAsync(SightChordSteps chords, SightAdjustDirection direction, int steps, GestureToken gesture, CancellationToken ct = default);

    /// <summary>
    /// Read <paramref name="readoutId"/> (an id or its Sight region), step toward <paramref name="target"/>, re-read, repeat.
    /// Acts only on full-confidence reads inside the readout's contexts. Each drive first probes 1–3 steps and rejects a
    /// step estimate (given or learned) more than 50% off; it stops on convergence, a growing error (Overshot), a value that
    /// stops changing, the wrong direction, or a press budget of the expected distance plus a margin.
    /// Kinds: key down/up, dial down/up, touch tap (a push, not a turn).
    /// </summary>
    Task<SightDriveResult> DriveToAsync(string readoutId, double target, SightStepVia stepVia, SightDriveOptions options, GestureToken gesture, CancellationToken ct = default);

    /// <summary>The chord form: <c>DriveToAsync(readoutId, target, stepChords, tolerance, gestureToken)</c>.</summary>
    Task<SightDriveResult> DriveToAsync(string readoutId, double target, SightChordSteps stepChords, double tolerance, GestureToken gesture, CancellationToken ct = default)
        => DriveToAsync(readoutId, target, stepChords, new SightDriveOptions(Tolerance: tolerance), gesture, ct);

    /// <summary>
    /// Forget the counted steps (all controls when null), e.g. when a new track piece starts. Sight also resets on its own
    /// when the game, recipe or active context changes, and for a control after a drive converged on it (observed there).
    /// </summary>
    void ResetLedger(string? controlId = null);
}

/// <summary>
/// Proof that the user just touched the deck: minted ONLY by <see cref="Gestures.Mint(Guid)"/> from a gesture the
/// registry recorded at the handler's first line (never from an event object). Sight accepts a token once (one-shot,
/// across every guard), only for a registered gesture, only of a kind that fits the operation (a dial turn never clicks),
/// only within <see cref="Gestures.MaxAge"/> of the gesture's recorded arrival, and at most <see cref="MaxPerEvent"/> per
/// gesture (a macro of several Sight steps mints one token per step). Mint at the event, use at once.
/// </summary>
public sealed class GestureToken
{
    /// <summary>The most tokens one deck gesture may mint (macro steps).</summary>
    public const int MaxPerEvent = Gestures.MaxTokens;

    private int _used;

    internal GestureToken(Gesture gesture, int sequence, DateTimeOffset at)
    {
        Gesture = gesture;
        Sequence = sequence;
        At = at;
        Nonce = Guid.NewGuid();
    }

    /// <summary>The registered gesture it was minted from (its arrival is the only clock that counts).</summary>
    public Gesture Gesture { get; }
    public GestureKind Kind => Gesture.Kind;
    /// <summary>The Stream Deck action context (instance) the event came from.</summary>
    public string Context => Gesture.Context;
    public string ActionUuid => Gesture.ActionUuid;
    /// <summary>When this token was minted.</summary>
    public DateTimeOffset At { get; }
    /// <summary>Dial ticks for DialRotate (signed), else 0.</summary>
    public int Ticks => Gesture.Ticks;
    /// <summary>The gesture it came from (the same for every token of that gesture).</summary>
    public Guid GestureId => Gesture.Id;
    /// <summary>When the gesture arrived: the age is measured from here.</summary>
    public DateTimeOffset ArrivedAt => Gesture.ArrivedAt;
    /// <summary>1 for the first token of a gesture, 2 for the second, … (at most <see cref="MaxPerEvent"/>).</summary>
    public int Sequence { get; }
    /// <summary>Unique per token.</summary>
    public Guid Nonce { get; }
    /// <summary>True once a guard accepted it.</summary>
    public bool Used => Volatile.Read(ref _used) != 0;

    internal bool TryConsume() => Interlocked.Exchange(ref _used, 1) == 0;

    public override string ToString() => $"{Kind} #{Sequence} @{At:HH:mm:ss.fff}";
}
