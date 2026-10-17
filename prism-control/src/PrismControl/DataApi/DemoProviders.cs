using System.Buffers.Binary;
using System.IO.Compression;
using PrismControl.Core.Data;
using PrismControl.Core.Hosting;

namespace PrismControl.DataApi;

/// <summary>
/// Fictional, moving data for every v1 endpoint (PRISM_CONTROL_DEMO_DATA=1). Lets the sibling plugin and tests
/// exercise the API before the domain modules publish real data. Every payload has "demo": true and source "demo".
/// Real providers always win: a demo claim never replaces a real one, and a real claim replaces the demo.
/// </summary>
internal sealed class DemoProviders : IAsyncDisposable
{
    public const string Env = "PRISM_CONTROL_DEMO_DATA";
    private readonly CancellationTokenSource _cts = new();
    private Task? _loop;

    public static bool Enabled => Environment.GetEnvironmentVariable(Env) is "1" or "true";

    public void Start(IDataRegistry data, ILog log)
    {
        var sys = data.System.Claim("demo", TimeSpan.FromSeconds(1), demo: true);
        var np = data.NowPlaying.Claim("demo", TimeSpan.FromSeconds(1), demo: true);
        var art = data.NowPlayingArt.Claim("demo", demo: true);
        var levels = data.AudioLevels.Claim("demo", TimeSpan.FromMilliseconds(33), demo: true);
        var devices = data.AudioDevices.Claim("demo", TimeSpan.FromSeconds(5), demo: true);
        var mic = data.Mic.Claim("demo", TimeSpan.FromSeconds(1), demo: true);
        art?.Publish(TinyPng.Gradient(64, 64, (0xab, 0x91, 0xeb), (0x52, 0xce, 0xa0)), "image/png");
        devices?.Publish(new AudioDevicesSnapshot
        {
            Output = new AudioDeviceList
            {
                DefaultId = "demo-out-1",
                DefaultCommunicationsId = "demo-out-1",
                Devices =
                [
                    new AudioDeviceInfo { Id = "demo-out-1", Name = "Speakers (Example Audio)", IsDefault = true, IsDefaultCommunications = true, VolumePct = 42, Muted = false },
                    new AudioDeviceInfo { Id = "demo-out-2", Name = "Headphones (Example USB)", VolumePct = 60, Muted = false },
                ],
            },
            Input = new AudioDeviceList
            {
                DefaultId = "demo-in-1",
                DefaultCommunicationsId = "demo-in-1",
                Devices = [new AudioDeviceInfo { Id = "demo-in-1", Name = "Microphone (Example USB)", IsDefault = true, IsDefaultCommunications = true, VolumePct = 80, Muted = false }],
            },
        });
        log.Info("Demo data providers are on (fictional data).");
        var start = DateTimeOffset.UtcNow;
        _loop = Task.Run(async () =>
        {
            var tick = 0L;
            using var timer = new PeriodicTimer(TimeSpan.FromMilliseconds(33));
            try
            {
                while (await timer.WaitForNextTickAsync(_cts.Token).ConfigureAwait(false))
                {
                    tick++;
                    var t = (DateTimeOffset.UtcNow - start).TotalSeconds;
                    if (levels is not null && levels.IsDemanded)
                    {
                        var l = 0.35 + 0.3 * Math.Sin(t * 3.1) * Math.Sin(t * 0.7);
                        var r = 0.35 + 0.3 * Math.Sin(t * 2.7 + 1) * Math.Sin(t * 0.9);
                        levels.Publish(new AudioLevelsSnapshot
                        {
                            Output = Level("demo-out-1", "Speakers (Example Audio)", Math.Abs(l), Math.Abs(r)),
                            Input = Level("demo-in-1", "Microphone (Example USB)", Math.Abs(0.1 * Math.Sin(t * 5)), null),
                            IntervalMs = 33,
                        });
                    }
                    if (tick % 30 != 1) continue; // ~1 Hz below
                    sys?.Publish(new SystemSnapshot
                    {
                        Cpu = new CpuStats { Name = "Example CPU 16-Core", UsagePct = Round(23 + 12 * Math.Sin(t / 5)), ClockMhz = 4200, TempC = Round(55 + 6 * Math.Sin(t / 9)), Cores = 16, Threads = 32 },
                        Gpus = [new GpuStats { Index = 0, Name = "Example GPU 24GB", Vendor = "nvidia", UsagePct = Round(41 + 20 * Math.Sin(t / 4)), TempC = 62, PowerW = Round(180 + 40 * Math.Sin(t / 4)), PowerLimitW = 450, VramUsedMiB = 8123, VramTotalMiB = 24564, ClockMhz = 2520, MemClockMhz = 10501, FanPct = 35 }],
                        Memory = new MemoryStats { UsedMiB = 20480, TotalMiB = 65536, UsagePct = 31.3, CommitUsedMiB = 24000, CommitLimitMiB = 75000 },
                        Disks = [new DiskStats { Name = "C:", Label = "System", UsedGiB = 512, TotalGiB = 1863, UsagePct = 27.5, ReadBps = 1_200_000, WriteBps = 350_000, ActivePct = 3 }],
                        Network = new NetworkStats
                        {
                            RxBps = Round(1_500_000 + 500_000 * Math.Sin(t)),
                            TxBps = 120_000,
                            Adapters = [new NetAdapterStats { Name = "Ethernet", RxBps = Round(1_500_000 + 500_000 * Math.Sin(t)), TxBps = 120_000, LinkMbps = 1000, Up = true }],
                        },
                        UptimeSec = Math.Round(t),
                    });
                    const long duration = 215_000;
                    np?.Publish(new NowPlayingSnapshot
                    {
                        Source = "demo",
                        App = "Example Player",
                        State = "playing",
                        Track = new TrackInfo { Title = "Example Song", Artists = ["The Example Ensemble"], Album = "Demo Album", DurationMs = duration, Url = "https://music.example/track/demo" },
                        PositionMs = (long)(t * 1000) % duration,
                        PositionAt = DateTimeOffset.UtcNow,
                        Shuffle = false,
                        Repeat = "off",
                        Liked = true,
                        VolumePct = 42,
                        ContextName = "Demo Playlist",
                    });
                    mic?.Publish(new MicSnapshot { DeviceId = "demo-in-1", Name = "Microphone (Example USB)", Muted = ((long)t / 10) % 2 == 1, VolumePct = 80, InUse = false });
                }
            }
            catch (OperationCanceledException) { }
        });
    }

    private static LevelInfo Level(string id, string name, double l, double? r)
    {
        var peak = r is { } rr ? Math.Max(l, rr) : l;
        return new LevelInfo
        {
            DeviceId = id,
            DeviceName = name,
            Peak = Math.Round(peak, 3),
            PeakDb = peak > 0 ? Math.Round(20 * Math.Log10(peak), 1) : null,
            Channels = r is { } r2 ? [Math.Round(l, 3), Math.Round(r2, 3)] : [Math.Round(l, 3)],
        };
    }

    private static double Round(double v) => Math.Round(v, 1);

    public async ValueTask DisposeAsync()
    {
        _cts.Cancel();
        if (_loop is not null) { try { await _loop.ConfigureAwait(false); } catch { } }
        _cts.Dispose();
    }
}

/// <summary>A minimal RGB PNG encoder (zlib from the BCL, CRC-32 by hand). Demo art and test fixtures only.</summary>
internal static class TinyPng
{
    public static byte[] Gradient(int w, int h, (byte R, byte G, byte B) a, (byte R, byte G, byte B) b)
    {
        var raw = new byte[h * (1 + w * 3)];
        var i = 0;
        for (var y = 0; y < h; y++)
        {
            raw[i++] = 0;
            for (var x = 0; x < w; x++)
            {
                var t = (x + y) / (double)(w + h - 2);
                raw[i++] = (byte)(a.R + (b.R - a.R) * t);
                raw[i++] = (byte)(a.G + (b.G - a.G) * t);
                raw[i++] = (byte)(a.B + (b.B - a.B) * t);
            }
        }
        using var ms = new MemoryStream();
        ms.Write([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
        var ihdr = new byte[13];
        BinaryPrimitives.WriteInt32BigEndian(ihdr, w);
        BinaryPrimitives.WriteInt32BigEndian(ihdr.AsSpan(4), h);
        ihdr[8] = 8; // bit depth
        ihdr[9] = 2; // RGB
        Chunk(ms, "IHDR", ihdr);
        using (var z = new MemoryStream())
        {
            using (var zs = new ZLibStream(z, CompressionLevel.Optimal, leaveOpen: true)) zs.Write(raw);
            Chunk(ms, "IDAT", z.ToArray());
        }
        Chunk(ms, "IEND", []);
        return ms.ToArray();
    }

    private static void Chunk(Stream s, string type, byte[] data)
    {
        Span<byte> len = stackalloc byte[4];
        BinaryPrimitives.WriteInt32BigEndian(len, data.Length);
        s.Write(len);
        var typeBytes = System.Text.Encoding.ASCII.GetBytes(type);
        s.Write(typeBytes);
        s.Write(data);
        var crc = Crc32(typeBytes, data);
        Span<byte> c = stackalloc byte[4];
        BinaryPrimitives.WriteUInt32BigEndian(c, crc);
        s.Write(c);
    }

    private static readonly uint[] Table = Enumerable.Range(0, 256).Select(n =>
    {
        var c = (uint)n;
        for (var k = 0; k < 8; k++) c = (c & 1) != 0 ? 0xEDB88320u ^ (c >> 1) : c >> 1;
        return c;
    }).ToArray();

    private static uint Crc32(byte[] a, byte[] b)
    {
        var c = 0xFFFFFFFFu;
        foreach (var x in a) c = Table[(c ^ x) & 0xFF] ^ (c >> 8);
        foreach (var x in b) c = Table[(c ^ x) & 0xFF] ^ (c >> 8);
        return c ^ 0xFFFFFFFFu;
    }
}
