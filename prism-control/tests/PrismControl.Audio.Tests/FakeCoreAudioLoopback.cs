using System.Collections.Concurrent;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.Marshalling;
using PrismControl.Audio.Interop;

namespace PrismControl.Audio.Tests;

/// <summary>
/// A fake shared-mode WASAPI stream (IAudioClient + IAudioCaptureClient + its session) for the real engine's loopback
/// code. Packets come from <see cref="FakeEndpoint.Play"/>; every call answers AUDCLNT_E_SERVICE_NOT_RUNNING once the
/// fake service stopped or restarted, and <see cref="FailWith"/> simulates a removed device or a format change.
/// </summary>
[GeneratedComClass]
internal sealed partial class FakeAudioClient : IAudioClient
{
    private readonly FakeAudioService _svc;
    private readonly FakeEndpoint _ep;
    private readonly int _generation;

    public FakeAudioClient(FakeAudioService svc, FakeEndpoint ep, int generation)
    {
        _svc = svc;
        _ep = ep;
        _generation = generation;
        Capture = new FakeCaptureClient(this);
        Session = new FakeStreamSession();
    }

    public FakeCaptureClient Capture { get; }
    public FakeStreamSession Session { get; }
    public bool Initialized { get; private set; }
    public int ShareMode { get; private set; } = -1;
    public uint StreamFlags { get; private set; }
    public long BufferDuration { get; private set; }
    public volatile bool Started;
    public int StartCalls, StopCalls, MixFormatCalls;
    public bool MixIsPcm16 => _ep.MixIsPcm16;
    public int MixChannels => _ep.MixChannels;

    /// <summary>Every call from now on fails with this HRESULT (0 = working).</summary>
    public int FailWith { get; set; }

    public int Hr => _svc.IsDead(_generation) ? FakeAudioService.Down : FailWith;

    public int Initialize(int shareMode, uint streamFlags, long hnsBufferDuration, long hnsPeriodicity, nint pFormat, nint audioSessionGuid)
    {
        if (Hr != 0) return Hr;
        if (Initialized) return unchecked((int)0x88890002); // AUDCLNT_E_ALREADY_INITIALIZED
        if (pFormat == 0) return unchecked((int)0x80004003); // E_POINTER
        ShareMode = shareMode;
        StreamFlags = streamFlags;
        BufferDuration = hnsBufferDuration;
        Initialized = true;
        return 0;
    }

    public int GetBufferSize(out uint numBufferFrames)
    {
        numBufferFrames = (uint)(_ep.MixRate / 5);
        return Hr;
    }

    public int GetStreamLatency(out long hnsLatency)
    {
        hnsLatency = 100_000;
        return Hr;
    }

    public int GetCurrentPadding(out uint numPaddingFrames)
    {
        numPaddingFrames = 0;
        return Hr;
    }

    public int IsFormatSupported(int shareMode, nint pFormat, out nint closestMatch)
    {
        closestMatch = 0;
        return FakeAudioService.E_NOTIMPL;
    }

    public unsafe int GetMixFormat(out nint deviceFormat)
    {
        deviceFormat = 0;
        if (Hr != 0) return Hr;
        Interlocked.Increment(ref MixFormatCalls);
        var p = Marshal.AllocCoTaskMem(40); // freed by the engine (CoTaskMemFree)
        var b = (byte*)p;
        new Span<byte>(b, 40).Clear();
        var ch = (ushort)_ep.MixChannels;
        if (_ep.MixIsPcm16)
        {
            *(ushort*)b = Wasapi.WAVE_FORMAT_PCM;
            *(ushort*)(b + 2) = ch;
            *(uint*)(b + 4) = (uint)_ep.MixRate;
            *(uint*)(b + 8) = (uint)(_ep.MixRate * ch * 2);
            *(ushort*)(b + 12) = (ushort)(ch * 2);
            *(ushort*)(b + 14) = 16;
        }
        else
        {
            *(ushort*)b = Wasapi.WAVE_FORMAT_EXTENSIBLE;
            *(ushort*)(b + 2) = ch;
            *(uint*)(b + 4) = (uint)_ep.MixRate;
            *(uint*)(b + 8) = (uint)(_ep.MixRate * ch * 4);
            *(ushort*)(b + 12) = (ushort)(ch * 4);
            *(ushort*)(b + 14) = 32;
            *(ushort*)(b + 16) = 22;
            *(ushort*)(b + 18) = 32;
            *(uint*)(b + 20) = 0x3;
            *(Guid*)(b + 24) = Wasapi.KSDATAFORMAT_SUBTYPE_IEEE_FLOAT;
        }
        deviceFormat = p;
        return 0;
    }

    public int GetDevicePeriod(out long defaultDevicePeriod, out long minimumDevicePeriod)
    {
        defaultDevicePeriod = 100_000;
        minimumDevicePeriod = 30_000;
        return Hr;
    }

    public int Start()
    {
        if (Hr != 0) return Hr;
        if (!Initialized) return Wasapi.AUDCLNT_E_NOT_INITIALIZED;
        Interlocked.Increment(ref StartCalls);
        Started = true;
        return 0;
    }

    public int Stop()
    {
        Interlocked.Increment(ref StopCalls);
        Started = false;
        return Hr;
    }

    public int Reset() => Hr;
    public int SetEventHandle(nint eventHandle) => FakeAudioService.E_NOTIMPL;

    public int GetService(in Guid riid, out nint ppv)
    {
        ppv = 0;
        if (Hr != 0) return Hr;
        if (!Initialized) return Wasapi.AUDCLNT_E_NOT_INITIALIZED;
        if (riid == Wasapi.IID_IAudioCaptureClient) ppv = _svc.Out(Capture, riid);
        else if (riid == Wasapi.IID_IAudioSessionControl) ppv = _svc.Out(Session, riid);
        else return FakeAudioService.E_NOINTERFACE;
        return 0;
    }
}

[GeneratedComClass]
internal sealed partial class FakeCaptureClient(FakeAudioClient client) : IAudioCaptureClient
{
    private readonly ConcurrentQueue<(float[] Samples, uint Flags)> _packets = new();
    private nint _held;
    public int GetBufferCalls, Released;

    public int Pending => _packets.Count;

    public void Enqueue(float[] interleaved, uint flags) => _packets.Enqueue((interleaved, flags));

    public int GetNextPacketSize(out uint numFramesInNextPacket)
    {
        numFramesInNextPacket = 0;
        if (client.Hr != 0) return client.Hr;
        if (_packets.TryPeek(out var p)) numFramesInNextPacket = (uint)(p.Samples.Length / Channels);
        return 0;
    }

    public unsafe int GetBuffer(out nint ppData, out uint numFramesToRead, out uint flags, out ulong devicePosition, out ulong qpcPosition)
    {
        ppData = 0;
        numFramesToRead = flags = 0;
        devicePosition = qpcPosition = 0;
        if (client.Hr != 0) return client.Hr;
        if (_held != 0) return Wasapi.AUDCLNT_E_BUFFER_ERROR; // the previous packet was not released
        if (!_packets.TryPeek(out var p)) return Wasapi.AUDCLNT_S_BUFFER_EMPTY;
        Interlocked.Increment(ref GetBufferCalls);
        var bytesPer = client.MixIsPcm16 ? 2 : 4;
        _held = Marshal.AllocHGlobal(p.Samples.Length * bytesPer);
        for (var i = 0; i < p.Samples.Length; i++)
        {
            // A silent packet's data is garbage on purpose: the engine must not read it.
            var v = (p.Flags & Wasapi.AUDCLNT_BUFFERFLAGS_SILENT) != 0 ? 0.9f : p.Samples[i];
            if (client.MixIsPcm16) ((short*)_held)[i] = (short)Math.Clamp(v * 32768f, short.MinValue, short.MaxValue);
            else ((float*)_held)[i] = v;
        }
        ppData = _held;
        numFramesToRead = (uint)(p.Samples.Length / Channels);
        flags = p.Flags;
        return 0;
    }

    public int ReleaseBuffer(uint numFramesRead)
    {
        if (_held == 0) return Wasapi.AUDCLNT_E_BUFFER_ERROR;
        Marshal.FreeHGlobal(_held);
        _held = 0;
        _packets.TryDequeue(out _);
        Interlocked.Increment(ref Released);
        return client.Hr;
    }

    /// <summary>Queued packets are interleaved in the endpoint's mix channel count.</summary>
    private int Channels => client.MixChannels;
}

/// <summary>The session our loopback stream belongs to: records the ducking opt-out.</summary>
[GeneratedComClass]
internal sealed partial class FakeStreamSession : IAudioSessionControl2
{
    public int? DuckingOptOut { get; private set; }

    public int GetState(out int state) { state = 1; return 0; }
    public int GetDisplayName(out string? name) { name = null; return 0; }
    public int SetDisplayName(string value, in Guid eventContext) => FakeAudioService.E_NOTIMPL;
    public int GetIconPath(out string? path) { path = null; return 0; }
    public int SetIconPath(string value, in Guid eventContext) => FakeAudioService.E_NOTIMPL;
    public int GetGroupingParam(out Guid groupingParam) { groupingParam = Guid.Empty; return 0; }
    public int SetGroupingParam(in Guid groupingParam, in Guid eventContext) => FakeAudioService.E_NOTIMPL;
    public int RegisterAudioSessionNotification(IAudioSessionEvents newNotifications) => FakeAudioService.E_NOTIMPL;
    public int UnregisterAudioSessionNotification(IAudioSessionEvents newNotifications) => FakeAudioService.E_NOTIMPL;
    public int GetSessionIdentifier(out string? id) { id = null; return 0; }
    public int GetSessionInstanceIdentifier(out string? id) { id = null; return 0; }
    public int GetProcessId(out uint pid) { pid = (uint)Environment.ProcessId; return 0; }
    public int IsSystemSoundsSession() => HResults.S_FALSE;

    public int SetDuckingPreference(int optOut)
    {
        DuckingOptOut = optOut;
        return 0;
    }
}
