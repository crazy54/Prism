using System.Globalization;
using System.Text.Json.Nodes;
using PrismControl.Eq.Sonar;

namespace PrismControl.Eq.Tests.Fakes;

/// <summary>
/// An in-memory SteelSeries Sonar with the real route shapes (research eq.md §4), served over loopback HTTP.
/// Fictional data only ("Example …" presets, placeholder ids). Records every request so tests can assert that no
/// forbidden endpoint is ever called and that EQ writes stay under the rate limit.
/// </summary>
public sealed class FakeSonar : SonarFixtureState, IAsyncDisposable
{
    private readonly object _gate = new();

    public FakeHttpServer Http { get; }

    public FakeSonar(int port = 0)
    {
        SonarFixtures.Populate(this);
        Http = new FakeHttpServer(Handle, port: port);
    }

    public string Address => "http://" + Http.Authority;
    public IReadOnlyList<FakeRequest> Requests => Http.Requests;
    public IReadOnlyList<FakeRequest> Puts(string path) => Requests.Where(r => r.Method == "PUT" && r.Path == path).ToList();
    /// <summary>Every request that could change Sonar (anything but GET).</summary>
    public IReadOnlyList<FakeRequest> Writes => Requests.Where(r => r.Method != "GET").ToList();

    /// <summary>
    /// A misbehaving Sonar: when set and it returns a response, that response is sent instead of the real route
    /// (a 500, an HTML page, truncated JSON, or a long <see cref="FakeResponse.Delay"/> for a timeout). Null = normal.
    /// </summary>
    public Func<FakeRequest, FakeResponse?>? Fault { get; set; }

    /// <summary>Canned bad replies for <see cref="Fault"/>.</summary>
    public static class Bad
    {
        public static FakeResponse ServerError() => new(500, "{\"error\":\"Internal Server Error\"}");
        public static FakeResponse Html() => new(200, "<!doctype html><html><head><title>Example</title></head><body>Not Sonar</body></html>", "text/html");
        public static FakeResponse TruncatedJson() => new(200, "{\"mode\":\"classic\",\"devices\":[{\"virtualAudioDev");
        public static FakeResponse Hang(TimeSpan delay) => new(200, "{}", Delay: delay);
    }

    public JsonObject SelectedConfig(string vad) { lock (_gate) return (JsonObject)Configs[Selected[vad]].DeepClone(); }

    public void Edit(string vad, Action<JsonObject> edit)
    {
        lock (_gate) edit(Configs[Selected[vad]]);
    }

    public double FilterGain(string vad, int filter) =>
        SonarConfig.Num(SelectedConfig(vad)["data"]!["parametricEQ"]!["filter" + filter.ToString(CultureInfo.InvariantCulture)]!["gain"]) ?? double.NaN;

    /// <summary>The endpoints research eq.md §4.10 says Prism Control must never call.</summary>
    public static bool IsForbidden(FakeRequest r) =>
        r.Path.StartsWith("/mode/", StringComparison.OrdinalIgnoreCase) ||
        (r.Method != "GET" && (r.Path.StartsWith("/classicRedirections", StringComparison.OrdinalIgnoreCase) || r.Path.StartsWith("/streamRedirections", StringComparison.OrdinalIgnoreCase))) ||
        r.Path.StartsWith("/audioInitialization", StringComparison.OrdinalIgnoreCase) ||
        r.Path.StartsWith("/onboarding", StringComparison.OrdinalIgnoreCase) ||
        r.Method == "DELETE" ||
        r.Path.EndsWith("/export", StringComparison.OrdinalIgnoreCase) ||
        r.Path.StartsWith("/audioSamples", StringComparison.OrdinalIgnoreCase) ||
        (r.Method != "GET" && r.Path.StartsWith("/fallbackSettings", StringComparison.OrdinalIgnoreCase)) ||
        (r.Method != "GET" && r.Path.StartsWith("/keyboardShortcuts", StringComparison.OrdinalIgnoreCase)) ||
        r.Path.StartsWith("/analytics", StringComparison.OrdinalIgnoreCase) ||
        r.Method == "POST";

    private FakeResponse Handle(FakeRequest r)
    {
        if (Fault?.Invoke(r) is { } bad) return bad;
        lock (_gate)
        {
            var p = r.Path;
            switch (r.Method)
            {
                case "GET" when p == "/v1/status": return FakeResponse.Json(Status().ToJsonString());
                case "GET" when p == "/mode": return FakeResponse.Json("\"" + Mode + "\"");
                case "GET" when p == "/configs/selected":
                    return FakeResponse.Json(new JsonArray(SonarChannels.All.Select(v => (JsonNode)Configs[Selected[v]].DeepClone()).ToArray()).ToJsonString());
                case "GET" when p.StartsWith("/presets/", StringComparison.Ordinal):
                {
                    var vad = p["/presets/".Length..];
                    if (!PresetOrder.TryGetValue(vad, out var ids)) return FakeResponse.NotFound();
                    return FakeResponse.Json(new JsonArray(ids.Select(id => (JsonNode)new JsonObject
                    {
                        ["id"] = id, ["name"] = Configs[id]["name"]!.DeepClone(), ["isFavorite"] = Configs[id]["isFavorite"]!.DeepClone(),
                        ["favoritePosition"] = Configs[id]["favoritePosition"]!.DeepClone(),
                    }).ToArray()).ToJsonString());
                }
                case "PUT" when p == "/configs":
                {
                    var cfg = JsonNode.Parse(r.Body) as JsonObject;
                    var id = SonarConfig.Str(cfg?["id"]);
                    if (cfg is null || id is null || !Configs.TryGetValue(id, out var stored)) return new FakeResponse(400, "{\"error\":\"unknown config\"}");
                    if (SonarConfig.Num(cfg["schemaVersion"]) != SonarConfig.Num(stored["schemaVersion"]))
                        return new FakeResponse(400, $"{{\"error\":\"Incorrect SchemaVersion ({cfg["schemaVersion"]}); expecting {stored["schemaVersion"]}\"}}");
                    if (cfg["data"] is not JsonObject data || data.Count == 0) return new FakeResponse(400, "{\"error\":\"empty data\"}");
                    // The server keeps selection/favorites from the DB and stores everything else as sent.
                    var keep = (fav: stored["isFavorite"]!.DeepClone(), pos: stored["favoritePosition"]!.DeepClone());
                    var copy = (JsonObject)cfg.DeepClone();
                    copy["isFavorite"] = keep.fav;
                    copy["favoritePosition"] = keep.pos;
                    copy["updatedAt"] = "2026-10-16T12:00:00";
                    Configs[id] = copy;
                    return FakeResponse.Json(copy.ToJsonString());
                }
                case "PUT" when p.StartsWith("/configs/", StringComparison.Ordinal) && p.EndsWith("/select", StringComparison.Ordinal):
                {
                    var id = p["/configs/".Length..^"/select".Length];
                    if (!Configs.TryGetValue(id, out var cfg)) return FakeResponse.NotFound();
                    Selected[SonarConfig.Vad(cfg)!] = id;
                    return FakeResponse.Json(cfg.ToJsonString());
                }
                case "GET" when p == "/volumeSettings/classic": return FakeResponse.Json(VolumeJson().ToJsonString());
                case "PUT" when p.StartsWith("/volumeSettings/classic/", StringComparison.Ordinal):
                {
                    var seg = p.Split('/', StringSplitOptions.RemoveEmptyEntries); // volumeSettings classic {role} {Volume|Mute} {v}
                    if (seg.Length != 5) return FakeResponse.NotFound();
                    var role = seg[2] == "Master" ? SonarMixer.Master : seg[2];
                    if (!Volumes.ContainsKey(role)) return FakeResponse.NotFound();
                    var (vol, muted) = Volumes[role];
                    if (seg[3] == "Volume")
                    {
                        if (!double.TryParse(seg[4], NumberStyles.Float, CultureInfo.InvariantCulture, out var v) || seg[4].Contains(',')) return new FakeResponse(400, "{\"error\":\"bad number\"}");
                        Volumes[role] = (v, muted);
                    }
                    else if (seg[3] == "Mute") Volumes[role] = (vol, bool.Parse(seg[4]));
                    else return FakeResponse.NotFound();
                    return FakeResponse.Json(VolumeJson().ToJsonString());
                }
                case "GET" when p == "/v1/chatMix":
                    return FakeResponse.Json(new JsonObject { ["balance"] = ChatBalance, ["state"] = ChatState, ["id"] = "00000000-0000-0000-0000-000000000000" }.ToJsonString());
                case "PUT" when p == "/v1/chatMix":
                {
                    if (ChatState != "enabled") return new FakeResponse(403, "{\"error\":\"forbidden\"}");
                    var q = r.Query.Split('&').Select(x => x.Split('=')).FirstOrDefault(x => x[0] == "balance");
                    if (q is null || !double.TryParse(q[1], NumberStyles.Float, CultureInfo.InvariantCulture, out var b)) return new FakeResponse(400, "{}");
                    ChatBalance = b;
                    return FakeResponse.Json(new JsonObject { ["balance"] = ChatBalance, ["state"] = ChatState }.ToJsonString());
                }
            }
            return FakeResponse.NotFound();
        }
    }

    private JsonObject Status()
    {
        var devices = new JsonArray();
        var n = 1;
        foreach (var vad in SonarChannels.All)
        {
            var cfg = Configs[Selected[vad]];
            JsonObject Entry(string flow) => new()
            {
                ["id"] = "{0.0." + (flow == "capture" ? "1" : "0") + ".00000000}.{" + new string((char)('0' + n), 8) + "-1111-2222-3333-444444444444}",
                ["dataFlow"] = flow, ["virtualAudioDevice"] = vad, ["defaultRole"] = "console", ["isChannelEnabled"] = ChannelEnabled[vad],
                ["config"] = new JsonObject { ["id"] = cfg["id"]!.DeepClone(), ["name"] = cfg["name"]!.DeepClone() },
            };
            if (vad == SonarChannels.Mic) devices.Add(Entry("render")); // the mic shows up twice, like the real thing
            devices.Add(Entry(vad == SonarChannels.Mic ? "capture" : "render"));
            n++;
        }
        return new JsonObject { ["isEnabled"] = true, ["isOnboardingDone"] = true, ["mode"] = Mode, ["areEndpointsConfigured"] = false, ["devices"] = devices };
    }

    private JsonObject VolumeJson()
    {
        JsonObject Of(string ch) => new() { ["stream"] = new JsonObject(), ["classic"] = new JsonObject { ["volume"] = Volumes[ch].Volume, ["muted"] = Volumes[ch].Muted } };
        var devices = new JsonObject();
        foreach (var v in SonarChannels.All) devices[v] = Of(v);
        return new JsonObject { ["masters"] = Of(SonarMixer.Master), ["devices"] = devices };
    }

    public ValueTask DisposeAsync() => Http.DisposeAsync();
}

/// <summary>The data behind a fake Sonar (no server; previews use it directly).</summary>
public class SonarFixtureState
{
    public readonly Dictionary<string, JsonObject> Configs = new();          // id → full config
    public readonly Dictionary<string, string> Selected = new();             // vad → config id
    public readonly Dictionary<string, List<string>> PresetOrder = new();    // vad → ids (the /presets list)
    public readonly Dictionary<string, bool> ChannelEnabled = new();
    public readonly Dictionary<string, (double Volume, bool Muted)> Volumes = new();
    public string Mode = "classic";
    public double ChatBalance;
    public string ChatState = "finiteWheel";
}

/// <summary>Fictional Sonar configs in the real shapes (research eq.md §4.7).</summary>
public static class SonarFixtures
{
    public static string Id(int n) => $"aaaaaaaa-0000-0000-0000-{n:000000000000}";

    public static JsonObject Filters(params (string Type, double Hz, double Gain, double Q, bool On)[] f)
    {
        var o = new JsonObject { ["enabled"] = true };
        for (var i = 0; i < f.Length; i++)
            o["filter" + (i + 1)] = new JsonObject { ["enabled"] = f[i].On, ["qFactor"] = f[i].Q, ["frequency"] = f[i].Hz, ["gain"] = f[i].Gain, ["type"] = f[i].Type };
        return o;
    }

    public static JsonObject OctaveFilters(params double[] gains)
    {
        double[] hz = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
        return Filters(hz.Select((h, i) => (i == 0 ? "lowShelving" : i == 9 ? "highShelving" : "peakingEQ", h, i < gains.Length ? gains[i] : 0.0, 0.7071, true)).ToArray());
    }

    public static JsonObject GameData(JsonObject peq, double bass = 0, double treble = 0) => new()
    {
        ["bassBoostState"] = new JsonObject { ["enabled"] = true, ["value"] = bass },
        ["trebleBoostState"] = new JsonObject { ["enabled"] = true, ["value"] = treble },
        ["voiceClarityState"] = new JsonObject { ["enabled"] = true, ["value"] = 0 },
        ["smartVolume"] = new JsonObject { ["enabled"] = false, ["volumeLevel"] = 0, ["loudness"] = "balanced" },
        ["generalGain"] = 0,
        ["parametricEQ"] = peq,
        ["virtualSurroundState"] = false,
        ["reverbGainDB"] = -1.6,
        ["formFactor"] = "headphones",
        ["globalEnableState"] = true,
        ["futureKey"] = new JsonObject { ["kept"] = "by the round trip" },
    };

    public static JsonObject ChatData(JsonObject peq) => new()
    {
        ["noiseReductionState"] = new JsonObject { ["enabled"] = false, ["value"] = 0.0 },
        ["noiseGateState"] = new JsonObject { ["enabled"] = false, ["value"] = -60.0 },
        ["parametricEQ"] = peq,
        ["acousticEchoCancelingState"] = false,
        ["globalEnableState"] = true,
    };

    public static JsonObject Config(string id, string name, string vad, JsonObject data, JsonObject defaults, bool isPreset, int schema = 5, bool fav = false, int pos = -1) => new()
    {
        ["id"] = id, ["name"] = name, ["createdAt"] = "2026-08-06T18:24:29", ["updatedAt"] = "2026-08-06T18:31:41",
        ["virtualAudioDevice"] = vad, ["schemaVersion"] = schema, ["isPreset"] = isPreset, ["image"] = "30.svg",
        ["isFavorite"] = fav, ["favoritePosition"] = pos, ["releaseVersion"] = null, ["data"] = data, ["defaultData"] = defaults,
    };

    public static void Populate(SonarFixtureState s)
    {
        void Add(JsonObject c, bool select)
        {
            var id = c["id"]!.GetValue<string>();
            var vad = c["virtualAudioDevice"]!.GetValue<string>();
            s.Configs[id] = c;
            if (!s.PresetOrder.TryGetValue(vad, out var list)) s.PresetOrder[vad] = list = [];
            list.Add(id);
            if (select) s.Selected[vad] = id;
        }

        // Game: a modified built-in preset (data != defaultData on filter 2) with tone knobs.
        var gamePeq = Filters(("peakingEQ", 40, 4, 1, true), ("peakingEQ", 110, 6, 1, true), ("peakingEQ", 300, -3, 3, true), ("peakingEQ", 700, 2, 3, true),
            ("peakingEQ", 1500, 3, 1, true), ("peakingEQ", 2500, 3, 2, true), ("peakingEQ", 4900, 5, 10, true), ("peakingEQ", 5900, 5, 10, true),
            ("peakingEQ", 11000, 4, 1, true), ("peakingEQ", 10000, 0, 0.707, false));
        var gameDef = (JsonObject)gamePeq.DeepClone();
        gameDef["filter2"]!["gain"] = 2;
        Add(Config(Id(1), "Example Arena", SonarChannels.Game, GameData(gamePeq, bass: 1.5), GameData(gameDef, bass: 0), isPreset: true, fav: true, pos: 2), select: true);
        Add(Config(Id(2), "Example Favorite One", SonarChannels.Game, GameData(OctaveFilters(3, 2)), GameData(OctaveFilters(3, 2)), isPreset: true, fav: true, pos: 1), select: false);
        Add(Config(Id(3), "Example Flat", SonarChannels.Game, GameData(OctaveFilters()), GameData(OctaveFilters()), isPreset: true), select: false);
        // Chat: a flat custom config.
        Add(Config(Id(10), "Custom", SonarChannels.Chat, ChatData(OctaveFilters()), ChatData(OctaveFilters()), isPreset: false), select: true);
        Add(Config(Id(11), "Example Broadcast", SonarChannels.Chat, ChatData(OctaveFilters(-2, -1, 0, 1, 2, 3)), ChatData(OctaveFilters(-2, -1, 0, 1, 2, 3)), isPreset: true), select: false);
        // Media: a preset on a channel that is turned off in Sonar.
        var mediaPeq = OctaveFilters(0, 5, 0, -2.5, 0, 0, 0, 0, 5, 0);
        Add(Config(Id(20), "Example Music: Punchy", SonarChannels.Media, GameData(mediaPeq, bass: 1.9, treble: 1.8), GameData(OctaveFilters(0, 4)), isPreset: true), select: true);
        // Aux: five enabled filters.
        Add(Config(Id(30), "Custom", SonarChannels.Aux, GameData(Filters(("peakingEQ", 35, 0, 0.7071, true), ("peakingEQ", 120, 0, 0.7071, true), ("peakingEQ", 1000, 0, 0.7071, true),
            ("peakingEQ", 6000, 0, 0.7071, true), ("peakingEQ", 18000, 0, 0.7071, true), ("peakingEQ", 1000, 0, 0.7071, false), ("peakingEQ", 2000, 0, 0.7071, false),
            ("peakingEQ", 4000, 0, 0.7071, false), ("peakingEQ", 8000, 0, 0.7071, false), ("peakingEQ", 16000, 0, 0.7071, false))), GameData(OctaveFilters()), isPreset: false), select: true);
        // Mic: schema 6.
        Add(Config(Id(40), "Custom", SonarChannels.Mic, ChatData(OctaveFilters()), ChatData(OctaveFilters()), isPreset: false, schema: 6), select: true);

        foreach (var v in SonarChannels.All) s.ChannelEnabled[v] = v is not (SonarChannels.Media or SonarChannels.Aux);
        foreach (var ch in SonarMixer.VolumeChannels) s.Volumes[ch] = (ch == SonarChannels.Chat ? 0.67 : 1.0, false);
    }
}

/// <summary>The GG core: HTTPS with a self-signed "CN=SteelSeries A/S" certificate, serving /subApps.</summary>
public sealed class FakeGg : IAsyncDisposable
{
    public string SonarAddress = "";
    public bool SonarEnabled = true, SonarRunning = true, SonarReady = true;

    public FakeHttpServer Http { get; }

    public FakeGg(string subject = Sonar.SonarDiscovery.GgCertificateSubject)
    {
        Http = new FakeHttpServer(Handle, FakeHttpServer.CreateCertificate(subject));
    }

    private FakeResponse Handle(FakeRequest r)
    {
        if (r.Method != "GET" || r.Path != "/subApps") return FakeResponse.NotFound();
        var sonar = new JsonObject
        {
            ["name"] = "sonar", ["isEnabled"] = SonarEnabled, ["isWindowsSupported"] = true, ["isReady"] = SonarReady, ["isRunning"] = SonarRunning, ["exitCode"] = 0,
            ["metadata"] = new JsonObject { ["encryptedWebServerAddress"] = "", ["webServerAddress"] = SonarAddress, ["offlineFrontendAddress"] = "", ["onlineFrontendAddress"] = "" },
            ["secretMetadata"] = null,
        };
        return FakeResponse.Json(new JsonObject { ["subApps"] = new JsonObject { ["sonar"] = sonar, ["engine"] = new JsonObject { ["name"] = "engine" } } }.ToJsonString());
    }

    public ValueTask DisposeAsync() => Http.DisposeAsync();
}
