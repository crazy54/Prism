using System.Globalization;

namespace PrismControl.Eq;

/// <summary>What a backend can do (research eq.md §8).</summary>
[Flags]
public enum EqCapabilities
{
    None = 0,
    /// <summary>Per-band gain.</summary>
    GainBands = 1 << 0,
    /// <summary>Frequency / Q / type are editable.</summary>
    ParametricBands = 1 << 1,
    BandEnable = 1 << 2,
    /// <summary>A backend-native preset list with select.</summary>
    Presets = 1 << 3,
    /// <summary>An ordered short list (Sonar favorites).</summary>
    PresetFavorites = 1 << 4,
    /// <summary>Sonar: game/chat/media/aux/mic. APO: one per device.</summary>
    MultipleChannels = 1 << 5,
    /// <summary>APO preamp, Sonar generalGain (0..12 only).</summary>
    Preamp = 1 << 6,
    /// <summary>Sonar bass / voice clarity / treble boosts.</summary>
    ToneKnobs = 1 << 7,
    /// <summary>Sonar defaultData; APO: the active preset's values.</summary>
    ResetToDefault = 1 << 8,
    EqBypass = 1 << 9,
    /// <summary>Detects edits made outside Prism Control (poll / file watch).</summary>
    ExternalChanges = 1 << 10,
    /// <summary>The whole-channel effects bypass (Sonar globalEnableState).</summary>
    EffectsBypass = 1 << 11,
}

public enum EqFilterType { Peaking, LowShelf, HighShelf, LowPass, HighPass, Notch, BandPass, AllPass }

public sealed record EqLimits(double MinGainDb, double MaxGainDb, double MinHz, double MaxHz, double MinQ, double MaxQ, int MaxBands)
{
    /// <summary>Sonar's UI ranges (the server does not clamp; we do).</summary>
    public static readonly EqLimits Sonar = new(-12, 12, 20, 20000, 0.5, 10, 10);
    /// <summary>Our choice for APO (APO itself accepts wider values).</summary>
    public static readonly EqLimits Apo = new(-30, 30, 10, 22000, 0.1, 30, 32);

    public double ClampGain(double db) => Math.Clamp(db, MinGainDb, MaxGainDb);
}

public enum EqChannelKind { Playback, Capture }

/// <summary>One EQ'able stream: a Sonar channel (game, chatRender, media, aux, chatCapture) or an APO device ({guid}).</summary>
public sealed record EqChannel(string Id, string Name, EqChannelKind Kind, bool IsActive, string? EndpointId)
{
    /// <summary>A short name for frames ("Game", "Speakers" for "Speakers (Example Audio)").</summary>
    public string ShortName
    {
        get
        {
            var n = Name;
            var i = n.IndexOf(" (", StringComparison.Ordinal);
            if (i > 0) n = n[..i];
            return n.Length <= 14 ? n : n[..14].TrimEnd();
        }
    }
}

/// <summary>One filter. <see cref="Index"/> is 1-based (Sonar filter1..filter10, APO "Filter N").</summary>
public sealed record EqBand(int Index, bool Enabled, EqFilterType Type, double FrequencyHz, double GainDb, double Q)
{
    /// <summary>Filter types whose gain does something (pass/notch filters ignore gain).</summary>
    public bool HasGain => Type is EqFilterType.Peaking or EqFilterType.LowShelf or EqFilterType.HighShelf;
}

/// <summary>Sonar's one-knob tone controls (Game, Media and Aux) and the preamp / general gain.</summary>
public enum EqKnob { BassBoost, VoiceClarity, TrebleBoost, Preamp }

/// <summary>What a gain dial edits: a filter (1-based index) or a knob.</summary>
public readonly record struct EqTarget(int Band, EqKnob? Knob)
{
    public static EqTarget ForBand(int index) => new(index, null);
    public static EqTarget ForKnob(EqKnob knob) => new(0, knob);
    public bool IsKnob => Knob is not null;

    /// <summary>The setting value: "1".."10" or "bass", "voice", "treble", "preamp".</summary>
    public string SettingValue => Knob switch
    {
        EqKnob.BassBoost => "bass",
        EqKnob.VoiceClarity => "voice",
        EqKnob.TrebleBoost => "treble",
        EqKnob.Preamp => "preamp",
        _ => Band.ToString(CultureInfo.InvariantCulture),
    };

    public static EqTarget Parse(string? value, EqTarget fallback)
    {
        var v = (value ?? "").Trim().ToLowerInvariant();
        return v switch
        {
            "bass" or "bassboost" => ForKnob(EqKnob.BassBoost),
            "voice" or "voiceclarity" => ForKnob(EqKnob.VoiceClarity),
            "treble" or "trebleboost" => ForKnob(EqKnob.TrebleBoost),
            "preamp" or "gain" => ForKnob(EqKnob.Preamp),
            _ when int.TryParse(v, NumberStyles.Integer, CultureInfo.InvariantCulture, out var i) && i >= 1 => ForBand(i),
            _ => fallback,
        };
    }

    public override string ToString() => SettingValue;
}

public sealed record EqPreset(string Id, string Name, bool IsFavorite, int FavoritePosition, bool IsBuiltIn);

public enum EqToggleScope
{
    /// <summary>The EQ switch (Sonar parametricEQ.enabled + the linked boosts; APO: the device's block).</summary>
    Eq,
    /// <summary>Every effect on the channel (Sonar globalEnableState). APO: same as Eq.</summary>
    AllEffects,
}

public enum EqResetScope
{
    /// <summary>Only the gain of one filter or knob.</summary>
    Gain,
    /// <summary>The whole filter (gain, frequency, Q, type, enabled).</summary>
    Band,
    AllBands,
    Knobs,
    Everything,
}

/// <summary>A snapshot of one channel. Immutable; every change produces a new one with a higher <see cref="Version"/>.</summary>
public sealed record EqState(
    string ChannelId,
    bool Enabled,
    bool EffectsEnabled,
    IReadOnlyList<EqBand> Bands,
    IReadOnlyDictionary<EqKnob, double> Knobs,
    EqPreset? ActivePreset,
    bool ModifiedFromDefault,
    EqLimits Limits,
    long Version)
{
    public EqBand? Band(int index) => Bands.FirstOrDefault(b => b.Index == index);

    public double? Gain(EqTarget target) => target.Knob is { } k
        ? Knobs.TryGetValue(k, out var v) ? v : null
        : Band(target.Band)?.GainDb;

    public bool Supports(EqTarget target) => target.Knob is { } k ? Knobs.ContainsKey(k) : Band(target.Band) is not null;

    /// <summary>Gain limits for a target (Sonar generalGain is 0..12).</summary>
    public (double Min, double Max) GainRange(EqTarget target) =>
        target.Knob == EqKnob.Preamp && Limits == EqLimits.Sonar ? (0, 12) : (Limits.MinGainDb, Limits.MaxGainDb);
}

public sealed record EqChangedEventArgs(string ChannelId, EqState? State, bool External);

public enum EqAvailabilityCode
{
    Ok,
    /// <summary>Not probed yet.</summary>
    Unknown,
    /// <summary>SteelSeries GG is not running (no discovery file, or the GG core refuses connections).</summary>
    NotRunning,
    /// <summary>Sonar is turned off in GG (a user setting).</summary>
    Disabled,
    /// <summary>Sonar is starting or restarting.</summary>
    Starting,
    /// <summary>Sonar did not answer (port changed, crashed, timed out).</summary>
    Unreachable,
    /// <summary>Equalizer APO is not installed.</summary>
    NotInstalled,
    /// <summary>Equalizer APO is installed but not on any device.</summary>
    NoDevices,
    /// <summary>Prism Control's include is not in config.txt yet (APO is opt-in).</summary>
    NotAttached,
    /// <summary>Another app removed our include line from config.txt.</summary>
    Detached,
    Error,
    /// <summary>
    /// Sonar answered, but badly: a 5xx, a reply that isn't JSON (or not the expected shape), or no answer in time.
    /// Transient: the client backs off and retries on its own; actions keep their last good frame meanwhile.
    /// </summary>
    ServerError,
    /// <summary>The action's channel setting names a channel the current backend doesn't have (never silently another one).</summary>
    ChannelMissing,
}

public sealed record EqAvailability(EqAvailabilityCode Code, string Reason, string? Detail = null)
{
    public bool Available => Code == EqAvailabilityCode.Ok;

    /// <summary>A passing backend error (<see cref="EqAvailabilityCode.ServerError"/>): keep showing the last good state, marked.</summary>
    public bool IsTransient => Code == EqAvailabilityCode.ServerError;

    /// <summary>A short upper-case line for keys and dials.</summary>
    public string ShortText => Code switch
    {
        EqAvailabilityCode.Ok => "READY",
        EqAvailabilityCode.Unknown => "CONNECTING",
        EqAvailabilityCode.NotRunning => "GG NOT RUNNING",
        EqAvailabilityCode.Disabled => "SONAR IS OFF",
        EqAvailabilityCode.Starting => "SONAR STARTING",
        EqAvailabilityCode.Unreachable => "SONAR OFFLINE",
        EqAvailabilityCode.NotInstalled => "NO EQUALIZER APO",
        EqAvailabilityCode.NoDevices => "APO: NO DEVICE",
        EqAvailabilityCode.NotAttached => "APO NOT ATTACHED",
        EqAvailabilityCode.Detached => "APO DETACHED",
        EqAvailabilityCode.ServerError => "SONAR ERROR",
        EqAvailabilityCode.ChannelMissing => "CHANNEL MISSING",
        _ => "EQ ERROR",
    };

    public static readonly EqAvailability Ok = new(EqAvailabilityCode.Ok, "Connected.");
    public static readonly EqAvailability Unknown = new(EqAvailabilityCode.Unknown, "Connecting…");
}

/// <summary>A backend call that needs the backend, while it is unavailable.</summary>
public sealed class EqUnavailableException(EqAvailability availability)
    : InvalidOperationException(availability.Reason)
{
    public EqAvailability Availability { get; } = availability;
}

/// <summary>The preset no longer exists for that channel (deleted in Sonar, or a stale key).</summary>
public sealed class EqPresetMissingException(string channelId, string presetId)
    : InvalidOperationException($"The preset {presetId} no longer exists on {channelId}.")
{
    public string ChannelId { get; } = channelId;
    public string PresetId { get; } = presetId;
}

/// <summary>A partial filter edit for <see cref="IEqBackend.SetBand"/>.</summary>
public sealed record EqBandPatch(bool? Enabled = null, EqFilterType? Type = null, double? FrequencyHz = null, double? GainDb = null, double? Q = null);
