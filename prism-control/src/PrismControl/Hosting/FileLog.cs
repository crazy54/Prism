using System.Globalization;
using System.Text;
using System.Threading.Channels;
using PrismControl.Core.Hosting;

namespace PrismControl.Hosting;

/// <summary>
/// Async file log: %APPDATA%\Prism\control\logs\prismcontrol.log, rolled at 5 MB (one .1 backup).
/// Warnings and errors are also forwarded to the Stream Deck app log (logMessage, rate-limited by the connection).
/// </summary>
internal sealed class FileLog : ILog, IAsyncDisposable
{
    private readonly Channel<string> _lines = Channel.CreateBounded<string>(new BoundedChannelOptions(4096) { FullMode = BoundedChannelFullMode.DropOldest, SingleReader = true });
    private readonly string _path;
    private readonly LogLevel _min;
    private readonly Task _writer;
    private const long MaxBytes = 5 * 1024 * 1024;

    public FileLog(string directory, LogLevel min)
    {
        Directory.CreateDirectory(directory);
        _path = Path.Combine(directory, "prismcontrol.log");
        _min = min;
        _writer = Task.Run(WriteLoopAsync);
    }

    /// <summary>Forward warnings/errors here (set once the connection exists).</summary>
    public Action<string>? RemoteSink { get; set; }
    public bool AlsoConsole { get; set; }

    public bool IsEnabled(LogLevel level) => level >= _min;

    public void Write(LogLevel level, string message, Exception? exception = null) => WriteCore(level, null, message, exception);

    public ILog For(string category) => new Child(this, category);

    private void WriteCore(LogLevel level, string? category, string message, Exception? ex)
    {
        if (level < _min) return;
        var sb = new StringBuilder(128);
        sb.Append(DateTimeOffset.Now.ToString("yyyy-MM-dd HH:mm:ss.fff", CultureInfo.InvariantCulture)).Append(' ')
          .Append(level switch { LogLevel.Debug => "DBG", LogLevel.Info => "INF", LogLevel.Warn => "WRN", _ => "ERR" }).Append(' ');
        if (category is not null) sb.Append('[').Append(category).Append("] ");
        sb.Append(message);
        if (ex is not null) sb.Append(" | ").Append(ex);
        var line = sb.ToString();
        _lines.Writer.TryWrite(line);
        if (AlsoConsole) Console.Error.WriteLine(line);
        if (level >= LogLevel.Warn)
        {
            try { RemoteSink?.Invoke($"[{(category ?? "core")}] {message}{(ex is null ? "" : " (" + ex.GetType().Name + ": " + ex.Message + ")")}"); }
            catch { /* never throw from logging */ }
        }
    }

    private async Task WriteLoopAsync()
    {
        StreamWriter? writer = null;
        try
        {
            await foreach (var line in _lines.Reader.ReadAllAsync().ConfigureAwait(false))
            {
                try
                {
                    if (writer is not null && writer.BaseStream.Length > MaxBytes)
                    {
                        await writer.DisposeAsync().ConfigureAwait(false);
                        writer = null;
                        File.Move(_path, _path + ".1", overwrite: true);
                    }
                    // One stream for the whole run; readers (tests, tail -f) may open it while we write.
                    writer ??= new StreamWriter(new FileStream(_path, FileMode.Append, FileAccess.Write, FileShare.ReadWrite | FileShare.Delete), new System.Text.UTF8Encoding(false));
                    await writer.WriteLineAsync(line).ConfigureAwait(false);
                    if (_lines.Reader.Count == 0) await writer.FlushAsync().ConfigureAwait(false);
                }
                catch (IOException) { writer = null; /* best effort */ }
                catch (UnauthorizedAccessException) { writer = null; }
            }
        }
        catch (OperationCanceledException) { }
        finally
        {
            if (writer is not null) await writer.DisposeAsync().ConfigureAwait(false);
        }
    }

    public async ValueTask DisposeAsync()
    {
        _lines.Writer.TryComplete();
        try { await _writer.WaitAsync(TimeSpan.FromSeconds(2)).ConfigureAwait(false); } catch { }
    }

    private sealed class Child(FileLog root, string category) : ILog
    {
        public void Write(LogLevel level, string message, Exception? exception = null) => root.WriteCore(level, category, message, exception);
        public ILog For(string sub) => new Child(root, category + "/" + sub);
        public bool IsEnabled(LogLevel level) => root.IsEnabled(level);
    }
}
