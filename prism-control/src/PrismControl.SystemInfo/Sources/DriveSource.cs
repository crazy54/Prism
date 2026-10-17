using PrismControl.Core.Hosting;

namespace PrismControl.SystemInfo.Sources;

/// <summary>
/// Free space per fixed drive via DriveInfo (≈1 ms; research §2.3), refreshed on a background task at most every
/// 30-60 s so a slow virtual drive (e.g. a cloud-sync drive that reports itself as Fixed) can never stall a tick.
/// </summary>
internal sealed class DriveInfoSource(ILog log, TimeProvider time) : IDriveSource
{
    private IReadOnlyList<DriveSpace> _current = [];
    private long _refreshedAt;
    private int _refreshedOnce;
    private int _running;
    private bool _warned;

    public IReadOnlyList<DriveSpace> Current => Volatile.Read(ref _current);

    public void RefreshIfOlderThan(TimeSpan maxAge)
    {
        var at = Interlocked.Read(ref _refreshedAt);
        if (Volatile.Read(ref _refreshedOnce) == 1 && time.GetElapsedTime(at) < maxAge) return;
        if (Interlocked.Exchange(ref _running, 1) == 1) return;
        _ = Task.Run(() =>
        {
            try { Volatile.Write(ref _current, ReadNow()); }
            catch (Exception ex)
            {
                if (!_warned) log.Warn("Reading drive free space failed", ex);
                _warned = true;
            }
            finally
            {
                Interlocked.Exchange(ref _refreshedAt, time.GetTimestamp());
                Volatile.Write(ref _refreshedOnce, 1);
                Volatile.Write(ref _running, 0);
            }
        });
    }

    internal static IReadOnlyList<DriveSpace> ReadNow()
    {
        var list = new List<DriveSpace>();
        foreach (var d in DriveInfo.GetDrives())
        {
            try
            {
                if (d.DriveType != DriveType.Fixed || !d.IsReady) continue;
                var total = d.TotalSize / 1073741824.0;
                if (total <= 0) continue;
                var label = string.IsNullOrWhiteSpace(d.VolumeLabel) ? null : d.VolumeLabel.Trim();
                list.Add(new DriveSpace(d.Name.TrimEnd('\\'), label, d.DriveFormat, total, d.AvailableFreeSpace / 1073741824.0));
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException) { }
        }
        return list;
    }
}
