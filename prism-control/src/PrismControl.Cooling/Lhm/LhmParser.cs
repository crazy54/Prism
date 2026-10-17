using System.Text.Json;
using System.Text.RegularExpressions;

namespace PrismControl.Cooling.Lhm;

/// <summary>
/// Parses LibreHardwareMonitor's <c>data.json</c> (Options → Remote Web Server): a tree of
/// <c>{ id, Text, Min, Value, Max, ImageURL, Children[] }</c>; newer builds add <c>SensorId</c> ("/lpc/nct6701d/0/fan/6"),
/// <c>Type</c> ("Fan", "Control", "Temperature") and <c>HardwareId</c> on hardware nodes. Values are strings with units
/// in the user's culture ("61.1 °C", "2368 RPM", "73.7 %"). Keeps only fans, pumps, CPU package and coolant temperatures,
/// and joins each fan with its "Control" duty (same index) as <see cref="RawSensor.Pct"/>. The machine-name node is never used.
/// </summary>
public static partial class LhmParser
{
    /// <summary>CPU temperature node names, best first (AMD: Tctl/Tdie; Intel: CPU Package).</summary>
    public static readonly string[] CpuTempNames = ["Core (Tctl/Tdie)", "CPU Package", "Package", "Core (Tctl)", "Tdie", "Core (Tdie)", "Core Average", "CPU Cores"];

    public static IReadOnlyList<RawSensor> Parse(ReadOnlySpan<byte> json, DateTimeOffset at)
    {
        using var doc = JsonDocument.Parse(json.ToArray(), new JsonDocumentOptions { MaxDepth = 64 });
        return Parse(doc.RootElement, at);
    }

    public static IReadOnlyList<RawSensor> Parse(JsonElement root, DateTimeOffset at)
    {
        var fans = new List<RawSensor>();
        var temps = new List<RawSensor>();
        var controls = new Dictionary<string, double>(StringComparer.Ordinal);
        var cpu = new Dictionary<string, (int Rank, RawSensor Sensor)>(StringComparer.Ordinal);
        Walk(root, null, null, null, fans, temps, controls, cpu, at);
        var list = new List<RawSensor>(fans.Count + temps.Count + cpu.Count);
        foreach (var f in fans)
            list.Add(controls.TryGetValue(f.Id.Replace("/fan/", "/control/", StringComparison.Ordinal), out var pct) ? f with { Pct = pct } : f);
        list.AddRange(cpu.Values.Select(c => c.Sensor));
        list.AddRange(temps);
        return list;
    }

    private static void Walk(JsonElement n, string? device, string? hardwareId, string? group,
        List<RawSensor> fans, List<RawSensor> temps, Dictionary<string, double> controls, Dictionary<string, (int, RawSensor)> cpu, DateTimeOffset at)
    {
        if (n.ValueKind != JsonValueKind.Object) return;
        var text = Str(n, "Text") ?? "";
        var hw = Str(n, "HardwareId");
        var sensorId = Str(n, "SensorId");
        var children = n.TryGetProperty("Children", out var ch) && ch.ValueKind == JsonValueKind.Array ? ch : default;
        var hasChildren = children.ValueKind == JsonValueKind.Array && children.GetArrayLength() > 0;

        if (hw is not null)
        {
            device ??= text;          // the outermost hardware names the device (the board, not its Super I/O chip)
            hardwareId = hw;          // the innermost hardware id says what it is (/amdcpu/0, /lpc/…)
        }
        else if (sensorId is null && hasChildren && device is not null)
        {
            group = text;             // "Fans", "Temperatures", "Controls"…
        }

        var isSensor = sensorId is not null || (!hasChildren && hw is null && device is not null && group is not null && !string.IsNullOrEmpty(Str(n, "Value")));
        if (isSensor && device is not null)
        {
            var type = Str(n, "Type") ?? group switch { "Fans" => "Fan", "Controls" => "Control", "Temperatures" => "Temperature", _ => null };
            var id = ("lhm" + (sensorId ?? $"{hardwareId}/{type}/{Slug(text)}")).ToLowerInvariant();
            var raw = Str(n, "Value");
            var value = SensorClassifier.ParseNumber(raw);
            switch (type)
            {
                case "Fan":
                    fans.Add(new RawSensor
                    {
                        Id = id, Name = text, Device = device, Type = PumpRe().IsMatch(text) ? RawSensorType.Pump : RawSensorType.Fan,
                        Value = value, Connected = value is not null, UpdatedAt = at,
                        IsBoardHeader = hardwareId?.StartsWith("/lpc/", StringComparison.OrdinalIgnoreCase) == true || hardwareId?.StartsWith("/motherboard", StringComparison.OrdinalIgnoreCase) == true,
                    });
                    break;
                case "Control":
                    if (value is { } pct) controls[id] = Math.Round(pct, 1);
                    break;
                case "Temperature":
                    if (value is not { } t) break;
                    if (raw is not null && SensorClassifier.IsFahrenheit(UnitOf(raw))) t = SensorClassifier.ToCelsius(t);
                    if (IsCpu(hardwareId))
                    {
                        var rank = Array.FindIndex(CpuTempNames, c => string.Equals(c, text, StringComparison.OrdinalIgnoreCase));
                        if (rank < 0) break;
                        var key = hardwareId!;
                        if (!cpu.TryGetValue(key, out var best) || rank < best.Item1)
                            cpu[key] = (rank, new RawSensor { Id = id, Name = text, Device = device, Type = RawSensorType.Temperature, Kind = "package", Value = t, UpdatedAt = at });
                    }
                    else if (CoolantRe().IsMatch(text))
                    {
                        temps.Add(new RawSensor { Id = id, Name = text, Device = device, Type = RawSensorType.Temperature, Kind = "coolant", Value = t, UpdatedAt = at });
                    }
                    break;
            }
        }

        if (!hasChildren) return;
        foreach (var c in children.EnumerateArray()) Walk(c, device, hardwareId, group, fans, temps, controls, cpu, at);
    }

    private static bool IsCpu(string? hardwareId) =>
        hardwareId is not null && (hardwareId.StartsWith("/amdcpu", StringComparison.OrdinalIgnoreCase) || hardwareId.StartsWith("/intelcpu", StringComparison.OrdinalIgnoreCase) || hardwareId.StartsWith("/cpu", StringComparison.OrdinalIgnoreCase));

    private static string? Str(JsonElement n, string name) =>
        n.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;

    private static string UnitOf(string raw) => UnitRe().Match(raw).Value;

    private static string Slug(string s) => SlugRe().Replace(s.ToLowerInvariant(), "-").Trim('-');

    [GeneratedRegex(@"\bpump\b|w_?pump|aio_?pump", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)] private static partial Regex PumpRe();
    [GeneratedRegex(@"coolant|liquid|water", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)] private static partial Regex CoolantRe();
    [GeneratedRegex(@"[^\d\s.,-][^\s]*\s*$", RegexOptions.CultureInvariant)] private static partial Regex UnitRe();
    [GeneratedRegex(@"[^a-z0-9]+", RegexOptions.CultureInvariant)] private static partial Regex SlugRe();
}
