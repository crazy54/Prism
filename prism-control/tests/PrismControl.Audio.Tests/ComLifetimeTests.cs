using PrismControl.Audio.Interop;
using PrismControl.Testing;

namespace PrismControl.Audio.Tests;

/// <summary>COM lifetime: deterministic release (review A #10).</summary>
public class ComLifetimeTests
{
    [Test]
    public void Native_release_drops_the_reference_at_once_without_the_gc()
    {
        var p = NativeFakeMeter.Create(0.5f);
        var meter = Native.Wrap<IAudioMeterInformation>(p); // takes over our reference
        Assert.Equal(0, meter.GetPeakValue(out var peak));
        Assert.Equal(0.5f, peak);
        Assert.True(NativeFakeMeter.RefCount(p) >= 1, "the RCW holds the object");
        Native.Release(meter);
        Assert.Equal(0, NativeFakeMeter.RefCount(p), "Native.Release let go of every reference right away");
        Native.Release(meter); // twice is harmless
        Assert.Equal(0, NativeFakeMeter.RefCount(p));
        // A released wrapper refuses calls instead of calling into an object it no longer holds.
        var calls = NativeFakeMeter.Calls(p);
        Assert.Throws<ObjectDisposedException>(() => meter.GetPeakValue(out _));
        Assert.Equal(calls, NativeFakeMeter.Calls(p), "the call never reached the object");
    }

    [Test]
    public void Owned_scopes_release_short_lived_objects()
    {
        var p = NativeFakeMeter.Create(0.25f);
        using (var meter = Native.Own<IAudioMeterInformation>(0, p))
        {
            Assert.Equal(0, meter.Value!.GetPeakValue(out _));
            Assert.True(NativeFakeMeter.RefCount(p) >= 1);
        }
        Assert.Equal(0, NativeFakeMeter.RefCount(p), "released at the end of the using block");
        var failed = NativeFakeMeter.Create(0);
        using (var none = Native.Own<IAudioMeterInformation>(unchecked((int)0x80004005), failed)) Assert.Null(none.Value);
        Assert.Equal(0, NativeFakeMeter.RefCount(failed), "a pointer that came with a failure HRESULT is released too");
    }
}
