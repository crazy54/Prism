using System.Globalization;
using System.Text.Json.Nodes;

namespace PrismControl.Eq.Sonar;

/// <summary>Sonar's channels ("virtual audio devices") and their names (research eq.md §4.1).</summary>
public static class SonarChannels
{
    public const string Game = "game", Chat = "chatRender", Media = "media", Aux = "aux", Mic = "chatCapture";

    /// <summary>In Sonar's own order.</summary>
    public static readonly IReadOnlyList<string> All = [Game, Chat, Media, Aux, Mic];

    public static string Name(string vad) => vad switch
    {
        Game => "Game",
        Chat => "Chat",
        Media => "Media",
        Aux => "Aux",
        Mic => "Mic",
        _ => vad,
    };

    public static EqChannelKind Kind(string vad) => vad == Mic ? EqChannelKind.Capture : EqChannelKind.Playback;

    public static bool IsKnown(string? vad) => vad is not null && All.Contains(vad);

    /// <summary>Game, Media and Aux have the bass / voice clarity / treble boosts and the general gain.</summary>
    public static bool HasToneKnobs(string vad) => vad is Game or Media or Aux;
}

/// <summary>
/// Reads and edits one Sonar config held as a raw <see cref="JsonObject"/>. We never map it to a typed DTO: shapes
/// differ per channel and schema version, and unknown keys must survive the round trip (research eq.md §4.8).
/// </summary>
public static class SonarConfig
{
    public const int FilterCount = 10;

    public static string? Id(JsonObject config) => Str(config["id"]);
    public static string? Name(JsonObject config) => Str(config["name"]);
    public static string? Vad(JsonObject config) => Str(config["virtualAudioDevice"]);

    public static JsonObject? Data(JsonObject config) => config["data"] as JsonObject;
    public static JsonObject? DefaultData(JsonObject config) => config["defaultData"] as JsonObject;

    public static string KnobKey(EqKnob knob) => knob switch
    {
        EqKnob.BassBoost => "bassBoostState",
        EqKnob.VoiceClarity => "voiceClarityState",
        EqKnob.TrebleBoost => "trebleBoostState",
        _ => "generalGain",
    };

    public static EqFilterType ParseType(string? type) => (type ?? "").ToLowerInvariant() switch
    {
        "peakingeq" => EqFilterType.Peaking,
        "lowshelving" => EqFilterType.LowShelf,
        "highshelving" => EqFilterType.HighShelf,
        "lowpass" => EqFilterType.LowPass,
        "highpass" => EqFilterType.HighPass,
        "notchfilter" => EqFilterType.Notch,
        "bandpasspeakq" or "bandpasspeak0db" => EqFilterType.BandPass,
        "allpass" or "bypass" => EqFilterType.AllPass,
        _ => EqFilterType.Peaking,
    };

    public static string TypeName(EqFilterType type) => type switch
    {
        EqFilterType.LowShelf => "lowShelving",
        EqFilterType.HighShelf => "highShelving",
        EqFilterType.LowPass => "lowPass",
        EqFilterType.HighPass => "highPass",
        EqFilterType.Notch => "notchFilter",
        EqFilterType.BandPass => "bandPassPeakQ",
        EqFilterType.AllPass => "allPass",
        _ => "peakingEQ",
    };

    public static IReadOnlyList<EqBand> Bands(JsonObject? data)
    {
        var list = new List<EqBand>(FilterCount);
        if (data?["parametricEQ"] is not JsonObject peq) return list;
        for (var i = 1; i <= FilterCount; i++)
        {
            if (peq["filter" + i.ToString(CultureInfo.InvariantCulture)] is not JsonObject f) continue;
            list.Add(new EqBand(i, Bool(f["enabled"]) ?? true, ParseType(Str(f["type"])), Num(f["frequency"]) ?? 1000, Num(f["gain"]) ?? 0, Num(f["qFactor"]) ?? 0.707));
        }
        return list;
    }

    public static IReadOnlyDictionary<EqKnob, double> Knobs(JsonObject? data)
    {
        var knobs = new Dictionary<EqKnob, double>();
        if (data is null) return knobs;
        foreach (var k in new[] { EqKnob.BassBoost, EqKnob.VoiceClarity, EqKnob.TrebleBoost })
            if (data[KnobKey(k)] is JsonObject o) knobs[k] = Num(o["value"]) ?? 0; // enabled mirrors the EQ switch
        if (Num(data["generalGain"]) is { } g) knobs[EqKnob.Preamp] = g;
        return knobs;
    }

    public static bool EqEnabled(JsonObject? data) => Bool(data?["parametricEQ"]?["enabled"]) ?? true;
    public static bool EffectsEnabled(JsonObject? data) => Bool(data?["globalEnableState"]) ?? true;

    /// <summary>The EQ part of data differs from the factory values (defaultData).</summary>
    public static bool Modified(JsonObject config)
    {
        var data = Data(config);
        var def = DefaultData(config);
        if (data is null || def is null) return false;
        if (EqEnabled(data) != EqEnabled(def)) return true;
        var a = Bands(data);
        var b = Bands(def);
        if (a.Count != b.Count) return true;
        for (var i = 0; i < a.Count; i++)
        {
            var x = a[i];
            var y = b[i];
            if (x.Enabled != y.Enabled || x.Type != y.Type || Math.Abs(x.FrequencyHz - y.FrequencyHz) > 0.01 || Math.Abs(x.GainDb - y.GainDb) > 0.01 || Math.Abs(x.Q - y.Q) > 0.001) return true;
        }
        var ka = Knobs(data);
        var kb = Knobs(def);
        foreach (var (k, v) in ka) if (!kb.TryGetValue(k, out var w) || Math.Abs(v - w) > 0.01) return true;
        return false;
    }

    public static EqState ToState(string vad, JsonObject config, long version)
    {
        var data = Data(config);
        var preset = Id(config) is { } id
            ? new EqPreset(id, Name(config) ?? "Custom", Bool(config["isFavorite"]) ?? false, (int)(Num(config["favoritePosition"]) ?? -1), Bool(config["isPreset"]) ?? false)
            : null;
        return new EqState(vad, EqEnabled(data), EffectsEnabled(data), Bands(data), Knobs(data), preset, Modified(config), EqLimits.Sonar, version);
    }

    // ------------------------------------------------------------------ edits (mutate in place; the caller holds the lock)

    public static JsonObject Filter(JsonObject data, int index)
    {
        var peq = data["parametricEQ"] as JsonObject ?? throw new InvalidOperationException("This Sonar config has no parametric EQ.");
        return peq["filter" + index.ToString(CultureInfo.InvariantCulture)] as JsonObject ?? throw new ArgumentOutOfRangeException(nameof(index), $"Filter {index} does not exist.");
    }

    public static void SetGain(JsonObject data, EqTarget target, double gainDb)
    {
        var g = Math.Round(gainDb, 2);
        switch (target.Knob)
        {
            case null:
                Filter(data, target.Band)["gain"] = Math.Clamp(g, EqLimits.Sonar.MinGainDb, EqLimits.Sonar.MaxGainDb);
                break;
            case EqKnob.Preamp:
                if (data["generalGain"] is null) throw new InvalidOperationException("This channel has no general gain.");
                data["generalGain"] = Math.Clamp(Math.Round(g, 1), 0, 12);
                break;
            case { } k:
                if (data[KnobKey(k)] is not JsonObject o) throw new InvalidOperationException($"This channel has no {EqMath.KnobName(k)} boost.");
                o["value"] = Math.Clamp(g, EqLimits.Sonar.MinGainDb, EqLimits.Sonar.MaxGainDb);
                // Sonar's UI links each boost's enabled flag to the EQ switch when it sets a value.
                o["enabled"] = EqEnabled(data);
                break;
        }
    }

    public static void SetBand(JsonObject data, int index, EqBandPatch p)
    {
        var f = Filter(data, index);
        var l = EqLimits.Sonar;
        if (p.Enabled is { } en) f["enabled"] = en;
        if (p.Type is { } t) f["type"] = TypeName(t);
        if (p.FrequencyHz is { } hz) f["frequency"] = Math.Round(Math.Clamp(hz, l.MinHz, l.MaxHz), 2);
        if (p.GainDb is { } g) f["gain"] = Math.Round(Math.Clamp(g, l.MinGainDb, l.MaxGainDb), 2);
        if (p.Q is { } q) f["qFactor"] = Math.Round(Math.Clamp(q, l.MinQ, l.MaxQ), 4);
    }

    public static void SetEnabled(JsonObject data, EqToggleScope scope, bool enabled)
    {
        if (scope == EqToggleScope.AllEffects)
        {
            data["globalEnableState"] = enabled;
            return;
        }
        if (data["parametricEQ"] is JsonObject peq) peq["enabled"] = enabled;
        foreach (var k in new[] { EqKnob.BassBoost, EqKnob.VoiceClarity, EqKnob.TrebleBoost })
            if (data[KnobKey(k)] is JsonObject o) o["enabled"] = enabled;
    }

    public static void Reset(JsonObject data, JsonObject? defaults, EqResetScope scope, EqTarget target)
    {
        switch (scope)
        {
            case EqResetScope.Gain:
                if (target.Knob is { } k)
                {
                    var dv = k == EqKnob.Preamp ? Num(defaults?["generalGain"]) : Num(defaults?[KnobKey(k)]?["value"]);
                    SetGain(data, target, dv ?? 0);
                }
                else
                {
                    var dv = defaults is null ? null : Num(defaults["parametricEQ"]?["filter" + target.Band.ToString(CultureInfo.InvariantCulture)]?["gain"]);
                    SetGain(data, target, dv ?? 0);
                }
                break;
            case EqResetScope.Band:
                if (target.Knob is not null) { Reset(data, defaults, EqResetScope.Gain, target); break; }
                var key = "filter" + target.Band.ToString(CultureInfo.InvariantCulture);
                if (defaults?["parametricEQ"]?[key] is JsonObject df && data["parametricEQ"] is JsonObject peq) peq[key] = df.DeepClone();
                else SetGain(data, target, 0);
                break;
            case EqResetScope.AllBands:
                if (defaults?["parametricEQ"] is JsonObject dpeq) data["parametricEQ"] = dpeq.DeepClone();
                break;
            case EqResetScope.Knobs:
                foreach (var kn in new[] { EqKnob.BassBoost, EqKnob.VoiceClarity, EqKnob.TrebleBoost })
                    if (defaults?[KnobKey(kn)] is JsonObject dk && data.ContainsKey(KnobKey(kn))) data[KnobKey(kn)] = dk.DeepClone();
                if (defaults?["generalGain"] is { } gg && data.ContainsKey("generalGain")) data["generalGain"] = gg.DeepClone();
                break;
            case EqResetScope.Everything:
                if (defaults is not null)
                {
                    foreach (var (k2, v) in defaults.ToList()) data[k2] = v?.DeepClone();
                }
                break;
        }
    }

    public static string? Str(JsonNode? n) => n is JsonValue v && v.TryGetValue<string>(out var s) ? s : null;

    public static bool? Bool(JsonNode? n) => n is JsonValue v && v.TryGetValue<bool>(out var b) ? b : null;

    /// <summary>A number from parsed JSON or from a value we set (int, long, float, decimal, double), or a numeric string.</summary>
    public static double? Num(JsonNode? n)
    {
        if (n is not JsonValue v) return null;
        if (v.TryGetValue<double>(out var d)) return d;
        if (v.TryGetValue<int>(out var i)) return i;
        if (v.TryGetValue<long>(out var l)) return l;
        if (v.TryGetValue<float>(out var f)) return f;
        if (v.TryGetValue<decimal>(out var m)) return (double)m;
        if (v.TryGetValue<string>(out var s) && double.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out var p)) return p;
        return v.GetValueKind() == System.Text.Json.JsonValueKind.Number && double.TryParse(v.ToJsonString(), NumberStyles.Float, CultureInfo.InvariantCulture, out var q) ? q : null;
    }
}
