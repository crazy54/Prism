using System.Runtime.InteropServices;
using Windows.Graphics.Capture;
using Windows.Graphics.DirectX.Direct3D11;

namespace PrismControl.Sight.Capture;

/// <summary>
/// Minimal Direct3D 11 / DXGI / WGC interop through raw vtables (no NuGet, trimming-safe). Only what Sight needs:
/// a hardware device, staging textures, CopySubresourceRegion (the GPU-side crop), Map/Unmap, and the WinRT bridges.
/// Slot numbers follow d3d11.h / dxgi1_4.h declaration order.
/// </summary>
internal static unsafe partial class D3D11
{
    public const uint DXGI_FORMAT_R16G16B16A16_FLOAT = 10;
    public const uint DXGI_FORMAT_B8G8R8A8_UNORM = 87;
    private const uint D3D11_USAGE_STAGING = 3;
    private const uint D3D11_CPU_ACCESS_READ = 0x20000;
    private const uint D3D11_MAP_READ = 1;

    public static readonly Guid IID_IDXGIDevice = new("54ec77fa-1377-44e6-8c32-88fd5f44c84c");
    public static readonly Guid IID_ID3D11Texture2D = new("6f15aaf2-d208-4e89-9ab4-489535d34f9c");
    public static readonly Guid IID_ID3D11Multithread = new("9b7e4e00-342c-4106-a19f-4f2704f689f0");
    public static readonly Guid IID_IDirect3DDxgiInterfaceAccess = new("a9b3d012-3df2-4ee3-b8d1-8695f457d3c1");
    public static readonly Guid IID_IGraphicsCaptureItemInterop = new("3628e81b-3cac-4c60-b7f4-23ce0e0c3356");
    public static readonly Guid IID_IGraphicsCaptureItem = new("79c3f95b-31f7-4ec2-a464-632ef5d30760");
    /// <summary>MinUpdateInterval lives here (OS winmd; not in the 22621 projection).</summary>
    public static readonly Guid IID_IGraphicsCaptureSession5 = new("67c0ea62-1f85-5061-925a-239be0ac09cb");

    [LibraryImport("d3d11.dll")]
    private static partial int D3D11CreateDevice(nint adapter, int driverType, nint software, uint flags, nint levels, uint numLevels, uint sdk, out nint device, out int level, out nint context);

    [LibraryImport("d3d11.dll")]
    private static partial int CreateDirect3D11DeviceFromDXGIDevice(nint dxgiDevice, out nint inspectable);

    [LibraryImport("combase.dll", StringMarshalling = StringMarshalling.Utf16)]
    private static partial int WindowsCreateString(string s, uint len, out nint hstring);

    [LibraryImport("combase.dll")]
    private static partial int WindowsDeleteString(nint hstring);

    [LibraryImport("combase.dll")]
    private static partial int RoGetActivationFactory(nint classId, Guid* iid, nint* factory);

    public static nint Slot(nint obj, int i) => (*(nint**)obj)[i];
    public static uint Release(nint obj) => obj == 0 ? 0 : ((delegate* unmanaged[Stdcall]<nint, uint>)Slot(obj, 2))(obj);
    public static uint AddRef(nint obj) => obj == 0 ? 0 : ((delegate* unmanaged[Stdcall]<nint, uint>)Slot(obj, 1))(obj);

    public static int QueryInterface(nint obj, Guid iid, out nint result)
    {
        nint r;
        var hr = ((delegate* unmanaged[Stdcall]<nint, Guid*, nint*, int>)Slot(obj, 0))(obj, &iid, &r);
        result = r;
        return hr;
    }

    /// <summary>A hardware D3D11 device with BGRA support, multithread-protected (WGC raises frames on its own threads).</summary>
    public static (nint Device, nint Context, IDirect3DDevice WinRtDevice) CreateDevice()
    {
        var hr = D3D11CreateDevice(0, 1 /* HARDWARE */, 0, 0x20 /* BGRA_SUPPORT */, 0, 0, 7 /* SDK */, out var dev, out _, out var ctx);
        if (hr < 0) Marshal.ThrowExceptionForHR(hr);
        if (QueryInterface(dev, IID_ID3D11Multithread, out var mt) >= 0)
        {
            ((delegate* unmanaged[Stdcall]<nint, int, int>)Slot(mt, 5))(mt, 1);   // SetMultithreadProtected(TRUE)
            Release(mt);
        }
        Marshal.ThrowExceptionForHR(QueryInterface(dev, IID_IDXGIDevice, out var dxgi));
        try
        {
            Marshal.ThrowExceptionForHR(CreateDirect3D11DeviceFromDXGIDevice(dxgi, out var insp));
            var winrt = WinRT.MarshalInterface<IDirect3DDevice>.FromAbi(insp);
            Release(insp);
            return (dev, ctx, winrt);
        }
        finally { Release(dxgi); }
    }

    /// <summary>
    /// GraphicsCaptureItem for a window (IGraphicsCaptureItemInterop::CreateForWindow). There is deliberately no monitor
    /// variant: Sight never captures a whole monitor (it would read other apps' pixels).
    /// </summary>
    public static GraphicsCaptureItem CreateItemForWindow(nint hwnd)
    {
        const string cls = "Windows.Graphics.Capture.GraphicsCaptureItem";
        Marshal.ThrowExceptionForHR(WindowsCreateString(cls, (uint)cls.Length, out var hs));
        try
        {
            var iidInterop = IID_IGraphicsCaptureItemInterop;
            var iidItem = IID_IGraphicsCaptureItem;
            nint interop;
            Marshal.ThrowExceptionForHR(RoGetActivationFactory(hs, &iidInterop, &interop));
            try
            {
                nint itemPtr;
                const int createForWindow = 3;   // IGraphicsCaptureItemInterop slot 3 (slot 4, CreateForMonitor, is never used)
                Marshal.ThrowExceptionForHR(((delegate* unmanaged[Stdcall]<nint, nint, Guid*, nint*, int>)Slot(interop, createForWindow))(interop, hwnd, &iidItem, &itemPtr));
                var item = GraphicsCaptureItem.FromAbi(itemPtr);
                Release(itemPtr);
                return item;
            }
            finally { Release(interop); }
        }
        finally { WindowsDeleteString(hs); }
    }

    /// <summary>Sets IGraphicsCaptureSession5.MinUpdateInterval through the raw ABI. False when the OS lacks it.</summary>
    public static bool TrySetMinUpdateInterval(GraphicsCaptureSession session, TimeSpan interval)
    {
        var unk = ((WinRT.IWinRTObject)session).NativeObject.ThisPtr;
        if (QueryInterface(unk, IID_IGraphicsCaptureSession5, out var s5) < 0 || s5 == 0) return false;
        try
        {
            var hr = ((delegate* unmanaged[Stdcall]<nint, long, int>)Slot(s5, 7))(s5, interval.Ticks);   // put_MinUpdateInterval(TimeSpan)
            return hr >= 0;
        }
        finally { Release(s5); }
    }

    /// <summary>The ID3D11Texture2D behind a WGC frame surface (AddRef'd: release it).</summary>
    public static nint TextureOf(IDirect3DSurface surface)
    {
        var s = WinRT.MarshalInterface<IDirect3DSurface>.FromManaged(surface);
        try
        {
            Marshal.ThrowExceptionForHR(QueryInterface(s, IID_IDirect3DDxgiInterfaceAccess, out var access));
            try
            {
                var iid = IID_ID3D11Texture2D;
                nint tex;
                Marshal.ThrowExceptionForHR(((delegate* unmanaged[Stdcall]<nint, Guid*, nint*, int>)Slot(access, 3))(access, &iid, &tex));
                return tex;
            }
            finally { Release(access); }
        }
        finally { Release(s); }
    }

    /// <summary>D3D11_TEXTURE2D_DESC (11 UINTs): width, height, mips, array, format, sample count/quality, usage, bind, cpu, misc.</summary>
    public static (uint Width, uint Height, uint Format) Describe(nint texture)
    {
        var d = stackalloc uint[11];
        ((delegate* unmanaged[Stdcall]<nint, uint*, void>)Slot(texture, 10))(texture, d);
        return (d[0], d[1], d[4]);
    }

    public static nint CreateStaging(nint device, uint width, uint height, uint format)
    {
        var d = stackalloc uint[11];
        d[0] = width; d[1] = height; d[2] = 1; d[3] = 1; d[4] = format; d[5] = 1; d[6] = 0;
        d[7] = D3D11_USAGE_STAGING; d[8] = 0; d[9] = D3D11_CPU_ACCESS_READ; d[10] = 0;
        nint tex;
        var hr = ((delegate* unmanaged[Stdcall]<nint, uint*, nint, nint*, int>)Slot(device, 5))(device, d, 0, &tex);
        Marshal.ThrowExceptionForHR(hr);
        return tex;
    }

    /// <summary>A GPU-only texture (D3D11_USAGE_DEFAULT, no bind flags): the private copy of the latest frame.</summary>
    public static nint CreateDefault(nint device, uint width, uint height, uint format)
    {
        var d = stackalloc uint[11];
        d[0] = width; d[1] = height; d[2] = 1; d[3] = 1; d[4] = format; d[5] = 1; d[6] = 0;
        d[7] = 0; d[8] = 0; d[9] = 0; d[10] = 0;
        nint tex;
        var hr = ((delegate* unmanaged[Stdcall]<nint, uint*, nint, nint*, int>)Slot(device, 5))(device, d, 0, &tex);
        Marshal.ThrowExceptionForHR(hr);
        return tex;
    }

    /// <summary>ID3D11DeviceContext::CopySubresourceRegion (slot 46) with a source box.</summary>
    public static void CopyRegion(nint context, nint dst, uint dstX, uint dstY, nint src, uint left, uint top, uint right, uint bottom)
    {
        var box = stackalloc uint[6];
        box[0] = left; box[1] = top; box[2] = 0; box[3] = right; box[4] = bottom; box[5] = 1;
        ((delegate* unmanaged[Stdcall]<nint, nint, uint, uint, uint, uint, nint, uint, uint*, void>)Slot(context, 46))(context, dst, 0, dstX, dstY, 0, src, 0, box);
    }

    /// <summary>ID3D11DeviceContext::CopyResource (slot 47).</summary>
    public static void CopyResource(nint context, nint dst, nint src) =>
        ((delegate* unmanaged[Stdcall]<nint, nint, nint, void>)Slot(context, 47))(context, dst, src);

    /// <summary>Map(READ) a staging texture (slot 14): returns the data pointer and row pitch, or (0, 0) on failure.</summary>
    public static (nint Data, int RowPitch) Map(nint context, nint resource)
    {
        var mapped = stackalloc byte[16];   // D3D11_MAPPED_SUBRESOURCE { void* pData; UINT RowPitch; UINT DepthPitch; }
        var hr = ((delegate* unmanaged[Stdcall]<nint, nint, uint, uint, uint, byte*, int>)Slot(context, 14))(context, resource, 0, D3D11_MAP_READ, 0, mapped);
        return hr < 0 ? (0, 0) : (*(nint*)mapped, (int)*(uint*)(mapped + 8));
    }

    public static void Unmap(nint context, nint resource) =>
        ((delegate* unmanaged[Stdcall]<nint, nint, uint, void>)Slot(context, 15))(context, resource, 0);
}
