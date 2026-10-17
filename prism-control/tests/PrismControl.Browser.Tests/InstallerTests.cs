using System.Text.Json.Nodes;
using PrismControl.Browser.Install;
using PrismControl.Browser.Protocol;
using PrismControl.Testing;

namespace PrismControl.Browser.Tests;

/// <summary>
/// HostInstaller against an in-memory registry and a temp folder: the real HKCU is never written in tests.
/// </summary>
public sealed class InstallRig : IDisposable
{
    public string Root { get; } = Path.Combine(Path.GetTempPath(), "prism-browser-install-tests", Guid.NewGuid().ToString("n"));
    public MemoryRegistry Registry { get; } = new();
    public FakeRelay Relay { get; }
    public RecordingLog Log { get; } = new();
    public string ExtensionSource { get; }
    public HostInstaller Installer { get; }

    public InstallRig(bool safeMode = false, bool withExtension = true)
    {
        Relay = new FakeRelay(Path.Combine(Root, "control", "relay", "prism-relay.exe"));
        ExtensionSource = Path.Combine(Root, "plugin", "extension");
        if (withExtension)
        {
            Directory.CreateDirectory(Path.Combine(ExtensionSource, "src", "background"));
            Directory.CreateDirectory(Path.Combine(ExtensionSource, "tests"));
            File.WriteAllText(Path.Combine(ExtensionSource, "manifest.json"), "{\"manifest_version\":3,\"name\":\"Fixture\"}");
            File.WriteAllText(Path.Combine(ExtensionSource, "sw.js"), "// fixture");
            File.WriteAllText(Path.Combine(ExtensionSource, "src", "background", "app.js"), "// fixture");
            File.WriteAllText(Path.Combine(ExtensionSource, "tests", "skip.js"), "// not copied");
            File.WriteAllText(Path.Combine(ExtensionSource, "dev-key.pem"), "-----BEGIN FAKE KEY----- not real");
        }
        Installer = new HostInstaller(new HostInstallerOptions
        {
            Registry = Registry,
            Relay = Relay,
            DataDirectory = Path.Combine(Root, "control", "modules", "browser"),
            ExtensionSource = ExtensionSource,
            SafeMode = safeMode,
            Log = Log,
        });
    }

    public void Dispose()
    {
        try { Directory.Delete(Root, recursive: true); } catch (Exception) { }
    }
}

public class InstallerTests
{
    [Test]
    public void The_plan_shows_exactly_what_will_be_written_and_writes_nothing()
    {
        using var rig = new InstallRig();
        var plan = rig.Installer.PlanConnect();
        Assert.True(plan.Connect);
        Assert.Equal("relay,file,registry,registry,folder", string.Join(",", plan.Steps.Select(s => s.Kind)));
        Assert.Contains(@"HKCU\Software\Google\Chrome\NativeMessagingHosts\com.jeremyfhall.prismcontrol.browser", plan.Text);
        Assert.Contains(@"HKCU\Software\Microsoft\Edge\NativeMessagingHosts\com.jeremyfhall.prismcontrol.browser", plan.Text);
        Assert.Contains("chrome-extension://ebbfhlgndibiinpfkhcacipfkoeokcgn/", plan.Text, "the manifest content is shown");
        Assert.Contains(rig.Relay.ExpectedPath.Replace(@"\", @"\\"), plan.Text, "the manifest points at the stable relay path");
        Assert.Contains("Load unpacked", plan.Text);
        Assert.Empty(rig.Registry.Writes, "planning is read-only");
        Assert.Equal(0, rig.Relay.Ensures);
        Assert.False(File.Exists(rig.Installer.ManifestPath));
        Assert.False(rig.Installer.Inspect().Connected);
    }

    [Test]
    public async Task Connect_writes_the_manifest_both_keys_the_extension_copy_and_a_record()
    {
        using var rig = new InstallRig();
        var plan = rig.Installer.PlanConnect();
        var r = await rig.Installer.ApplyAsync(true, plan.Id);
        Assert.True(r.Ok, r.Message);
        Assert.Equal(rig.Installer.ManifestPath, rig.Registry.GetDefault(HostInstaller.ChromeKey));
        Assert.Equal(rig.Installer.ManifestPath, rig.Registry.GetDefault(HostInstaller.EdgeKey));
        var manifest = JsonNode.Parse(File.ReadAllText(rig.Installer.ManifestPath))!.AsObject();
        Assert.Equal(Wire.HostName, manifest["name"]!.GetValue<string>());
        Assert.Equal("stdio", manifest["type"]!.GetValue<string>());
        Assert.Equal(rig.Relay.ExpectedPath, manifest["path"]!.GetValue<string>());
        Assert.Equal("chrome-extension://ebbfhlgndibiinpfkhcacipfkoeokcgn/", manifest["allowed_origins"]![0]!.GetValue<string>());
        Assert.True(File.Exists(Path.Combine(rig.Installer.ExtensionFolder, "manifest.json")));
        Assert.True(File.Exists(Path.Combine(rig.Installer.ExtensionFolder, "src", "background", "app.js")));
        Assert.False(File.Exists(Path.Combine(rig.Installer.ExtensionFolder, "dev-key.pem")), "a private key is never copied");
        Assert.False(Directory.Exists(Path.Combine(rig.Installer.ExtensionFolder, "tests")));
        Assert.True(File.Exists(rig.Installer.RecordPath));
        var state = rig.Installer.Inspect();
        Assert.True(state.Connected && state.Chrome && state.Edge && state.Manifest && state.Extension);
        Assert.Equal(1, rig.Relay.Ensures);
    }

    [Test]
    public async Task Apply_refuses_a_plan_that_changed_since_review_or_was_never_shown()
    {
        using var rig = new InstallRig();
        var plan = rig.Installer.PlanConnect();
        rig.Registry.Seed(HostInstaller.ChromeKey, @"C:\Other\vendor.json");   // the state changed after the review
        var r = await rig.Installer.ApplyAsync(true, plan.Id);
        Assert.False(r.Ok);
        Assert.Contains("changed", r.Message);
        Assert.Equal(@"C:\Other\vendor.json", rig.Registry.GetDefault(HostInstaller.ChromeKey), "nothing was written");
        Assert.False((await rig.Installer.ApplyAsync(true, "0000000000000000")).Ok);
        Assert.False(File.Exists(rig.Installer.ManifestPath));
    }

    [Test]
    public async Task Disconnect_undoes_exactly_what_connect_wrote()
    {
        using var rig = new InstallRig();
        rig.Registry.Seed(@"Software\Google\Chrome\NativeMessagingHosts\com.other.vendor", @"C:\Other\vendor.json");   // another vendor's host
        var before = rig.Registry.AllKeys();
        await rig.Installer.ApplyAsync(true, rig.Installer.PlanConnect().Id);
        var plan = rig.Installer.PlanDisconnect();
        Assert.False(plan.Connect);
        Assert.Contains("Remove HKCU", plan.Text);
        var r = await rig.Installer.ApplyAsync(false, plan.Id);
        Assert.True(r.Ok, r.Message);
        Assert.Equal(string.Join("|", before), string.Join("|", rig.Registry.AllKeys()), "every key we created is gone, the other vendor's stays");
        Assert.Equal(@"C:\Other\vendor.json", rig.Registry.GetDefault(@"Software\Google\Chrome\NativeMessagingHosts\com.other.vendor"));
        Assert.False(File.Exists(rig.Installer.ManifestPath));
        Assert.False(Directory.Exists(rig.Installer.ExtensionFolder));
        Assert.False(File.Exists(rig.Installer.RecordPath));
        Assert.True(File.Exists(rig.Relay.ExpectedPath), "the shared relay stays (other modules use it)");
        Assert.False(rig.Installer.Inspect().Connected);
    }

    [Test]
    public async Task A_previous_value_is_restored_and_foreign_changes_are_left_alone()
    {
        using var rig = new InstallRig();
        rig.Registry.Seed(HostInstaller.ChromeKey, @"C:\Old\prism-host.json");
        var plan = rig.Installer.PlanConnect();
        Assert.Contains(@"currently points to C:\Old\prism-host.json", plan.Text);
        await rig.Installer.ApplyAsync(true, plan.Id);
        rig.Registry.SetDefault(HostInstaller.EdgeKey, @"C:\Someone\else.json");   // changed by something else afterwards
        var undo = rig.Installer.PlanDisconnect();
        Assert.Contains("left alone", string.Join(" ", undo.Notes));
        await rig.Installer.ApplyAsync(false, undo.Id);
        Assert.Equal(@"C:\Old\prism-host.json", rig.Registry.GetDefault(HostInstaller.ChromeKey), "restored");
        Assert.Equal(@"C:\Someone\else.json", rig.Registry.GetDefault(HostInstaller.EdgeKey), "not ours any more: untouched");
    }

    [Test]
    public async Task A_failure_midway_rolls_back_and_leaves_no_record()
    {
        using var rig = new InstallRig();
        rig.Relay.Fail = true;
        var r = await rig.Installer.ApplyAsync(true, rig.Installer.PlanConnect().Id);
        Assert.False(r.Ok);
        Assert.Empty(rig.Registry.Writes);
        Assert.False(File.Exists(rig.Installer.RecordPath));
        Assert.False(File.Exists(rig.Installer.ManifestPath));
    }

    [Test]
    public async Task Safe_mode_writes_nothing_at_all()
    {
        using var rig = new InstallRig(safeMode: true);
        var plan = rig.Installer.PlanConnect();
        Assert.True(plan.SafeMode);
        var r = await rig.Installer.ApplyAsync(true, plan.Id);
        Assert.False(r.Ok);
        Assert.Contains("safe mode", r.Message);
        Assert.Empty(rig.Registry.Writes);
        Assert.Equal(0, rig.Relay.Ensures);
        Assert.False(Directory.Exists(Path.Combine(rig.Root, "control", "modules")));
        Assert.Contains("[safe mode]", rig.Log.All);
    }

    [Test]
    public async Task Reconnect_keeps_the_original_before_state()
    {
        using var rig = new InstallRig();
        rig.Registry.Seed(HostInstaller.ChromeKey, @"C:\Old\prism-host.json");
        await rig.Installer.ApplyAsync(true, rig.Installer.PlanConnect().Id);
        await rig.Installer.ApplyAsync(true, rig.Installer.PlanConnect().Id);
        await rig.Installer.ApplyAsync(false, rig.Installer.PlanDisconnect().Id);
        Assert.Equal(@"C:\Old\prism-host.json", rig.Registry.GetDefault(HostInstaller.ChromeKey));
        Assert.False(rig.Registry.KeyExists(HostInstaller.EdgeKey));
    }

    [Test]
    public async Task The_PI_consent_flow_needs_the_plan_id_and_explicit_consent()
    {
        using var irig = new InstallRig();
        await using var rig = Rig.Create();
        await using var h = await ActionHarness<Actions.TabKeyAction>.AppearAsync(TestDevices.Plus, new(0, 0),
            configureServices: s => { s.Add(rig.Hub); s.Add(irig.Installer); });
        var plan = await h.PiMessageAsync("browser.connect.plan", null, requestId: 1);
        var planId = plan!["data"]!["planId"]!.GetValue<string>();
        Assert.Equal(5, plan["data"]!["steps"]!.AsArray().Count);
        var noConsent = await h.PiMessageAsync("browser.connect.apply", new { planId }, requestId: 2);
        Assert.False(noConsent!["ok"]!.GetValue<bool>(), "no consent flag, no writes");
        Assert.Empty(irig.Registry.Writes);
        var ok = await h.PiMessageAsync("browser.connect.apply", new { planId, consent = true }, requestId: 3);
        Assert.True(ok!["ok"]!.GetValue<bool>());
        Assert.True(ok["data"]!["ok"]!.GetValue<bool>(), ok.ToJsonString());
        Assert.NotNull(irig.Registry.GetDefault(HostInstaller.ChromeKey));
    }

    [Test(Category = "integration")]
    public void The_real_HKCU_has_no_browser_host_key_written_by_these_tests()
    {
        // Read-only probe: the tests above only ever used MemoryRegistry.
        var real = new CurrentUserRegistry();
        Assert.False(real.KeyExists(HostInstaller.ChromeKey) && real.GetDefault(HostInstaller.ChromeKey)?.Contains("prism-browser-install-tests") == true);
    }
}
