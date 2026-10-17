// Undocumented default-device switching (windows.md §1.6). Called through the raw vtable so the slot index is
// explicit and auditable. Only the IPolicyConfig IID verified on this PC (F8679F50, Win7..Win11) is used; if the QI
// fails we report "unavailable" instead of guessing slots.
using System.Runtime.InteropServices;

namespace PrismControl.Audio.Interop;

/// <summary>Makes an endpoint the default for a role (IPolicyConfig slot 13 in Windows; a fake in tests).</summary>
internal interface IDefaultEndpointSetter : IDisposable
{
    int SetDefaultEndpoint(string deviceId, ERole role);
}

internal sealed unsafe class PolicyConfigClient : IDefaultEndpointSetter
{
    public static readonly Guid CLSID_PolicyConfigClient = new("870AF99C-171D-4F9E-AF0D-E63DF40C2BC9");
    public static readonly Guid IID_IPolicyConfig = new("F8679F50-850A-41CF-9C72-430F290290C8");

    // IPolicyConfig (F8679F50) vtable:
    //  3 GetMixFormat  4 GetDeviceFormat  5 ResetDeviceFormat  6 SetDeviceFormat  7 GetProcessingPeriod
    //  8 SetProcessingPeriod  9 GetShareMode  10 SetShareMode  11 GetPropertyValue  12 SetPropertyValue
    // 13 SetDefaultEndpoint(PCWSTR deviceId, ERole role)  14 SetEndpointVisibility (never called: it hides devices)
    private const int SlotGetPropertyValue = 11;
    private const int SlotSetDefaultEndpoint = 13;

    private nint _pc;

    private PolicyConfigClient(nint pc) => _pc = pc;

    /// <summary>Creates the client and QIs the verified IID. Null (with the HRESULT) when unavailable.</summary>
    public static PolicyConfigClient? TryCreate(out int hr)
    {
        hr = Native.CoCreateInstance(CLSID_PolicyConfigClient, 0, Native.CLSCTX_ALL, Iids.IUnknown, out var unk);
        if (hr != 0 || unk == 0) return null;
        try
        {
            var iid = IID_IPolicyConfig;
            hr = Marshal.QueryInterface(unk, in iid, out var pc);
            return hr == 0 && pc != 0 ? new PolicyConfigClient(pc) : null;
        }
        finally { Marshal.Release(unk); }
    }

    private nint Slot(int index) => (*(nint**)_pc)[index];

    /// <summary>Read-only sanity check: slot 11 GetPropertyValue(PKEY_Device_FriendlyName). Never writes.</summary>
    public int GetFriendlyName(string deviceId, out string? name)
    {
        name = null;
        if (_pc == 0) return unchecked((int)0x80004003);
        var key = PKeys.Device_FriendlyName;
        PROPVARIANT pv = default;
        int hr;
        fixed (char* id = deviceId)
            hr = ((delegate* unmanaged[Stdcall]<nint, char*, int, PROPERTYKEY*, PROPVARIANT*, int>)Slot(SlotGetPropertyValue))(_pc, id, 0, &key, &pv);
        if (hr == 0 && pv.vt == 31 && pv.p != 0) name = Marshal.PtrToStringUni(pv.p);
        Native.PropVariantClear(ref pv);
        return hr;
    }

    /// <summary>Slot 13. "Default Device" in Windows = eConsole + eMultimedia; "Default Communication Device" = eCommunications.</summary>
    public int SetDefaultEndpoint(string deviceId, ERole role)
    {
        if (_pc == 0) return unchecked((int)0x80004003);
        fixed (char* id = deviceId)
            return ((delegate* unmanaged[Stdcall]<nint, char*, ERole, int>)Slot(SlotSetDefaultEndpoint))(_pc, id, role);
    }

    public void Dispose()
    {
        var p = Interlocked.Exchange(ref _pc, 0);
        if (p != 0) Marshal.Release(p);
    }
}
