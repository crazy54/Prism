using System.Globalization;
using System.Security.Cryptography;
using PrismControl.Core.Hosting;
using PrismControl.Desktop.Interop;

namespace PrismControl.Desktop;

/// <summary>prism-relay.exe could not be installed (missing from the plugin, or the copy failed verification).</summary>
public sealed class RelayInstallException(string message, Exception? inner = null) : IOException(message, inner);

/// <summary>How <see cref="RelayInstaller.EnsureAsync"/> put a new image at the stable path.</summary>
public enum RelayUpdateMethod
{
    /// <summary>Nothing to do: the stable copy already had the plugin's bytes.</summary>
    Unchanged,
    /// <summary>There was no stable copy yet: the verified image was moved into place.</summary>
    Installed,
    /// <summary>One POSIX-semantics rename-replace (the stable path never went missing, even with the old image running).</summary>
    PosixRename,
    /// <summary>MoveFileEx(REPLACE_EXISTING): atomic, possible when nothing ran the old image.</summary>
    Replace,
    /// <summary>A hard link kept the running image reachable, then the stable name was replaced atomically.</summary>
    HardLink,
    /// <summary>The last resort: the old image renamed aside, then the new one renamed into place (a gap of microseconds).</summary>
    RenameAside,
}

/// <summary>
/// Maintains ONE stable per-user copy, <c>%APPDATA%\Prism\control\relay\prism-relay.exe</c> (contract §1.6), that hook
/// entries and the browser native-messaging manifest point at forever. If its SHA-256 differs from the plugin's
/// <c>bin\prism-relay.exe</c>: copy to <c>prism-relay.exe.new</c> (verified), then replace the stable name WITHOUT a
/// moment where it is missing (a browser or agent could launch the relay right then): a POSIX-semantics rename over the
/// old file first (Windows 10 1709+; the loader maps images with FILE_SHARE_DELETE, so it can work while the old relay
/// runs), else a plain atomic replace, else a hard link that keeps the running image reachable as
/// <c>prism-relay.old-&lt;utc&gt;-&lt;rand&gt;.exe</c> plus an atomic replace, and only as the last resort the old
/// rename-aside + rename-into-place (no await between the two renames). Running relays keep their old image until
/// relaunched. Old copies are deleted on later runs once unlocked. Safe mode: no writes, returns the path.
/// </summary>
public sealed class RelayInstaller
{
    public const string ExeName = "prism-relay.exe";
    public const string OldPrefix = "prism-relay.old-";
    private static readonly SemaphoreSlim Gate = new(1, 1);

    private readonly string _pluginDirectory;
    private readonly string _userDirectory;
    private readonly bool _safeMode;
    private readonly ILog _log;

    /// <param name="pluginDirectory">The .sdPlugin folder (IModuleContext.PluginDirectory).</param>
    /// <param name="userDirectory">%APPDATA%\Prism\control (DesktopPaths.UserDirectory).</param>
    public RelayInstaller(string pluginDirectory, string userDirectory, bool safeMode, ILog? log = null)
    {
        _pluginDirectory = pluginDirectory;
        _userDirectory = userDirectory;
        _safeMode = safeMode;
        _log = (log ?? NullLog.Instance).For("relay");
    }

    /// <summary>From a module context: the user directory is DataDirectory\..\.. (…\control\modules\&lt;name&gt;).</summary>
    public static RelayInstaller ForModule(IModuleContext ctx)
    {
        var data = Path.GetFullPath(ctx.DataDirectory).TrimEnd('\\', '/');
        var modules = Path.GetDirectoryName(data);
        var user = modules is not null && string.Equals(Path.GetFileName(modules), "modules", StringComparison.OrdinalIgnoreCase)
            ? Path.GetDirectoryName(modules)! : DesktopPaths.UserDirectory;
        return new RelayInstaller(ctx.PluginDirectory, user, ctx.SafeMode, ctx.Log);
    }

    public string SourcePath => Path.Combine(_pluginDirectory, "bin", ExeName);

    public string RelayDirectory => Path.Combine(_userDirectory, "relay");

    /// <summary>The stable path every hook and host manifest uses.</summary>
    public string StablePath => Path.Combine(RelayDirectory, ExeName);

    /// <summary>How the last <see cref="EnsureAsync"/> placed the image (diagnostics and tests).</summary>
    public RelayUpdateMethod LastUpdate { get; private set; } = RelayUpdateMethod.Unchanged;

    /// <summary>The default per-user root (%APPDATA%\Prism\control), ignoring PRISM_CONTROL_DIR.</summary>
    public static string DefaultUserDirectory => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Prism", "control");

    /// <summary>
    /// True when <paramref name="command"/> (an executable path as written in a hook entry or reported for a pipe client)
    /// is exactly our stable relay: <c>&lt;user dir&gt;\relay\prism-relay.exe</c>, or the same under the default root
    /// %APPDATA%\Prism\control (entries written before PRISM_CONTROL_DIR changed). <c>%VAR%</c> forms are expanded, quotes
    /// stripped, <c>/</c> accepted and <c>..</c> resolved first; the file name must be exactly prism-relay.exe
    /// (case-insensitive). Anything else, including other prism-relay.exe copies under the user directory, is not ours.
    /// </summary>
    public bool IsOurCommand(string? command) => IsOurRelayPath(command, [DefaultUserDirectory]);

    /// <summary>
    /// <see cref="IsOurCommand"/> with explicit extra roots (each a "…\Prism\control"-style user directory whose
    /// <c>relay\prism-relay.exe</c> also counts). The installer's own user directory always counts.
    /// </summary>
    public bool IsOurRelayPath(string? command, IEnumerable<string>? extraRoots = null)
    {
        if (Normalize(command) is not { } path) return false;
        if (!string.Equals(Path.GetFileName(path), ExeName, StringComparison.OrdinalIgnoreCase)) return false;
        foreach (var root in new[] { _userDirectory }.Concat(extraRoots ?? []))
        {
            if (Normalize(root) is not { } r) continue;
            if (string.Equals(path, Path.Combine(r, "relay", ExeName), StringComparison.OrdinalIgnoreCase)) return true;
        }
        return false;
    }

    /// <summary>
    /// True for the stable relay (see <see cref="IsOurCommand"/>) or a renamed-aside copy of it that may still be running
    /// (<c>&lt;user dir&gt;\relay\prism-relay.old-*.exe</c>): for pipe-client image checks, not for hook entries.
    /// </summary>
    public bool IsOurRelayImage(string? imagePath)
    {
        if (IsOurCommand(imagePath)) return true;
        if (Normalize(imagePath) is not { } path) return false;
        var name = Path.GetFileName(path);
        if (!name.StartsWith(OldPrefix, StringComparison.OrdinalIgnoreCase) || !name.EndsWith(".exe", StringComparison.OrdinalIgnoreCase)) return false;
        return Normalize(RelayDirectory) is { } dir && string.Equals(Path.GetDirectoryName(path), dir, StringComparison.OrdinalIgnoreCase);
    }

    private static string? Normalize(string? p)
    {
        if (string.IsNullOrWhiteSpace(p)) return null;
        try
        {
            var s = Environment.ExpandEnvironmentVariables(p.Trim()).Trim().Trim('"').Trim();
            if (s.Length == 0 || s.IndexOfAny(Path.GetInvalidPathChars()) >= 0) return null;
            s = s.Replace('/', '\\');
            if (!Path.IsPathFullyQualified(s)) return null;
            return Path.GetFullPath(s).TrimEnd('\\');
        }
        catch (Exception ex) when (ex is ArgumentException or NotSupportedException or PathTooLongException) { return null; }
    }

    /// <summary>Installs or updates the stable copy and returns <see cref="StablePath"/>.</summary>
    public async Task<string> EnsureAsync(CancellationToken ct = default)
    {
        var source = SourcePath;
        if (!File.Exists(source)) throw new RelayInstallException($"{ExeName} is missing from the plugin's bin folder.");
        var dest = StablePath;
        if (_safeMode)
        {
            _log.Info($"[safe mode] would install {ExeName} for this user");
            return dest;
        }

        await Gate.WaitAsync(ct).ConfigureAwait(false);
        try
        {
            Directory.CreateDirectory(RelayDirectory);
            CollectGarbage();
            var hash = await HashAsync(source, ct).ConfigureAwait(false);
            if (File.Exists(dest) && string.Equals(await TryHashAsync(dest, ct).ConfigureAwait(false), hash, StringComparison.Ordinal))
            {
                LastUpdate = RelayUpdateMethod.Unchanged;
                return dest;
            }

            // 1. The new image, verified, next to the stable path (same volume, so the renames below are atomic).
            var staged = dest + ".new";
            await RetryAsync(() => { File.Copy(source, staged, overwrite: true); return true; }, ct).ConfigureAwait(false);
            if (!string.Equals(await HashAsync(staged, ct).ConfigureAwait(false), hash, StringComparison.Ordinal))
            {
                TryDelete(staged);
                throw new RelayInstallException("The copied relay failed SHA-256 verification.");
            }

            // 2. Into place without the stable path ever going missing.
            RelayUpdateMethod method;
            if (!File.Exists(dest))
            {
                await RetryAsync(() => { File.Move(staged, dest); return true; }, ct).ConfigureAwait(false);
                method = RelayUpdateMethod.Installed;
            }
            else method = await ReplaceAsync(staged, dest, ct).ConfigureAwait(false);
            LastUpdate = method;
            _log.Info($"Installed {ExeName} ({hash[..12]}) for this user via {Describe(method)}.");
            CollectGarbage();
            return dest;
        }
        finally { Gate.Release(); }
    }

    private static string Describe(RelayUpdateMethod m) => m switch
    {
        RelayUpdateMethod.Installed => "a first install",
        RelayUpdateMethod.PosixRename => "a POSIX-semantics rename over the old copy (no gap)",
        RelayUpdateMethod.Replace => "an atomic replace (no gap)",
        RelayUpdateMethod.HardLink => "a hard link to the running copy plus an atomic replace (no gap; the previous copy is kept until it is no longer running)",
        RelayUpdateMethod.RenameAside => "rename-aside (a gap of microseconds; the previous copy is kept until it is no longer running)",
        _ => m.ToString(),
    };

    /// <summary>The replace ladder. Each rung keeps <paramref name="dest"/> present throughout, except the last resort.</summary>
    private async Task<RelayUpdateMethod> ReplaceAsync(string staged, string dest, CancellationToken ct)
    {
        // a) One POSIX rename-replace: works on NTFS even while the old image runs (when the loader's mapping allows it).
        if (await TryNativeAsync(() => FileNative.PosixReplace(staged, dest), ct).ConfigureAwait(false) is var posix && posix == 0)
            return RelayUpdateMethod.PosixRename;
        _log.Debug($"relay update: POSIX rename refused ({posix})");

        // b) MoveFileEx(REPLACE_EXISTING): atomic when nothing runs the old image.
        if (TryMoveOverwrite(staged, dest, out var replaceError)) return RelayUpdateMethod.Replace;
        _log.Debug("relay update: replace refused (" + replaceError + ")");

        // c) Keep the running image reachable under a second name, then replace the stable name atomically.
        var aside = NewAsidePath();
        if (FileNative.HardLink(aside, dest) is var link && link == 0)
        {
            var linkedPosix = FileNative.PosixReplace(staged, dest);
            if (linkedPosix == 0) { _log.Debug("relay update: POSIX rename succeeded once the running image had a second link"); return RelayUpdateMethod.HardLink; }
            if (TryMoveOverwrite(staged, dest, out var linkedReplace)) { _log.Debug($"relay update: replace succeeded once the running image had a second link (POSIX rename: {linkedPosix})"); return RelayUpdateMethod.HardLink; }
            _log.Debug($"relay update: refused even with a second link (POSIX {linkedPosix}, replace {linkedReplace})");
            TryDelete(aside);   // another link to the running image: removable later by CollectGarbage if this fails
        }
        else _log.Debug($"relay update: hard link refused ({link})");

        // d) Last resort: rename aside, then rename into place immediately (no await between the two renames).
        ct.ThrowIfCancellationRequested();
        aside = NewAsidePath();
        MoveTight(dest, aside);
        try
        {
            MoveTight(staged, dest);
        }
        catch (Exception)
        {
            if (!File.Exists(dest)) { try { File.Move(aside, dest); } catch (Exception) { } }
            throw;
        }
        return RelayUpdateMethod.RenameAside;
    }

    private string NewAsidePath() =>
        Path.Combine(RelayDirectory, $"{OldPrefix}{DateTime.UtcNow.ToString("yyyyMMdd'T'HHmmssfff'Z'", CultureInfo.InvariantCulture)}-{PipeFraming.NewNameSuffix()[..8]}.exe");

    private static bool TryMoveOverwrite(string from, string to, out string? error)
    {
        error = null;
        for (var attempt = 0; ; attempt++)
        {
            try { File.Move(from, to, overwrite: true); return true; }
            catch (IOException ex) when (ex.HResult == unchecked((int)0x80070020) && attempt < 3) { Thread.Sleep(25); }   // sharing violation: AV scanner
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException) { error = ex.GetType().Name; return false; }
        }
    }

    /// <summary>A native call returning a Win32 error, retried briefly on sharing violations only.</summary>
    private static async Task<int> TryNativeAsync(Func<int> op, CancellationToken ct)
    {
        for (var attempt = 0; ; attempt++)
        {
            var e = op();
            if (e != FileNative.ERROR_SHARING_VIOLATION || attempt >= 3) return e;
            await Task.Delay(25, ct).ConfigureAwait(false);
        }
    }

    /// <summary>A synchronous move with a tight retry (≤ ~200 ms) on transient sharing errors; no await, so the rename-aside gap stays tiny.</summary>
    private static void MoveTight(string from, string to)
    {
        for (var attempt = 0; ; attempt++)
        {
            try { File.Move(from, to); return; }
            catch (Exception ex) when ((ex is IOException and not FileNotFoundException and not DirectoryNotFoundException || ex is UnauthorizedAccessException) && attempt < 200)
            {
                Thread.Sleep(1);
            }
        }
    }

    /// <summary>Deletes old copies (and stray staging files) that nothing runs any more. Returns how many were removed.</summary>
    public int CollectGarbage()
    {
        if (!Directory.Exists(RelayDirectory)) return 0;
        var removed = 0;
        foreach (var f in Directory.EnumerateFiles(RelayDirectory))
        {
            var name = Path.GetFileName(f);
            var stale = name.StartsWith(OldPrefix, StringComparison.OrdinalIgnoreCase) && name.EndsWith(".exe", StringComparison.OrdinalIgnoreCase);
            if (stale && TryDelete(f)) removed++;
        }
        return removed;
    }

    private static bool TryDelete(string path)
    {
        try { File.Delete(path); return true; }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException) { return false; } // still running
    }

    /// <summary>Retries a file operation on sharing violations / access denied (antivirus, an indexer, a starting relay).</summary>
    private static async Task RetryAsync(Func<bool> op, CancellationToken ct)
    {
        for (var attempt = 0; ; attempt++)
        {
            try { op(); return; }
            catch (Exception ex) when ((ex is IOException and not FileNotFoundException and not DirectoryNotFoundException || ex is UnauthorizedAccessException) && attempt < 20)
            {
                await Task.Delay(25, ct).ConfigureAwait(false);
            }
        }
    }

    internal static async Task<string> HashAsync(string path, CancellationToken ct)
    {
        await using var fs = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read | FileShare.Delete, 81920, useAsync: true);
        return Convert.ToHexString(await SHA256.HashDataAsync(fs, ct).ConfigureAwait(false)).ToLowerInvariant();
    }

    private static async Task<string?> TryHashAsync(string path, CancellationToken ct)
    {
        try { return await HashAsync(path, ct).ConfigureAwait(false); }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException) { return null; }
    }
}
