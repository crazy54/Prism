using System.Buffers.Binary;
using System.Text;

namespace PrismControl.SystemInfo.CpuTemp;

/// <summary>
/// Parses HWiNFO's sensor shared memory (<c>Global\HWiNFO_SENS_SM2</c>, layout from HWiNFO's <c>hwisenssm2.h</c>, pack 1):
/// <code>
/// header:  u32 signature 'HWiS' | u32 version | u32 revision | i64 poll_time |
///          u32 sensorOffset | u32 sensorSize | u32 sensorCount | u32 readingOffset | u32 readingSize | u32 readingCount
/// sensor:  u32 id | u32 instance | char nameOrig[128] | char nameUser[128] ...
/// reading: u32 type (1 = temperature) | u32 sensorIndex | u32 id | char labelOrig[128] | char labelUser[128] | char unit[16] |
///          f64 value | f64 min | f64 max | f64 avg ...
/// </code>
/// Every offset is bounds-checked against the mapped size. Only readings of a CPU sensor count, so the iGPU is never the CPU.
/// </summary>
public static class HwInfoParser
{
    public const uint Signature = 0x53695748; // "HWiS" little-endian
    public const int HeaderSize = 44;
    public const int SensorNameOffset = 8, StringLength = 128;
    public const int ReadingLabelOffset = 12, ReadingUnitOffset = 268, ReadingValueOffset = 284, ReadingMinSize = 316;
    public const uint TypeTemperature = 1;

    private static readonly string[] Preference =
        ["CPU (Tctl/Tdie)", "CPU Package", "CPU (Tctl)", "CPU Die (average)", "CPU CCD1 (Tdie)", "Core Max", "CPU (Tdie)", "CPU"];

    public static CpuTempReading? FindCpuTemperature(ReadOnlySpan<byte> shm) => FindCpuTemperature(shm, out _);

    /// <param name="error">Why nothing was found (for the status text).</param>
    public static CpuTempReading? FindCpuTemperature(ReadOnlySpan<byte> shm, out string? error)
    {
        error = null;
        if (shm.Length < HeaderSize) { error = "shared memory too small"; return null; }
        if (BinaryPrimitives.ReadUInt32LittleEndian(shm) != Signature) { error = "HWiNFO's shared memory is inactive"; return null; }
        var sensorOffset = BinaryPrimitives.ReadUInt32LittleEndian(shm[20..]);
        var sensorSize = BinaryPrimitives.ReadUInt32LittleEndian(shm[24..]);
        var sensorCount = BinaryPrimitives.ReadUInt32LittleEndian(shm[28..]);
        var readingOffset = BinaryPrimitives.ReadUInt32LittleEndian(shm[32..]);
        var readingSize = BinaryPrimitives.ReadUInt32LittleEndian(shm[36..]);
        var readingCount = BinaryPrimitives.ReadUInt32LittleEndian(shm[40..]);
        if (readingSize < ReadingMinSize || sensorSize < SensorNameOffset + StringLength || sensorCount > 4096 || readingCount > 65536)
        { error = "unexpected HWiNFO layout"; return null; }
        if ((ulong)sensorOffset + (ulong)sensorSize * sensorCount > (ulong)shm.Length || (ulong)readingOffset + (ulong)readingSize * readingCount > (ulong)shm.Length)
        { error = "HWiNFO's shared memory is truncated"; return null; }

        var candidates = new List<(string Label, double Value)>();
        for (var i = 0; i < readingCount; i++)
        {
            var r = shm.Slice((int)(readingOffset + readingSize * (uint)i), (int)readingSize);
            if (BinaryPrimitives.ReadUInt32LittleEndian(r) != TypeTemperature) continue;
            var sensorIndex = BinaryPrimitives.ReadUInt32LittleEndian(r[4..]);
            if (sensorIndex >= sensorCount) continue;
            var sensor = shm.Slice((int)(sensorOffset + sensorSize * sensorIndex), (int)sensorSize);
            var sensorName = Ascii(sensor.Slice(SensorNameOffset, StringLength));
            if (!IsCpuSensor(sensorName)) continue;
            var label = Ascii(r.Slice(ReadingLabelOffset, StringLength));
            var unit = Ascii(r.Slice(ReadingUnitOffset, 16));
            var value = BinaryPrimitives.ReadDoubleLittleEndian(r[ReadingValueOffset..]);
            if (!double.IsFinite(value) || IsNotATemperature(label)) continue;
            if (unit.EndsWith('F')) value = (value - 32) * 5 / 9;
            if (value is < -40 or > 150) continue;
            candidates.Add((label, value));
        }
        if (candidates.Count == 0) { error = "HWiNFO reports no CPU temperature"; return null; }
        foreach (var want in Preference)
            foreach (var c in candidates)
                if (string.Equals(c.Label, want, StringComparison.OrdinalIgnoreCase)) return new CpuTempReading(c.Value, c.Label);
        return new CpuTempReading(candidates[0].Value, candidates[0].Label);
    }

    /// <summary>HWiNFO names CPU sensors "CPU [#0]: AMD Ryzen 7 …" (the Enhanced and DTS sensors included).</summary>
    public static bool IsCpuSensor(string name) =>
        name.StartsWith("CPU [", StringComparison.OrdinalIgnoreCase) || name.StartsWith("CPU:", StringComparison.OrdinalIgnoreCase);

    private static bool IsNotATemperature(string label) =>
        label.Contains("Distance", StringComparison.OrdinalIgnoreCase) || label.Contains("TjMax", StringComparison.OrdinalIgnoreCase) ||
        label.Contains("GPU", StringComparison.OrdinalIgnoreCase) || label.Contains("SoC", StringComparison.OrdinalIgnoreCase) ||
        label.Contains("Limit", StringComparison.OrdinalIgnoreCase);

    private static string Ascii(ReadOnlySpan<byte> s)
    {
        var n = s.IndexOf((byte)0);
        return Encoding.Latin1.GetString(n < 0 ? s : s[..n]).Trim();
    }

    /// <summary>Builds a minimal HWiNFO-layout buffer (tests and the offline preview).</summary>
    public static byte[] Build(IReadOnlyList<string> sensors, IReadOnlyList<(uint Type, int Sensor, string Label, string Unit, double Value)> readings)
    {
        const int sensorSize = 8 + 128 + 128, readingSize = ReadingMinSize;
        var sensorOffset = HeaderSize;
        var readingOffset = sensorOffset + sensorSize * sensors.Count;
        var buf = new byte[readingOffset + readingSize * readings.Count];
        var s = buf.AsSpan();
        BinaryPrimitives.WriteUInt32LittleEndian(s, Signature);
        BinaryPrimitives.WriteUInt32LittleEndian(s[4..], 2);
        BinaryPrimitives.WriteUInt32LittleEndian(s[20..], (uint)sensorOffset);
        BinaryPrimitives.WriteUInt32LittleEndian(s[24..], sensorSize);
        BinaryPrimitives.WriteUInt32LittleEndian(s[28..], (uint)sensors.Count);
        BinaryPrimitives.WriteUInt32LittleEndian(s[32..], (uint)readingOffset);
        BinaryPrimitives.WriteUInt32LittleEndian(s[36..], readingSize);
        BinaryPrimitives.WriteUInt32LittleEndian(s[40..], (uint)readings.Count);
        for (var i = 0; i < sensors.Count; i++)
            Encoding.Latin1.GetBytes(sensors[i], s.Slice(sensorOffset + i * sensorSize + SensorNameOffset, StringLength - 1));
        for (var i = 0; i < readings.Count; i++)
        {
            var r = s.Slice(readingOffset + i * readingSize, readingSize);
            var (type, sensor, label, unit, value) = readings[i];
            BinaryPrimitives.WriteUInt32LittleEndian(r, type);
            BinaryPrimitives.WriteUInt32LittleEndian(r[4..], (uint)sensor);
            Encoding.Latin1.GetBytes(label, r.Slice(ReadingLabelOffset, StringLength - 1));
            Encoding.Latin1.GetBytes(unit, r.Slice(ReadingUnitOffset, 15));
            BinaryPrimitives.WriteDoubleLittleEndian(r[ReadingValueOffset..], value);
        }
        return buf;
    }
}
