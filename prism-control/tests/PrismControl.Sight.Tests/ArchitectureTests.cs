using System.Reflection;
using System.Reflection.Emit;
using System.Runtime.CompilerServices;
using PrismControl.Core.Actions;
using PrismControl.Desktop;
using PrismControl.Desktop.Sight;
using PrismControl.Sight.Calibration;
using PrismControl.Sight.Control;
using PrismControl.Sight.GameLink;
using PrismControl.Sight.Imaging;
using PrismControl.Sight.Safety;
using PrismControl.Testing;

namespace PrismControl.Sight.Tests;

/// <summary>
/// Proofs by IL inspection of PrismControl.Sight.dll (every method body, compiler-generated state machines and lambdas
/// attributed to the method that wrote them):
///   1. only <see cref="SightControl"/> calls IInputSender / IMouseSender, and only SightModule (the composition root)
///      fetches them; no other type even holds one;
///   2. the act methods and the gesture registry (Gestures.Begin/BeginHold/Mint) are called only from deck-event
///      handlers of actions (OnKey*/OnDial*/OnTouch*): there is no path from a reading (subscriptions, the engine, the
///      service) to input;
///   3. only GameLinkForwarder touches the network, and only to 127.0.0.1;
///   4. only CalibrationRecorder writes image files (and UserGames its settings file), by any file API;
///   5. nothing can capture a monitor.
/// Plus source scans of Sight AND Smart (decision 1): the first line of every key/dial/touch handler records the gesture,
/// tokens are minted only from gesture ids, and no code copies a deck event.
/// </summary>
public class ArchitectureTests
{
    private static readonly Assembly Sight = typeof(SightControl).Assembly;

    public sealed record CallSite(Type Owner, string Method, MemberInfo Callee)
    {
        public override string ToString() => $"{Owner.Name}.{Method} → {Callee.DeclaringType?.Name}.{Callee.Name}";
    }

    private static readonly Lazy<IReadOnlyList<CallSite>> Sites = new(Scan);

    [Test]
    public void Only_SightControl_sends_keyboard_or_mouse_input()
    {
        // The composition root may construct a fallback fake (no desktop services); calling a sender is SightControl's alone.
        var offenders = Sites.Value.Where(s => IsSenderMember(s.Callee) && s.Owner != typeof(SightControl)
            && !(s.Owner == typeof(SightModule) && s.Callee is ConstructorInfo)).ToList();
        Assert.Empty(offenders, "IInputSender/IMouseSender used outside SightControl");
        Assert.True(Sites.Value.Any(s => IsSenderMember(s.Callee) && s.Owner == typeof(SightControl)), "the scan sees SightControl's sends (sanity)");
    }

    [Test]
    public void Only_the_module_fetches_the_senders_and_only_SightControl_holds_them()
    {
        var fetch = Sites.Value.Where(s => s.Callee is MethodInfo m && m.DeclaringType == typeof(DesktopServices) && m.Name is "get_Input" or "get_Mouse").ToList();
        Assert.True(fetch.Count > 0, "sanity: the module fetches them");
        Assert.Empty(fetch.Where(s => s.Owner != typeof(SightModule)), "who fetches the senders");
        var generic = Sites.Value.Where(s => s.Callee is MethodInfo m && m.IsGenericMethod && m.Name is "Get" or "TryGet"
            && m.GetGenericArguments().Any(a => a == typeof(IInputSender) || a == typeof(IMouseSender))).ToList();
        Assert.Empty(generic, "nobody resolves the senders from the service registry");
        var holders = Sight.GetTypes().SelectMany(t => t.GetFields(BindingFlags.Instance | BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.DeclaredOnly)
                .Where(f => typeof(IInputSender).IsAssignableFrom(f.FieldType) || typeof(IMouseSender).IsAssignableFrom(f.FieldType))
                .Select(f => (Owner: OwnerOf(t), Field: f)))
            .Where(x => x.Owner != typeof(SightControl) && !(x.Owner == typeof(SightModule) && x.Field.DeclaringType != typeof(SightModule)))
            .ToList();
        Assert.Empty(holders.Select(h => $"{h.Owner.Name}.{h.Field.Name}"), "fields that hold a sender");
    }

    private static bool IsDeckHandler(string method) => method.StartsWith("OnKey", StringComparison.Ordinal) || method.StartsWith("OnDial", StringComparison.Ordinal)
                                                         || method.StartsWith("OnTouch", StringComparison.Ordinal);

    [Test]
    public void Acting_and_minting_gestures_happen_only_in_deck_event_handlers()
    {
        var actNames = new[] { "ClickAsync", "AdjustAsync", "StepAsync", "DriveToAsync" };
        var acts = Sites.Value.Where(s => s.Callee is MethodInfo m && actNames.Contains(m.Name)
            && (m.DeclaringType == typeof(ISightControl) || m.DeclaringType == typeof(SightControl))).ToList();
        var registry = Sites.Value.Where(s => s.Callee is MethodInfo m && m.DeclaringType == typeof(Desktop.Sight.Gestures)
            && m.Name is nameof(Desktop.Sight.Gestures.Begin) or nameof(Desktop.Sight.Gestures.BeginHold) or nameof(Desktop.Sight.Gestures.Mint) or nameof(Desktop.Sight.Gestures.TryMint)).ToList();
        Assert.True(acts.Count > 0 && registry.Count(r => r.Callee.Name == nameof(Desktop.Sight.Gestures.Begin)) > 0 && registry.Count(r => r.Callee.Name == nameof(Desktop.Sight.Gestures.Mint)) > 0,
            "sanity: the dial action records gestures, mints and acts");
        foreach (var s in acts.Concat(registry))
        {
            var isAction = typeof(ActionBase).IsAssignableFrom(s.Owner);
            // Level is the dial action's shared body for push/press: it takes the gesture recorded by the handler and
            // mints from its id; it never records one.
            var isShared = isAction && s.Method == "Level" && s.Callee.Name is not (nameof(Desktop.Sight.Gestures.Begin) or nameof(Desktop.Sight.Gestures.BeginHold));
            // SightControl may call its own overloads (the chord DriveTo form forwards to the general one).
            var isSelf = s.Owner == typeof(SightControl);
            Assert.True(isSelf || (isAction && (IsDeckHandler(s.Method) || isShared)), $"{s}: acting, recording or minting outside a deck event handler");
        }
        var levelCallers = Sites.Value.Where(s => s.Callee is MethodInfo m && m.Name == "Level" && typeof(ActionBase).IsAssignableFrom(s.Owner)).ToList();
        Assert.True(levelCallers.Count > 0 && levelCallers.All(s => IsDeckHandler(s.Method)), "Level is reached only from deck handlers: " + string.Join(", ", levelCallers));
        // Nothing in Sight builds tokens another way.
        Assert.Empty(Sites.Value.Where(s => s.Callee is ConstructorInfo c && (c.DeclaringType == typeof(GestureToken) || c.DeclaringType == typeof(Gesture))), "token constructors");
    }

    // ------------------------------------------------------------------ source scans (Sight AND Smart)

    private static string SrcRoot()
    {
        for (var d = new DirectoryInfo(AppContext.BaseDirectory); d is not null; d = d.Parent)
            if (File.Exists(Path.Combine(d.FullName, "PrismControl.sln"))) return Path.Combine(d.FullName, "src");
        return @"E:\Development Workspaces\Prism-control\prism-control\src";
    }

    private static IEnumerable<(string File, string Text)> Sources(string module) =>
        Directory.EnumerateFiles(Path.Combine(SrcRoot(), module), "*.cs", SearchOption.AllDirectories)
            .Where(f => !f.Contains($"{Path.DirectorySeparatorChar}obj{Path.DirectorySeparatorChar}") && !f.Contains($"{Path.DirectorySeparatorChar}bin{Path.DirectorySeparatorChar}"))
            .Select(f => (f, File.ReadAllText(f)));

    private static readonly System.Text.RegularExpressions.Regex Handler = new(
        @"protected\s+override\s+(?:async\s+)?Task\s+(On(?:Key|Dial|Touch)\w*Async)\s*\(\s*(\w+)\s+(\w+)\s*\)\s*(\{|=>)");

    [Test]
    public void Every_Sight_and_Smart_deck_handler_records_its_gesture_on_its_first_line()
    {
        var checkedHandlers = 0;
        foreach (var module in new[] { "PrismControl.Sight", "PrismControl.Smart" })
            foreach (var (file, text) in Sources(module))
                foreach (System.Text.RegularExpressions.Match m in Handler.Matches(text))
                {
                    var (name, param) = (m.Groups[1].Value, m.Groups[3].Value);
                    Assert.Equal("{", m.Groups[4].Value, $"{Path.GetFileName(file)} {name}: a block body, so its first line can record the gesture");
                    var rest = text[(m.Index + m.Length)..].TrimStart();
                    while (rest.StartsWith("//", StringComparison.Ordinal)) rest = rest[(rest.IndexOf('\n') + 1)..].TrimStart();   // comments are not lines of code
                    var first = rest[..rest.IndexOf(';')].Trim();
                    var call = name is "OnKeyLongPressAsync" or "OnDialLongPressAsync" ? "BeginHold" : "Begin";
                    Assert.True(System.Text.RegularExpressions.Regex.IsMatch(first, $@"^(?:var\s+\w+\s*=|_\s*=)\s*Gestures\.{call}\(\s*{param}\s*,\s*Time\s*\)$"),
                        $"{Path.GetFileName(file)} {name}: the first line must be Gestures.{call}({param}, Time), was: {first}");
                    checkedHandlers++;
                }
        Assert.True(checkedHandlers >= 12, $"sanity: {checkedHandlers} handlers found");
    }

    [Test]
    public void Smart_and_Sight_mint_only_from_gesture_ids_and_never_copy_a_deck_event()
    {
        foreach (var module in new[] { "PrismControl.Sight", "PrismControl.Smart" })
            foreach (var (file, text) in Sources(module))
            {
                var name = Path.GetFileName(file);
                Assert.DoesNotContain("GestureToken.FromDeckEvent", text, $"{name}: tokens come from Gestures.Mint(gestureId) only");
                // A record copy of a deck event (e with { }, evt with { … }) could be handed to Begin as a new delivery.
                Assert.False(System.Text.RegularExpressions.Regex.IsMatch(text, @"\b(?:e|evt|ev|deckEvent|\w+Event)\s+with\s*\{"), $"{name}: copies a deck event");
                var begins = System.Text.RegularExpressions.Regex.Matches(text, @"Gestures\.Begin(?:Hold)?\(").Count;
                var handlerBegins = Handler.Matches(text).Count;
                // Begin appears once per handler (its first line), plus DeckGesture.FromDeckEvent (Smart's wrapper).
                var allowedExtra = name == "DeckGesture.cs" ? 1 : 0;
                Assert.True(begins <= handlerBegins + allowedExtra, $"{name}: Gestures.Begin outside the first line of a deck handler ({begins} calls, {handlerBegins} handlers)");
                if (module == "PrismControl.Smart")
                {
                    var mints = System.Text.RegularExpressions.Regex.Matches(text, @"Gestures\.(?:Try)?Mint\(").Count;
                    Assert.True(mints == 0 || name == "DeckGesture.cs", $"{name}: Smart mints only through DeckGesture.Mint (from the gesture id)");
                    Assert.True(!text.Contains("DeckGesture.FromDeckEvent(") || name == "DeckGesture.cs", $"{name}: handlers wrap the recorded gesture (DeckGesture.Of), never an event");
                }
            }
    }

    [Test]
    public void Nothing_can_capture_a_monitor()
    {
        // M11: window capture only. The D3D11 bridge has no monitor variant, and no Sight source uses CreateForMonitor.
        var d3d = Sight.GetType("PrismControl.Sight.Capture.D3D11", throwOnError: true)!;
        Assert.Empty(d3d.GetMethods(BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic).Where(m => m.Name.Contains("Monitor", StringComparison.OrdinalIgnoreCase) && m.Name.Contains("Item", StringComparison.Ordinal)).Select(m => m.Name));
        foreach (var (file, text) in Sources("PrismControl.Sight"))
        {
            Assert.DoesNotContain("monitor: true", text, Path.GetFileName(file));
            Assert.False(System.Text.RegularExpressions.Regex.IsMatch(text, @"Slot\(interop,\s*4\)"), $"{Path.GetFileName(file)}: CreateForMonitor");
        }
        Assert.Null(typeof(Capture.CaptureOptions).GetProperty("ForceMonitor"));
    }

    [Test]
    public void Nothing_that_reads_can_reach_the_control_layer()
    {
        // The read side (engine, detectors, service, forwarder, recorder) never references SightControl or ISightControl.
        var readSide = Sites.Value.Where(s => s.Owner.Namespace is "PrismControl.Sight.Engine" or "PrismControl.Sight.Detectors" or "PrismControl.Sight.Service"
            or "PrismControl.Sight.GameLink" or "PrismControl.Sight.Calibration" or "PrismControl.Sight.Text" or "PrismControl.Sight.Capture" or "PrismControl.Sight.Recipes");
        var bad = readSide.Where(s => s.Callee.DeclaringType == typeof(SightControl) || s.Callee.DeclaringType == typeof(ISightControl)).ToList();
        Assert.Empty(bad, "read side → control");
    }

    [Test]
    public void Only_the_game_link_forwarder_touches_the_network()
    {
        var net = Sites.Value.Where(s => s.Callee.DeclaringType is { } t && (t.Namespace?.StartsWith("System.Net", StringComparison.Ordinal) == true)
                                         && t != typeof(System.Net.HttpStatusCode)).ToList();
        Assert.True(net.Any(s => s.Owner == typeof(GameLinkForwarder)), "sanity");
        Assert.Empty(net.Where(s => s.Owner != typeof(GameLinkForwarder) && s.Owner != typeof(GameLinkEndpoint)), "network use outside the forwarder");
    }

    [Test]
    public void Only_the_calibration_recorder_writes_images_and_only_it_and_UserGames_write_files()
    {
        var png = Sites.Value.Where(s => s.Callee is MethodInfo m && m.DeclaringType == typeof(PngCodec) && m.Name == nameof(PngCodec.Encode)).ToList();
        Assert.Empty(png.Where(s => s.Owner != typeof(CalibrationRecorder)), "PNG encoding outside the recorder");
        var writes = Sites.Value.Where(s => IsFileWrite(s.Callee)).ToList();
        Assert.True(writes.Any(s => s.Owner == typeof(CalibrationRecorder)) && writes.Any(s => s.Owner == typeof(UserGames)), "sanity: the scan sees the two writers");
        Assert.Empty(writes.Where(s => s.Owner != typeof(CalibrationRecorder) && s.Owner != typeof(UserGames)).Select(s => s.ToString()), "file writes elsewhere");
    }

    /// <summary>
    /// Every way to write or change a file the BCL and WinRT offer: File.* writers (sync and async, Open/OpenHandle,
    /// Delete, Move…), FileInfo/Directory writers, FileStream/StreamWriter/BinaryWriter constructors over paths,
    /// RandomAccess.Write and anything in Windows.Storage (StorageFile, FileIO, StorageFolder…).
    /// </summary>
    internal static bool IsFileWrite(MemberInfo callee)
    {
        var t = callee.DeclaringType;
        if (t is null) return false;
        if (t.Namespace?.StartsWith("Windows.Storage", StringComparison.Ordinal) == true) return true;
        if (callee is ConstructorInfo c)
            return t == typeof(FileStream) || t == typeof(FileSystemWatcher) ||
                   ((t == typeof(StreamWriter) || t == typeof(BinaryWriter)) && c.GetParameters().FirstOrDefault()?.ParameterType == typeof(string));
        var name = callee.Name;
        if (t == typeof(File))
            return name.StartsWith("Write", StringComparison.Ordinal) || name.StartsWith("Append", StringComparison.Ordinal) || name.StartsWith("Create", StringComparison.Ordinal)
                   || name is "Open" or "OpenWrite" or "OpenHandle" or "Move" or "Copy" or "Replace" or "Delete" or "SetAttributes" or "Encrypt" or "Decrypt" or "SetLastWriteTime" or "SetCreationTime";
        if (t == typeof(FileInfo) || t == typeof(DirectoryInfo))
            return name is "Create" or "CreateText" or "AppendText" or "Open" or "OpenWrite" or "MoveTo" or "CopyTo" or "Replace" or "Delete" or "CreateSubdirectory";
        if (t == typeof(Directory)) return name is "CreateDirectory" or "Move" or "Delete" or "CreateSymbolicLink";
        if (t == typeof(RandomAccess)) return name.StartsWith("Write", StringComparison.Ordinal);
        return false;
    }

    [Test]
    public void The_file_write_scan_sees_every_write_api()
    {
        // The reviewer's LOW: the old scan missed File.Open, the async writers, StreamWriter and WinRT storage.
        Assert.True(IsFileWrite(typeof(File).GetMethod(nameof(File.Open), [typeof(string), typeof(FileMode)])!));
        Assert.True(IsFileWrite(typeof(File).GetMethod(nameof(File.WriteAllTextAsync), [typeof(string), typeof(string), typeof(CancellationToken)])!));
        Assert.True(IsFileWrite(typeof(StreamWriter).GetConstructor([typeof(string)])!));
        Assert.True(IsFileWrite(typeof(Directory).GetMethod(nameof(Directory.CreateDirectory), [typeof(string)])!));
        Assert.True(IsFileWrite(typeof(Windows.Storage.FileIO).GetMethod(nameof(Windows.Storage.FileIO.WriteTextAsync), [typeof(Windows.Storage.IStorageFile), typeof(string)])!));
        Assert.False(IsFileWrite(typeof(File).GetMethod(nameof(File.ReadAllText), [typeof(string)])!));
        Assert.False(IsFileWrite(typeof(StreamWriter).GetConstructor([typeof(Stream)])!), "a writer over an existing stream is not a new file");
    }

    [Test]
    public void The_forwarder_only_ever_targets_loopback()
    {
        var token = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
        var ep = new GameLinkEndpoint(38140, token);
        Assert.Equal("127.0.0.1", ep.CompanionUri.Host);
        Assert.Equal("/v1/companion", ep.CompanionUri.AbsolutePath);
        Assert.DoesNotContain(token[..12], ep.ToString(), "the token is never printed whole");
    }

    // ------------------------------------------------------------------ IL scanning

    private static bool IsSenderMember(MemberInfo m)
    {
        var t = m.DeclaringType;
        if (t is null) return false;
        return t == typeof(IInputSender) || t == typeof(IMouseSender) || typeof(IInputSender).IsAssignableFrom(t) || typeof(IMouseSender).IsAssignableFrom(t);
    }

    /// <summary>The user-written type a (possibly compiler-generated, nested) type belongs to.</summary>
    private static Type OwnerOf(Type t)
    {
        while (t.DeclaringType is not null && (t.Name.Contains('<') || t.IsDefined(typeof(CompilerGeneratedAttribute), false))) t = t.DeclaringType;
        return t;
    }

    /// <summary>The user-written method a body belongs to ("&lt;OnDialRotateAsync&gt;d__3" → OnDialRotateAsync).</summary>
    private static string MethodOf(Type type, MethodBase m)
    {
        static string Unmangle(string n) => n.StartsWith('<') && n.IndexOf('>') is var i and > 1 ? n[1..i] : n;
        if (type.Name.StartsWith('<') && type.Name.Contains(">d__")) return Unmangle(type.Name);
        return Unmangle(m.Name);
    }

    private static readonly Dictionary<short, OpCode> OpCodesByValue = typeof(OpCodes).GetFields(BindingFlags.Public | BindingFlags.Static)
        .Select(f => (OpCode)f.GetValue(null)!).ToDictionary(o => o.Value);

    private static IReadOnlyList<CallSite> Scan()
    {
        var sites = new List<CallSite>();
        foreach (var type in Sight.GetTypes())
        {
            var owner = OwnerOf(type);
            const BindingFlags all = BindingFlags.Instance | BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.DeclaredOnly;
            foreach (var m in type.GetMethods(all).Cast<MethodBase>().Concat(type.GetConstructors(all)))
            {
                byte[]? il;
                try { il = m.GetMethodBody()?.GetILAsByteArray(); }
                catch (Exception) { continue; }
                if (il is null) continue;
                var typeArgs = type.IsGenericType ? type.GetGenericArguments() : null;
                var methodArgs = m.IsGenericMethod ? m.GetGenericArguments() : null;
                var name = MethodOf(type, m);
                for (var i = 0; i < il.Length;)
                {
                    short value = il[i];
                    if (value == 0xFE) { value = (short)(0xFE00 | il[i + 1]); i += 2; } else i++;
                    if (!OpCodesByValue.TryGetValue(value, out var op)) break;
                    var size = op.OperandType switch
                    {
                        OperandType.InlineNone => 0,
                        OperandType.ShortInlineBrTarget or OperandType.ShortInlineI or OperandType.ShortInlineVar => 1,
                        OperandType.InlineVar => 2,
                        OperandType.InlineI8 or OperandType.InlineR => 8,
                        OperandType.InlineSwitch => 4 + 4 * BitConverter.ToInt32(il, i),
                        _ => 4,
                    };
                    if (op.OperandType is OperandType.InlineMethod or OperandType.InlineField or OperandType.InlineTok or OperandType.InlineType)
                    {
                        var token = BitConverter.ToInt32(il, i);
                        try
                        {
                            var member = m.Module.ResolveMember(token, typeArgs, methodArgs);
                            if (member is not null) sites.Add(new CallSite(owner, name, member));
                        }
                        catch (Exception) { /* unresolvable generic context: skip */ }
                    }
                    i += size;
                }
            }
        }
        return sites;
    }
}
