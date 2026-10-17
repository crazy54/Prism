using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;

namespace PrismControl.Eq.Apo;

/// <summary>
/// Owns Prism Control's include without clobbering the user's Equalizer APO config (research eq.md §6.4):
/// <list type="bullet">
/// <item>We fully own <c>prism-control.txt</c> and regenerate it whole on every change.</item>
/// <item><c>config.txt</c> is touched only on an explicit Attach/Detach: Attach prepends two lines (a marker comment and
/// <c>Include: prism-control.txt</c>) at the very top, where no user Device/Channel/Stage/If can be in effect yet;
/// Detach removes only those lines. Everything else is kept byte for byte, including the encoding (UTF-8 with or
/// without BOM, or ANSI) and the line endings.</item>
/// <item>Every write is atomic: a temp file in the same folder, then a same-volume replace (APO opens the file with
/// FILE_SHARE_READ and reloads about 10 ms after any change in the folder tree).</item>
/// </list>
/// </summary>
public static partial class ApoConfigFiles
{
    public const string IncludeFile = "prism-control.txt";
    public const string MainFile = "config.txt";
    public const string MarkerLine = "# --- Prism Control (managed include; delete these two lines to detach) ---";
    public const string IncludeLine = "Include: " + IncludeFile;

    [GeneratedRegex(@"^\s*Include:\s*prism-control\.txt\s*$", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex IncludeRegex();

    [GeneratedRegex(@"^\s*#\s*---\s*Prism Control \(managed include", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex MarkerRegex();

    public static string MainPath(string configDir) => Path.Combine(configDir, MainFile);
    public static string IncludePath(string configDir) => Path.Combine(configDir, IncludeFile);

    /// <summary>config.txt includes our file (one line matching <c>Include: prism-control.txt</c>).</summary>
    public static bool IsAttached(string configDir)
    {
        var path = MainPath(configDir);
        if (!File.Exists(path)) return false;
        var bytes = ReadShared(path);
        return SplitLines(bytes).Any(l => IncludeRegex().IsMatch(Ascii(l.Content)));
    }

    /// <summary>Prepends our two lines to config.txt (creating it if missing). Returns false if it was already attached.</summary>
    public static bool Attach(string configDir)
    {
        var path = MainPath(configDir);
        byte[] bytes = File.Exists(path) ? ReadShared(path) : [];
        if (HasUtf16Bom(bytes)) throw new IOException("config.txt is UTF-16; Equalizer APO reads UTF-8 or ANSI only, so Prism Control will not edit it.");
        var lines = SplitLines(bytes);
        if (lines.Any(l => IncludeRegex().IsMatch(Ascii(l.Content)))) return false;
        var bom = HasUtf8Bom(bytes) ? 3 : 0;
        var eol = DetectEol(bytes);
        using var ms = new MemoryStream(bytes.Length + 128);
        ms.Write(bytes, 0, bom);
        var block = Encoding.ASCII.GetBytes(MarkerLine + eol + IncludeLine + eol);
        ms.Write(block);
        ms.Write(bytes, bom, bytes.Length - bom);
        WriteAtomic(path, ms.ToArray());
        return true;
    }

    /// <summary>Removes only our marker and include lines. Returns false if there was nothing to remove.</summary>
    public static bool Detach(string configDir)
    {
        var path = MainPath(configDir);
        if (!File.Exists(path)) return false;
        var bytes = ReadShared(path);
        var bom = HasUtf8Bom(bytes) ? 3 : 0;
        var lines = SplitLines(bytes);
        var keep = lines.Where(l => !IncludeRegex().IsMatch(Ascii(l.Content)) && !MarkerRegex().IsMatch(Ascii(l.Content))).ToList();
        if (keep.Count == lines.Count) return false;
        using var ms = new MemoryStream(bytes.Length);
        ms.Write(bytes, 0, bom);
        foreach (var l in keep) { ms.Write(l.Content); ms.Write(l.Eol); }
        WriteAtomic(path, ms.ToArray());
        return true;
    }

    /// <summary>Writes prism-control.txt only when its content changed. Returns true if it wrote.</summary>
    public static bool WriteInclude(string configDir, string content)
    {
        var path = IncludePath(configDir);
        var bytes = new UTF8Encoding(encoderShouldEmitUTF8Identifier: false).GetBytes(content);
        if (File.Exists(path))
        {
            try { if (ReadShared(path).AsSpan().SequenceEqual(bytes)) return false; }
            catch (IOException) { /* rewrite */ }
        }
        WriteAtomic(path, bytes);
        return true;
    }

    /// <summary>Temp file in the same folder, then MoveFileEx(REPLACE_EXISTING): atomic on one NTFS volume.</summary>
    public static void WriteAtomic(string path, byte[] bytes)
    {
        var dir = Path.GetDirectoryName(Path.GetFullPath(path))!;
        var tmp = Path.Combine(dir, Path.GetFileName(path) + "." + Guid.NewGuid().ToString("N")[..8] + ".tmp");
        try
        {
            using (var fs = new FileStream(tmp, FileMode.CreateNew, FileAccess.Write, FileShare.None))
            {
                fs.Write(bytes);
                fs.Flush(flushToDisk: true);
            }
            for (var attempt = 0; ; attempt++)
            {
                try { File.Move(tmp, path, overwrite: true); break; }
                catch (IOException) when (attempt < 5) { Thread.Sleep(5); } // APO may be reading it this instant
                catch (UnauthorizedAccessException) when (attempt < 5) { Thread.Sleep(5); }
            }
        }
        finally
        {
            try { if (File.Exists(tmp)) File.Delete(tmp); } catch (IOException) { } catch (UnauthorizedAccessException) { }
        }
    }

    // ------------------------------------------------------------------ generation

    /// <summary>One device's block for prism-control.txt.</summary>
    public sealed record DeviceBlock(string Guid, string Name, bool Enabled, double PreampDb, IReadOnlyList<EqBand> Bands);

    /// <summary>The whole prism-control.txt (deterministic: same state, same bytes, so unchanged state never writes).</summary>
    public static string Generate(IEnumerable<DeviceBlock> devices)
    {
        var sb = new StringBuilder();
        sb.Append("# Managed by Prism Control. This file is rewritten automatically; edit EQ in Prism Control.\r\n");
        sb.Append("# backend=apo version=1\r\n");
        foreach (var d in devices)
        {
            sb.Append("# ").Append(Sanitize(d.Name)).Append("\r\n");
            if (!d.Enabled) { sb.Append("# (EQ off)\r\n"); continue; }
            sb.Append("Device: ").Append(d.Guid).Append("\r\n");
            if (Math.Abs(d.PreampDb) >= 0.05) sb.Append("Preamp: ").Append(F(d.PreampDb, "0.0")).Append(" dB\r\n");
            var n = 1;
            foreach (var b in d.Bands.Where(b => b.Enabled).OrderBy(b => b.Index))
                sb.Append(FilterLine(n++, b)).Append("\r\n");
        }
        // APO resets the device match when an included file ends, so nothing here leaks into the user's lines.
        return sb.ToString();
    }

    /// <summary>APO syntax for one filter (research eq.md §6.2).</summary>
    public static string FilterLine(int number, EqBand b)
    {
        var fc = "Fc " + F(b.FrequencyHz, "0.##") + " Hz";
        var gain = "Gain " + F(b.GainDb, "0.0#") + " dB";
        var q = "Q " + F(b.Q, "0.###");
        var body = b.Type switch
        {
            EqFilterType.LowShelf => $"LSC {fc} {gain} {q}",
            EqFilterType.HighShelf => $"HSC {fc} {gain} {q}",
            EqFilterType.LowPass => $"LPQ {fc} {q}",
            EqFilterType.HighPass => $"HPQ {fc} {q}",
            EqFilterType.Notch => $"NO {fc}",
            EqFilterType.BandPass => $"BP {fc} {q}",
            EqFilterType.AllPass => $"AP {fc} {q}",
            _ => $"PK {fc} {gain} {q}",
        };
        return $"Filter {number.ToString(CultureInfo.InvariantCulture)}: ON {body}";
    }

    private static string F(double v, string format) => Math.Round(v, 3).ToString(format, CultureInfo.InvariantCulture);

    private static string Sanitize(string s) => new(s.Where(c => c >= ' ' && c != '\u007f').Take(80).ToArray());

    // ------------------------------------------------------------------ byte-level helpers (keep the user's encoding)

    private readonly record struct Line(byte[] Content, byte[] Eol);

    private static List<Line> SplitLines(byte[] bytes)
    {
        var lines = new List<Line>();
        var start = HasUtf8Bom(bytes) ? 3 : 0;
        var i = start;
        while (i < bytes.Length)
        {
            var nl = Array.IndexOf(bytes, (byte)'\n', i);
            if (nl < 0)
            {
                lines.Add(new Line(bytes[i..], []));
                break;
            }
            var end = nl > i && bytes[nl - 1] == '\r' ? nl - 1 : nl;
            lines.Add(new Line(bytes[i..end], bytes[end..(nl + 1)]));
            i = nl + 1;
        }
        return lines;
    }

    private static string DetectEol(byte[] bytes)
    {
        var nl = Array.IndexOf(bytes, (byte)'\n');
        if (nl < 0) return "\r\n";
        return nl > 0 && bytes[nl - 1] == '\r' ? "\r\n" : "\n";
    }

    /// <summary>Lossy ASCII view for matching our own (ASCII) lines; never used to rewrite user text.</summary>
    private static string Ascii(byte[] b) => Encoding.Latin1.GetString(b);

    private static bool HasUtf8Bom(byte[] b) => b.Length >= 3 && b[0] == 0xEF && b[1] == 0xBB && b[2] == 0xBF;
    private static bool HasUtf16Bom(byte[] b) => b.Length >= 2 && ((b[0] == 0xFF && b[1] == 0xFE) || (b[0] == 0xFE && b[1] == 0xFF));

    private static byte[] ReadShared(string path)
    {
        for (var attempt = 0; ; attempt++)
        {
            try
            {
                using var fs = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
                using var ms = new MemoryStream();
                fs.CopyTo(ms);
                return ms.ToArray();
            }
            catch (IOException) when (attempt < 5) { Thread.Sleep(5); }
        }
    }
}
