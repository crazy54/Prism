using System.Diagnostics;
using PrismControl.Ai.Platform;
using PrismControl.Ai.Sessions;
using PrismControl.Core.Data;
using PrismControl.Core.Devices;
using PrismControl.Core.Hosting;
using PrismControl.Testing;

namespace PrismControl.Ai.Tests;

/// <summary>
/// The real Win32 adapters, read-only, against this test process and child processes it starts itself (all killed).
/// No other process is touched, focused or sent input.
/// </summary>
public class PlatformTests
{
    [Test(Category = "integration")]
    public void Process_tree_reads_our_own_ancestry_with_creation_times()
    {
        var tree = new Win32ProcessTree();
        var found = tree.Identity(Environment.ProcessId);
        Assert.True(found is not null);
        var me = found!.Value;
        Assert.True(me.StartedAtMs > 0);
        Assert.True(string.Equals(Path.GetFileName(Environment.ProcessPath), me.Image, StringComparison.OrdinalIgnoreCase), me.Image);
        var parents = tree.Ancestors(Environment.ProcessId);
        Assert.True(parents.Count >= 1, "a test run always has a parent");
        Assert.True(parents.All(p => p.StartedAtMs > 0 && p.StartedAtMs <= me.StartedAtMs), "parents were created before their children");
        Assert.True(tree.Identity(-5) is null);
    }

    [Test(Category = "integration")]
    public async Task Exit_watcher_fires_for_our_own_child_process()
    {
        using var watcher = new ProcessExitWatcher(TimeProvider.System, NullLog.Instance);
        var exited = new TaskCompletionSource<ProcessIdentity>(TaskCreationOptions.RunContinuationsAsynchronously);
        watcher.Exited += (id, _) => exited.TrySetResult(id);
        using var child = Process.Start(new ProcessStartInfo("cmd.exe", "/c ping -n 2 127.0.0.1 >nul") { CreateNoWindow = true, UseShellExecute = false })!;
        try
        {
            Assert.True(watcher.Watch(child.Id, 0, "cmd.exe") is not null);
            Assert.True(watcher.Watch(child.Id, 1, "cmd.exe") is null, "a creation time that doesn't match is a different process");
            var done = await Task.WhenAny(exited.Task, Task.Delay(10_000));
            Assert.True(done == exited.Task, "exit notification arrived");
            Assert.Equal(child.Id, exited.Task.Result.Pid);
        }
        finally
        {
            if (!child.HasExited) child.Kill(entireProcessTree: true);
        }
    }

    [Test(Category = "integration")]
    public async Task Cli_runner_captures_output_and_kills_at_the_timeout()
    {
        var runner = new CliRunner(NullLog.Instance);
        var ok = await runner.RunAsync(new CommandSpec("cmd.exe", ["/c", "echo", "[]"], TimeSpan.FromSeconds(5)), CancellationToken.None);
        Assert.True(ok.Ok);
        Assert.Equal("[]", ok.StdOut.Trim());
        var sw = Stopwatch.StartNew();
        var slow = await runner.RunAsync(new CommandSpec("cmd.exe", ["/c", "ping", "-n", "20", "127.0.0.1"], TimeSpan.FromMilliseconds(400)), CancellationToken.None);
        Assert.True(slow.TimedOut);
        Assert.True(sw.Elapsed < TimeSpan.FromSeconds(5), "killed, not waited out");
        var missing = await runner.RunAsync(new CommandSpec(@"C:\nope\missing.exe", [], TimeSpan.FromSeconds(1)), CancellationToken.None);
        Assert.False(missing.Started);
        Assert.Null(runner.Find("definitely-not-installed-example"));
        Assert.NotNull(runner.Find("cmd"));
    }

    [Test(Category = "integration")]
    public async Task Module_initializes_in_safe_mode_against_temporary_folders()
    {
        var root = TempDirs.New("module");
        var saved = new Dictionary<string, string?>();
        void Set(string k, string v) { saved[k] = Environment.GetEnvironmentVariable(k); Environment.SetEnvironmentVariable(k, v); }
        Set("PRISM_CONTROL_DIR", Path.Combine(root, "control"));
        Set("CLAUDE_CONFIG_DIR", Path.Combine(root, ".claude"));
        Set("CODEX_HOME", Path.Combine(root, ".codex"));
        using var shutdown = new CancellationTokenSource();
        var ctx = new SmokeContext(root, shutdown.Token);
        var module = new AiModule();
        try
        {
            module.Initialize(ctx);
            var s = ctx.Services.Get<AiServices>();
            Assert.True(s.SafeMode);
            Assert.True(ctx.Services.TryGet<Status.IAiStatus>(out _));
            Assert.True(ctx.Services.TryGet<Status.IAiStatusSink>(out _));
            var discovery = Path.Combine(root, "control", "modules", "ai", "ingress.json");
            var until = Environment.TickCount64 + 5000;
            while (!File.Exists(discovery) && Environment.TickCount64 < until) await Task.Delay(20);
            Assert.True(File.Exists(discovery), "the ai pipe listens and publishes its discovery file (under PRISM_CONTROL_DIR)");
            Assert.False(s.Demanded, "no AI action visible: no CLI polling");
            Assert.True(s.Hooks.SafeMode);
            Assert.False(s.Hooks.Preview().Files[0].Path.StartsWith(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile) + "\\.claude", StringComparison.OrdinalIgnoreCase));
        }
        finally
        {
            shutdown.Cancel();
            await module.DisposeAsync();
            foreach (var (k, v) in saved) Environment.SetEnvironmentVariable(k, v);
            await Task.Delay(100);
            Assert.False(File.Exists(Path.Combine(root, "control", "modules", "ai", "ingress.json")), "removed on a clean exit");
            TempDirs.Delete(root);
        }
    }

    private sealed class SmokeContext(string root, CancellationToken shutdown) : IModuleContext
    {
        public ILog Log { get; } = new CapturingLog();
        public IDataRegistry Data => throw new NotSupportedException("the ai module claims no data topics");
        public IServiceRegistry Services { get; } = new ServiceRegistry();
        public IGlobalSettings GlobalSettings { get; } = new TestGlobalSettings();
        public IPluginEvents Events { get; } = new FakePluginEvents();
        public IDeviceDirectory Devices { get; } = new Directory();
        public TimeProvider Time => TimeProvider.System;
        public CancellationToken ShutdownToken => shutdown;
        public string PluginDirectory => Path.Combine(root, "plugin");
        public string DataDirectory => Path.Combine(root, "control", "modules", "ai");
        public void OpenUrl(string url) => throw new InvalidOperationException("nothing opens in safe mode");
        public bool SafeMode => true;

        private sealed class Directory : IDeviceDirectory
        {
            public IReadOnlyCollection<DeviceInfo> All => [TestDevices.Galleon];
            public DeviceInfo? Find(string deviceId) => All.FirstOrDefault(d => d.Id == deviceId);
        }
    }
}
