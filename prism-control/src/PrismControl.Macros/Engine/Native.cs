using System.Runtime.InteropServices;

namespace PrismControl.Macros.Engine;

/// <summary>
/// SendInput interop. x64 layouts verified with sizeof in research/win-probes/HostProbe (and in our tests):
/// INPUT 40 bytes with the union at +8, MOUSEINPUT 32, KEYBDINPUT 24, HARDWAREINPUT 8.
/// </summary>
internal static unsafe partial class NativeInput
{
    public const uint InputKeyboard = 1;
    /// <summary>dwExtraInfo on every event we inject ("PRMC"), so our own input is recognizable.</summary>
    public const nint ExtraInfoMarker = 0x50524D43;
    public const uint MapvkVkToVscEx = 4;

    [StructLayout(LayoutKind.Sequential)]
    public struct MOUSEINPUT { public int dx, dy; public uint mouseData, dwFlags, time; public nint dwExtraInfo; }

    [StructLayout(LayoutKind.Sequential)]
    public struct KEYBDINPUT { public ushort wVk, wScan; public uint dwFlags, time; public nint dwExtraInfo; }

    [StructLayout(LayoutKind.Sequential)]
    public struct HARDWAREINPUT { public uint uMsg; public ushort wParamL, wParamH; }

    [StructLayout(LayoutKind.Explicit)]
    public struct InputUnion
    {
        [FieldOffset(0)] public MOUSEINPUT mi;
        [FieldOffset(0)] public KEYBDINPUT ki;
        [FieldOffset(0)] public HARDWAREINPUT hi;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct INPUT { public uint type; public InputUnion u; }

    public static INPUT ToNative(KeyInput k) => new()
    {
        type = InputKeyboard,
        u = new InputUnion { ki = new KEYBDINPUT { wVk = k.Vk, wScan = k.Scan, dwFlags = (uint)k.Flags, time = 0, dwExtraInfo = ExtraInfoMarker } },
    };

    [LibraryImport("user32.dll", SetLastError = true)]
    public static partial uint SendInput(uint cInputs, INPUT* pInputs, int cbSize);

    [LibraryImport("user32.dll")]
    public static partial uint MapVirtualKeyW(uint uCode, uint uMapType);
}

/// <summary>
/// The real sink: one SendInput call per batch. Only the module creates it (never in safe mode or a dry run); tests never
/// call it. As a last line, it sends nothing while <c>PRISM_CONTROL_SAFE_MODE</c> is on (it reports 0 accepted, so a
/// wiring mistake shows up as an error instead of typing).
/// </summary>
internal sealed unsafe class SendInputSink : IInputSink
{
    public int Send(ReadOnlySpan<KeyInput> inputs)
    {
        if (inputs.IsEmpty || Core.Hosting.SafeModeEnvironment.FromEnvironment()) return 0;
        var native = new NativeInput.INPUT[inputs.Length];
        for (var i = 0; i < inputs.Length; i++) native[i] = NativeInput.ToNative(inputs[i]);
        fixed (NativeInput.INPUT* p = native)
            return (int)NativeInput.SendInput((uint)native.Length, p, sizeof(NativeInput.INPUT));
    }
}

/// <summary>MapVirtualKeyW(vk, MAPVK_VK_TO_VSC_EX) with the standard table as a fallback (read-only; sends nothing).</summary>
internal sealed class Win32ScanCodeMap : IScanCodeMap
{
    public ushort ToScanCode(ushort vk)
    {
        var sc = (ushort)NativeInput.MapVirtualKeyW(vk, NativeInput.MapvkVkToVscEx);
        return sc != 0 ? sc : StandardScanCodes.Instance.ToScanCode(vk);
    }
}
