using System.Diagnostics;
using PrismControl.Core.Hosting;
using PrismControl.SystemInfo.Native;
using PrismControl.SystemInfo.Telemetry;

namespace PrismControl.SystemInfo.Sources;

/// <summary>
/// Network throughput via IP Helper (research §2.4): the adapter list (GetIfTable2, 1.5-2.5 ms) and the default-route
/// pick (GetBestInterface: a routing-table lookup, no packets) are refreshed every ~10 s; each tick reads only the
/// listed adapters with GetIfEntry2 (31-38 µs each) and turns byte-counter deltas into bytes per second.
/// </summary>
internal sealed unsafe class IpHelperNetworkSource : INetworkSource
{
    private const int MaxAdapters = 12;
    private static readonly long RepickTicks = Stopwatch.Frequency * 10;

    private readonly ILog _log;
    private List<AdapterRow> _adapters = [];
    private uint _bestIf;
    private long _pickedAt;
    private readonly Dictionary<ulong, (ulong In, ulong Out, long At)> _prev = [];
    private bool _warned;

    internal sealed record AdapterRow(ulong Luid, uint Index, string Id, string Alias, string Description, bool Hardware, double? LinkMbps, uint Type);

    public IpHelperNetworkSource(ILog log) => _log = log;

    public void Prime()
    {
        RefreshIfDue(force: false);
        var now = Stopwatch.GetTimestamp();
        foreach (var a in _adapters)
            if (ReadCounters(a, out var inOct, out var outOct)) _prev[a.Luid] = (inOct, outOct, now);
    }

    public NetworkFrame? Read()
    {
        RefreshIfDue(force: false);
        if (_adapters.Count == 0) return new NetworkFrame();
        var now = Stopwatch.GetTimestamp();
        var frames = new List<NetAdapterFrame>(_adapters.Count);
        foreach (var a in _adapters)
        {
            double? rx = null, tx = null;
            var up = ReadCounters(a, out var inOct, out var outOct);
            if (up)
            {
                if (_prev.TryGetValue(a.Luid, out var p) && inOct >= p.In && outOct >= p.Out)
                {
                    var secs = (now - p.At) / (double)Stopwatch.Frequency;
                    if (secs > 0.05)
                    {
                        rx = (inOct - p.In) / secs;
                        tx = (outOct - p.Out) / secs;
                    }
                }
                _prev[a.Luid] = (inOct, outOct, now);
            }
            frames.Add(new NetAdapterFrame
            {
                Id = a.Id,
                Name = a.Alias,
                Description = a.Description,
                RxBps = rx,
                TxBps = tx,
                LinkMbps = a.LinkMbps,
                Up = up,
                Hardware = a.Hardware,
                IsDefaultRoute = a.Index == _bestIf,
            });
        }
        var (sumRx, sumTx) = NetworkMath.Totals(frames);
        return new NetworkFrame { RxBps = sumRx, TxBps = sumTx, Adapters = frames };
    }

    private bool ReadCounters(AdapterRow a, out ulong inOctets, out ulong outOctets)
    {
        var row = new MIB_IF_ROW2 { InterfaceLuid = a.Luid, InterfaceIndex = a.Index };
        if (Win32.GetIfEntry2(&row) != 0 || row.OperStatus != 1)
        {
            inOctets = outOctets = 0;
            return false;
        }
        inOctets = row.InOctets;
        outOctets = row.OutOctets;
        return true;
    }

    private void RefreshIfDue(bool force)
    {
        var now = Stopwatch.GetTimestamp();
        if (!force && _pickedAt != 0 && now - _pickedAt < RepickTicks) return;
        _pickedAt = now;
        _bestIf = BestInterface();
        if (Win32.GetIfTable2(out var table) != 0 || table == 0)
        {
            if (!_warned) _log.Warn("GetIfTable2 failed; network stats are unavailable.");
            _warned = true;
            _adapters = [];
            return;
        }
        try
        {
            var count = *(uint*)table;
            var rows = (MIB_IF_ROW2*)(table + 8);
            var list = new List<AdapterRow>();
            for (var i = 0; i < count; i++)
            {
                var r = &rows[i];
                if (!NetworkMath.IsInteresting(r->OperStatus, r->InterfaceAndOperStatusFlags, r->Type)) continue;
                var description = new string(r->Description).Trim();
                var hardware = (r->InterfaceAndOperStatusFlags & 1) != 0;
                if (!hardware && (NetworkMath.IsPlumbing(description) || r->InOctets + r->OutOctets == 0)) continue;
                var link = r->ReceiveLinkSpeed is 0 or ulong.MaxValue ? (double?)null : r->ReceiveLinkSpeed / 1e6;
                list.Add(new AdapterRow(r->InterfaceLuid, r->InterfaceIndex, r->InterfaceGuid.ToString("D"),
                    new string(r->Alias).Trim(), description, hardware, link, r->Type));
            }
            // Default route first, then hardware, then the rest; cap the list (each costs a GetIfEntry2 per tick).
            _adapters = list
                .OrderByDescending(a => a.Index == _bestIf)
                .ThenByDescending(a => a.Hardware)
                .ThenBy(a => a.Alias, StringComparer.OrdinalIgnoreCase)
                .Take(MaxAdapters)
                .ToList();
            foreach (var gone in _prev.Keys.Where(k => _adapters.All(a => a.Luid != k)).ToList()) _prev.Remove(gone);
        }
        finally { Win32.FreeMibTable(table); }
    }

    private static uint BestInterface()
    {
        // Any public address works: GetBestInterface only consults the routing table.
        if (Win32.GetBestInterface(0x01010101, out var idx) == 0) return idx;
        // IPv6-only networks: SOCKADDR_IN6 for 2606:4700:4700::1111.
        byte* sa = stackalloc byte[28];
        new Span<byte>(sa, 28).Clear();
        *(ushort*)sa = 23; // AF_INET6
        ReadOnlySpan<byte> addr = [0x26, 0x06, 0x47, 0x00, 0x47, 0x00, 0, 0, 0, 0, 0, 0, 0, 0, 0x11, 0x11];
        addr.CopyTo(new Span<byte>(sa + 8, 16));
        return Win32.GetBestInterfaceEx(sa, out idx) == 0 ? idx : 0;
    }

    public void Dispose() { }
}

/// <summary>Pure helpers for adapter selection and totals (unit-tested).</summary>
internal static class NetworkMath
{
    /// <summary>Up, not a filter shim (QoS/WFP/Npcap), not loopback (research §2.4).</summary>
    public static bool IsInteresting(int operStatus, byte flags, uint ifType) =>
        operStatus == 1 && (flags & 2) == 0 && ifType != 24;

    /// <summary>Hidden system adapters that never carry user traffic of their own (WAN miniports, switch extensions, debugger).</summary>
    public static bool IsPlumbing(string description) =>
        description.StartsWith("WAN Miniport", StringComparison.OrdinalIgnoreCase) ||
        description.Contains("Virtual Switch Extension", StringComparison.OrdinalIgnoreCase) ||
        description.Contains("Kernel Debug", StringComparison.OrdinalIgnoreCase) ||
        description.Contains("Teredo", StringComparison.OrdinalIgnoreCase) ||
        description.Contains("6to4", StringComparison.OrdinalIgnoreCase) ||
        description.Contains("IP-HTTPS", StringComparison.OrdinalIgnoreCase);

    /// <summary>Sum over hardware adapters that are up; if none has data, the default-route adapter.</summary>
    public static (double? Rx, double? Tx) Totals(IReadOnlyList<NetAdapterFrame> adapters)
    {
        double rx = 0, tx = 0;
        var any = false;
        foreach (var a in adapters)
        {
            if (!a.Up || !a.Hardware || a.RxBps is not { } r || a.TxBps is not { } t) continue;
            rx += r;
            tx += t;
            any = true;
        }
        if (any) return (rx, tx);
        var d = adapters.FirstOrDefault(a => a.IsDefaultRoute && a.RxBps is not null);
        return d is null ? (null, null) : (d.RxBps, d.TxBps);
    }
}
