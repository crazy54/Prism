using System.Runtime.InteropServices;
using Microsoft.Win32;

namespace PrismControl.Ai.Apps;

// Read-only probes for the Apps layer. Production: the Win32 classes below. Tests: fakes. None of them writes anything.

/// <summary>One process: pid, parent pid, exe name, and the full image path for watched exes only (null otherwise or when unreadable).</summary>
public sealed record ProcInfo(int Pid, int ParentPid, string Exe, string? ImagePath);

public interface IProcessScanner
{
    IReadOnlyList<ProcInfo> Scan();
}

public interface IForegroundProbe
{
    /// <summary>The foreground window's pid and exe name (0, "" when none: lock screen, UAC, focus in transit).</summary>
    (int Pid, string Exe) Foreground();
}

public interface IVoiceProbe
{
    /// <summary>Pids that hold an ACTIVE capture (microphone) audio session right now. Empty when Core Audio is unavailable.</summary>
    IReadOnlySet<int> ActiveCapturePids();
}

public interface IAppProbe
{
    /// <summary>Is the app installed (its AUMID resolves in shell:AppsFolder, or its exe exists)?</summary>
    bool IsInstalled(AppDef app);
    /// <summary>Is a URI scheme registered (HKCR\&lt;scheme&gt; exists)? Read-only registry lookup.</summary>
    bool SchemeRegistered(string scheme);
}

/// <summary>A Toolhelp32 snapshot, plus QueryFullProcessImageName (limited-information access) for the watched exes.</summary>
public sealed unsafe partial class Win32ProcessScanner : IProcessScanner
{
    private const uint TH32CS_SNAPPROCESS = 0x2;
    private const uint PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;

    public IReadOnlyList<ProcInfo> Scan()
    {
        var list = new List<ProcInfo>(256);
        var snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if (snap == 0 || snap == -1) return list;
        try
        {
            var e = new PROCESSENTRY32W { dwSize = (uint)sizeof(PROCESSENTRY32W) };
            if (!Process32FirstW(snap, ref e)) return list;
            do
            {
                var exe = new string(e.szExeFile);
                var nul = exe.IndexOf('\0');
                if (nul >= 0) exe = exe[..nul];
                var pid = (int)e.th32ProcessID;
                var path = AppCatalog.WatchedExes.Contains(exe) ? ImagePath(pid) : null;
                list.Add(new ProcInfo(pid, (int)e.th32ParentProcessID, exe, path));
            }
            while (Process32NextW(snap, ref e));
        }
        finally { CloseHandle(snap); }
        return list;
    }

    private static string? ImagePath(int pid)
    {
        var h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, (uint)pid);
        if (h == 0) return null;
        try
        {
            var buf = stackalloc char[1024];
            uint len = 1024;
            return QueryFullProcessImageNameW(h, 0, buf, ref len) ? new string(buf, 0, (int)len) : null;
        }
        finally { CloseHandle(h); }
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct PROCESSENTRY32W
    {
        public uint dwSize;
        public uint cntUsage;
        public uint th32ProcessID;
        public nint th32DefaultHeapID;
        public uint th32ModuleID;
        public uint cntThreads;
        public uint th32ParentProcessID;
        public int pcPriClassBase;
        public uint dwFlags;
        public fixed char szExeFile[260];
    }

    [LibraryImport("kernel32.dll", SetLastError = true)]
    private static partial nint CreateToolhelp32Snapshot(uint flags, uint pid);

    [LibraryImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static partial bool Process32FirstW(nint snap, ref PROCESSENTRY32W entry);

    [LibraryImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static partial bool Process32NextW(nint snap, ref PROCESSENTRY32W entry);

    [LibraryImport("kernel32.dll", SetLastError = true)]
    private static partial nint OpenProcess(uint access, [MarshalAs(UnmanagedType.Bool)] bool inherit, uint pid);

    [LibraryImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static partial bool QueryFullProcessImageNameW(nint process, uint flags, char* name, ref uint size);

    [LibraryImport("kernel32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static partial bool CloseHandle(nint h);
}

/// <summary>GetForegroundWindow → GetWindowThreadProcessId → the exe name (limited-information access). Reads only.</summary>
public sealed unsafe partial class Win32ForegroundProbe : IForegroundProbe
{
    public (int Pid, string Exe) Foreground()
    {
        var hwnd = GetForegroundWindow();
        if (hwnd == 0) return (0, "");
        _ = GetWindowThreadProcessId(hwnd, out var pid);
        if (pid == 0) return (0, "");
        var h = OpenProcess(0x1000, false, pid);
        if (h == 0) return ((int)pid, "");
        try
        {
            var buf = stackalloc char[1024];
            uint len = 1024;
            return ((int)pid, QueryFullProcessImageNameW(h, 0, buf, ref len) ? Path.GetFileName(new string(buf, 0, (int)len)) : "");
        }
        finally { CloseHandle(h); }
    }

    [LibraryImport("user32.dll")]
    private static partial nint GetForegroundWindow();

    [LibraryImport("user32.dll")]
    private static partial uint GetWindowThreadProcessId(nint hwnd, out uint pid);

    [LibraryImport("kernel32.dll", SetLastError = true)]
    private static partial nint OpenProcess(uint access, [MarshalAs(UnmanagedType.Bool)] bool inherit, uint pid);

    [LibraryImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static partial bool QueryFullProcessImageNameW(nint process, uint flags, char* name, ref uint size);

    [LibraryImport("kernel32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static partial bool CloseHandle(nint h);
}

/// <summary>
/// Core Audio, read-only: every ACTIVE capture endpoint → IAudioSessionManager2 → sessions → GetState == Active →
/// IAudioSessionControl2::GetProcessId. Raw vtable calls (no RCWs), every pointer released, COM initialized (MTA) per call.
/// Active means the app holds an open microphone stream; it is reported as an inferred "voice live", never as "talking".
/// </summary>
public sealed unsafe class CoreAudioVoiceProbe : IVoiceProbe
{
    private static readonly Guid ClsidEnumerator = new("BCDE0395-E52F-467C-8E3D-C4579291692E");
    private static readonly Guid IidEnumerator = new("A95664D2-9614-4F35-A746-DE8DB63617E6");
    private static readonly Guid IidSessionManager2 = new("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F");
    private static readonly Guid IidSessionControl2 = new("BFB7FF88-7239-4FC9-8FA2-07C950BE9C6D");
    private const uint CLSCTX_ALL = 0x17;
    private const int eCapture = 1;
    private const uint DEVICE_STATE_ACTIVE = 1;
    private const int RPC_E_CHANGED_MODE = unchecked((int)0x80010106);

    public IReadOnlySet<int> ActiveCapturePids()
    {
        var pids = new HashSet<int>();
        var hrInit = CoInitializeEx(0, 0 /* COINIT_MULTITHREADED */);
        try
        {
            if (CoCreateInstance(ClsidEnumerator, 0, CLSCTX_ALL, IidEnumerator, out var enumerator) != 0 || enumerator == 0) return pids;
            try
            {
                nint collection = 0;
                // IMMDeviceEnumerator::EnumAudioEndpoints(EDataFlow, DWORD, IMMDeviceCollection**)
                if (((delegate* unmanaged[Stdcall]<nint, int, uint, nint*, int>)Vtbl(enumerator)[3])(enumerator, eCapture, DEVICE_STATE_ACTIVE, &collection) != 0 || collection == 0) return pids;
                try
                {
                    uint count = 0;
                    if (((delegate* unmanaged[Stdcall]<nint, uint*, int>)Vtbl(collection)[3])(collection, &count) != 0) return pids;
                    for (uint i = 0; i < count && i < 64; i++)
                    {
                        nint device = 0;
                        if (((delegate* unmanaged[Stdcall]<nint, uint, nint*, int>)Vtbl(collection)[4])(collection, i, &device) != 0 || device == 0) continue;
                        try { Sessions(device, pids); }
                        finally { Marshal.Release(device); }
                    }
                }
                finally { Marshal.Release(collection); }
            }
            finally { Marshal.Release(enumerator); }
        }
        catch (Exception) { }
        finally
        {
            if (hrInit is 0 or 1) CoUninitialize();
        }
        return pids;
    }

    private static void Sessions(nint device, HashSet<int> pids)
    {
        nint manager = 0;
        var iid = IidSessionManager2;
        // IMMDevice::Activate(REFIID, DWORD, PROPVARIANT*, void**)
        if (((delegate* unmanaged[Stdcall]<nint, Guid*, uint, nint, nint*, int>)Vtbl(device)[3])(device, &iid, CLSCTX_ALL, 0, &manager) != 0 || manager == 0) return;
        try
        {
            nint sessions = 0;
            // IAudioSessionManager2::GetSessionEnumerator (slot 5: after IAudioSessionManager's two methods)
            if (((delegate* unmanaged[Stdcall]<nint, nint*, int>)Vtbl(manager)[5])(manager, &sessions) != 0 || sessions == 0) return;
            try
            {
                int n = 0;
                if (((delegate* unmanaged[Stdcall]<nint, int*, int>)Vtbl(sessions)[3])(sessions, &n) != 0) return;
                for (var i = 0; i < n && i < 256; i++)
                {
                    nint control = 0;
                    if (((delegate* unmanaged[Stdcall]<nint, int, nint*, int>)Vtbl(sessions)[4])(sessions, i, &control) != 0 || control == 0) continue;
                    try
                    {
                        int state = 0;
                        // IAudioSessionControl::GetState: 0 inactive, 1 active, 2 expired
                        if (((delegate* unmanaged[Stdcall]<nint, int*, int>)Vtbl(control)[3])(control, &state) != 0 || state != 1) continue;
                        var iid2 = IidSessionControl2;
                        if (Marshal.QueryInterface(control, in iid2, out var control2) != 0 || control2 == 0) continue;
                        try
                        {
                            uint pid = 0;
                            // IAudioSessionControl2::GetProcessId (slot 14); AUDCLNT_S_NO_SINGLE_PROCESS (a success code) is skipped
                            if (((delegate* unmanaged[Stdcall]<nint, uint*, int>)Vtbl(control2)[14])(control2, &pid) == 0 && pid != 0) pids.Add((int)pid);
                        }
                        finally { Marshal.Release(control2); }
                    }
                    finally { Marshal.Release(control); }
                }
            }
            finally { Marshal.Release(sessions); }
        }
        finally { Marshal.Release(manager); }
    }

    private static nint* Vtbl(nint p) => *(nint**)p;

    [DllImport("ole32.dll")]
    private static extern int CoInitializeEx(nint reserved, uint coinit);

    [DllImport("ole32.dll")]
    private static extern void CoUninitialize();

    [DllImport("ole32.dll")]
    private static extern int CoCreateInstance(in Guid clsid, nint outer, uint context, in Guid iid, out nint ppv);
}

/// <summary>Installed checks: SHCreateItemFromParsingName("shell:AppsFolder\&lt;AUMID&gt;") or File.Exists; HKCR scheme keys. Reads only.</summary>
public sealed partial class Win32AppProbe : IAppProbe
{
    private static readonly Guid IidShellItem = new("43826D1E-E718-42EE-BC55-A1E261C37BFE");
    private readonly Dictionary<string, (bool Value, DateTimeOffset At)> _cache = new(StringComparer.OrdinalIgnoreCase);
    private readonly object _gate = new();

    public bool IsInstalled(AppDef app)
    {
        lock (_gate)
            if (_cache.TryGetValue(app.Id, out var c) && DateTimeOffset.UtcNow - c.At < TimeSpan.FromMinutes(5)) return c.Value;
        var installed = false;
        if (app.Aumid is { } aumid)
        {
            var init = CoInitializeEx(0, 0);
            try
            {
                var iid = IidShellItem;
                if (SHCreateItemFromParsingName(@"shell:AppsFolder\" + aumid, 0, in iid, out var item) == 0 && item != 0)
                {
                    Marshal.Release(item);
                    installed = true;
                }
            }
            finally { if (init is 0 or 1) CoUninitialize(); }
        }
        if (!installed && app.ExpandedExePath is { } path) installed = File.Exists(path);
        lock (_gate) _cache[app.Id] = (installed, DateTimeOffset.UtcNow);
        return installed;
    }

    public bool SchemeRegistered(string scheme)
    {
        if (string.IsNullOrWhiteSpace(scheme) || scheme.Any(ch => !(char.IsAsciiLetterOrDigit(ch) || ch is '-' or '+' or '.'))) return false;
        try
        {
            using var key = Registry.ClassesRoot.OpenSubKey(scheme, writable: false);
            return key is not null;
        }
        catch (Exception ex) when (ex is System.Security.SecurityException or UnauthorizedAccessException or IOException) { return false; }
    }

    [LibraryImport("shell32.dll", StringMarshalling = StringMarshalling.Utf16)]
    private static partial int SHCreateItemFromParsingName(string path, nint bindCtx, in Guid iid, out nint item);

    [LibraryImport("ole32.dll")]
    private static partial int CoInitializeEx(nint reserved, uint coinit);

    [LibraryImport("ole32.dll")]
    private static partial void CoUninitialize();
}
