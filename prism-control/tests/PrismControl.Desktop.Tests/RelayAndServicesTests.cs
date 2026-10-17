using System.Diagnostics;
using PrismControl.Testing;

namespace PrismControl.Desktop.Tests;

public class RelayInstallerTests
{
    private sealed class Rig : IDisposable
    {
        public readonly TempDir Dir = new();
        public string Plugin => Path.Combine(Dir.Path, "plugin.sdPlugin");
        public string User => Path.Combine(Dir.Path, "user");
        public string Source => Path.Combine(Plugin, "bin", RelayInstaller.ExeName);
        public Rig() { Directory.CreateDirectory(Path.Combine(Plugin, "bin")); }
        public void Ship(byte[] bytes) => File.WriteAllBytes(Source, bytes);
        public RelayInstaller Installer(bool safe = false, RecordingLog? log = null) => new(Plugin, User, safe, log);
        public string[] RelayFiles() => Directory.Exists(Path.Combine(User, "relay")) ? Directory.GetFiles(Path.Combine(User, "relay")).Select(f => Path.GetFileName(f)!).OrderBy(n => n).ToArray() : [];
        public void Dispose() => Dir.Dispose();
    }

    [Test]
    public async Task Missing_source_throws()
    {
        using var r = new Rig();
        await Assert.ThrowsAsync<RelayInstallException>(() => r.Installer().EnsureAsync());
    }

    [Test]
    public async Task Installs_to_the_one_stable_path_verified_and_idempotent()
    {
        using var r = new Rig();
        r.Ship([1, 2, 3, 4]);
        var inst = r.Installer();
        var path = await inst.EnsureAsync();
        Assert.Equal(Path.Combine(r.User, "relay", "prism-relay.exe"), path);
        Assert.Equal(inst.StablePath, path);
        Assert.True(File.ReadAllBytes(path).SequenceEqual(new byte[] { 1, 2, 3, 4 }));
        var stamp = File.GetLastWriteTimeUtc(path);
        await Task.Delay(30);
        Assert.Equal(path, await inst.EnsureAsync());
        Assert.Equal(stamp, File.GetLastWriteTimeUtc(path), "unchanged bytes → untouched");
        Assert.Equal("prism-relay.exe", string.Join(",", r.RelayFiles()));
    }

    [Test]
    public async Task An_update_when_nothing_runs_leaves_no_old_copies()
    {
        using var r = new Rig();
        r.Ship([1]);
        var inst = r.Installer();
        await inst.EnsureAsync();
        r.Ship([2, 2]);
        var path = await inst.EnsureAsync();
        Assert.True(File.ReadAllBytes(path).SequenceEqual(new byte[] { 2, 2 }));
        Assert.Equal("prism-relay.exe", string.Join(",", r.RelayFiles()), "the old copy was renamed aside and collected at once");
    }

    [Test(Category = "integration", TimeoutMs = 60_000)]
    public async Task Update_while_a_relay_runs_from_the_stable_path_then_collect_it()
    {
        // A copy of ping.exe stands in for a long-lived relay (e.g. a Chrome native host): it runs from the stable path,
        // pinging loopback only, and is killed at the end.
        using var r = new Rig();
        var ping = Path.Combine(Environment.SystemDirectory, "PING.EXE");
        r.Ship(await File.ReadAllBytesAsync(ping));
        var log = new RecordingLog();
        var inst = r.Installer(log: log);
        var stable = await inst.EnsureAsync();
        using var running = Process.Start(new ProcessStartInfo(stable, "-n 60 127.0.0.1") { UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true })!;
        try
        {
            await Task.Delay(300);
            Assert.False(running.HasExited);
            Assert.Throws<IOException>(() => File.WriteAllBytes(stable, [9])); // a running exe cannot be overwritten: what forces the rename dance

            var update = (await File.ReadAllBytesAsync(ping)).Concat(new byte[] { 0x50, 0x52, 0x49, 0x53, 0x4D }).ToArray(); // different SHA-256
            r.Ship(update);

            // Review LOW 22: a watcher polls the stable path for the whole update; it must never go missing (a browser or
            // an agent hook could launch the relay at that very moment).
            var missing = 0;
            var polls = 0;
            using var stopWatch = new CancellationTokenSource();
            var watcher = Task.Run(() =>
            {
                while (!stopWatch.IsCancellationRequested)
                {
                    if (!File.Exists(stable)) Interlocked.Increment(ref missing);
                    Interlocked.Increment(ref polls);
                }
            });
            await Task.Delay(20);
            Assert.Equal(stable, await inst.EnsureAsync());
            await Task.Delay(20);
            stopWatch.Cancel();
            await watcher;
            Console.WriteLine($"     update while running: {inst.LastUpdate}; {polls} polls, stable path missing in {missing}");
            foreach (var line in log.Lines.Where(l => l.Contains("relay update:"))) Console.WriteLine("     " + line);

            Assert.True((await File.ReadAllBytesAsync(stable)).SequenceEqual(update), "the stable path now holds the new image");
            Assert.False(running.HasExited, "the running relay kept running");
            Assert.True(inst.LastUpdate is RelayUpdateMethod.PosixRename or RelayUpdateMethod.HardLink or RelayUpdateMethod.RenameAside, inst.LastUpdate.ToString());
            if (inst.LastUpdate is RelayUpdateMethod.PosixRename or RelayUpdateMethod.HardLink)
                Assert.Equal(0, missing, "a gap-free method was used: the stable path never went missing");
            var olds = r.RelayFiles().Where(n => n.StartsWith(RelayInstaller.OldPrefix)).ToList();
            if (inst.LastUpdate is RelayUpdateMethod.PosixRename)
                Assert.Empty(olds, "POSIX rename: the old image lives on unnamed until the relay exits");
            else
            {
                Assert.Single(olds, "the running image is still reachable under an old name");
                // Seen once under heavy load (got 1), never reproduced (185 tries, flakes/NOTES.md F7): say whether the stand-in
                // relay was still alive on both sides of the collection, so a recurrence tells an early exit from an OS change.
                var aliveBefore = !running.HasExited;
                var collected = inst.CollectGarbage();
                Assert.Equal(0, collected, $"locked: not collected yet (stand-in relay alive before: {aliveBefore}, after: {!running.HasExited})");
            }
        }
        finally
        {
            running.Kill();
            await running.WaitForExitAsync();
        }
        await Task.Delay(200);
        inst.CollectGarbage();
        Assert.Equal("prism-relay.exe", string.Join(",", r.RelayFiles()), "old copies are collected once nothing runs them");
    }

    [Test]
    public async Task Replacing_a_copy_nothing_runs_never_leaves_the_stable_path_missing()
    {
        using var r = new Rig();
        r.Ship([1, 1]);
        var inst = r.Installer();
        var stable = await inst.EnsureAsync();
        Assert.Equal(RelayUpdateMethod.Installed, inst.LastUpdate);
        r.Ship([2, 2, 2]);
        await inst.EnsureAsync();
        Assert.True(inst.LastUpdate is RelayUpdateMethod.PosixRename or RelayUpdateMethod.Replace, inst.LastUpdate.ToString());
        Assert.True(File.ReadAllBytes(stable).SequenceEqual(new byte[] { 2, 2, 2 }));
        await inst.EnsureAsync();
        Assert.Equal(RelayUpdateMethod.Unchanged, inst.LastUpdate);
    }

    [Test]
    public async Task A_stale_new_file_is_overwritten()
    {
        using var r = new Rig();
        Directory.CreateDirectory(Path.Combine(r.User, "relay"));
        File.WriteAllBytes(Path.Combine(r.User, "relay", "prism-relay.exe.new"), [0xDE, 0xAD]);
        r.Ship([7, 7, 7]);
        var path = await r.Installer().EnsureAsync();
        Assert.True(File.ReadAllBytes(path).SequenceEqual(new byte[] { 7, 7, 7 }));
        Assert.Equal("prism-relay.exe", string.Join(",", r.RelayFiles()));
    }

    [Test]
    public async Task Safe_mode_writes_nothing_and_returns_the_would_be_path()
    {
        using var r = new Rig();
        r.Ship([1]);
        var log = new RecordingLog();
        var path = await r.Installer(safe: true, log).EnsureAsync();
        Assert.Equal(Path.Combine(r.User, "relay", "prism-relay.exe"), path);
        Assert.False(Directory.Exists(Path.Combine(r.User, "relay")));
        Assert.Contains("[safe mode] would install", log.Text);
    }

    [Test]
    public void Our_commands_are_recognized_by_location_and_name()
    {
        using var r = new Rig();
        var inst = r.Installer();
        Assert.True(inst.IsOurCommand(inst.StablePath));
        Assert.True(inst.IsOurCommand(inst.StablePath.ToUpperInvariant()), "Windows paths are case-insensitive");
        // Changed with the AI review (L7): only the exact stable path counts now. A prism-relay.exe elsewhere under the
        // user dir (e.g. modules\ai\bin) is not something RelayInstaller installs, so it is not ours.
        Assert.False(inst.IsOurCommand(Path.Combine(r.User, "modules", "ai", "bin", "PRISM-RELAY.EXE")), "only <user>\\relay\\prism-relay.exe");
        Assert.False(inst.IsOurCommand(@"C:\Elsewhere\prism-relay.exe"));
        Assert.False(inst.IsOurCommand(Path.Combine(r.User, "relay", "other.exe")));
        Assert.False(inst.IsOurCommand(null));
        Assert.False(inst.IsOurCommand("   "));
        Assert.False(inst.IsOurCommand("prism-relay.exe"), "relative paths never count");
    }

    [Test]
    public void IsOurCommand_rejects_escapes_and_look_alikes_and_accepts_our_other_spellings()
    {
        using var r = new Rig();
        var inst = r.Installer();
        // 1. A ".." escape that still "starts with" the user dir.
        Assert.False(inst.IsOurCommand(Path.Combine(r.User, "..", "..", "OtherVendor", "prism-relay.exe")), "the .. escape");
        Assert.False(inst.IsOurCommand(r.User + @"\relay\..\..\OtherVendor\prism-relay.exe"), "the .. escape after the relay folder");
        // 2. A look-alike name that merely ends in prism-relay.exe.
        Assert.False(inst.IsOurCommand(Path.Combine(r.User, "relay", "not-prism-relay.exe")), "look-alike name");
        Assert.False(inst.IsOurCommand(Path.Combine(r.User, "relay", "prism-relay.exe.bak")));
        // 3. The %VAR% form (expanded first).
        using (new EnvScope("PRISM_TEST_ROOT", r.User))
            Assert.True(inst.IsOurCommand(@"%PRISM_TEST_ROOT%\relay\prism-relay.exe"), "environment-variable form");
        // 4. Quoted, with forward slashes.
        Assert.True(inst.IsOurCommand("\"" + inst.StablePath.Replace('\\', '/') + "\""), "quoted with forward slashes");
        Assert.True(inst.IsOurCommand("  \"" + inst.StablePath + "\"  "), "quoted with spaces around");
        // 5. A leftover under the default root, written before PRISM_CONTROL_DIR changed.
        var defaultStable = Path.Combine(RelayInstaller.DefaultUserDirectory, "relay", "prism-relay.exe");
        Assert.True(inst.IsOurCommand(defaultStable), "the default %APPDATA% root still counts");
        Assert.True(inst.IsOurCommand(@"%APPDATA%\Prism\control\relay\prism-relay.exe"), "the %APPDATA% form of the default root");
        Assert.False(inst.IsOurRelayPath(defaultStable, extraRoots: []), "without the default root as an extra root");
        Assert.True(inst.IsOurRelayPath(Path.Combine(r.Dir.Path, "old-root", "relay", "prism-relay.exe"), [Path.Combine(r.Dir.Path, "old-root")]), "explicit extra roots");
    }

    [Test]
    public void IsOurRelayImage_also_accepts_a_renamed_aside_copy_in_the_relay_folder()
    {
        using var r = new Rig();
        var inst = r.Installer();
        Assert.True(inst.IsOurRelayImage(inst.StablePath));
        Assert.True(inst.IsOurRelayImage(Path.Combine(r.User, "relay", "prism-relay.old-20261017T010203004Z-a1b2c3d4.exe")));
        Assert.False(inst.IsOurCommand(Path.Combine(r.User, "relay", "prism-relay.old-20261017T010203004Z-a1b2c3d4.exe")), "never for hook entries");
        Assert.False(inst.IsOurRelayImage(Path.Combine(r.User, "modules", "prism-relay.old-x.exe")), "only in the relay folder");
        Assert.False(inst.IsOurRelayImage(Path.Combine(r.User, "relay", "..", "prism-relay.old-x.exe")));
        Assert.False(inst.IsOurRelayImage(null));
    }

    [Test]
    public void ForModule_derives_the_user_directory()
    {
        using var r = new Rig();
        using var ctx = new FakeModuleContext(r.Plugin, Path.Combine(r.User, "modules", "ai"), safeMode: false);
        var inst = RelayInstaller.ForModule(ctx);
        Assert.Equal(Path.Combine(r.User, "relay", "prism-relay.exe"), inst.StablePath);
        Assert.Equal(r.Source, inst.SourcePath);
    }
}

public class CwdHashTests
{
    [Test]
    public void Normalization()
    {
        Assert.Equal(@"c:\users\example\repo", CwdHash.Normalize(@"C:\Users\Example\Repo\"));
        Assert.Equal(@"c:\users\example\repo", CwdHash.Normalize("C:/Users/Example/Repo"));
        Assert.Equal(@"c:\users\example\repo", CwdHash.Normalize("/c/Users/Example/Repo"), "Git Bash path");
        Assert.Equal(@"c:\users\example\repo", CwdHash.Normalize(@"\\?\C:\Users\Example\Repo"));
        Assert.Equal(@"c:\", CwdHash.Normalize(@"C:\"));
        Assert.Equal(@"c:\", CwdHash.Normalize("/c"));
        Assert.Equal(@"\\server.example\share", CwdHash.Normalize(@"\\server.example\share\"));
    }

    [Test]
    public void Hash_is_16_hex_and_join_stable()
    {
        var h = CwdHash.Compute(@"C:\Users\Example\Repo");
        Assert.Equal(16, h.Length);
        Assert.True(h.All(Uri.IsHexDigit) && h == h.ToLowerInvariant());
        Assert.Equal(h, CwdHash.Compute("/c/users/example/repo/"));
        Assert.NotEqual(h, CwdHash.Compute(@"C:\Users\Example\Repo2"));
        Assert.Equal("9c4c2ac3d3a1d0e5".Length, h.Length);
        Assert.Equal("Repo", CwdHash.Basename(@"C:\Users\Example\Repo\"));
        Assert.Equal("C:", CwdHash.Basename(@"C:\"));
        Assert.Equal("repo", CwdHash.Basename("/c/x/repo"));
    }
}

public class DesktopServicesTests
{
    [Test(Category = "integration")]
    public void Safe_mode_composition_uses_the_fakes_and_is_shared()
    {
        using var dir = new TempDir();
        using var ctx = new FakeModuleContext(dir.Path, dir.Path, safeMode: true);
        var a = DesktopServices.GetOrCreate(ctx);
        var b = DesktopServices.GetOrCreate(ctx);
        Assert.True(ReferenceEquals(a, b), "one per process (per service registry)");
        Assert.True(a.SafeMode);
        Assert.True(a.Foreground is SafeModeForegroundService);
        Assert.True(a.Input is RecordingInputSender);
        Assert.True(a.Mouse is RecordingMouseSender);
        Assert.True(ReferenceEquals(ctx.Services.Get<IMouseSender>(), a.Mouse));
        Assert.True(a.Windows is WindowCatalog);
        Assert.True(ReferenceEquals(ctx.Services.Get<IForegroundService>(), a.Foreground));
        Assert.True(ReferenceEquals(ctx.Services.Get<IInputSender>(), a.Input));
        Assert.True(ReferenceEquals(ctx.Services.Get<IShellThread>(), a.Shell));
        Assert.True(ReferenceEquals(ctx.Services.Get<IWindowCatalog>(), a.Windows));
        Assert.True(ReferenceEquals(ctx.Services.Get<IIconProvider>(), a.Icons));
        Assert.Contains("Safe mode", ctx.RecordingLog.Text);
        var h = a.Shell.WindowHandle;
        ctx.Shutdown();
        Assert.Equal(0, TestNative.IsWindow(h), "disposed with the plugin");
    }

    [Test(Category = "integration")]
    public void Real_composition_uses_the_real_services()
    {
        using var d = DesktopServices.Create(safeMode: false);
        Assert.False(d.SafeMode);
        Assert.True(d.Foreground is ForegroundService);
        Assert.True(d.Input is SendInputSender);
        Assert.True(d.Mouse is SendInputMouseSender);
        Assert.True(d.Icons is IconProvider);
    }
}
