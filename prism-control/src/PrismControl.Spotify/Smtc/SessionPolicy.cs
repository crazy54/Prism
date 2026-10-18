namespace PrismControl.Spotify.Smtc;

/// <summary>Which Windows media session the deck follows (global setting <c>spotify."media.follow"</c>).</summary>
public enum MediaFollow
{
    /// <summary>Default: Spotify while it plays; otherwise the most recently playing other app (YouTube in a browser, any player).</summary>
    SpotifyFirst,
    /// <summary>Spotify's session only (the behavior before 2026-10-18).</summary>
    SpotifyOnly,
    /// <summary>Windows' own "current" session (what the volume flyout shows).</summary>
    Current,
}

/// <summary>The wire names of <see cref="MediaFollow"/>: <c>spotifyFirst</c> | <c>spotifyOnly</c> | <c>current</c>.</summary>
public static class MediaFollowModes
{
    public const string SpotifyFirst = "spotifyFirst";
    public const string SpotifyOnly = "spotifyOnly";
    public const string Current = "current";

    public static MediaFollow? Parse(string? value) => value?.Trim().ToLowerInvariant() switch
    {
        "spotifyfirst" => MediaFollow.SpotifyFirst,
        "spotifyonly" => MediaFollow.SpotifyOnly,
        "current" => MediaFollow.Current,
        _ => null,
    };

    public static string Wire(MediaFollow mode) => mode switch
    {
        MediaFollow.SpotifyOnly => SpotifyOnly,
        MediaFollow.Current => Current,
        _ => SpotifyFirst,
    };
}

/// <summary>What the policy knows about one follow target.</summary>
/// <param name="Key">A session key, or <see cref="SessionPolicy.SpotifyKey"/> for Spotify (its session and/or the Web API).</param>
/// <param name="PlayingSince">Start of the current playing run (null when not playing). Short gaps (a track change) keep the run.</param>
/// <param name="LastPlayingAt">The last time it was seen playing (null = not since the plugin started).</param>
/// <param name="IsWindowsCurrent">Windows' own current session.</param>
public readonly record struct PolicySession(string Key, bool IsSpotify, PlayState State, DateTimeOffset? PlayingSince, DateTimeOffset? LastPlayingAt, bool IsWindowsCurrent)
{
    public bool IsPlaying => State == PlayState.Playing;
}

/// <summary>The target to show, and when the policy wants to be asked again (a pending switch or an expiring intent).</summary>
public readonly record struct PolicyDecision(string Shown, DateTimeOffset? RecheckAt);

/// <summary>
/// Picks the session the deck shows, with hysteresis. Pure and single-threaded (the caller serializes calls).
/// <para><b>spotifyFirst</b> (default):</para>
/// <list type="number">
/// <item>Spotify wins while it plays (its session, or the Web API on another device).</item>
/// <item>Otherwise the session the user last pressed play on from the deck, while that playing run lasts.</item>
/// <item>Otherwise the playing session whose run started most recently.</item>
/// <item>If nothing plays, the shown session stays (paused). If it vanished: the last one seen playing, then Spotify,
/// then Windows' current session.</item>
/// </list>
/// A switch happens only after the new pick has been the pick for <see cref="Hold"/> without a break, so two sessions
/// flapping (a muted autoplay, a buffering stream, Spotify's pause between tracks) never make the deck flicker. It is
/// immediate when nothing valid is shown, when the mode changed, or for the session the user just pressed play on.
/// <para><b>spotifyOnly</b>: always Spotify. <b>current</b>: Windows' current session (Spotify when there is none).</para>
/// </summary>
public sealed class SessionPolicy
{
    /// <summary>The single target that stands for Spotify (any of its sessions, plus the Web API). Never a real AppUserModelId.</summary>
    public const string SpotifyKey = "<spotify>";

    public static readonly TimeSpan DefaultHold = TimeSpan.FromSeconds(1.5);
    /// <summary>How long a deck press keeps its session preferred while Windows has not reported it playing yet.</summary>
    public static readonly TimeSpan IntentWindow = TimeSpan.FromSeconds(3);

    private string? _shown;
    private (string Key, DateTimeOffset Since)? _pending;
    private (string Key, DateTimeOffset At, DateTimeOffset? RunSince)? _pin;
    private MediaFollow? _mode;

    public SessionPolicy(TimeSpan? hold = null) => Hold = hold ?? DefaultHold;

    public TimeSpan Hold { get; }

    /// <summary>The target shown after the last <see cref="Decide"/> (null before the first).</summary>
    public string? Shown => _shown;

    /// <summary>The user pressed play (or play/pause on a paused session) on <paramref name="key"/> from the deck.</summary>
    public void NoteUserPlay(string key, DateTimeOffset at)
    {
        if (key == SpotifyKey) return;   // Spotify wins while it plays anyway
        _pin = (key, at, null);
    }

    public PolicyDecision Decide(MediaFollow mode, IReadOnlyList<PolicySession> sessions, DateTimeOffset now)
    {
        var modeChanged = _mode is { } m && m != mode;
        _mode = mode;
        DateTimeOffset? recheck = null;
        var preferred = mode switch
        {
            MediaFollow.SpotifyOnly => SpotifyKey,
            MediaFollow.Current => sessions.FirstOrDefault(s => s.IsWindowsCurrent) is { Key: { } k } ? k : SpotifyKey,
            _ => PreferSpotifyFirst(sessions, now, ref recheck),
        };

        if (preferred == _shown)
        {
            _pending = null;
            return new PolicyDecision(preferred, recheck);
        }
        var shownValid = _shown is { } shown && Exists(sessions, shown);
        var userPick = _pin is { } pin && pin.Key == preferred && now - pin.At <= IntentWindow;
        if (mode != MediaFollow.SpotifyFirst || modeChanged || !shownValid || userPick) return Switch(preferred, recheck);

        if (_pending is not { } pending || pending.Key != preferred)
        {
            _pending = (preferred, now);
            return new PolicyDecision(_shown!, Min(recheck, now + Hold));
        }
        if (now - pending.Since >= Hold) return Switch(preferred, recheck);
        return new PolicyDecision(_shown!, Min(recheck, pending.Since + Hold));
    }

    private PolicyDecision Switch(string target, DateTimeOffset? recheck)
    {
        _shown = target;
        _pending = null;
        return new PolicyDecision(target, recheck);
    }

    private string PreferSpotifyFirst(IReadOnlyList<PolicySession> sessions, DateTimeOffset now, ref DateTimeOffset? recheck)
    {
        PolicySession? spotify = null;
        foreach (var s in sessions) if (s.Key == SpotifyKey) { spotify = s; break; }
        if (spotify is { IsPlaying: true }) return SpotifyKey;

        // The session the user pressed play on from the deck, for that playing run.
        if (_pin is { } pin)
        {
            var hit = sessions.Where(s => s.Key == pin.Key).Select(s => (PolicySession?)s).FirstOrDefault();
            if (hit is not { } p) _pin = null;
            else if (p.IsPlaying)
            {
                var run = pin.RunSince ?? p.PlayingSince;
                if (pin.RunSince is null) _pin = pin with { RunSince = run };
                if (run == p.PlayingSince) return pin.Key;
                _pin = null;   // it stopped and started again on its own: no longer the user's pick
            }
            else if (pin.RunSince is null && now - pin.At <= IntentWindow)
            {
                recheck = Min(recheck, pin.At + IntentWindow);
                return pin.Key;   // waiting for Windows to report it playing
            }
            else _pin = null;
        }

        // The most recently started playing run (ties: what is shown, then Windows' current, then a stable order).
        PolicySession? best = null;
        foreach (var s in sessions)
        {
            if (s.Key == SpotifyKey || !s.IsPlaying) continue;
            if (best is not { } b) { best = s; continue; }
            var c = Nullable.Compare(s.PlayingSince, b.PlayingSince);
            if (c > 0 || (c == 0 && Rank(s) > Rank(b))) best = s;
        }
        if (best is { } winner) return winner.Key;

        // Nothing plays: the last shown stays, paused.
        if (_shown is { } shown && Exists(sessions, shown)) return shown;
        PolicySession? last = null;
        foreach (var s in sessions)
            if (s.LastPlayingAt is not null && (last is not { } l || s.LastPlayingAt > l.LastPlayingAt)) last = s;
        if (last is { } lp) return lp.Key;
        if (spotify is not null) return SpotifyKey;
        foreach (var s in sessions) if (s.IsWindowsCurrent) return s.Key;
        return sessions.Count > 0 ? sessions[0].Key : SpotifyKey;
    }

    private int Rank(PolicySession s) => (s.Key == _shown ? 2 : 0) + (s.IsWindowsCurrent ? 1 : 0);

    private static bool Exists(IReadOnlyList<PolicySession> sessions, string key)
    {
        foreach (var s in sessions) if (s.Key == key) return true;
        return false;
    }

    private static DateTimeOffset? Min(DateTimeOffset? a, DateTimeOffset b) => a is { } x && x < b ? x : b;
}
