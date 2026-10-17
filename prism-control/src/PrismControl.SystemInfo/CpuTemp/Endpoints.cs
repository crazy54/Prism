using System.Buffers;
using System.Diagnostics;
using System.Net.Http;
using System.Net.Sockets;
using System.Text.Json;
using PrismControl.SystemInfo.Native;

namespace PrismControl.SystemInfo.CpuTemp;

/// <summary>
/// GET http://127.0.0.1:&lt;port&gt;/data.json (never "localhost": that costs ~2 s here). The connect timeout is short
/// because a refused loopback connect on Windows otherwise takes ~2 s (TCP retries the SYN). ONE 2.5 s budget covers the
/// whole read, headers and body (like Cooling's LhmProvider): a hung LHM, or another app on the port that stalls after
/// its headers, costs one timeout, never a stuck CPU-temperature loop.
/// </summary>
internal sealed class LhmHttpEndpoint : ILhmEndpoint, IDisposable
{
    public static readonly TimeSpan ReadTimeout = TimeSpan.FromSeconds(2.5);
    private const int MaxBytes = 8 * 1024 * 1024;
    private readonly HttpClient _http = new(new SocketsHttpHandler
    {
        ConnectTimeout = TimeSpan.FromMilliseconds(400),
        UseProxy = false,
        UseCookies = false,
        AllowAutoRedirect = false,
        PooledConnectionIdleTimeout = TimeSpan.FromSeconds(15),
    })
    { Timeout = System.Threading.Timeout.InfiniteTimeSpan }; // the per-read token below is the only deadline

    public async Task<ProviderRead> ReadAsync(int port, CancellationToken cancellationToken)
    {
        byte[]? rented = null;
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        deadline.CancelAfter(ReadTimeout);
        var ct = deadline.Token;
        try
        {
            using var resp = await _http.GetAsync($"http://127.0.0.1:{port}/data.json", HttpCompletionOption.ResponseHeadersRead, ct).ConfigureAwait(false);
            if (!resp.IsSuccessStatusCode) return new ProviderRead(ProviderOutcome.Error, null, $"HTTP {(int)resp.StatusCode}");
            if (resp.Content.Headers.ContentLength is > MaxBytes) return new ProviderRead(ProviderOutcome.Error, null, "response too large");
            await using var stream = await resp.Content.ReadAsStreamAsync(ct).ConfigureAwait(false);
            rented = ArrayPool<byte>.Shared.Rent((int)Math.Clamp(resp.Content.Headers.ContentLength ?? 262144, 4096, MaxBytes));
            var length = 0;
            while (true)
            {
                if (length == rented.Length)
                {
                    if (rented.Length >= MaxBytes) return new ProviderRead(ProviderOutcome.Error, null, "response too large");
                    var bigger = ArrayPool<byte>.Shared.Rent(Math.Min(rented.Length * 2, MaxBytes));
                    rented.AsSpan(0, length).CopyTo(bigger);
                    ArrayPool<byte>.Shared.Return(rented);
                    rented = bigger;
                }
                var n = await stream.ReadAsync(rented.AsMemory(length), ct).ConfigureAwait(false);
                if (n == 0) break;
                length += n;
            }
            var reading = LhmParser.FindCpuTemperature(rented.AsSpan(0, length));
            return reading is null ? new ProviderRead(ProviderOutcome.NoCpuSensor) : new ProviderRead(ProviderOutcome.Ok, reading);
        }
        catch (HttpRequestException ex) when (ex.InnerException is SocketException || ex.HttpRequestError == HttpRequestError.ConnectionError)
        {
            return new ProviderRead(ProviderOutcome.Unreachable, null, "connection refused");
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            return new ProviderRead(ProviderOutcome.Unreachable, null, "timed out");
        }
        catch (HttpRequestException ex)
        {
            return new ProviderRead(ProviderOutcome.Error, null, ex.HttpRequestError.ToString());
        }
        catch (IOException) when (!cancellationToken.IsCancellationRequested)
        {
            return new ProviderRead(ProviderOutcome.Error, null, "the connection closed mid-response");
        }
        catch (JsonException)
        {
            return new ProviderRead(ProviderOutcome.Error, null, "unexpected data");
        }
        finally
        {
            if (rented is not null) ArrayPool<byte>.Shared.Return(rented);
        }
    }

    public bool IsAppRunning()
    {
        var processes = Process.GetProcessesByName("LibreHardwareMonitor");
        try { return processes.Length > 0; }
        finally { foreach (var p in processes) p.Dispose(); }
    }

    public void Dispose() => _http.Dispose();
}

/// <summary>Maps HWiNFO's sensor shared memory read-only and parses it in place (bounds-checked against the mapped size).</summary>
internal sealed unsafe class HwInfoSharedMemory(string name = HwInfoSharedMemory.DefaultName) : IHwInfoEndpoint, IDisposable
{
    public const string DefaultName = @"Global\HWiNFO_SENS_SM2";

    private nint _mapping;
    private void* _view;
    private nuint _size;

    public ProviderRead Read()
    {
        if (_view == null && !Open(out var absent)) return absent;
        var span = new ReadOnlySpan<byte>(_view, (int)Math.Min(_size, (nuint)int.MaxValue));
        // A stopped HWiNFO leaves the section alive while we hold it; its signature and poll time tell.
        if (span.Length >= 20)
        {
            var poll = *(long*)((byte*)_view + 12);
            var age = DateTimeOffset.UtcNow.ToUnixTimeSeconds() - poll;
            if (poll > 0 && age > 60)
            {
                Close();
                return new ProviderRead(ProviderOutcome.Inactive, null, "not updating");
            }
        }
        var reading = HwInfoParser.FindCpuTemperature(span, out var error);
        if (reading is not null) return new ProviderRead(ProviderOutcome.Ok, reading);
        var inactive = span.Length < 4 || *(uint*)_view != HwInfoParser.Signature;
        if (inactive) Close();
        return new ProviderRead(inactive ? ProviderOutcome.Inactive : ProviderOutcome.NoCpuSensor, null, error);
    }

    private bool Open(out ProviderRead failure)
    {
        failure = new ProviderRead(ProviderOutcome.Unreachable, null, "not running");
        _mapping = Win32.OpenFileMapping(Win32.FILE_MAP_READ, false, name);
        if (_mapping == 0) return false;
        _view = Win32.MapViewOfFile(_mapping, Win32.FILE_MAP_READ, 0, 0, 0);
        if (_view == null)
        {
            Close();
            failure = new ProviderRead(ProviderOutcome.Error, null, "cannot map the shared memory");
            return false;
        }
        MEMORY_BASIC_INFORMATION mbi;
        _size = Win32.VirtualQuery(_view, &mbi, (nuint)sizeof(MEMORY_BASIC_INFORMATION)) != 0 ? mbi.RegionSize : 0;
        if (_size < HwInfoParser.HeaderSize)
        {
            Close();
            failure = new ProviderRead(ProviderOutcome.Error, null, "shared memory too small");
            return false;
        }
        return true;
    }

    private void Close()
    {
        if (_view != null) Win32.UnmapViewOfFile(_view);
        _view = null;
        if (_mapping != 0) Win32.CloseHandle(_mapping);
        _mapping = 0;
        _size = 0;
    }

    public void Dispose() => Close();
}
