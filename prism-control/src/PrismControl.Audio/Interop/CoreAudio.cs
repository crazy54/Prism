// Core Audio interop for .NET 10 using the COM source generator ([GeneratedComInterface]).
// Trim/AOT-safe: no built-in COM marshalling, no reflection. Vtable order = declaration order
// (IUnknown's 3 slots are implicit). Derived interfaces list only their new methods.
// Lifetime: every object the engine gets back is an `out nint` that it wraps with Native.Wrap/Own (a unique RCW it
// releases deterministically); generated `out IFoo?` parameters would hand out shared RCWs that only the GC frees.
// Sources: mmdeviceapi.h, endpointvolume.h, audiopolicy.h, functiondiscoverykeys_devpkey.h (Windows SDK 10.0.22621);
// verified on this PC by research/win-probes/AudioProbe (windows.md §1.2).
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.Marshalling;

namespace PrismControl.Audio.Interop;

internal enum EDataFlow { eRender = 0, eCapture = 1, eAll = 2 }
internal enum ERole { eConsole = 0, eMultimedia = 1, eCommunications = 2 }

internal static class DeviceState
{
    public const uint Active = 0x1, Disabled = 0x2, NotPresent = 0x4, Unplugged = 0x8, All = 0xF;
}

internal static class HResults
{
    public const int S_OK = 0;
    public const int S_FALSE = 1;
    public const int E_NOTFOUND = unchecked((int)0x80070490);
    public const int AUDCLNT_S_NO_SINGLE_PROCESS = 0x08890013;
    public const int AUDCLNT_E_DEVICE_INVALIDATED = unchecked((int)0x88890004);
    public const int AUDCLNT_E_SERVICE_NOT_RUNNING = unchecked((int)0x88890010);
    public const int RPC_E_DISCONNECTED = unchecked((int)0x80010108);
    public const int RPC_S_SERVER_UNAVAILABLE = unchecked((int)0x800706BA);
    public const int RPC_S_CALL_FAILED = unchecked((int)0x800706BE);
    public const int RPC_S_CALL_FAILED_DNE = unchecked((int)0x800706BF);
    public const int CO_E_OBJNOTCONNECTED = unchecked((int)0x800401FD);

    /// <summary>The audio service (or its RPC connection) is gone: every object from before is dead, so the engine rebuilds.</summary>
    public static bool IsServiceDown(int hr) => hr is AUDCLNT_E_SERVICE_NOT_RUNNING or RPC_E_DISCONNECTED or RPC_S_SERVER_UNAVAILABLE
        or RPC_S_CALL_FAILED or RPC_S_CALL_FAILED_DNE or CO_E_OBJNOTCONNECTED;
}

[StructLayout(LayoutKind.Sequential)]
internal struct PROPERTYKEY
{
    public Guid fmtid;
    public uint pid;
    public PROPERTYKEY(string g, uint p) { fmtid = new Guid(g); pid = p; }
    public readonly bool Is(in PROPERTYKEY other) => fmtid == other.fmtid && pid == other.pid;
}

// PROPVARIANT is 24 bytes on x64 (vt + 3 reserved WORDs + 16-byte union).
[StructLayout(LayoutKind.Explicit, Size = 24)]
internal struct PROPVARIANT
{
    [FieldOffset(0)] public ushort vt;
    [FieldOffset(8)] public nint p;      // VT_LPWSTR (31) -> pwszVal
    [FieldOffset(8)] public uint u4;     // VT_UI4 (19)
}

internal static class PKeys
{
    public static readonly PROPERTYKEY Device_FriendlyName = new("a45c254e-df1c-4efd-8020-67d146a850e0", 14);   // "Speakers (Realtek(R) Audio)"
    public static readonly PROPERTYKEY Device_DeviceDesc = new("a45c254e-df1c-4efd-8020-67d146a850e0", 2);      // "Speakers"
    public static readonly PROPERTYKEY DeviceInterface_FriendlyName = new("026e516e-b814-414b-83cd-856d6fef4822", 2); // adapter name
    public static readonly PROPERTYKEY AudioEndpoint_FormFactor = new("1da5d803-d492-4edd-8c23-e0c0ffee7f0e", 0);
}

internal static class Iids
{
    public static readonly Guid CLSID_MMDeviceEnumerator = new("BCDE0395-E52F-467C-8E3D-C4579291692E");
    public static readonly Guid IMMDeviceEnumerator = new("A95664D2-9614-4F35-A746-DE8DB63617E6");
    public static readonly Guid IAudioEndpointVolume = new("5CDF2C82-841E-4546-9722-0CF74078229A");
    public static readonly Guid IAudioMeterInformation = new("C02216F6-8C67-4B5B-9D00-D008E73E0064");
    public static readonly Guid IAudioSessionManager2 = new("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F");
    public static readonly Guid IUnknown = new("00000000-0000-0000-C000-000000000046");
}

[GeneratedComInterface(StringMarshalling = StringMarshalling.Utf16)]
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6")]
internal partial interface IMMDeviceEnumerator
{
    [PreserveSig] int EnumAudioEndpoints(EDataFlow dataFlow, uint dwStateMask, out nint ppDevices);   // IMMDeviceCollection*
    [PreserveSig] int GetDefaultAudioEndpoint(EDataFlow dataFlow, ERole role, out nint ppEndpoint);  // IMMDevice*; E_NOTFOUND when none
    [PreserveSig] int GetDevice(string pwstrId, out nint ppDevice);                                  // IMMDevice*
    [PreserveSig] int RegisterEndpointNotificationCallback(IMMNotificationClient pClient);
    [PreserveSig] int UnregisterEndpointNotificationCallback(IMMNotificationClient pClient);
}

[GeneratedComInterface]
[Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E")]
internal partial interface IMMDeviceCollection
{
    [PreserveSig] int GetCount(out uint count);
    [PreserveSig] int Item(uint nDevice, out nint device); // IMMDevice*
}

[GeneratedComInterface(StringMarshalling = StringMarshalling.Utf16)]
[Guid("D666063F-1587-4E43-81F1-B948E807363F")]
internal partial interface IMMDevice
{
    [PreserveSig] int Activate(in Guid iid, uint dwClsCtx, nint pActivationParams, out nint ppInterface);
    [PreserveSig] int OpenPropertyStore(uint stgmAccess, out nint store); // IPropertyStore*; STGM_READ = 0
    [PreserveSig] int GetId(out string? id);
    [PreserveSig] int GetState(out uint state);
}

[GeneratedComInterface]
[Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99")]
internal partial interface IPropertyStore
{
    [PreserveSig] int GetCount(out uint count);
    [PreserveSig] int GetAt(uint iProp, out PROPERTYKEY key);
    [PreserveSig] int GetValue(in PROPERTYKEY key, out PROPVARIANT pv);
    [PreserveSig] int SetValue(in PROPERTYKEY key, in PROPVARIANT propvar);
    [PreserveSig] int Commit();
}

[GeneratedComInterface]
[Guid("7991EEC9-7E89-4D85-8390-6C703CEC60C0")]
internal partial interface IMMNotificationClient
{
    // LPCWSTR args kept as nint: the callee must not free them.
    [PreserveSig] int OnDeviceStateChanged(nint pwstrDeviceId, uint dwNewState);
    [PreserveSig] int OnDeviceAdded(nint pwstrDeviceId);
    [PreserveSig] int OnDeviceRemoved(nint pwstrDeviceId);
    [PreserveSig] int OnDefaultDeviceChanged(EDataFlow flow, ERole role, nint pwstrDefaultDeviceId);
    [PreserveSig] int OnPropertyValueChanged(nint pwstrDeviceId, PROPERTYKEY key);
}

[GeneratedComInterface]
[Guid("5CDF2C82-841E-4546-9722-0CF74078229A")]
internal partial interface IAudioEndpointVolume
{
    [PreserveSig] int RegisterControlChangeNotify(IAudioEndpointVolumeCallback pNotify);
    [PreserveSig] int UnregisterControlChangeNotify(IAudioEndpointVolumeCallback pNotify);
    [PreserveSig] int GetChannelCount(out uint pnChannelCount);
    [PreserveSig] int SetMasterVolumeLevel(float fLevelDB, in Guid pguidEventContext);
    [PreserveSig] int SetMasterVolumeLevelScalar(float fLevel, in Guid pguidEventContext);
    [PreserveSig] int GetMasterVolumeLevel(out float pfLevelDB);
    [PreserveSig] int GetMasterVolumeLevelScalar(out float pfLevel);
    [PreserveSig] int SetChannelVolumeLevel(uint nChannel, float fLevelDB, in Guid pguidEventContext);
    [PreserveSig] int SetChannelVolumeLevelScalar(uint nChannel, float fLevel, in Guid pguidEventContext);
    [PreserveSig] int GetChannelVolumeLevel(uint nChannel, out float pfLevelDB);
    [PreserveSig] int GetChannelVolumeLevelScalar(uint nChannel, out float pfLevel);
    [PreserveSig] int SetMute(int bMute, in Guid pguidEventContext);
    [PreserveSig] int GetMute(out int pbMute);
    [PreserveSig] int GetVolumeStepInfo(out uint pnStep, out uint pnStepCount);
    [PreserveSig] int VolumeStepUp(in Guid pguidEventContext);
    [PreserveSig] int VolumeStepDown(in Guid pguidEventContext);
    [PreserveSig] int QueryHardwareSupport(out uint pdwHardwareSupportMask);
    [PreserveSig] int GetVolumeRange(out float pflVolumeMindB, out float pflVolumeMaxdB, out float pflVolumeIncrementdB);
}

// OnNotify gets PAUDIO_VOLUME_NOTIFICATION_DATA:
//   +0 GUID guidEventContext, +16 BOOL bMuted, +20 float fMasterVolume, +24 UINT nChannels, +28 float afChannelVolumes[n]
[GeneratedComInterface]
[Guid("657804FA-D6AD-4496-8A60-352752AF4F89")]
internal partial interface IAudioEndpointVolumeCallback
{
    [PreserveSig] int OnNotify(nint pNotify);
}

[GeneratedComInterface]
[Guid("C02216F6-8C67-4B5B-9D00-D008E73E0064")]
internal unsafe partial interface IAudioMeterInformation
{
    [PreserveSig] int GetPeakValue(out float pfPeak);
    [PreserveSig] int GetMeteringChannelCount(out uint pnChannelCount);
    [PreserveSig] int GetChannelsPeakValues(uint u32ChannelCount, float* afPeakValues);
    [PreserveSig] int QueryHardwareSupport(out uint pdwHardwareSupportMask);
}

[GeneratedComInterface]
[Guid("BFA971F1-4D5E-40BB-935E-967039BFBEE4")]
internal partial interface IAudioSessionManager
{
    [PreserveSig] int GetAudioSessionControl(nint audioSessionGuid, uint streamFlags, out IAudioSessionControl? sessionControl);
    [PreserveSig] int GetSimpleAudioVolume(nint audioSessionGuid, uint crossProcessSession, out ISimpleAudioVolume? audioVolume);
}

[GeneratedComInterface(StringMarshalling = StringMarshalling.Utf16)]
[Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F")]
internal partial interface IAudioSessionManager2 : IAudioSessionManager
{
    [PreserveSig] int GetSessionEnumerator(out nint sessionEnum); // IAudioSessionEnumerator*
    [PreserveSig] int RegisterSessionNotification(IAudioSessionNotification sessionNotification);
    [PreserveSig] int UnregisterSessionNotification(IAudioSessionNotification sessionNotification);
    [PreserveSig] int RegisterDuckNotification(string sessionId, nint duckNotification);
    [PreserveSig] int UnregisterDuckNotification(nint duckNotification);
}

[GeneratedComInterface]
[Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8")]
internal partial interface IAudioSessionEnumerator
{
    [PreserveSig] int GetCount(out int sessionCount);
    [PreserveSig] int GetSession(int sessionIndex, out nint session); // IAudioSessionControl*
}

[GeneratedComInterface(StringMarshalling = StringMarshalling.Utf16)]
[Guid("F4B1A599-7266-4319-A8CA-E70ACB11E8CD")]
internal partial interface IAudioSessionControl
{
    [PreserveSig] int GetState(out int state); // 0 Inactive, 1 Active, 2 Expired
    [PreserveSig] int GetDisplayName(out string? name);
    [PreserveSig] int SetDisplayName(string value, in Guid eventContext);
    [PreserveSig] int GetIconPath(out string? path);
    [PreserveSig] int SetIconPath(string value, in Guid eventContext);
    [PreserveSig] int GetGroupingParam(out Guid groupingParam);
    [PreserveSig] int SetGroupingParam(in Guid groupingParam, in Guid eventContext);
    [PreserveSig] int RegisterAudioSessionNotification(IAudioSessionEvents newNotifications);
    [PreserveSig] int UnregisterAudioSessionNotification(IAudioSessionEvents newNotifications);
}

[GeneratedComInterface(StringMarshalling = StringMarshalling.Utf16)]
[Guid("BFB7FF88-7239-4FC9-8FA2-07C950BE9C6D")]
internal partial interface IAudioSessionControl2 : IAudioSessionControl
{
    [PreserveSig] int GetSessionIdentifier(out string? id);
    [PreserveSig] int GetSessionInstanceIdentifier(out string? id);
    [PreserveSig] int GetProcessId(out uint pid); // AUDCLNT_S_NO_SINGLE_PROCESS for multi-process sessions
    [PreserveSig] int IsSystemSoundsSession();     // S_OK = yes, S_FALSE = no
    [PreserveSig] int SetDuckingPreference(int optOut);
}

[GeneratedComInterface]
[Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8")]
internal partial interface ISimpleAudioVolume
{
    [PreserveSig] int SetMasterVolume(float fLevel, in Guid eventContext);
    [PreserveSig] int GetMasterVolume(out float pfLevel);
    [PreserveSig] int SetMute(int bMute, in Guid eventContext);
    [PreserveSig] int GetMute(out int pbMute);
}

[GeneratedComInterface]
[Guid("641DD20B-4D41-49CC-ABA3-174B9477BB08")]
internal partial interface IAudioSessionNotification
{
    [PreserveSig] int OnSessionCreated(nint newSession); // IAudioSessionControl*; AddRef if you keep it (we do not)
}

[GeneratedComInterface]
[Guid("24918ACC-64B3-37C1-8CA9-74A66E9957A8")]
internal partial interface IAudioSessionEvents
{
    [PreserveSig] int OnDisplayNameChanged(nint newDisplayName, nint eventContext);
    [PreserveSig] int OnIconPathChanged(nint newIconPath, nint eventContext);
    [PreserveSig] int OnSimpleVolumeChanged(float newVolume, int newMute, nint eventContext);
    [PreserveSig] int OnChannelVolumeChanged(uint channelCount, nint newChannelVolumeArray, uint changedChannel, nint eventContext);
    [PreserveSig] int OnGroupingParamChanged(nint newGroupingParam, nint eventContext);
    [PreserveSig] int OnStateChanged(int newState);
    [PreserveSig] int OnSessionDisconnected(int disconnectReason); // AudioSessionDisconnectReason; 1 = DisconnectReasonServerShutdown
}

/// <summary>An RCW from <see cref="Native.Own{T}"/>, released when disposed (a <c>using</c> scope for short-lived objects).</summary>
internal readonly struct Owned<T>(T? value) : IDisposable where T : class
{
    public T? Value { get; } = value;

    public void Dispose() => Native.Release(Value);
}

internal static unsafe partial class Native
{
    public const uint CLSCTX_ALL = 0x17;
    public const uint PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;

    /// <summary>Creates the unique-instance RCWs of <see cref="Wrap{T}"/> (the marshallers' default instance is not public).</summary>
    private static readonly StrategyBasedComWrappers Wrappers = new();

    [LibraryImport("ole32.dll")]
    public static partial int CoCreateInstance(in Guid rclsid, nint pUnkOuter, uint dwClsContext, in Guid riid, out nint ppv);

    [LibraryImport("ole32.dll")]
    public static partial int PropVariantClear(ref PROPVARIANT pvar);

    [LibraryImport("shlwapi.dll", StringMarshalling = StringMarshalling.Utf16)]
    public static partial int SHLoadIndirectString(string pszSource, char* pszOutBuf, uint cchOutBuf, nint ppvReserved);

    [LibraryImport("kernel32.dll", SetLastError = true)]
    public static partial nint OpenProcess(uint access, [MarshalAs(UnmanagedType.Bool)] bool inherit, uint pid);

    [LibraryImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static partial bool CloseHandle(nint handle);

    [LibraryImport("kernel32.dll", EntryPoint = "QueryFullProcessImageNameW", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static partial bool QueryFullProcessImageName(nint process, uint flags, char* buffer, ref uint size);

    /// <summary>
    /// Wraps a raw COM pointer in a source-generated RCW of its own and drops our reference. The RCW is a unique
    /// instance (not the shared, cached one <c>ComInterfaceMarshaller</c> hands out), which is what lets
    /// <see cref="Release"/> free it at once: <c>ComObject.FinalRelease</c> is a no-op on shared RCWs, so those wait for
    /// the GC. A direct IUnknown::Release through the vtable would be wrong here: the RCW still owns its references and
    /// would release them again when it is finalized.
    /// </summary>
    public static T Wrap<T>(nint p) where T : class
    {
        try { return (T)Wrappers.GetOrCreateObjectForComInstance(p, CreateObjectFlags.UniqueInstance); }
        finally { Marshal.Release(p); }
    }

    /// <summary>Wraps an <c>out nint</c> result when the call succeeded (an empty <see cref="Owned{T}"/> otherwise); release it with <c>using</c>.</summary>
    public static Owned<T> Own<T>(int hr, nint p) where T : class
    {
        if (p == 0) return default;
        if (hr < 0)
        {
            Marshal.Release(p);
            return default;
        }
        return new Owned<T>(Wrap<T>(p));
    }

    /// <summary>IMMDevice::Activate + wrap. Null on failure.</summary>
    public static T? Activate<T>(IMMDevice device, Guid iid) where T : class
    {
        if (device.Activate(iid, CLSCTX_ALL, 0, out var p) != 0 || p == 0) return null;
        return Wrap<T>(p);
    }

    /// <summary>
    /// Releases an RCW made by <see cref="Wrap{T}"/> right away (null-safe, idempotent, never throws). The object must not
    /// be used afterwards. Shared RCWs (from <c>out</c> parameters of generated interfaces) are left to the GC.
    /// </summary>
    public static void Release(object? rcw)
    {
        if (rcw is ComObject co)
        {
            try { co.FinalRelease(); } catch { /* already released */ }
        }
    }

    public static string? GetString(IPropertyStore store, in PROPERTYKEY key)
    {
        if (store.GetValue(key, out var pv) != 0) return null;
        try { return pv.vt == 31 && pv.p != 0 ? Marshal.PtrToStringUni(pv.p) : null; }
        finally { PropVariantClear(ref pv); }
    }

    public static uint? GetUInt(IPropertyStore store, in PROPERTYKEY key)
    {
        if (store.GetValue(key, out var pv) != 0) return null;
        try { return pv.vt == 19 ? pv.u4 : null; }
        finally { PropVariantClear(ref pv); }
    }

    /// <summary>Resolves "@%SystemRoot%\System32\AudioSrv.Dll,-203"-style indirect strings (returns the input otherwise).</summary>
    public static string ResolveIndirect(string s)
    {
        if (string.IsNullOrEmpty(s) || s[0] != '@') return s;
        char* buf = stackalloc char[512];
        return SHLoadIndirectString(s, buf, 512, 0) == 0 ? new string(buf) : s;
    }

    /// <summary>Full image path of a process (works for most processes at Medium IL via QUERY_LIMITED_INFORMATION).</summary>
    public static string? ProcessImagePath(uint pid, out bool exists)
    {
        exists = true;
        if (pid == 0) return null;
        var h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid);
        if (h == 0)
        {
            // ERROR_INVALID_PARAMETER (87): no such process.
            exists = Marshal.GetLastPInvokeError() != 87;
            return null;
        }
        try
        {
            char* buf = stackalloc char[1024];
            uint size = 1024;
            return QueryFullProcessImageName(h, 0, buf, ref size) ? new string(buf, 0, (int)size) : null;
        }
        finally { CloseHandle(h); }
    }
}
