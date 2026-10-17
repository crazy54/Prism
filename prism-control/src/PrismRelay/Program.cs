using System.Text;
using PrismRelay;
using PrismRelay.Hook;

// prism-relay.exe (contract §2). Modes:
//   chrome-extension://<id>/ [--parent-window=N]   Chrome/Edge native-messaging host (stdio ⇄ the browser pipe)
//   hook <agent> <EventName>                       agent hook relay (stdin JSON → the ai pipe → decision on stdout)
//   otel-headers                                   {"Authorization":"Bearer <token>"} for Claude Code's otelHeadersHelper
//   --version | --help
// Never writes to stderr. Exit code 0 in every mode (hooks must never see 2).

try
{
    if (args.Length == 0) return 0;
    switch (args[0])
    {
        case "--version":
            return Print(RelayEnv.Version + "\n");
        case "--self-time":
            // Diagnostics: ms from this process's creation to Main (loader + runtime start-up), independent of the caller.
            return Print((DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() - ProcessTree.StartedAtMs((uint)Environment.ProcessId)).ToString(System.Globalization.CultureInfo.InvariantCulture) + "\n");
        case "--help":
            return Print("prism-relay " + RelayEnv.Version + "\n  chrome-extension://<id>/ [--parent-window=N]\n  hook <agent> <EventName>\n  otel-headers\n");
        case "hook":
        {
            var ev = args.Length > 2 ? args[2] : "";
            Watchdog.Arm(ev == "PermissionRequest" ? TimeSpan.FromSeconds(58) : TimeSpan.FromSeconds(3));
            var relay = new HookRelay(args.Length > 1 ? args[1] : "", ev, Console.OpenStandardInput(), Console.OpenStandardOutput(),
                Environment.GetEnvironmentVariable, RelayEnv.IngressFile("ai"), new HookOptions());
            return await relay.RunAsync();
        }
        case "otel-headers":
        {
            // Only a dedicated OTLP token, never the pipe token (review L12): the pipe token authenticates hook frames and
            // must not end up in Claude Code's exporter headers. No token, or one that isn't a plain token string: "{}".
            var token = Discovery.TryRead(RelayEnv.IngressFile("ai"))?.OtelToken;
            return Print(OtelHeaders.Json(token));
        }
    }
    if (NativeHost.IsExtensionOrigin(args[0]))
    {
        var host = new NativeHost(Console.OpenStandardInput(), Console.OpenStandardOutput(), args[0], NativeHost.ParentWindow(args),
            RelayEnv.IngressFile("browser"), new NativeHostOptions());
        return await host.RunAsync();
    }
    return 0;
}
catch (Exception)
{
    return 0;
}

static int Print(string s)
{
    try
    {
        using var o = Console.OpenStandardOutput();
        o.Write(Encoding.UTF8.GetBytes(s));
    }
    catch (Exception) { }
    return 0;
}

namespace PrismRelay
{
    /// <summary>The otelHeadersHelper output (review L12).</summary>
    internal static class OtelHeaders
    {
        /// <summary><c>{"Authorization":"Bearer &lt;token&gt;"}</c> for a dedicated token of 16–256 token characters, else <c>{}</c>.</summary>
        public static string Json(string? otelToken) =>
            otelToken is { Length: >= 16 and <= 256 } t && t.All(c => char.IsAsciiLetterOrDigit(c) || c is '-' or '_' or '.' or '~' or '+' or '/' or '=')
                ? "{\"Authorization\":\"Bearer " + t + "\"}"
                : "{}";
    }

    /// <summary>A last line of defense: whatever happens, the process exits 0 by this deadline.</summary>
    internal static class Watchdog
    {
        public static void Arm(TimeSpan deadline)
        {
            var t = new Thread(() =>
            {
                Thread.Sleep(deadline);
                Environment.Exit(0);
            }) { IsBackground = true, Name = "watchdog" };
            t.Start();
        }
    }
}
