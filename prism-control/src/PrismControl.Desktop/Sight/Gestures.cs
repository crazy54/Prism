using System.Collections.Concurrent;
using System.Runtime.CompilerServices;
using PrismControl.Core.Actions;

namespace PrismControl.Desktop.Sight;

public enum GestureKind { KeyDown, KeyUp, DialRotate, DialDown, DialUp, TouchTap }

/// <summary>
/// One real deck gesture as it arrived: recorded by <see cref="Gestures.Begin"/> on the first line of a key, dial or touch
/// handler, with a unique <see cref="Id"/> and the arrival time from the action's injected time provider. Immutable apart
/// from its mint counter; only the registry creates one.
/// </summary>
public sealed class Gesture
{
    private int _minted;

    internal Gesture(GestureKind kind, string context, string actionUuid, int ticks, DateTimeOffset arrivedAt, TimeProvider time, bool isHold, bool inMultiAction)
    {
        Id = Guid.NewGuid();
        Kind = kind;
        Context = context;
        ActionUuid = actionUuid;
        Ticks = ticks;
        ArrivedAt = arrivedAt;
        Time = time;
        IsHold = isHold;
        InMultiAction = inMultiAction;
    }

    /// <summary>Unique per delivery: tokens are minted from this id, never from an event object.</summary>
    public Guid Id { get; }
    public GestureKind Kind { get; }
    /// <summary>The Stream Deck action context (instance) the event came from.</summary>
    public string Context { get; }
    public string ActionUuid { get; }
    /// <summary>Dial ticks for DialRotate (signed), else 0.</summary>
    public int Ticks { get; }
    /// <summary>When the handler received it (the time provider's clock). Freshness is measured from here, and only here.</summary>
    public DateTimeOffset ArrivedAt { get; }
    /// <summary>The long-press delivery of a key-down (the hold threshold was reached while the key is still down).</summary>
    public bool IsHold { get; }
    /// <summary>A step of a Stream Deck multi-action (not a direct press): Sight refuses it.</summary>
    public bool InMultiAction { get; }
    /// <summary>How many tokens were minted from it (at most <see cref="Gestures.MaxTokens"/>).</summary>
    public int Minted => Volatile.Read(ref _minted);

    internal TimeProvider Time { get; }

    /// <summary>Claims the next token number; 0 when the cap is reached (the counter never passes the cap).</summary>
    internal int ClaimSequence()
    {
        while (true)
        {
            var n = Volatile.Read(ref _minted);
            if (n >= Gestures.MaxTokens) return 0;
            if (Interlocked.CompareExchange(ref _minted, n + 1, n) == n) return n + 1;
        }
    }

    public override string ToString() => $"{Kind}{(IsHold ? " (hold)" : "")} @{ArrivedAt:HH:mm:ss.fff}";
}

/// <summary>
/// The gesture registry (lead decision 1). The FIRST line of every Smart/Sight key, dial and touch handler calls
/// <see cref="Begin"/> with the handler's own event (the long-press handler calls <see cref="BeginHold"/>). That records a
/// unique gesture id and the arrival time; calling it again for the same delivered event returns the same gesture
/// (idempotent per delivery). <see cref="GestureToken"/>s are minted from the gesture id only: one-shot, at most
/// <see cref="MaxTokens"/> per gesture, and never later than <see cref="MaxAge"/> after the recorded arrival. A copy of an
/// event (<c>e with { }</c>) or of a token can't refresh anything: the arrival lives here, keyed by the id, and the guard
/// checks a token against this registry. The architecture tests (Sight + Smart) prove Begin is called only at handler entry.
/// </summary>
public static class Gestures
{
    /// <summary>The most tokens one gesture may mint (one per Sight step of a macro).</summary>
    public const int MaxTokens = 8;

    /// <summary>A token is minted and accepted only within this time of the gesture's arrival.</summary>
    public static readonly TimeSpan MaxAge = TimeSpan.FromSeconds(1);

    private static readonly ConditionalWeakTable<object, Gesture> Deliveries = new();
    private static readonly ConditionalWeakTable<object, Gesture> HoldDeliveries = new();
    private static readonly ConcurrentDictionary<Guid, Gesture> ById = new();

    /// <summary>
    /// Records the user's gesture for this delivered deck event: KeyDownEvent, KeyUpEvent, DialRotateEvent, DialDownEvent,
    /// DialUpEvent or TouchTapEvent. Anything else (willAppear, settings, PI messages) throws: those are not the user's
    /// gesture. Idempotent for the same event object.
    /// </summary>
    public static Gesture Begin(ActionEvent deckEvent, TimeProvider time) => Register(deckEvent, time, hold: false);

    /// <summary>
    /// The long-press delivery: the key (or Stream Deck + dial) is still down and has just reached the hold threshold.
    /// That is a new, present gesture with its own arrival (not the key-down's), idempotent for the same event object.
    /// </summary>
    public static Gesture BeginHold(ActionEvent deckEvent, TimeProvider time)
    {
        if (deckEvent is not (KeyDownEvent or DialDownEvent)) throw new ArgumentException($"{deckEvent?.GetType().Name} is not a hold", nameof(deckEvent));
        return Register(deckEvent, time, hold: true);
    }

    private static Gesture Register(ActionEvent deckEvent, TimeProvider time, bool hold)
    {
        ArgumentNullException.ThrowIfNull(deckEvent);
        ArgumentNullException.ThrowIfNull(time);
        var (kind, ticks, multi) = deckEvent switch
        {
            KeyDownEvent k => (GestureKind.KeyDown, 0, k.IsInMultiAction),
            KeyUpEvent k => (GestureKind.KeyUp, 0, k.IsInMultiAction),
            DialRotateEvent r => (GestureKind.DialRotate, r.Ticks, false),
            DialDownEvent => (GestureKind.DialDown, 0, false),
            DialUpEvent => (GestureKind.DialUp, 0, false),
            TouchTapEvent => (GestureKind.TouchTap, 0, false),
            _ => throw new ArgumentException($"{deckEvent.GetType().Name} is not a deck gesture", nameof(deckEvent)),
        };
        if (string.IsNullOrEmpty(deckEvent.Context)) throw new ArgumentException("the event has no action context", nameof(deckEvent));
        var table = hold ? HoldDeliveries : Deliveries;
        var g = table.GetValue(DeliveryKey(deckEvent), _ => new Gesture(kind, deckEvent.Context, deckEvent.ActionUuid, ticks, time.GetUtcNow(), time, hold, multi));
        if (ById.TryAdd(g.Id, g) && ById.Count > 4096) Prune();
        return g;
    }

    /// <summary>
    /// What identifies one delivery. The host parses every inbound message into a new event with its own deep-cloned
    /// <see cref="ActionEvent.RawSettings"/> object, and a record copy (<c>e with { }</c>) shares that object: so a copy of
    /// a delivered event maps to the SAME gesture (same arrival, same 8-token budget) and can never refresh it. An event
    /// without settings (built in code) is identified by the object itself.
    /// </summary>
    private static object DeliveryKey(ActionEvent e) => (object?)e.RawSettings ?? e;

    /// <summary>Drops gestures far past their freshness window (they could not mint or be accepted anyway).</summary>
    private static void Prune()
    {
        foreach (var (id, g) in ById)
            if (g.Time.GetUtcNow() - g.ArrivedAt > MaxAge + TimeSpan.FromMinutes(1)) ById.TryRemove(id, out _);
    }

    /// <summary>The registered gesture with this id (null when unknown or long expired).</summary>
    public static Gesture? Find(Guid gestureId) => ById.TryGetValue(gestureId, out var g) ? g : null;

    /// <summary>A fresh one-shot token for one Sight call, or null (unknown gesture, older than <see cref="MaxAge"/>, or used up).</summary>
    public static GestureToken? Mint(Guid gestureId) => TryMint(gestureId, MaxAge, out var t, out _) ? t : null;

    /// <summary>The same with a stricter age limit (the smaller of <paramref name="maxAge"/> and <see cref="MaxAge"/>).</summary>
    public static GestureToken? Mint(Guid gestureId, TimeSpan maxAge) => TryMint(gestureId, maxAge, out var t, out _) ? t : null;

    public static bool TryMint(Guid gestureId, TimeSpan maxAge, out GestureToken? token, out string reason)
    {
        token = null;
        if (!ById.TryGetValue(gestureId, out var g)) { reason = "not a registered deck gesture"; return false; }
        var limit = maxAge < MaxAge ? maxAge : MaxAge;
        var now = g.Time.GetUtcNow();
        var age = now - g.ArrivedAt;
        if (age > limit) { reason = $"the gesture is {age.TotalMilliseconds:F0} ms old (max {limit.TotalMilliseconds:F0})"; return false; }
        var seq = g.ClaimSequence();
        if (seq == 0) { reason = $"more than {MaxTokens} actions from one deck gesture"; return false; }
        token = new GestureToken(g, seq, now);
        reason = "ok";
        return true;
    }

    /// <summary>True when the token was minted here for a gesture still in the registry (not forged, not orphaned).</summary>
    public static bool IsRegistered(GestureToken token) => token is not null && ById.TryGetValue(token.GestureId, out var g) && ReferenceEquals(g, token.Gesture);

    /// <summary>Marks the token used. False when it was used before (one-shot, across every guard).</summary>
    public static bool Consume(GestureToken token) => token.TryConsume();
}
