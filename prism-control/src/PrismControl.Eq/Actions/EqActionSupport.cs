using System.Text.Json.Nodes;
using PrismControl.Core.Actions;
using PrismControl.Core.PropertyInspector;

namespace PrismControl.Eq;

/// <summary>
/// Settings every EQ action shares. The backend is not here: it is plugin-wide, and the PI edits it directly in the
/// global "eq" section (<see cref="EqGlobalSettings.BackendField"/>).
/// </summary>
public class EqActionSettings
{
    /// <summary>
    /// Sonar: game, chatRender, media, aux, chatCapture. APO: the device {guid}. Empty = the first active channel. A set
    /// channel the backend doesn't have shows "CHANNEL MISSING"; it is never swapped for another one.
    /// </summary>
    public string Channel { get; set; } = "";
}

/// <summary>
/// Connects one action instance to the shared <see cref="EqService"/>: forwards its events into the action's mailbox
/// (service events arrive on thread-pool threads) and holds the poll lease while the action is visible.
/// </summary>
internal sealed class EqLink : IDisposable
{
    private readonly EqService _svc;
    private readonly IDisposable _lease;
    private readonly EventHandler<EqChangedEventArgs> _changed;
    private readonly EventHandler<EqAvailability> _availability;
    private readonly EventHandler _backend;

    /// <param name="onChanged">Runs in the action's mailbox for every channel change.</param>
    /// <param name="onReload">Runs in the action's mailbox when availability or the backend changes.</param>
    public EqLink(ActionBase action, EqService svc, Func<EqChangedEventArgs, Task> onChanged, Func<Task> onReload)
    {
        _svc = svc;
        _changed = (_, e) => action.Post(() => onChanged(e));
        _availability = (_, _) => action.Post(onReload);
        _backend = (_, _) => action.Post(onReload);
        svc.Changed += _changed;
        svc.AvailabilityChanged += _availability;
        svc.BackendChanged += _backend;
        _lease = svc.Watch();
    }

    public void Dispose()
    {
        _svc.Changed -= _changed;
        _svc.AvailabilityChanged -= _availability;
        _svc.BackendChanged -= _backend;
        _lease.Dispose();
    }
}

/// <summary>
/// Keeps an open PI in step with its action through Core's refresh API: the whole form when the backend changed (the
/// fields differ per backend; the PI then re-requests every list), the channel-dependent lists when the channel
/// changed, and otherwise just the status line.
/// </summary>
internal sealed class EqPiSync
{
    private string? _backend;
    private string? _channel;

    /// <summary>The PI just opened: the hello it asks for carries the current form and lists.</summary>
    public void Opened(EqService? svc, string channel)
    {
        _backend = svc?.BackendId;
        _channel = channel;
    }

    /// <param name="channelLists">The optionsFrom lists that depend on the channel ("eq.bands", "eq.presets").</param>
    public void Sync(ActionBase action, EqService? svc, string channel, object? state, params string[] channelLists)
    {
        if (!action.IsPropertyInspectorVisible) return;
        var backend = svc?.BackendId;
        if (backend != _backend)
        {
            _backend = backend;
            _channel = channel;
            action.RefreshPropertyInspectorForm();
            return;
        }
        if (!string.Equals(channel, _channel, StringComparison.Ordinal))
        {
            _channel = channel;
            if (channelLists.Length > 0) action.RefreshPropertyInspectorOptions(channelLists);
        }
        action.SendToPropertyInspector("pi.state", state);
    }
}

/// <summary>Property-inspector pieces shared by the EQ actions (auto forms via <see cref="PiForm"/>; no custom HTML).</summary>
internal static class EqPi
{
    public const string SpotifyNote =
        "Spotify's built-in equalizer can't be controlled by other apps: Spotify offers no API for it. To EQ Spotify, send it to Sonar's Media channel (in Sonar), or use Equalizer APO on your output device.";

    public const string SonarEditNote =
        "Edits change your Sonar preset, just like editing it in Sonar. Push the dial to reset a band to the preset's value.";

    public static readonly (string Value, string Label)[] Backends = [(EqService.Sonar, "SteelSeries Sonar (default)"), (EqService.Apo, "Equalizer APO")];

    /// <summary>The backend picker edits the global "eq.backend" (one backend for every EQ action), then the channel.</summary>
    public static PiForm Head(PiForm f) => f
        .Heading("EQ")
        .Select(EqGlobalSettings.BackendField, "Backend", Backends)
        .Select("channel", "Channel", optionsFrom: "eq.channels");

    public static PiForm Tail(PiForm f, EqService? svc)
    {
        if (svc?.BackendId == EqService.Apo)
        {
            f.Heading("Equalizer APO")
             .Button("eq.apo.attach", "Attach Equalizer APO")
             .Button("eq.apo.detach", "Detach")
             .Info("APO", "Attach adds one Include line to the top of config.txt; Prism Control then edits only its own prism-control.txt. APO acts after Sonar when both run.");
        }
        return f.Info("Status", stateKey: "status")
                .Info("Spotify", SpotifyNote);
    }

    /// <summary>The PI status line: the action's own problem first (a missing channel, a Sonar error), else the backend's.</summary>
    public static string Status(EqService? svc, EqAvailability? problem, string? detail = null)
    {
        if (svc is null) return "The EQ module failed to start (see the plugin log).";
        var a = problem ?? svc.Backend.Availability;
        var head = $"{EqService.DisplayName(svc.BackendId)}: {(a.Available ? "connected." : a.Reason)}";
        return detail is null ? head : head + " " + detail;
    }

    /// <summary>The marker a frame carries for a passing Sonar error while it keeps the last good state (else null).</summary>
    public static string? TransientMark(EqAvailability? problem) => problem is { IsTransient: true } p ? p.ShortText : null;

    /// <summary>Answers the shared PI requests; Handled = false when it is not one of ours.</summary>
    public static async Task<(bool Handled, object? Result)> HandleAsync(EqService svc, string type, string? channelSetting, CancellationToken ct)
    {
        switch (type)
        {
            case "eq.channels":
            {
                var list = await svc.Backend.GetChannelsAsync(ct).ConfigureAwait(false);
                return (true, list.Select(c => new { value = c.Id, label = c.Name + (c.IsActive ? "" : svc.BackendId == EqService.Sonar ? " (off in Sonar)" : " (not present)") }).ToList());
            }
            case "eq.bands":
            {
                EqState? state = null;
                try
                {
                    if (await svc.ResolveChannelAsync(channelSetting, ct).ConfigureAwait(false) is not { } ch) return (true, Array.Empty<object>());
                    state = await svc.Backend.GetStateAsync(ch.Id, TimeSpan.FromSeconds(2), ct).ConfigureAwait(false);
                }
                catch (EqUnavailableException) { /* the generic band list; the status line explains */ }
                return (true, BandOptions(state));
            }
            case "eq.presets":
            {
                IReadOnlyList<EqPreset> presets;
                try
                {
                    if (await svc.ResolveChannelAsync(channelSetting, ct).ConfigureAwait(false) is not { } ch) return (true, Array.Empty<object>());
                    presets = await svc.Backend.GetPresetsAsync(ch.Id, TimeSpan.FromSeconds(5), ct).ConfigureAwait(false);
                }
                catch (EqUnavailableException) { return (true, Array.Empty<object>()); }
                var favorites = presets.Where(p => p.IsFavorite).OrderBy(p => p.FavoritePosition);
                var rest = presets.Where(p => !p.IsFavorite).OrderBy(p => p.Name, StringComparer.CurrentCultureIgnoreCase);
                return (true, favorites.Select(p => new { value = p.Id, label = "★ " + p.Name })
                    .Concat(rest.Select(p => new { value = p.Id, label = p.Name })).ToList());
            }
            case "eq.apo.attach":
            {
                if (svc.ApoBackend is not { } apo) return (true, null);
                try { await apo.AttachAsync(ct).ConfigureAwait(false); }
                catch (EqUnavailableException) { /* not installed: the status line says so */ }
                svc.PollSoon();
                return (true, null);
            }
            case "eq.apo.detach":
            {
                if (svc.ApoBackend is not { } apo) return (true, null);
                await apo.DetachAsync(ct).ConfigureAwait(false);
                svc.PollSoon();
                return (true, null);
            }
            case "eq.probe":
                await svc.Backend.ProbeAsync(ct).ConfigureAwait(false);
                return (true, null);
        }
        return (false, null);
    }

    public static List<object> BandOptions(EqState? state)
    {
        var list = new List<object>();
        if (state is null)
        {
            for (var i = 1; i <= 10; i++) list.Add(new { value = i.ToString(System.Globalization.CultureInfo.InvariantCulture), label = $"Band {i}" });
            return list;
        }
        foreach (var b in state.Bands)
            list.Add(new { value = EqTarget.ForBand(b.Index).SettingValue, label = $"Band {b.Index} · {EqMath.FormatHz(b.FrequencyHz)}{(b.Enabled ? "" : " (off)")}" });
        foreach (var k in new[] { EqKnob.BassBoost, EqKnob.VoiceClarity, EqKnob.TrebleBoost, EqKnob.Preamp })
            if (state.Knobs.ContainsKey(k))
                list.Add(new { value = EqTarget.ForKnob(k).SettingValue, label = k switch
                {
                    EqKnob.BassBoost => "Bass boost",
                    EqKnob.VoiceClarity => "Voice clarity",
                    EqKnob.TrebleBoost => "Treble boost",
                    _ => state.Limits == EqLimits.Sonar ? "Gain (0 to +12 dB)" : "Preamp",
                } });
        return list;
    }

    /// <summary>
    /// Undoes this session's edits on the channel (the PI's "Undo my edits" button). False when there was nothing to
    /// undo or Sonar couldn't take it (the reason goes to <paramref name="problem"/>).
    /// </summary>
    public static async Task<bool> RevertAsync(EqService svc, EqChannel? channel, CancellationToken ct, Action<EqAvailability> problem)
    {
        if (channel is null) return false;
        try { return await svc.Backend.RevertSessionAsync(channel.Id, ct).ConfigureAwait(false); }
        catch (EqUnavailableException ex) { problem(ex.Availability); return false; }
        catch (Sonar.SonarHttpException ex) { problem(new EqAvailability(EqAvailabilityCode.Error, "Sonar refused the undo.", ex.Message)); return false; }
    }

    public static string? Str(JsonNode? n) => n is JsonValue v && v.TryGetValue<string>(out var s) ? s : n?.ToString();
}
