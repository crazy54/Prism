using System.Globalization;
using System.Text.Json;

namespace PrismControl.SystemInfo.CpuTemp;

/// <summary>A CPU temperature reading from an external provider.</summary>
public sealed record CpuTempReading(double TempC, string SensorName);

/// <summary>
/// Streams LibreHardwareMonitor's web-server <c>data.json</c> (a 100-300 KB tree of
/// <c>{ Text, Value, SensorId?, HardwareId?, Type?, ImageURL, Children[] }</c>) with <see cref="Utf8JsonReader"/> and keeps
/// only the CPU's temperature sensors. Sensors count as CPU only under a CPU hardware node (<c>/amdcpu</c>, <c>/intelcpu</c>,
/// or the cpu icon in older builds), so the iGPU (<c>/gpu-amd</c>) is never taken for the CPU.
/// AMD prefers "Core (Tctl/Tdie)"; Intel prefers "CPU Package".
/// </summary>
public static class LhmParser
{
    private static readonly string[] AmdPreference =
        ["Core (Tctl/Tdie)", "CPU (Tctl/Tdie)", "Core (Tctl)", "Tctl/Tdie", "Tctl", "Core (Tdie)", "Tdie", "CPU Package", "Package", "CCDs Max (Tdie)", "CCD1 (Tdie)"];

    private static readonly string[] IntelPreference =
        ["CPU Package", "Package", "Core Max", "Core Average", "CPU Core"];

    private enum CpuKind : byte { None, Amd, Intel, Unknown }

    private struct Node
    {
        public string? Text, Value, SensorId, HardwareId, Type, ImageUrl;
        public CpuKind Cpu;          // this node or an ancestor is a CPU hardware node
        public bool UnderTemperatures; // the parent group is "Temperatures"
        public bool HasChildren;
    }

    /// <summary>All CPU temperature sensors found (name, °C), in document order.</summary>
    public static List<(string Name, double TempC, bool Amd, bool Intel)> CpuTemperatures(ReadOnlySpan<byte> json)
    {
        var found = new List<(string, double, bool, bool)>();
        var reader = new Utf8JsonReader(json, new JsonReaderOptions { CommentHandling = JsonCommentHandling.Skip, AllowTrailingCommas = true, MaxDepth = 512 });
        var stack = new List<Node>(32);
        string? property = null;
        while (reader.Read())
        {
            switch (reader.TokenType)
            {
                case JsonTokenType.StartObject:
                {
                    var parent = stack.Count > 0 ? stack[^1] : default;
                    stack.Add(new Node
                    {
                        Cpu = parent.Cpu,
                        UnderTemperatures = string.Equals(parent.Text, "Temperatures", StringComparison.OrdinalIgnoreCase),
                    });
                    property = null;
                    break;
                }
                case JsonTokenType.PropertyName:
                    property = reader.GetString();
                    if (property == "Children" && stack.Count > 0)
                    {
                        // Classify before descending: LHM writes Text/HardwareId/ImageURL before Children.
                        var n = stack[^1];
                        n.HasChildren = true;
                        if (n.Cpu == CpuKind.None) n.Cpu = Classify(n);
                        stack[^1] = n;
                    }
                    break;
                case JsonTokenType.String when stack.Count > 0 && property is not null:
                {
                    var n = stack[^1];
                    switch (property)
                    {
                        case "Text": n.Text = reader.GetString(); break;
                        case "Value": n.Value = reader.GetString(); break;
                        case "SensorId": n.SensorId = reader.GetString(); break;
                        case "HardwareId": n.HardwareId = reader.GetString(); break;
                        case "Type": n.Type = reader.GetString(); break;
                        case "ImageURL": n.ImageUrl = reader.GetString(); break;
                    }
                    stack[^1] = n;
                    property = null;
                    break;
                }
                case JsonTokenType.EndObject when stack.Count > 0:
                {
                    var n = stack[^1];
                    stack.RemoveAt(stack.Count - 1);
                    if (IsCpuTemperature(n, out var kind) && TryParseCelsius(n.Value, out var c) && n.Text is { } name && !IsNotATemperature(name))
                        found.Add((name, c, kind == CpuKind.Amd, kind == CpuKind.Intel));
                    property = null;
                    break;
                }
                default:
                    if (reader.TokenType is not (JsonTokenType.StartArray or JsonTokenType.EndArray)) property = null;
                    break;
            }
        }
        return found;
    }

    /// <summary>The CPU temperature to show, or null when LHM reports none (for example when it runs without admin rights).</summary>
    public static CpuTempReading? FindCpuTemperature(ReadOnlySpan<byte> json)
    {
        var all = CpuTemperatures(json);
        if (all.Count == 0) return null;
        var amd = all.Any(t => t.Amd) || all.Any(t => t.Name.Contains("Tctl", StringComparison.OrdinalIgnoreCase) || t.Name.Contains("Tdie", StringComparison.OrdinalIgnoreCase));
        var order = amd ? AmdPreference : IntelPreference;
        foreach (var want in order)
            foreach (var t in all)
                if (string.Equals(t.Name, want, StringComparison.OrdinalIgnoreCase)) return new CpuTempReading(t.TempC, t.Name);
        foreach (var want in order)
            foreach (var t in all)
                if (t.Name.Contains(want, StringComparison.OrdinalIgnoreCase)) return new CpuTempReading(t.TempC, t.Name);
        var first = all[0];
        return new CpuTempReading(first.TempC, first.Name);
    }

    private static CpuKind Classify(Node n)
    {
        var id = n.HardwareId;
        if (id is not null)
        {
            if (id.StartsWith("/amdcpu", StringComparison.OrdinalIgnoreCase)) return CpuKind.Amd;
            if (id.StartsWith("/intelcpu", StringComparison.OrdinalIgnoreCase)) return CpuKind.Intel;
            return CpuKind.None;
        }
        // Older LHM builds have no HardwareId: the CPU hardware node carries the cpu icon.
        if (n.ImageUrl is { } img && img.EndsWith("/cpu.png", StringComparison.OrdinalIgnoreCase))
        {
            if (n.Text?.Contains("AMD", StringComparison.OrdinalIgnoreCase) == true) return CpuKind.Amd;
            if (n.Text?.Contains("Intel", StringComparison.OrdinalIgnoreCase) == true) return CpuKind.Intel;
            return CpuKind.Unknown;
        }
        return CpuKind.None;
    }

    private static bool IsCpuTemperature(Node n, out CpuKind kind)
    {
        kind = n.Cpu;
        if (n.HasChildren && n.Value is null or "") return false; // a group, not a sensor
        if (n.SensorId is { } sid)
        {
            if (sid.StartsWith("/amdcpu/", StringComparison.OrdinalIgnoreCase)) kind = CpuKind.Amd;
            else if (sid.StartsWith("/intelcpu/", StringComparison.OrdinalIgnoreCase)) kind = CpuKind.Intel;
            else return false; // a sensor of some other hardware (GPU, board, NVMe, DIMM)
            return n.Type is null
                ? n.UnderTemperatures || sid.Contains("/temperature/", StringComparison.OrdinalIgnoreCase)
                : string.Equals(n.Type, "Temperature", StringComparison.OrdinalIgnoreCase);
        }
        if (kind == CpuKind.None) return false;
        return string.Equals(n.Type, "Temperature", StringComparison.OrdinalIgnoreCase) || (n.Type is null && n.UnderTemperatures);
    }

    /// <summary>Intel's "Distance to TjMax" is a delta, and the limit/resolution entries are not readings.</summary>
    private static bool IsNotATemperature(string name) =>
        name.Contains("Distance", StringComparison.OrdinalIgnoreCase) || name.Contains("TjMax", StringComparison.OrdinalIgnoreCase) ||
        name.Contains("Limit", StringComparison.OrdinalIgnoreCase) || name.Contains("Resolution", StringComparison.OrdinalIgnoreCase) ||
        name.Contains("Critical", StringComparison.OrdinalIgnoreCase) || name.Contains("Warning", StringComparison.OrdinalIgnoreCase);

    /// <summary>"52.0 °C", "52,0 °C" (LHM formats with the user's culture) or "125.6 °F" → °C.</summary>
    public static bool TryParseCelsius(string? text, out double celsius)
    {
        celsius = 0;
        if (string.IsNullOrWhiteSpace(text)) return false;
        var s = text.AsSpan().Trim();
        var end = 0;
        while (end < s.Length && (char.IsAsciiDigit(s[end]) || s[end] is '.' or ',' or '-' or '+')) end++;
        if (end == 0) return false;
        var number = s[..end].ToString().Replace(',', '.');
        if (!double.TryParse(number, NumberStyles.Float, CultureInfo.InvariantCulture, out var v) || !double.IsFinite(v)) return false;
        var unit = s[end..].Trim();
        if (unit.EndsWith("F", StringComparison.OrdinalIgnoreCase)) v = (v - 32) * 5 / 9;
        else if (unit.Length > 0 && !unit.EndsWith("C", StringComparison.OrdinalIgnoreCase)) return false; // not a temperature
        if (v is < -40 or > 150) return false;
        celsius = v;
        return true;
    }
}
