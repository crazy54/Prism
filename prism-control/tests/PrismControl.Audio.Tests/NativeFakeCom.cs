using System.Runtime.InteropServices;

namespace PrismControl.Audio.Tests;

/// <summary>
/// A hand-built native COM object (IUnknown + IAudioMeterInformation) with a reference count the test can read.
/// It is not a .NET wrapper, so the marshallers cannot unwrap it: every RCW over it is a real <c>ComObject</c>,
/// exactly like an object from the audio service. Objects are never freed (a buggy double release cannot crash the
/// test run; the leak is a few bytes per test).
/// </summary>
internal static unsafe class NativeFakeMeter
{
    private const int E_NOINTERFACE = unchecked((int)0x80004002);
    private static readonly Guid IidUnknown = new("00000000-0000-0000-C000-000000000046");
    private static readonly Guid IidMeter = new("C02216F6-8C67-4B5B-9D00-D008E73E0064");

    [StructLayout(LayoutKind.Sequential)]
    private struct Obj
    {
        public void** Vtbl;
        public int Refs;
        public float Peak;
        public int Calls;
    }

    private static readonly nint Vtable = CreateVtable();

    private static nint CreateVtable()
    {
        var v = (void**)NativeMemory.AllocZeroed(7, (nuint)sizeof(void*));
        v[0] = (delegate* unmanaged<Obj*, Guid*, void**, int>)&QueryInterface;
        v[1] = (delegate* unmanaged<Obj*, uint>)&AddRef;
        v[2] = (delegate* unmanaged<Obj*, uint>)&Release;
        v[3] = (delegate* unmanaged<Obj*, float*, int>)&GetPeakValue;
        v[4] = (delegate* unmanaged<Obj*, uint*, int>)&GetMeteringChannelCount;
        v[5] = (delegate* unmanaged<Obj*, uint, float*, int>)&GetChannelsPeakValues;
        v[6] = (delegate* unmanaged<Obj*, uint*, int>)&QueryHardwareSupport;
        return (nint)v;
    }

    /// <summary>A new object holding one reference (the caller's).</summary>
    public static nint Create(float peak)
    {
        var o = (Obj*)NativeMemory.AllocZeroed((nuint)sizeof(Obj));
        o->Vtbl = (void**)Vtable;
        o->Refs = 1;
        o->Peak = peak;
        return (nint)o;
    }

    public static int RefCount(nint p) => Volatile.Read(ref ((Obj*)p)->Refs);

    /// <summary>How many IAudioMeterInformation methods were called on the object.</summary>
    public static int Calls(nint p) => Volatile.Read(ref ((Obj*)p)->Calls);

    [UnmanagedCallersOnly]
    private static int QueryInterface(Obj* self, Guid* iid, void** ppv)
    {
        if (*iid == IidUnknown || *iid == IidMeter)
        {
            Interlocked.Increment(ref self->Refs);
            *ppv = self;
            return 0;
        }
        *ppv = null;
        return E_NOINTERFACE;
    }

    [UnmanagedCallersOnly]
    private static uint AddRef(Obj* self) => (uint)Interlocked.Increment(ref self->Refs);

    [UnmanagedCallersOnly]
    private static uint Release(Obj* self) => (uint)Interlocked.Decrement(ref self->Refs);

    [UnmanagedCallersOnly]
    private static int GetPeakValue(Obj* self, float* peak)
    {
        Interlocked.Increment(ref self->Calls);
        *peak = self->Peak;
        return 0;
    }

    [UnmanagedCallersOnly]
    private static int GetMeteringChannelCount(Obj* self, uint* n)
    {
        Interlocked.Increment(ref self->Calls);
        *n = 0;
        return 0;
    }

    [UnmanagedCallersOnly]
    private static int GetChannelsPeakValues(Obj* self, uint n, float* values)
    {
        Interlocked.Increment(ref self->Calls);
        return 0;
    }

    [UnmanagedCallersOnly]
    private static int QueryHardwareSupport(Obj* self, uint* mask)
    {
        Interlocked.Increment(ref self->Calls);
        *mask = 0;
        return 0;
    }
}
