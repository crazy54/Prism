using System.Runtime.InteropServices;
using PrismControl.Desktop;

namespace PrismControl.Ai.Apps;

/// <summary>A copy of every memory-backed clipboard format (text, HTML, RTF, DIB images, files…), so Ask AI can put it back.</summary>
public sealed class ClipboardSnapshot
{
    internal ClipboardSnapshot(IReadOnlyList<(uint Format, byte[] Data)> items) => Items = items;
    internal IReadOnlyList<(uint Format, byte[] Data)> Items { get; }
    public bool IsEmpty => Items.Count == 0;
    public long Bytes => Items.Sum(i => (long)i.Data.Length);
    public static ClipboardSnapshot Of(params (uint Format, byte[] Data)[] items) => new(items);
}

/// <summary>The clipboard, for Ask AI (save → copy selection → read → restore) and the PI's "save key from clipboard".</summary>
public interface IClipboard
{
    uint SequenceNumber();
    /// <summary>Null when the clipboard can't be saved (another app holds it, or it is over the size cap): callers then touch nothing.</summary>
    Task<ClipboardSnapshot?> SnapshotAsync(CancellationToken ct);
    Task<bool> RestoreAsync(ClipboardSnapshot snapshot, CancellationToken ct);
    Task<string?> ReadTextAsync(CancellationToken ct);
    /// <summary>Empties the clipboard (after an admin key was saved from it). False when it could not be opened.</summary>
    Task<bool> ClearAsync(CancellationToken ct) => Task.FromResult(false);
}

/// <summary>
/// Win32 clipboard on Desktop's shell thread (its hidden window owns our writes). GDI-handle formats (bitmaps, metafiles,
/// palettes) are skipped; Windows re-synthesizes bitmaps from the DIB copy. The restore is marked
/// <c>CanIncludeInClipboardHistory = 0</c> and <c>CanUploadToCloudClipboard = 0</c>, so putting the user's own clipboard back
/// adds nothing to Win+V history or the cloud clipboard. Nothing here is ever logged.
/// </summary>
public sealed partial class Win32Clipboard(IShellThread shell) : IClipboard
{
    public const long MaxSnapshotBytes = 32L << 20;
    private const uint CF_UNICODETEXT = 13;
    private const uint GMEM_MOVEABLE = 0x2;
    private static readonly HashSet<uint> HandleFormats = [2 /*BITMAP*/, 3 /*METAFILEPICT*/, 9 /*PALETTE*/, 14 /*ENHMETAFILE*/, 0x80, 0x82, 0x83, 0x8E];

    public uint SequenceNumber() => GetClipboardSequenceNumber();

    public async Task<ClipboardSnapshot?> SnapshotAsync(CancellationToken ct)
    {
        for (var attempt = 0; attempt < 5; attempt++)
        {
            var r = await shell.InvokeAsync(Snapshot).ConfigureAwait(false);
            if (r.Opened) return r.Snapshot;
            await Task.Delay(20, ct).ConfigureAwait(false);
        }
        return null;
    }

    private (bool Opened, ClipboardSnapshot? Snapshot) Snapshot()
    {
        if (!OpenClipboard(shell.WindowHandle)) return (false, null);
        try
        {
            var items = new List<(uint, byte[])>();
            long total = 0;
            uint f = 0;
            while ((f = EnumClipboardFormats(f)) != 0)
            {
                if (HandleFormats.Contains(f)) continue;
                var h = GetClipboardData(f);
                if (h == 0) continue;
                var size = (long)GlobalSize(h);
                if (size <= 0) continue;
                total += size;
                if (total > MaxSnapshotBytes) return (true, null);   // too big to keep a copy: Ask AI then refuses
                var p = GlobalLock(h);
                if (p == 0) continue;
                try
                {
                    var data = new byte[size];
                    Marshal.Copy(p, data, 0, (int)size);
                    items.Add((f, data));
                }
                finally { GlobalUnlock(h); }
            }
            return (true, new ClipboardSnapshot(items));
        }
        finally { CloseClipboard(); }
    }

    public async Task<bool> RestoreAsync(ClipboardSnapshot snapshot, CancellationToken ct)
    {
        for (var attempt = 0; attempt < 5; attempt++)
        {
            var r = await shell.InvokeAsync(() => Restore(snapshot)).ConfigureAwait(false);
            if (r is not null) return r.Value;
            await Task.Delay(20, ct).ConfigureAwait(false);
        }
        return false;
    }

    private bool? Restore(ClipboardSnapshot s)
    {
        if (!OpenClipboard(shell.WindowHandle)) return null;
        try
        {
            if (!EmptyClipboard()) return false;
            var ok = true;
            foreach (var (format, data) in s.Items) ok &= Set(format, data);
            var noHistory = BitConverter.GetBytes(0);
            Set(RegisterClipboardFormatW("CanIncludeInClipboardHistory"), noHistory);
            Set(RegisterClipboardFormatW("CanUploadToCloudClipboard"), noHistory);
            return ok;
        }
        finally { CloseClipboard(); }
    }

    private static bool Set(uint format, byte[] data)
    {
        if (format == 0) return false;
        var h = GlobalAlloc(GMEM_MOVEABLE, (nuint)Math.Max(1, data.Length));
        if (h == 0) return false;
        var p = GlobalLock(h);
        if (p == 0) { GlobalFree(h); return false; }
        Marshal.Copy(data, 0, p, data.Length);
        GlobalUnlock(h);
        if (SetClipboardData(format, h) != 0) return true;   // the system owns h now
        GlobalFree(h);
        return false;
    }

    public async Task<bool> ClearAsync(CancellationToken ct)
    {
        for (var attempt = 0; attempt < 5; attempt++)
        {
            var r = await shell.InvokeAsync(() =>
            {
                if (!OpenClipboard(shell.WindowHandle)) return (bool?)null;
                try { return EmptyClipboard(); }
                finally { CloseClipboard(); }
            }).ConfigureAwait(false);
            if (r is not null) return r.Value;
            await Task.Delay(20, ct).ConfigureAwait(false);
        }
        return false;
    }

    public async Task<string?> ReadTextAsync(CancellationToken ct)
    {
        for (var attempt = 0; attempt < 5; attempt++)
        {
            var r = await shell.InvokeAsync(ReadText).ConfigureAwait(false);
            if (r.Opened) return r.Text;
            await Task.Delay(20, ct).ConfigureAwait(false);
        }
        return null;
    }

    private (bool Opened, string? Text) ReadText()
    {
        if (!OpenClipboard(shell.WindowHandle)) return (false, null);
        try
        {
            var h = GetClipboardData(CF_UNICODETEXT);
            if (h == 0) return (true, null);
            var size = (long)GlobalSize(h);
            var p = GlobalLock(h);
            if (p == 0) return (true, null);
            try
            {
                var chars = (int)Math.Min(size / 2, 1 << 22);
                var s = Marshal.PtrToStringUni(p, chars);
                var nul = s.IndexOf('\0');
                return (true, nul >= 0 ? s[..nul] : s);
            }
            finally { GlobalUnlock(h); }
        }
        finally { CloseClipboard(); }
    }

    [LibraryImport("user32.dll")] private static partial uint GetClipboardSequenceNumber();
    [LibraryImport("user32.dll")][return: MarshalAs(UnmanagedType.Bool)] private static partial bool OpenClipboard(nint owner);
    [LibraryImport("user32.dll")][return: MarshalAs(UnmanagedType.Bool)] private static partial bool CloseClipboard();
    [LibraryImport("user32.dll")][return: MarshalAs(UnmanagedType.Bool)] private static partial bool EmptyClipboard();
    [LibraryImport("user32.dll")] private static partial uint EnumClipboardFormats(uint format);
    [LibraryImport("user32.dll")] private static partial nint GetClipboardData(uint format);
    [LibraryImport("user32.dll")] private static partial nint SetClipboardData(uint format, nint mem);
    [LibraryImport("user32.dll", StringMarshalling = StringMarshalling.Utf16)] private static partial uint RegisterClipboardFormatW(string name);
    [LibraryImport("kernel32.dll")] private static partial nint GlobalAlloc(uint flags, nuint bytes);
    [LibraryImport("kernel32.dll")] private static partial nint GlobalFree(nint mem);
    [LibraryImport("kernel32.dll")] private static partial nint GlobalLock(nint mem);
    [LibraryImport("kernel32.dll")][return: MarshalAs(UnmanagedType.Bool)] private static partial bool GlobalUnlock(nint mem);
    [LibraryImport("kernel32.dll")] private static partial nuint GlobalSize(nint mem);
}
