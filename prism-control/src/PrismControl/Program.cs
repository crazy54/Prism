using System.Runtime.InteropServices;
using System.Text.Json;
using System.Text.Json.Nodes;
using PrismControl;
using PrismControl.Core.Hosting;
using PrismControl.Hosting;
using PrismControl.Protocol;

// Prism Control: a native Stream Deck plugin. Modes:
//   (Stream Deck)      PrismControl.exe -port <n> -pluginUUID <id> -registerEvent <event> -info <json>
//   --emit-manifest <file> [--version x.y.z.w]   write manifest.json generated from the action attributes
//   --list-actions                               print discovered actions
//   --selftest [--out <file>]                    COM + WinRT + DPAPI + discovery checks (exit 0 = all pass)
//   --version
// The exe is a WinExe (no console window when the app launches it); CLI modes attach to the parent console.
if (args.Length > 0 && args[0].StartsWith("--", StringComparison.Ordinal)) ConsoleAttach.ToParent();

if (args is ["--version"])
{
    Console.WriteLine($"{PluginInfo.Name} {PluginInfo.ManifestVersion}");
    return 0;
}

if (Option(args, "--emit-manifest") is { } manifestPath)
{
    var errors = new List<string>();
    var warnings = new List<string>();
    var modules = ModuleLoader.Load(NullLog.Instance, errors);
    var registry = ActionRegistry.Discover(modules.Select(m => m.Assembly).Append(typeof(PluginInfo).Assembly), errors, warnings);
    foreach (var w in warnings) Console.Error.WriteLine("warning: " + w);
    if (errors.Count > 0)
    {
        foreach (var e in errors) Console.Error.WriteLine("error: " + e);
        return 1;
    }
    var manifest = ManifestBuilder.Build(registry, modules, Option(args, "--version") ?? PluginInfo.ManifestVersion);
    var dir = Path.GetDirectoryName(Path.GetFullPath(manifestPath));
    if (dir is not null) Directory.CreateDirectory(dir);
    File.WriteAllText(manifestPath, manifest.ToJsonString(new JsonSerializerOptions
    {
        WriteIndented = true,
        Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    }) + "\n");
    Console.WriteLine($"manifest: {registry.Actions.Count} actions -> {Path.GetFullPath(manifestPath)}");
    return 0;
}

if (args.Contains("--list-actions"))
{
    var errors = new List<string>();
    var warnings = new List<string>();
    var modules = ModuleLoader.Load(NullLog.Instance, errors);
    var registry = ActionRegistry.Discover(modules.Select(m => m.Assembly).Append(typeof(PluginInfo).Assembly), errors, warnings);
    foreach (var a in registry.Actions)
        Console.WriteLine($"{a.Uuid}\t{a.Attribute.Controllers}\t{a.Type.FullName}\t{a.AssemblyName}");
    foreach (var e in errors) Console.Error.WriteLine("error: " + e);
    return errors.Count == 0 ? 0 : 1;
}

if (args.Contains("--selftest"))
{
    var report = await SelfTest.RunAsync();
    var text = report.ToJsonString(new JsonSerializerOptions { WriteIndented = true });
    if (Option(args, "--out") is { } outPath) File.WriteAllText(outPath, text);
    Console.WriteLine(text);
    return report["ok"]?.GetValue<bool>() == true ? 0 : 1;
}

if (!LaunchArgs.TryParse(args, out var launch, out var error))
{
    ConsoleAttach.ToParent();
    Console.Error.WriteLine($"Prism Control is a Stream Deck plugin; the Stream Deck app starts it. ({error})");
    Console.Error.WriteLine("Developer modes: --version | --emit-manifest <file> [--version x.y.z.w] | --list-actions | --selftest [--out <file>]");
    return 2;
}

using var cts = new CancellationTokenSource();
var finished = new ManualResetEventSlim(false);
Console.CancelKeyPress += (_, e) => { e.Cancel = true; cts.Cancel(); };
AppDomain.CurrentDomain.ProcessExit += (_, _) =>
{
    // Give the clean shutdown (control.json removal, socket close) a moment if the process is asked to exit.
    try { cts.Cancel(); } catch (ObjectDisposedException) { }
    finished.Wait(TimeSpan.FromSeconds(2));
};
PosixSignalRegistration? sigterm = null;
try { sigterm = PosixSignalRegistration.Create(PosixSignal.SIGTERM, ctx => { ctx.Cancel = true; cts.Cancel(); }); }
catch (PlatformNotSupportedException) { }
TaskScheduler.UnobservedTaskException += (_, e) => e.SetObserved();
try
{
    return await PluginHost.RunAsync(launch!, cts.Token);
}
finally
{
    sigterm?.Dispose();
    finished.Set();
}

static string? Option(string[] a, string name)
{
    var i = Array.IndexOf(a, name);
    return i >= 0 && i + 1 < a.Length && !a[i + 1].StartsWith("--", StringComparison.Ordinal) ? a[i + 1] : null;
}

internal static partial class ConsoleAttach
{
    private static bool _done;

    [LibraryImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static partial bool AttachConsole(int processId);

    /// <summary>For CLI modes of the WinExe: print into the terminal that started us (no-op when output is redirected).</summary>
    public static void ToParent()
    {
        if (_done) return;
        _done = true;
        if (!Console.IsOutputRedirected || !Console.IsErrorRedirected)
        {
            if (AttachConsole(-1))
            {
                if (!Console.IsOutputRedirected) Console.SetOut(new StreamWriter(Console.OpenStandardOutput()) { AutoFlush = true });
                if (!Console.IsErrorRedirected) Console.SetError(new StreamWriter(Console.OpenStandardError()) { AutoFlush = true });
            }
        }
    }
}
