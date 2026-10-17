using System.Buffers.Binary;
using System.IO.Pipes;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Text;
using System.Text.Json.Nodes;
using PrismControl.Testing;

namespace PrismControl.Desktop.Tests;

/// <summary>A raw client that speaks the framing by hand (so tests can also send broken frames).</summary>
internal sealed class RawClient : IAsyncDisposable
{
    public NamedPipeClientStream Stream { get; }
    private RawClient(NamedPipeClientStream s) => Stream = s;

    public static async Task<RawClient> ConnectAsync(string pipe, int timeoutMs = 2000)
    {
        var s = new NamedPipeClientStream(".", pipe, PipeDirection.InOut, PipeOptions.Asynchronous | PipeOptions.CurrentUserOnly);
        await s.ConnectAsync(timeoutMs);
        return new RawClient(s);
    }

    public Task SendAsync(string json) => SendRawAsync(Encoding.UTF8.GetBytes(json));

    public async Task SendRawAsync(byte[] body, uint? lengthOverride = null)
    {
        var header = new byte[4];
        BinaryPrimitives.WriteUInt32LittleEndian(header, lengthOverride ?? (uint)body.Length);
        await Stream.WriteAsync(header);
        if (body.Length > 0) await Stream.WriteAsync(body);
    }

    /// <summary>The next frame body as a string, or null at end of stream.</summary>
    public async Task<string?> ReadAsync(int timeoutMs = 3000)
    {
        using var cts = new CancellationTokenSource(timeoutMs);
        var header = new byte[4];
        if (!await Fill(header, cts.Token)) return null;
        var body = new byte[BinaryPrimitives.ReadUInt32LittleEndian(header)];
        if (!await Fill(body, cts.Token)) return null;
        return Encoding.UTF8.GetString(body);
    }

    /// <summary>True when the server closed the pipe (EOF or broken pipe) within the timeout.</summary>
    public async Task<bool> ClosedAsync(int timeoutMs = 3000)
    {
        using var cts = new CancellationTokenSource(timeoutMs);
        try
        {
            var b = new byte[1];
            while (true)
            {
                var n = await Stream.ReadAsync(b, cts.Token);
                if (n == 0) return true;
            }
        }
        catch (IOException) { return true; }
        catch (OperationCanceledException) { return false; }
    }

    private async Task<bool> Fill(Memory<byte> buf, CancellationToken ct)
    {
        while (buf.Length > 0)
        {
            int n;
            try { n = await Stream.ReadAsync(buf, ct); } catch (IOException) { return false; }
            if (n == 0) return false;
            buf = buf[n..];
        }
        return true;
    }

    public ValueTask DisposeAsync() => Stream.DisposeAsync();
}

public class PipeTests
{
    private static PipeEndpointOptions Opts(int maxFrame = 1024, int instances = 4, int timeoutMs = 400, string? discovery = null) =>
        new() { Name = "test", MaxFrameBytes = maxFrame, MaxInstances = instances, ReadTimeout = TimeSpan.FromMilliseconds(timeoutMs), DiscoveryFile = discovery };

    private static string Hello(PipeEndpoint ep, string extra = "\"t\":\"relay\"") => $"{{\"token\":\"{ep.Token}\",{extra}}}";

    [Test]
    public async Task Authenticated_round_trip_strips_the_token_and_reports_the_client()
    {
        var opened = new TaskCompletionSource<PipeSession>();
        var replied = new TaskCompletionSource<JsonNode?>();
        await using var ep = new PipeEndpoint(Opts());
        ep.SessionOpened += async s =>
        {
            opened.TrySetResult(s);
            var f = await s.ReadAsync(CancellationToken.None);
            await s.WriteAsync(new JsonObject { ["echo"] = f!["n"]!.GetValue<int>() + 1 }, CancellationToken.None);
            replied.TrySetResult(await s.ReadAsync(CancellationToken.None));
        };
        await ep.StartAsync();
        Assert.True(ep.PipeName.StartsWith("prism-control-test-", StringComparison.Ordinal) && ep.PipeName.Length == "prism-control-test-".Length + 32);
        Assert.Equal(@"\\.\pipe\" + ep.PipeName, ep.PipePath);
        await using var c = await RawClient.ConnectAsync(ep.PipeName);
        await c.SendAsync(Hello(ep, "\"t\":\"relay\",\"origin\":\"chrome-extension://abc/\""));
        var s = await opened.Task.WaitAsync(TimeSpan.FromSeconds(3));
        Assert.Null(s.Hello["token"], "the module never sees the token");
        Assert.Equal("relay", s.Hello["t"]!.GetValue<string>());
        Assert.Equal(Environment.ProcessId, s.ClientPid);
        Assert.True(string.Equals(Environment.ProcessPath, s.ClientImagePath, StringComparison.OrdinalIgnoreCase), "client image path");
        await c.SendAsync("{\"n\":41}");
        Assert.Equal("{\"echo\":42}", await c.ReadAsync());
        await c.Stream.DisposeAsync();
        Assert.Null(await replied.Task.WaitAsync(TimeSpan.FromSeconds(3)), "EOF reads as null");
        await s.Completion.WaitAsync(TimeSpan.FromSeconds(3));
        Assert.False(s.IsConnected);
    }

    [Test]
    public async Task A_client_without_the_token_is_rejected_unseen()
    {
        var sessions = 0;
        await using var ep = new PipeEndpoint(Opts());
        ep.SessionOpened += _ => { Interlocked.Increment(ref sessions); return Task.CompletedTask; };
        await ep.StartAsync();
        await using var c1 = await RawClient.ConnectAsync(ep.PipeName);
        await c1.SendAsync("{\"t\":\"relay\",\"v\":1}");
        Assert.True(await c1.ClosedAsync(), "no token → disconnected");
        await using var c2 = await RawClient.ConnectAsync(ep.PipeName);
        await c2.SendAsync("{\"token\":\"" + new string('0', 64) + "\"}");
        Assert.True(await c2.ClosedAsync(), "wrong token → disconnected");
        await using var c3 = await RawClient.ConnectAsync(ep.PipeName);
        await c3.SendAsync("{\"token\":12345}");
        Assert.True(await c3.ClosedAsync(), "non-string token → disconnected");
        await using var c4 = await RawClient.ConnectAsync(ep.PipeName);
        await c4.SendAsync("[\"" + ep.Token + "\"]");
        Assert.True(await c4.ClosedAsync(), "not an object → disconnected");
        Assert.Equal(0, sessions);
        Assert.Equal(4, ep.RejectedClients);
    }

    [Test]
    public async Task A_silent_client_is_dropped_after_the_read_timeout()
    {
        await using var ep = new PipeEndpoint(Opts(timeoutMs: 300));
        ep.SessionOpened += _ => Task.CompletedTask;
        await ep.StartAsync();
        await using var c = await RawClient.ConnectAsync(ep.PipeName);
        var sw = System.Diagnostics.Stopwatch.StartNew();
        Assert.True(await c.ClosedAsync(3000));
        Assert.InRange(sw.ElapsedMilliseconds, 200, 2500);
        Assert.Equal(1, ep.RejectedClients);
    }

    [Test]
    public async Task An_oversize_hello_is_rejected_without_reading_it()
    {
        await using var ep = new PipeEndpoint(Opts(maxFrame: 64));
        ep.SessionOpened += _ => Task.CompletedTask;
        await ep.StartAsync();
        await using var c = await RawClient.ConnectAsync(ep.PipeName);
        try { await c.SendRawAsync([], lengthOverride: 100_000_000); } catch (IOException) { }
        Assert.True(await c.ClosedAsync());
        Assert.Equal(1, ep.RejectedClients);
    }

    private static async Task<(PipeEndpoint Ep, RawClient C, PipeSession S)> OpenAsync(PipeEndpointOptions? o = null)
    {
        var opened = new TaskCompletionSource<PipeSession>();
        var hold = new TaskCompletionSource();
        var ep = new PipeEndpoint(o ?? Opts());
        ep.SessionOpened += async s => { opened.TrySetResult(s); await s.Completion; };
        await ep.StartAsync();
        var c = await RawClient.ConnectAsync(ep.PipeName);
        await c.SendAsync(Hello(ep));
        return (ep, c, await opened.Task.WaitAsync(TimeSpan.FromSeconds(3)));
    }

    [Test]
    public async Task A_frame_over_the_cap_throws_and_closes_the_session()
    {
        var (ep, c, s) = await OpenAsync(Opts(maxFrame: 1024));
        await using var _ = ep;
        await using var __ = c;
        await c.SendAsync("{\"ok\":1}");
        Assert.Equal(1, (await s.ReadAsync(CancellationToken.None))!["ok"]!.GetValue<int>());
        try { await c.SendRawAsync(new byte[2000]); }
        catch (IOException) { /* the server may close as soon as it has read the oversize header */ }
        var ex = await Assert.ThrowsAsync<PipeFrameException>(() => s.ReadAsync(CancellationToken.None));
        Assert.Contains("exceeds the 1024-byte cap", ex.Message);
        Assert.True(await c.ClosedAsync(), "the client is disconnected");
        Assert.False(s.IsConnected);
        await Assert.ThrowsAsync<PipeFrameException>(() => s.ReadAsync(CancellationToken.None));
    }

    [Test]
    public async Task Bad_json_and_empty_frames_throw_and_close()
    {
        foreach (var bad in new[] { Encoding.UTF8.GetBytes("{not json"), Array.Empty<byte>(), [0xFF, 0xFE, 0x7B, 0x7D], Encoding.UTF8.GetBytes("null") })
        {
            var (ep, c, s) = await OpenAsync();
            await using var _ = ep;
            await using var __ = c;
            await c.SendRawAsync(bad);
            await Assert.ThrowsAsync<PipeFrameException>(() => s.ReadAsync(CancellationToken.None));
            Assert.True(await c.ClosedAsync());
        }
    }

    [Test]
    public async Task A_stalled_frame_times_out_but_an_idle_session_does_not()
    {
        var (ep, c, s) = await OpenAsync(Opts(timeoutMs: 300));
        await using var _ = ep;
        await using var __ = c;
        await Task.Delay(700);
        Assert.True(s.IsConnected, "idle longer than the read timeout is fine");
        await c.SendAsync("{\"a\":1}");
        Assert.NotNull(await s.ReadAsync(CancellationToken.None));
        await c.Stream.WriteAsync(new byte[] { 50, 0, 0, 0, (byte)'{' }); // promises 50 bytes, sends 1
        var ex = await Assert.ThrowsAsync<PipeFrameException>(() => s.ReadAsync(CancellationToken.None));
        Assert.Contains("stalled", ex.Message);
    }

    [Test]
    public async Task Cancelling_a_read_loses_no_data()
    {
        var (ep, c, s) = await OpenAsync();
        await using var _ = ep;
        await using var __ = c;
        using (var cts = new CancellationTokenSource(100))
            await Assert.ThrowsAsync<OperationCanceledException>(() => s.ReadAsync(cts.Token));
        await c.SendAsync("{\"after\":true}");
        Assert.True((await s.ReadAsync(CancellationToken.None))!["after"]!.GetValue<bool>());
        Assert.True(s.IsConnected);
    }

    [Test]
    public async Task Oversize_writes_throw_but_keep_the_session_and_concurrent_writes_stay_whole()
    {
        var (ep, c, s) = await OpenAsync(Opts(maxFrame: 256));
        await using var _ = ep;
        await using var __ = c;
        await Assert.ThrowsAsync<PipeFrameException>(() => s.WriteAsync(new JsonObject { ["x"] = new string('a', 300) }, CancellationToken.None));
        Assert.True(s.IsConnected);
        var reader = Task.Run(async () =>
        {
            var got = new List<string>();
            for (var i = 0; i < 100; i++) got.Add((await c.ReadAsync())!);
            return got;
        });
        await Task.WhenAll(Enumerable.Range(0, 100).Select(i => Task.Run(() => s.WriteAsync(new JsonObject { ["i"] = i, ["pad"] = new string('p', 100) }, CancellationToken.None))));
        var frames = await reader;
        Assert.Equal(100, frames.Select(f => JsonNode.Parse(f)!["i"]!.GetValue<int>()).Distinct().Count(), "every frame intact");
        s.Close();
        await Assert.ThrowsAsync<IOException>(() => s.WriteAsync(new JsonObject(), CancellationToken.None));
    }

    [Test]
    public async Task Instances_are_capped_and_freed()
    {
        var hold = new TaskCompletionSource();
        await using var ep = new PipeEndpoint(Opts(instances: 2));
        ep.SessionOpened += async s => await Task.WhenAny(s.Completion, hold.Task);
        await ep.StartAsync();
        var a = await RawClient.ConnectAsync(ep.PipeName);
        await a.SendAsync(Hello(ep));
        var b = await RawClient.ConnectAsync(ep.PipeName);
        await b.SendAsync(Hello(ep));
        await Task.Delay(200);
        Assert.Equal(2, ep.ActiveSessions);
        await Assert.ThrowsAsync<TimeoutException>(() => RawClient.ConnectAsync(ep.PipeName, 300));
        await a.DisposeAsync();
        await Task.Delay(300);
        await using var c = await RawClient.ConnectAsync(ep.PipeName, 2000);
        await b.DisposeAsync();
        hold.TrySetResult();
    }

    [Test]
    public async Task Name_and_token_rotate_on_every_start()
    {
        await using var a = new PipeEndpoint(Opts());
        await using var b = new PipeEndpoint(Opts());
        await a.StartAsync();
        await b.StartAsync();
        Assert.NotEqual(a.PipeName, b.PipeName);
        Assert.NotEqual(a.Token, b.Token);
        Assert.Equal(64, a.Token.Length);
        Assert.True(a.CheckToken(a.Token));
        Assert.False(a.CheckToken(b.Token));
        Assert.False(a.CheckToken(null));
        await Assert.ThrowsAsync<InvalidOperationException>(() => a.StartAsync());
    }

    [Test]
    public async Task A_squatted_name_is_skipped_thanks_to_FILE_FLAG_FIRST_PIPE_INSTANCE()
    {
        var squatted = "prism-control-test-" + PipeFraming.NewNameSuffix();
        using var squatter = new NamedPipeServerStream(squatted, PipeDirection.InOut, 4, PipeTransmissionMode.Byte, PipeOptions.Asynchronous);
        var names = new Queue<string>([squatted, "prism-control-test-" + PipeFraming.NewNameSuffix()]);
        var log = new RecordingLog();
        await using var ep = new PipeEndpoint(Opts(), log) { NameFactory = () => names.Dequeue() };
        await ep.StartAsync();
        Assert.NotEqual(squatted, ep.PipeName);
        Assert.Contains("retrying with a new name", log.Text);
    }

    [Test]
    public void Security_descriptor_allows_only_the_current_user_and_denies_the_network()
    {
        var sd = new RawSecurityDescriptor(PipeEndpoint.BuildSecurityDescriptor(), 0);
        var me = WindowsIdentity.GetCurrent().User!;
        Assert.Equal(me, sd.Owner);
        Assert.True((sd.ControlFlags & ControlFlags.DiscretionaryAclProtected) != 0, "protected DACL");
        var aces = sd.DiscretionaryAcl!.Cast<CommonAce>().ToList();
        Assert.Equal(3, aces.Count);
        Assert.Equal(AceQualifier.AccessDenied, aces[0].AceQualifier);
        Assert.Equal(new SecurityIdentifier("S-1-5-2"), aces[0].SecurityIdentifier);
        var allowed = aces.Where(a => a.AceQualifier == AceQualifier.AccessAllowed).ToList();
        Assert.Equal(2, allowed.Count);
        Assert.True(allowed.Any(a => a.SecurityIdentifier == me), "the current user");
        Assert.True(allowed.Any(a => a.SecurityIdentifier.Value == "S-1-3-4"), "OWNER RIGHTS (no implicit WRITE_DAC for the owner)");
        Assert.True(allowed.All(a => a.SecurityIdentifier == me || a.SecurityIdentifier.Value == "S-1-3-4"), "nobody else");
    }

    [Test]
    public void Security_descriptor_grants_least_privilege_not_full_control()
    {
        // Review LOW 12: read/write + create-instance + synchronize only. No GENERIC_ALL, FullControl, WRITE_DAC,
        // WRITE_OWNER or DELETE for any allowed SID.
        const int GenericAll = 0x10000000, Delete = 0x10000, WriteDac = 0x40000, WriteOwner = 0x80000, FullControl = 0x1F019F;
        var sd = new RawSecurityDescriptor(PipeEndpoint.BuildSecurityDescriptor(), 0);
        foreach (var ace in sd.DiscretionaryAcl!.Cast<CommonAce>().Where(a => a.AceQualifier == AceQualifier.AccessAllowed))
        {
            Assert.Equal((int)PipeEndpoint.AllowedRights, ace.AccessMask, ace.SecurityIdentifier.Value);
            Assert.Equal(0, ace.AccessMask & (GenericAll | Delete | WriteDac | WriteOwner), "no dangerous rights: " + ace.SecurityIdentifier.Value);
            Assert.NotEqual(FullControl, ace.AccessMask & FullControl);
        }
        Assert.Equal((int)(PipeAccessRights.ReadWrite | PipeAccessRights.CreateNewInstance | PipeAccessRights.Synchronize), (int)PipeEndpoint.AllowedRights);
    }

    [Test]
    public async Task The_live_pipe_carries_that_DACL()
    {
        var (ep, c, _) = await OpenAsync();
        await using var __ = ep;
        await using var ___ = c;
        var sec = c.Stream.GetAccessControl();
        var rules = sec.GetAccessRules(true, true, typeof(SecurityIdentifier)).Cast<PipeAccessRule>().ToList();
        Assert.True(rules.Any(r => r.AccessControlType == AccessControlType.Deny && r.IdentityReference.Value == "S-1-5-2"), "NETWORK denied");
        var me = WindowsIdentity.GetCurrent().User!.Value;
        var allows = rules.Where(r => r.AccessControlType == AccessControlType.Allow).ToList();
        Assert.True(allows.All(r => r.IdentityReference.Value == me || r.IdentityReference.Value == "S-1-3-4"), "only us (and OWNER RIGHTS) allowed");
        Assert.True(allows.All(r => (r.PipeAccessRights & (PipeAccessRights.ChangePermissions | PipeAccessRights.TakeOwnership | PipeAccessRights.Delete)) == 0), "no WRITE_DAC / WRITE_OWNER / DELETE on the live pipe");
    }

    [Test]
    public async Task Discovery_file_is_written_after_listening_user_only_and_removed_if_ours()
    {
        using var dir = new TempDir();
        var path = Path.Combine(dir.Path, "modules", "ai", "ingress.json");
        var ep = new PipeEndpoint(Opts(discovery: path));
        await ep.StartAsync();
        var o = Assert.NotNull(DiscoveryFile.Read(path));
        Assert.Equal(1, o["v"]!.GetValue<int>());
        Assert.Equal(ep.PipeName, o["pipe"]!.GetValue<string>());
        Assert.Equal(ep.Token, o["token"]!.GetValue<string>());
        Assert.Equal(Environment.ProcessId, o["pid"]!.GetValue<int>());
        Assert.True(DateTimeOffset.TryParse(o["startedAt"]!.GetValue<string>(), out _));
        await using (var c = await RawClient.ConnectAsync(o["pipe"]!.GetValue<string>())) { } // listening already
        Assert.Empty(Directory.GetFiles(Path.GetDirectoryName(path)!).Where(f => f.EndsWith(".tmp")));
        var acl = new FileInfo(path).GetAccessControl();
        Assert.True(acl.AreAccessRulesProtected, "no inherited ACEs");
        var rules = acl.GetAccessRules(true, true, typeof(SecurityIdentifier)).Cast<FileSystemAccessRule>().ToList();
        Assert.Single(rules);
        Assert.Equal(WindowsIdentity.GetCurrent().User!.Value, rules[0].IdentityReference.Value);
        await ep.DisposeAsync();
        Assert.False(File.Exists(path), "deleted on a clean exit");
    }

    [Test]
    public async Task Discovery_file_replaced_by_a_newer_instance_is_left_alone()
    {
        using var dir = new TempDir();
        var path = dir.File("ingress.json");
        var old = new PipeEndpoint(Opts(discovery: path));
        await old.StartAsync();
        var newer = new PipeEndpoint(Opts(discovery: path));
        await newer.StartAsync();
        await old.DisposeAsync();
        Assert.True(File.Exists(path), "the newer instance's file survives");
        Assert.Equal(newer.Token, DiscoveryFile.Read(path)!["token"]!.GetValue<string>());
        await newer.DisposeAsync();
        Assert.False(File.Exists(path));
        Assert.Null(DiscoveryFile.Read(path));
        Assert.False(DiscoveryFile.DeleteIfOurs(path, "x"));
    }

    [Test]
    public async Task Dispose_closes_sessions_and_stops_listening()
    {
        var (ep, c, s) = await OpenAsync();
        await using var _ = c;
        await ep.DisposeAsync();
        Assert.True(await c.ClosedAsync());
        await s.Completion.WaitAsync(TimeSpan.FromSeconds(2));
        await Assert.ThrowsAsync<TimeoutException>(() => RawClient.ConnectAsync(ep.PipeName, 300));
        await ep.DisposeAsync(); // idempotent
    }

    [Test]
    public async Task A_throwing_handler_does_not_break_the_endpoint()
    {
        var log = new RecordingLog();
        var calls = 0;
        await using var ep = new PipeEndpoint(Opts(), log);
        ep.SessionOpened += _ => Interlocked.Increment(ref calls) == 1 ? throw new InvalidOperationException("module bug") : Task.CompletedTask;
        await ep.StartAsync();
        for (var i = 0; i < 2; i++)
        {
            await using var c = await RawClient.ConnectAsync(ep.PipeName);
            await c.SendAsync(Hello(ep));
            Assert.True(await c.ClosedAsync());
        }
        Assert.Equal(2, calls);
        Assert.Contains("module bug", log.Text);
    }

    [Test]
    public async Task No_subscriber_closes_the_client()
    {
        await using var ep = new PipeEndpoint(Opts());
        await ep.StartAsync();
        await using var c = await RawClient.ConnectAsync(ep.PipeName);
        await c.SendAsync(Hello(ep));
        Assert.True(await c.ClosedAsync());
    }

    [Test]
    public async Task Static_start_helper_subscribes_first()
    {
        var got = new TaskCompletionSource<string>();
        await using var ep = await PipeEndpoint.StartAsync(Opts(), s => { got.TrySetResult(s.Hello["t"]!.GetValue<string>()); return Task.CompletedTask; });
        await using var c = await RawClient.ConnectAsync(ep.PipeName);
        await c.SendAsync(Hello(ep));
        Assert.Equal("relay", await got.Task.WaitAsync(TimeSpan.FromSeconds(3)));
    }

    [Test]
    public void Options_are_validated()
    {
        Assert.Throws<ArgumentException>(() => new PipeEndpoint(new PipeEndpointOptions { Name = "Bad Name" }));
        Assert.Throws<ArgumentException>(() => new PipeEndpoint(new PipeEndpointOptions { Name = "" }));
        Assert.Throws<ArgumentException>(() => new PipeEndpoint(new PipeEndpointOptions { Name = new string('a', 33) }));
        Assert.Throws<ArgumentOutOfRangeException>(() => new PipeEndpoint(new PipeEndpointOptions { Name = "ok", MaxInstances = 0 }));
        Assert.Throws<ArgumentOutOfRangeException>(() => new PipeEndpoint(new PipeEndpointOptions { Name = "ok", MaxFrameBytes = 8 }));
        Assert.Throws<ArgumentOutOfRangeException>(() => new PipeEndpoint(new PipeEndpointOptions { Name = "ok", ReadTimeout = TimeSpan.Zero }));
        var defaults = new PipeEndpointOptions { Name = "browser" };
        Assert.Equal(8, defaults.MaxInstances);
        Assert.Equal(1 << 20, defaults.MaxFrameBytes);
        Assert.Equal(TimeSpan.FromSeconds(1), defaults.ReadTimeout);
    }

    [Test]
    public void Framing_helpers()
    {
        var f = PipeFraming.Encode(new JsonObject { ["a"] = "é<" });
        Assert.Equal((uint)(f.Length - 4), BinaryPrimitives.ReadUInt32LittleEndian(f));
        Assert.Equal("{\"a\":\"é<\"}", Encoding.UTF8.GetString(f, 4, f.Length - 4));
        Assert.True(PipeFraming.TokenEquals("abc", "abc"));
        Assert.False(PipeFraming.TokenEquals("abd", "abc"));
        Assert.False(PipeFraming.TokenEquals("ab", "abc"));
        Assert.False(PipeFraming.TokenEquals(null, "abc"));
        Assert.Equal(32, PipeFraming.NewNameSuffix().Length);
        Assert.Throws<PipeFrameException>(() => PipeFraming.Parse(Encoding.UTF8.GetBytes(new string('[', 100) + new string(']', 100))));
    }
}
