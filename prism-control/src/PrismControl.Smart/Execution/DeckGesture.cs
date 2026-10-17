using PrismControl.Core.Actions;
using PrismControl.Desktop.Sight;

namespace PrismControl.Smart.Execution;

/// <summary>
/// The user's deck gesture behind an execution: the <see cref="Gesture"/> the registry recorded on the first line of the
/// Smart Key / Smart Dial handler (<see cref="Gestures.Begin"/>, or <see cref="Gestures.BeginHold"/> for the hold), with
/// its arrival time. Every Prism Sight step mints its own one-shot <see cref="GestureToken"/> from the gesture id (a
/// two-click macro needs two), at most <see cref="MaxTokens"/>, and never once the gesture is older than the freshness
/// window: so each token still proves a real, recent press. Copies of an event can't refresh it.
/// </summary>
public sealed class DeckGesture
{
    public const int MaxTokens = Gestures.MaxTokens;

    private readonly Gesture _gesture;

    private DeckGesture(Gesture gesture) => _gesture = gesture ?? throw new ArgumentNullException(nameof(gesture));

    /// <summary>The gesture <see cref="Gestures.Begin"/> recorded at the handler's first line.</summary>
    public static DeckGesture Of(Gesture gesture) => new(gesture);

    /// <summary>
    /// <see cref="Gestures.Begin"/> + <see cref="Of"/> in one call (idempotent for the same delivered event). Throws for
    /// anything that isn't a deck gesture (willAppear, settings, PI messages).
    /// </summary>
    public static DeckGesture FromDeckEvent(ActionEvent deckEvent, TimeProvider time) => new(Gestures.Begin(deckEvent, time));

    /// <summary>When the deck event arrived (the registry's recorded arrival).</summary>
    public DateTimeOffset At => _gesture.ArrivedAt;

    public GestureKind Kind => _gesture.Kind;
    public string Context => _gesture.Context;
    /// <summary>The registry id tokens are minted from.</summary>
    public Guid Id => _gesture.Id;

    /// <summary>How many tokens were handed out.</summary>
    public int Minted => _gesture.Minted;

    /// <summary>A fresh one-shot token for one Sight call, or null when the gesture is older than <paramref name="maxAge"/> (≤ 1 s) or used up.</summary>
    public GestureToken? Mint(TimeSpan maxAge) => Gestures.Mint(_gesture.Id, maxAge);
}
