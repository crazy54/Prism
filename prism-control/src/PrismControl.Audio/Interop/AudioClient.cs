// WASAPI stream interfaces for loopback capture of a render endpoint (the /v1/audio/spectrum analyzer).
// Same rules as CoreAudio.cs: [GeneratedComInterface], vtable order = declaration order after IUnknown's three slots,
// every returned object is an `out nint` the caller wraps with Native.Wrap (a unique RCW released deterministically).
// Source: audioclient.h (Windows SDK 10.0.22621). Only reads and stream control on our own stream: nothing here changes
// a device, a volume or another app's session.
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.Marshalling;

namespace PrismControl.Audio.Interop;

internal static class Wasapi
{
    public static readonly Guid IID_IAudioClient = new("1CB9AD4C-DBFA-4C32-B178-C2F568A703B2");
    public static readonly Guid IID_IAudioCaptureClient = new("C8ADBD64-E71E-48A0-A4DE-185C395CD317");
    public static readonly Guid IID_IAudioSessionControl = new("F4B1A599-7266-4319-A8CA-E70ACB11E8CD");

    public const int AUDCLNT_SHAREMODE_SHARED = 0;
    /// <summary>Capture what the render endpoint plays (shared mode only).</summary>
    public const uint AUDCLNT_STREAMFLAGS_LOOPBACK = 0x00020000;

    public const uint AUDCLNT_BUFFERFLAGS_DATA_DISCONTINUITY = 0x1;
    /// <summary>The packet is silence: ignore the data pointer and treat the frames as zeros.</summary>
    public const uint AUDCLNT_BUFFERFLAGS_SILENT = 0x2;
    public const uint AUDCLNT_BUFFERFLAGS_TIMESTAMP_ERROR = 0x4;

    /// <summary>GetBuffer: no packet is ready (a success code).</summary>
    public const int AUDCLNT_S_BUFFER_EMPTY = 0x08890001;
    public const int AUDCLNT_E_NOT_INITIALIZED = unchecked((int)0x88890001);
    public const int AUDCLNT_E_DEVICE_IN_USE = unchecked((int)0x8889000A);
    public const int AUDCLNT_E_BUFFER_ERROR = unchecked((int)0x88890018);
    /// <summary>Windows 8.1+: the stream must be torn down and re-created (e.g. after a format change).</summary>
    public const int AUDCLNT_E_RESOURCES_INVALIDATED = unchecked((int)0x88890026);

    /// <summary>REFERENCE_TIME is in 100 ns units.</summary>
    public const long HnsPerMs = 10_000;

    public const ushort WAVE_FORMAT_PCM = 1;
    public const ushort WAVE_FORMAT_IEEE_FLOAT = 3;
    public const ushort WAVE_FORMAT_EXTENSIBLE = 0xFFFE;
    public static readonly Guid KSDATAFORMAT_SUBTYPE_PCM = new("00000001-0000-0010-8000-00aa00389b71");
    public static readonly Guid KSDATAFORMAT_SUBTYPE_IEEE_FLOAT = new("00000003-0000-0010-8000-00aa00389b71");
}

[GeneratedComInterface]
[Guid("1CB9AD4C-DBFA-4C32-B178-C2F568A703B2")]
internal partial interface IAudioClient
{
    // pFormat: const WAVEFORMATEX*; audioSessionGuid: LPCGUID (0 = the process's default session).
    [PreserveSig] int Initialize(int shareMode, uint streamFlags, long hnsBufferDuration, long hnsPeriodicity, nint pFormat, nint audioSessionGuid);
    [PreserveSig] int GetBufferSize(out uint numBufferFrames);
    [PreserveSig] int GetStreamLatency(out long hnsLatency);
    [PreserveSig] int GetCurrentPadding(out uint numPaddingFrames);
    [PreserveSig] int IsFormatSupported(int shareMode, nint pFormat, out nint closestMatch); // closestMatch: CoTaskMem WAVEFORMATEX*
    [PreserveSig] int GetMixFormat(out nint deviceFormat);                                   // CoTaskMem WAVEFORMATEX*; caller frees
    [PreserveSig] int GetDevicePeriod(out long defaultDevicePeriod, out long minimumDevicePeriod);
    [PreserveSig] int Start();
    [PreserveSig] int Stop();
    [PreserveSig] int Reset();
    [PreserveSig] int SetEventHandle(nint eventHandle);
    [PreserveSig] int GetService(in Guid riid, out nint ppv);
}

[GeneratedComInterface]
[Guid("C8ADBD64-E71E-48A0-A4DE-185C395CD317")]
internal partial interface IAudioCaptureClient
{
    // ppData points into the engine's buffer and stays valid until ReleaseBuffer. AUDCLNT_S_BUFFER_EMPTY = nothing ready.
    [PreserveSig] int GetBuffer(out nint ppData, out uint numFramesToRead, out uint flags, out ulong devicePosition, out ulong qpcPosition);
    [PreserveSig] int ReleaseBuffer(uint numFramesRead);
    [PreserveSig] int GetNextPacketSize(out uint numFramesInNextPacket);
}

/// <summary>The sample layouts the analyzer reads.</summary>
internal enum SampleKind { Unsupported, Float32, Pcm16, Pcm24, Pcm32 }

/// <summary>A parsed WAVEFORMATEX / WAVEFORMATEXTENSIBLE.</summary>
internal readonly record struct WaveFormat(int SampleRate, int Channels, int BitsPerSample, int BlockAlign, SampleKind Kind)
{
    /// <summary>
    /// Reads a WAVEFORMATEX(-TENSIBLE) at <paramref name="p"/>: +0 wFormatTag, +2 nChannels, +4 nSamplesPerSec,
    /// +8 nAvgBytesPerSec, +12 nBlockAlign, +14 wBitsPerSample, +16 cbSize; extensible: +18 wValidBitsPerSample,
    /// +20 dwChannelMask, +24 SubFormat (GUID).
    /// </summary>
    public static unsafe WaveFormat Parse(nint p)
    {
        if (p == 0) return default;
        var b = (byte*)p;
        var tag = *(ushort*)b;
        int channels = *(ushort*)(b + 2);
        var rate = (int)*(uint*)(b + 4);
        int blockAlign = *(ushort*)(b + 12);
        int bits = *(ushort*)(b + 14);
        var cbSize = *(ushort*)(b + 16);
        var isFloat = tag == Wasapi.WAVE_FORMAT_IEEE_FLOAT;
        var isPcm = tag == Wasapi.WAVE_FORMAT_PCM;
        if (tag == Wasapi.WAVE_FORMAT_EXTENSIBLE && cbSize >= 22)
        {
            var sub = *(Guid*)(b + 24);
            isFloat = sub == Wasapi.KSDATAFORMAT_SUBTYPE_IEEE_FLOAT;
            isPcm = sub == Wasapi.KSDATAFORMAT_SUBTYPE_PCM;
        }
        var kind = (isFloat, isPcm, bits) switch
        {
            (true, _, 32) => SampleKind.Float32,
            (_, true, 16) => SampleKind.Pcm16,
            (_, true, 24) => SampleKind.Pcm24,
            (_, true, 32) => SampleKind.Pcm32,
            _ => SampleKind.Unsupported,
        };
        if (channels <= 0 || rate <= 0 || blockAlign != channels * bits / 8) kind = SampleKind.Unsupported;
        return new WaveFormat(rate, channels, bits, blockAlign, kind);
    }
}
