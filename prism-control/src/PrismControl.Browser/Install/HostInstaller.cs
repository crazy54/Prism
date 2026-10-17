using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;
using PrismControl.Browser.Platform;
using PrismControl.Browser.Protocol;
using PrismControl.Core.Hosting;

namespace PrismControl.Browser.Install;

/// <summary>One thing Connect/Disconnect will do, exactly as the consent step shows it.</summary>
public sealed record InstallStep(string Kind, string Target, string Detail);

/// <summary>A reviewed plan. <see cref="Id"/> hashes every step: Apply refuses if anything changed since the user saw it.</summary>
public sealed record InstallPlan(string Id, bool Connect, IReadOnlyList<InstallStep> Steps, IReadOnlyList<string> Notes, bool SafeMode)
{
    public string Text => string.Join("\n", Steps.Select(s => "• " + s.Detail).Concat(Notes.Select(n => "ⓘ " + n)));
}

public sealed record InstallResult(bool Ok, string Message, IReadOnlyList<string> Done);

/// <summary>Exactly what Connect wrote, so Disconnect can undo it (kept in the module data folder).</summary>
public sealed class InstallRecord
{
    public int V { get; set; } = 1;
    public DateTimeOffset At { get; set; }
    public List<RegistryWrite> Registry { get; set; } = [];
    public List<FileWrite> Files { get; set; } = [];
    public string? ExtensionFolder { get; set; }
    public string? RelayPath { get; set; }
}

public sealed class RegistryWrite
{
    public string SubKey { get; set; } = "";
    public string Value { get; set; } = "";
    public string? PreviousValue { get; set; }
    /// <summary>Keys along the path that did not exist before (deepest last).</summary>
    public List<string> CreatedKeys { get; set; } = [];
}

public sealed class FileWrite
{
    public string Path { get; set; } = "";
    public string Sha256 { get; set; } = "";
}

/// <summary>Read-only state for the property inspector.</summary>
public sealed record InstallState(bool Connected, bool Chrome, bool Edge, bool Manifest, bool Extension, string ExtensionFolder, string ExpectedId, string? Problem);

public sealed class HostInstallerOptions
{
    public required IRegistryHive Registry { get; init; }
    public required IRelayPort Relay { get; init; }
    /// <summary>%APPDATA%\Prism\control\modules\browser.</summary>
    public required string DataDirectory { get; init; }
    /// <summary>The packaged extension folder (&lt;plugin&gt;\extension), copied for Load unpacked; null if not packaged.</summary>
    public string? ExtensionSource { get; init; }
    public bool SafeMode { get; init; }
    public ILog Log { get; init; } = NullLog.Instance;
    public TimeProvider Time { get; init; } = TimeProvider.System;
    public IReadOnlyList<string> AllowedOrigins { get; init; } = Wire.AllowedOrigins;
}

/// <summary>
/// "Connect browsers" (research §6.3, §8.2, §12): with the user's explicit consent in the property inspector, writes the
/// native-messaging host manifest, the HKCU NativeMessagingHosts keys for Chrome and Edge, copies the relay (shared, via
/// RelayInstaller) and a copy of the extension for "Load unpacked", and records every write. "Disconnect" undoes
/// exactly what the record lists (restoring previous values, deleting only keys it created and files whose hash still
/// matches). It is never run at start-up and never in safe mode; nothing happens in the constructor.
/// </summary>
public sealed class HostInstaller
{
    public const string ChromeKey = @"Software\Google\Chrome\NativeMessagingHosts\" + Wire.HostName;
    public const string EdgeKey = @"Software\Microsoft\Edge\NativeMessagingHosts\" + Wire.HostName;
    public const string MarkerFile = ".prism-control-copy";

    /// <summary>How long a reviewed plan can be applied (LOW 19).</summary>
    public static readonly TimeSpan PlanLifetime = TimeSpan.FromMinutes(10);

    private static readonly JsonSerializerOptions RecordJson = new() { WriteIndented = true, PropertyNamingPolicy = JsonNamingPolicy.CamelCase, DefaultIgnoreCondition = JsonIgnoreCondition.Never };
    private readonly HostInstallerOptions _o;
    private readonly SemaphoreSlim _gate = new(1, 1);
    /// <summary>Plans shown to the user: id → (content hash, issued at). Ids are random and single-use.</summary>
    private readonly Dictionary<string, (string Content, long IssuedAt)> _issued = new(StringComparer.Ordinal);

    public HostInstaller(HostInstallerOptions options) => _o = options;

    public string HostFolder => Path.Combine(_o.DataDirectory, "host");
    public string ManifestPath => Path.Combine(HostFolder, Wire.HostName + ".json");
    public string ExtensionFolder => Path.Combine(_o.DataDirectory, "extension");
    public string RecordPath => Path.Combine(_o.DataDirectory, "host-install.json");
    public string ExpectedExtensionId => Wire.ExtensionId;
    public bool SafeMode => _o.SafeMode;

    /// <summary>The manifest JSON for a relay path (allowed_origins lists every id: Edge reads only the first manifest it finds).</summary>
    public string ManifestJson(string relayPath)
    {
        var o = new JsonObject
        {
            ["name"] = Wire.HostName,
            ["description"] = "Prism Control bridge for Stream Deck",
            ["path"] = relayPath,
            ["type"] = "stdio",
            ["allowed_origins"] = new JsonArray([.. _o.AllowedOrigins.Select(x => (JsonNode)JsonValue.Create(x)!)]),
        };
        return o.ToJsonString(new JsonSerializerOptions { WriteIndented = true }) + "\n";
    }

    // ------------------------------------------------------------------ read-only inspection

    public InstallRecord? ReadRecord()
    {
        try
        {
            if (!File.Exists(RecordPath)) return null;
            return JsonSerializer.Deserialize<InstallRecord>(File.ReadAllText(RecordPath), RecordJson);
        }
        catch (Exception ex)
        {
            _o.Log.Warn("browser host-install record unreadable", ex);
            return null;
        }
    }

    public InstallState Inspect()
    {
        var rec = ReadRecord();
        var chrome = _o.Registry.GetDefault(ChromeKey);
        var edge = _o.Registry.GetDefault(EdgeKey);
        var manifest = File.Exists(ManifestPath);
        var ext = Directory.Exists(ExtensionFolder) && File.Exists(Path.Combine(ExtensionFolder, "manifest.json"));
        string? problem = null;
        var chromeOk = string.Equals(chrome, ManifestPath, StringComparison.OrdinalIgnoreCase);
        var edgeOk = string.Equals(edge, ManifestPath, StringComparison.OrdinalIgnoreCase);
        if (rec is not null && (!chromeOk || !edgeOk || !manifest)) problem = "Something changed the browser connection since it was set up. Press Connect browsers again.";
        if (rec is null && (chrome is not null || edge is not null) && !chromeOk) problem = "Another program registered a browser host with our name. Connect browsers shows what will be replaced.";
        return new InstallState(rec is not null && chromeOk && edgeOk && manifest, chromeOk, edgeOk, manifest, ext, ExtensionFolder, ExpectedExtensionId, problem);
    }

    // ------------------------------------------------------------------ plans (read-only)

    public InstallPlan PlanConnect()
    {
        var relay = _o.Relay.ExpectedPath;
        var manifest = ManifestJson(relay);
        var steps = new List<InstallStep>
        {
            new("relay", relay, $"Copy the Prism Control relay (prism-relay.exe) to {relay}"),
            new("file", ManifestPath, $"Write the browser host manifest {ManifestPath}, which lets only the Prism Control extension (id {Wire.ExtensionId}) start the relay:\n{manifest.TrimEnd()}"),
        };
        foreach (var (key, browser) in new[] { (ChromeKey, "Chrome"), (EdgeKey, "Edge") })
        {
            var prev = _o.Registry.GetDefault(key);
            var detail = $"Set the registry value {_o.Registry.Name}\\{key} (Default) = {ManifestPath} so {browser} can find the host";
            if (prev is not null && !string.Equals(prev, ManifestPath, StringComparison.OrdinalIgnoreCase)) detail += $" (it currently points to {prev}; Disconnect puts that back)";
            else if (prev is not null) detail += " (already set; it stays the same)";
            steps.Add(new InstallStep("registry", key, detail));
        }
        var notes = new List<string>();
        if (_o.ExtensionSource is { } src && Directory.Exists(src) && File.Exists(Path.Combine(src, "manifest.json")))
            steps.Add(new InstallStep("folder", ExtensionFolder, $"Copy the extension to {ExtensionFolder} (you load it from there with Load unpacked)"));
        else notes.Add("The extension folder is not packaged with this build, so it is not copied.");
        notes.Add("Nothing else changes: no browser profile, policy or other program is touched. Disconnect browsers undoes exactly these steps (the shared relay stays for other Prism Control features).");
        notes.Add($"Then load the extension: open chrome://extensions (or edge://extensions), turn on Developer mode, choose Load unpacked and select {ExtensionFolder}. Its id must be {Wire.ExtensionId}.");
        return Plan(true, steps, notes);
    }

    public InstallPlan PlanDisconnect()
    {
        var rec = ReadRecord();
        var steps = new List<InstallStep>();
        var notes = new List<string>();
        if (rec is null)
        {
            notes.Add("Prism Control has no record of connecting browsers on this PC, so there is nothing to undo.");
            return Plan(false, steps, notes);
        }
        foreach (var w in rec.Registry)
        {
            var current = _o.Registry.GetDefault(w.SubKey);
            if (!string.Equals(current, w.Value, StringComparison.OrdinalIgnoreCase))
            {
                notes.Add($"{_o.Registry.Name}\\{w.SubKey} was changed by something else since; it is left alone.");
                continue;
            }
            steps.Add(new InstallStep("registry", w.SubKey, w.PreviousValue is { } p
                ? $"Restore {_o.Registry.Name}\\{w.SubKey} (Default) to its earlier value {p}"
                : $"Remove {_o.Registry.Name}\\{w.SubKey}" + (w.CreatedKeys.Count > 1 ? $" and the {w.CreatedKeys.Count - 1} empty parent key(s) Prism Control created" : "")));
        }
        foreach (var f in rec.Files)
        {
            if (File.Exists(f.Path) && Sha(File.ReadAllBytes(f.Path)) == f.Sha256) steps.Add(new InstallStep("file", f.Path, $"Delete {f.Path}"));
            else if (File.Exists(f.Path)) notes.Add($"{f.Path} was changed since; it is left alone.");
        }
        if (rec.ExtensionFolder is { } folder && File.Exists(Path.Combine(folder, MarkerFile)))
        {
            steps.Add(new InstallStep("folder", folder, $"Delete the extension copy {folder}"));
            notes.Add("Remove the extension in chrome://extensions (or edge://extensions) first: once its folder is gone the browser reports it as missing.");
        }
        steps.Add(new InstallStep("record", RecordPath, $"Delete the record {RecordPath}"));
        return Plan(false, steps, notes);
    }

    private static string ContentOf(bool connect, IEnumerable<InstallStep> steps) =>
        Sha(Encoding.UTF8.GetBytes((connect ? "connect\n" : "disconnect\n") + string.Join("\n", steps.Select(s => $"{s.Kind}|{s.Target}|{s.Detail}"))));

    /// <summary>
    /// A plan with a random, single-use id that expires after <see cref="PlanLifetime"/> (LOW 19: the id used to be a pure
    /// hash of the steps, so any caller that could compute it could apply without the review). Apply also re-checks that
    /// the steps are still exactly the ones shown.
    /// </summary>
    private InstallPlan Plan(bool connect, List<InstallStep> steps, List<string> notes)
    {
        var content = ContentOf(connect, steps);
        var id = Convert.ToHexString(RandomNumberGenerator.GetBytes(12)).ToLowerInvariant();
        lock (_issued)
        {
            var now = _o.Time.GetTimestamp();
            foreach (var stale in _issued.Where(kv => _o.Time.GetElapsedTime(kv.Value.IssuedAt, now) > PlanLifetime).Select(kv => kv.Key).ToList()) _issued.Remove(stale);
            while (_issued.Count >= 16) _issued.Remove(_issued.OrderBy(kv => kv.Value.IssuedAt).First().Key);
            _issued[id] = (content, now);
        }
        return new InstallPlan(id, connect, steps, notes, _o.SafeMode);
    }

    // ------------------------------------------------------------------ apply (writes; consent + plan id required)

    /// <summary>
    /// Applies a reviewed plan. Refuses in safe mode, an id this installer did not issue (or already used, or older than
    /// <see cref="PlanLifetime"/>), and a plan whose steps changed since the user reviewed them.
    /// </summary>
    public async Task<InstallResult> ApplyAsync(bool connect, string reviewedPlanId, CancellationToken ct = default)
    {
        if (_o.SafeMode)
        {
            _o.Log.Info($"[safe mode] would {(connect ? "connect" : "disconnect")} browsers; nothing was written");
            return new InstallResult(false, "Prism Control is in safe mode: nothing was written.", []);
        }
        await _gate.WaitAsync(ct).ConfigureAwait(false);
        try
        {
            (string Content, long IssuedAt) issued;
            lock (_issued)
            {
                if (!_issued.Remove(reviewedPlanId ?? "", out issued))
                    return new InstallResult(false, "Review the steps again: that review is unknown or was already used.", []);
            }
            if (_o.Time.GetElapsedTime(issued.IssuedAt) > PlanLifetime) return new InstallResult(false, "That review expired. Review the steps again.", []);
            var plan = connect ? PlanConnect() : PlanDisconnect();
            lock (_issued) _issued.Remove(plan.Id);
            if (ContentOf(connect, plan.Steps) != issued.Content) return new InstallResult(false, "Something changed since you reviewed the steps. Review them again.", []);
            return connect ? await ConnectAsync(ct).ConfigureAwait(false) : Disconnect();
        }
        finally { _gate.Release(); }
    }

    // ------------------------------------------------------------------ start-up refresh (MED 7)

    /// <summary>The version in the packaged extension's manifest.json ("0.1.0"), or null when it is not packaged.</summary>
    public string? PackagedExtensionVersion
    {
        get
        {
            try
            {
                if (_o.ExtensionSource is not { } src) return null;
                var path = Path.Combine(src, "manifest.json");
                if (!File.Exists(path)) return null;
                return JsonNode.Parse(File.ReadAllText(path))?["version"]?.GetValue<string>();
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or JsonException or InvalidOperationException) { return null; }
        }
    }

    /// <summary>
    /// After a plugin update, brings the copies Connect made up to date (MED 7): the shared relay (RelayInstaller copies only
    /// when its hash differs) and the extension copy for Load unpacked (replaced atomically when its files differ). Only
    /// when the user connected browsers before (<c>host-install.json</c> exists: that consent covers these same copies),
    /// never in safe mode, never the registry or the manifest. Returns what was refreshed.
    /// </summary>
    public async Task<IReadOnlyList<string>> RefreshAsync(CancellationToken ct = default)
    {
        if (_o.SafeMode) return [];
        await _gate.WaitAsync(ct).ConfigureAwait(false);
        try
        {
            var rec = ReadRecord();
            if (rec is null) return [];
            var done = new List<string>();
            CleanLeftovers();
            try
            {
                var relay = await _o.Relay.EnsureAsync(ct).ConfigureAwait(false);
                done.Add("relay " + relay);
            }
            catch (Exception ex) when (ex is not OperationCanceledException) { _o.Log.Warn("The relay copy could not be refreshed", ex); }
            if (rec.ExtensionFolder is { } folder && File.Exists(Path.Combine(folder, MarkerFile))
                && _o.ExtensionSource is { } src && Directory.Exists(src) && File.Exists(Path.Combine(src, "manifest.json")))
            {
                if (TreeHash(src, skipOurs: false) != TreeHash(folder, skipOurs: true))
                {
                    try
                    {
                        CopyExtension(src);
                        done.Add("extension " + folder);
                        _o.Log.Info("The extension copy was updated: click Reload on the extension's card in the browser.");
                    }
                    catch (Exception ex) when (ex is IOException or UnauthorizedAccessException) { _o.Log.Warn("The extension copy could not be refreshed", ex); }
                }
            }
            return done;
        }
        finally { _gate.Release(); }
    }

    /// <summary>A hash over the copied files' relative paths and bytes (the same filters as the copy).</summary>
    private static string TreeHash(string root, bool skipOurs)
    {
        using var h = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
        void Walk(string dir, string rel, int depth)
        {
            if (depth > 8) return;
            foreach (var f in Directory.EnumerateFiles(dir).OrderBy(x => x, StringComparer.OrdinalIgnoreCase))
            {
                var name = Path.GetFileName(f);
                if (name.EndsWith(".pem", StringComparison.OrdinalIgnoreCase)) continue;
                if (skipOurs && depth == 0 && name == MarkerFile) continue;
                h.AppendData(Encoding.UTF8.GetBytes(rel + name.ToLowerInvariant() + "\n"));
                h.AppendData(File.ReadAllBytes(f));
            }
            foreach (var d in Directory.EnumerateDirectories(dir).OrderBy(x => x, StringComparer.OrdinalIgnoreCase))
            {
                var name = Path.GetFileName(d);
                if (name is "node_modules" or "tests" or "tools" or ".git") continue;
                Walk(d, rel + name.ToLowerInvariant() + "/", depth + 1);
            }
        }
        Walk(root, "", 0);
        return Convert.ToHexString(h.GetHashAndReset());
    }

    private async Task<InstallResult> ConnectAsync(CancellationToken ct)
    {
        var done = new List<string>();
        var rec = ReadRecord() ?? new InstallRecord();
        var undo = new List<Action>();
        try
        {
            var relay = await _o.Relay.EnsureAsync(ct).ConfigureAwait(false);
            if (!string.Equals(relay, _o.Relay.ExpectedPath, StringComparison.OrdinalIgnoreCase))
                return new InstallResult(false, "The relay was copied somewhere unexpected; nothing else was written.", done);
            if (!File.Exists(relay)) return new InstallResult(false, "The relay is missing from this Prism Control build; nothing else was written.", done);
            done.Add("relay " + relay);
            rec.RelayPath = relay;

            // Manifest (atomic).
            Directory.CreateDirectory(HostFolder);
            var manifest = Encoding.UTF8.GetBytes(ManifestJson(relay));
            var existedBefore = File.Exists(ManifestPath) ? File.ReadAllBytes(ManifestPath) : null;
            WriteAtomic(ManifestPath, manifest);
            undo.Add(() => { if (existedBefore is null) File.Delete(ManifestPath); else WriteAtomic(ManifestPath, existedBefore); });
            rec.Files.RemoveAll(f => string.Equals(f.Path, ManifestPath, StringComparison.OrdinalIgnoreCase));
            rec.Files.Add(new FileWrite { Path = ManifestPath, Sha256 = Sha(manifest) });
            done.Add("manifest " + ManifestPath);

            // Registry: remember what was there; an earlier record keeps the original "previous" value.
            foreach (var key in new[] { ChromeKey, EdgeKey })
            {
                var earlier = rec.Registry.FirstOrDefault(r => string.Equals(r.SubKey, key, StringComparison.OrdinalIgnoreCase));
                var prev = _o.Registry.GetDefault(key);
                var created = new List<string>();
                var parts = key.Split('\\');
                for (var i = 1; i <= parts.Length; i++)
                {
                    var p = string.Join('\\', parts.Take(i));
                    if (!_o.Registry.KeyExists(p)) created.Add(p);
                }
                _o.Registry.SetDefault(key, ManifestPath);
                undo.Add(() =>
                {
                    if (prev is not null) _o.Registry.SetDefault(key, prev);
                    else
                    {
                        _o.Registry.DeleteDefault(key);
                        for (var i = created.Count - 1; i >= 0; i--) _o.Registry.DeleteKeyIfEmpty(created[i]);
                    }
                });
                if (earlier is not null) earlier.Value = ManifestPath;   // a re-connect keeps the original "before" state
                else
                {
                    rec.Registry.Add(new RegistryWrite
                    {
                        SubKey = key,
                        Value = ManifestPath,
                        PreviousValue = string.Equals(prev, ManifestPath, StringComparison.OrdinalIgnoreCase) ? null : prev,
                        CreatedKeys = created,
                    });
                }
                done.Add("registry " + key);
            }

            // Extension copy for Load unpacked.
            if (_o.ExtensionSource is { } src && Directory.Exists(src) && File.Exists(Path.Combine(src, "manifest.json")))
            {
                CopyExtension(src);
                rec.ExtensionFolder = ExtensionFolder;
                done.Add("extension " + ExtensionFolder);
            }

            rec.At = _o.Time.GetUtcNow();
            WriteAtomic(RecordPath, Encoding.UTF8.GetBytes(JsonSerializer.Serialize(rec, RecordJson)));
            _o.Log.Info($"browsers connected: host manifest and {rec.Registry.Count} registry value(s) written");
            return new InstallResult(true, "Browsers connected. Now load the extension (see below).", done);
        }
        catch (Exception ex)
        {
            _o.Log.Warn("Connect browsers failed; rolling back", ex);
            for (var i = undo.Count - 1; i >= 0; i--)
            {
                try { undo[i](); }
                catch (Exception rex) { _o.Log.Warn("rollback step failed", rex); }
            }
            return new InstallResult(false, "Connect browsers failed and was rolled back: " + ex.Message, []);
        }
    }

    private InstallResult Disconnect()
    {
        var rec = ReadRecord();
        if (rec is null) return new InstallResult(true, "Nothing to undo.", []);
        var done = new List<string>();
        foreach (var w in rec.Registry)
        {
            var current = _o.Registry.GetDefault(w.SubKey);
            if (!string.Equals(current, w.Value, StringComparison.OrdinalIgnoreCase)) continue;
            if (w.PreviousValue is { } p) _o.Registry.SetDefault(w.SubKey, p);
            else
            {
                _o.Registry.DeleteDefault(w.SubKey);
                for (var i = w.CreatedKeys.Count - 1; i >= 0; i--) _o.Registry.DeleteKeyIfEmpty(w.CreatedKeys[i]);
            }
            done.Add("registry " + w.SubKey);
        }
        foreach (var f in rec.Files)
        {
            if (File.Exists(f.Path) && Sha(File.ReadAllBytes(f.Path)) == f.Sha256)
            {
                File.Delete(f.Path);
                done.Add("file " + f.Path);
            }
        }
        if (Directory.Exists(HostFolder) && !Directory.EnumerateFileSystemEntries(HostFolder).Any()) Directory.Delete(HostFolder);
        if (rec.ExtensionFolder is { } folder && File.Exists(Path.Combine(folder, MarkerFile)))
        {
            Directory.Delete(folder, recursive: true);
            done.Add("extension " + folder);
        }
        File.Delete(RecordPath);
        _o.Log.Info("browsers disconnected: the recorded host manifest and registry values were removed");
        return new InstallResult(true, "Browsers disconnected. Remove the extension from the browser if you haven't.", done);
    }

    /// <summary>
    /// Copies the extension next to its final place, then swaps it in with directory renames (LOW 18): the old copy is
    /// renamed aside first (so the folder is never half-written), the new one renamed in, and the old one deleted. On any
    /// failure the old copy goes back and the temporary folder is removed. Leftovers of an interrupted swap are cleaned
    /// on the next Connect or start-up.
    /// </summary>
    private void CopyExtension(string src)
    {
        var target = ExtensionFolder;
        if (Directory.Exists(target) && !File.Exists(Path.Combine(target, MarkerFile)))
            throw new IOException($"{target} exists and was not made by Prism Control; move it away first");
        CleanLeftovers();
        var suffix = Convert.ToHexString(RandomNumberGenerator.GetBytes(4)).ToLowerInvariant();
        var tmp = target + ".tmp-" + suffix;
        var old = target + ".old-" + suffix;
        try
        {
            CopyTree(src, tmp, depth: 0);
            File.WriteAllText(Path.Combine(tmp, MarkerFile), "Copied by Prism Control for \"Load unpacked\". Disconnect browsers deletes this folder.\n");
            var hadOld = Directory.Exists(target);
            if (hadOld) Retry(() => Directory.Move(target, old));
            try { Retry(() => Directory.Move(tmp, target)); }
            catch
            {
                if (hadOld && !Directory.Exists(target)) { try { Directory.Move(old, target); } catch (Exception) { } }
                throw;
            }
            if (hadOld) TryDeleteTree(old);
        }
        finally
        {
            TryDeleteTree(tmp);
        }
    }

    /// <summary>Removes <c>extension.tmp-*</c> / <c>extension.old-*</c> folders an interrupted copy left behind (ours only, by name).</summary>
    private void CleanLeftovers()
    {
        try
        {
            if (!Directory.Exists(_o.DataDirectory)) return;
            var name = Path.GetFileName(ExtensionFolder);
            foreach (var d in Directory.EnumerateDirectories(_o.DataDirectory, name + ".*"))
            {
                // Windows also matches "extension" itself against "extension.*".
                var leaf = Path.GetFileName(d);
                if (leaf.Length <= name.Length + 1 || leaf[name.Length] != '.') continue;
                var rest = leaf[(name.Length + 1)..];
                if ((rest.StartsWith("tmp-", StringComparison.Ordinal) || rest.StartsWith("old-", StringComparison.Ordinal))
                    && rest.Length == 12 && rest[4..].All(char.IsAsciiHexDigitLower))
                    TryDeleteTree(d);
            }
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException) { _o.Log.Debug("extension leftovers not cleaned: " + ex.GetType().Name); }
    }

    private static void TryDeleteTree(string path)
    {
        try { if (Directory.Exists(path)) Directory.Delete(path, recursive: true); }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException) { }
    }

    /// <summary>Directory renames can briefly fail while a browser or an indexer reads a file inside.</summary>
    private static void Retry(Action op)
    {
        for (var attempt = 0; ; attempt++)
        {
            try { op(); return; }
            catch (Exception ex) when ((ex is IOException and not DirectoryNotFoundException || ex is UnauthorizedAccessException) && attempt < 10) { Thread.Sleep(30); }
        }
    }

    private static void CopyTree(string src, string dst, int depth)
    {
        if (depth > 8) throw new IOException("extension folder too deep");
        Directory.CreateDirectory(dst);
        foreach (var f in Directory.EnumerateFiles(src))
        {
            var name = Path.GetFileName(f);
            if (name.EndsWith(".pem", StringComparison.OrdinalIgnoreCase)) continue;   // never copy a private key
            File.Copy(f, Path.Combine(dst, name), overwrite: true);
        }
        foreach (var d in Directory.EnumerateDirectories(src))
        {
            var name = Path.GetFileName(d);
            if (name is "node_modules" or "tests" or "tools" or ".git") continue;   // dev-only folders
            CopyTree(d, Path.Combine(dst, name), depth + 1);
        }
    }

    private static void WriteAtomic(string path, byte[] bytes)
    {
        var tmp = path + ".tmp";
        File.WriteAllBytes(tmp, bytes);
        File.Move(tmp, path, overwrite: true);
    }

    private static string Sha(byte[] bytes) => Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();
}
