using System.Text.Json.Nodes;

namespace PrismControl.Smart.Packs;

// The context-pack format v1 (aaa-prism-play/packs/schema/README.md) as immutable C# records. Only what the engine uses
// at runtime is modeled; evidence fields (sources, confidence notes) are kept as raw strings for the PI.

public enum PackKind { Game, App, Browser, Site, Shell }
public enum PolicyClass { SafeOffline, DesktopApp, OnlineCompetitive }
public enum PackKeyMode { Vk, Scancode }
public enum VerbCategory { Primary, Tool, Mode, Nav, Camera, System, Toggle, Readout }
public enum Safety { Safe, Confirm, NeverAuto }

/// <summary>
/// How strict a safety class is (review B1): <c>safe</c> &lt; <c>never-auto</c> &lt; <c>confirm</c>. Never compare the enum
/// values themselves (their order is historical); compare <see cref="Rank"/>. An AI change may only raise it.
/// </summary>
public static class SafetyRules
{
    public static int Rank(Safety s) => s switch { Safety.Confirm => 2, Safety.NeverAuto => 1, _ => 0 };

    /// <summary>The stricter of two classes.</summary>
    public static Safety Stricter(Safety a, Safety b) => Rank(a) >= Rank(b) ? a : b;

    public static string Name(Safety s) => s switch { Safety.Confirm => "confirm", Safety.NeverAuto => "never-auto", _ => "safe" };

    /// <summary>Parses a pack / module safety string; null for anything else.</summary>
    public static Safety? Parse(string? s) => s switch { "safe" => Safety.Safe, "confirm" => Safety.Confirm, "never-auto" => Safety.NeverAuto, _ => null };
}
/// <summary>base = always-on underlay (windows-shell), app = normal, overlay = merged over its extends parent (site packs).</summary>
public enum PackLayer { App, Base, Overlay }

public sealed record PackPolicy(PolicyClass Class, bool InputAllowed, bool SightAllowed, bool ClosedLoopAllowed, string? Reason)
{
    /// <summary>The refined input rule: Sight-located / closed-loop input only for safe-offline packs that allow both gates.</summary>
    public bool AllowsSightInput => Class == PolicyClass.SafeOffline && InputAllowed && SightAllowed;
    public bool AllowsClosedLoop => AllowsSightInput && ClosedLoopAllowed;
}

public sealed record SiteRule(string? Host, string? HostSuffix, string? PathRegex);

public sealed record MatchRule(string? Process, string? ProcessPathRegex, string? Aumid, string? WindowClass, string? TitleRegex,
    long? SteamAppId, SiteRule? Site, string? TitleFlags = null)
{
    /// <summary>How specific the rule is (more properties = more specific); ties between packs are broken by this.</summary>
    public int Specificity => (Process is null ? 0 : 1) + (ProcessPathRegex is null ? 0 : 1) + (Aumid is null ? 0 : 1)
        + (WindowClass is null ? 0 : 1) + (TitleRegex is null ? 0 : 1) + (Site is null ? 0 : 4);
}

public sealed record PackMatch(IReadOnlyList<MatchRule> Any, IReadOnlyList<MatchRule> Exclude);

public enum DetectorType { Always, WindowTitle, Process, Sight, Extension, GameLink, Module, FocusedControl, WindowClass }
public enum SightState { Visible, Hidden, Value }

public sealed record Detector(DetectorType Type, string? Regex, string? Region, SightState? State, string? Field,
    JsonNode? EqualsValue, bool? Exists, bool Negate, string? Flags = null);

public sealed record DetectGroup(bool All, IReadOnlyList<Detector> Detectors);

public sealed record PackContext(string Id, string Label, string? Parent, bool IsDefault, int Priority, int HysteresisMs, DetectGroup Detect);

/// <summary>What a slot shows when its verb can't run.</summary>
public sealed record Unavailable(string Label, string Hint, IReadOnlyList<string> When, string Style)
{
    public static Unavailable Generic(string label) => new(label, "Not available right now.", [], "dim");
}

// ---------------------------------------------------------------- bindings

public abstract record Binding(string Kind)
{
    /// <summary>True when running it sends keyboard/mouse input to the app (display-only packs may not have these).</summary>
    public virtual bool SendsInput => true;
    /// <summary>True when it needs Prism Sight to act (policy-gated: safe-offline only, direct gesture only).</summary>
    public virtual bool UsesSight => false;
    public abstract string Describe();
}

public sealed record ChordBinding(Chord Chord) : Binding("chord")
{
    public override string Describe() => Chord.ToString();
}

public sealed record SequenceBinding(IReadOnlyList<Chord> Steps, int GapMs) : Binding("sequence")
{
    public override string Describe() => string.Join(" , ", Steps);
}

public sealed record RepeatBinding(Chord Chord, int Count, int IntervalMs) : Binding("repeat")
{
    public override string Describe() => $"{Chord} ×{Count}";
}

public enum HoldMode { WhilePressed, Timed }

public sealed record HoldBinding(Chord Chord, HoldMode Mode, int DurationMs) : Binding("hold")
{
    public override string Describe() => Mode == HoldMode.Timed ? $"hold {Chord} {DurationMs} ms" : $"hold {Chord}";
}

public enum PackMouseButton { Left, Right, Middle, X1, X2, WheelUp, WheelDown, WheelLeft, WheelRight }

public enum MouseMode { Click, WhilePressed, Timed }

public sealed record MouseBinding(PackMouseButton Button, IReadOnlyList<string> Mods, int Clicks, MouseMode Mode = MouseMode.Click, int DurationMs = 0) : Binding("mouse")
{
    public bool IsWheel => Button is PackMouseButton.WheelUp or PackMouseButton.WheelDown or PackMouseButton.WheelLeft or PackMouseButton.WheelRight;
    public override string Describe() => (Mods.Count > 0 ? string.Join("+", Mods) + "+" : "") + Button + (Clicks > 1 ? $" ×{Clicks}" : "");
}

/// <summary>Several bindings in order (open a menu with a key, then click an entry Sight located). Never nested.</summary>
public sealed record MacroBinding(IReadOnlyList<Binding> Steps, int GapMs) : Binding("macro")
{
    public override bool SendsInput => Steps.Any(s => s.SendsInput);
    public override bool UsesSight => Steps.Any(s => s.UsesSight);
    public override string Describe() => string.Join(" then ", Steps.Select(s => s.Describe()));
}

public sealed record TextBinding(string Text) : Binding("text")
{
    public override string Describe() => $"type {Text.Length} characters";
}

public enum ModuleVerbStatus { Exists, InProgress, Planned }

public sealed record ModuleBinding(string Verb, JsonObject? Args, ModuleVerbStatus Status, string? Action) : Binding("module")
{
    public override bool SendsInput => false;
    public override string Describe() => Verb + (Status == ModuleVerbStatus.Exists ? "" : $" ({Status.ToString().ToLowerInvariant()})");
}

public sealed record ClosedLoopBinding(string Sight, double Target, Chord? Increase, Chord? Decrease, string? StepSight, double Step,
    string? Unit, double Tolerance, int MaxSteps, int SettleMs, string Fallback) : Binding("closedLoop")
{
    public override bool UsesSight => true;
    public override string Describe() => $"closed loop {Sight} → {Target}{Unit}" + (StepSight is null ? $" via {Increase}/{Decrease}" : $" via {StepSight}");
}

public sealed record SightClickBinding(string Sight, string Button) : Binding("sightClick")
{
    public override bool UsesSight => true;
    public override string Describe() => $"Sight click {Sight}";
}

public sealed record SightAdjustBinding(string Sight, int Direction, int Steps, string Method) : Binding("sightAdjust")
{
    public override bool UsesSight => true;
    public override string Describe() => $"Sight adjust {Sight} {(Direction > 0 ? "+" : "-")}{Steps}";
}

public sealed record UnboundBinding(string Reason, Chord? Suggest, string? Note) : Binding("unbound")
{
    public override bool SendsInput => false;
    public override string Describe() => "unbound" + (Suggest is null ? "" : $" (suggest {Suggest})");
}

// ---------------------------------------------------------------- verbs, controls, readouts

public sealed record PackVerb(string Id, string Label, string? LongLabel, string Glyph, string? Monogram, VerbCategory Category,
    int Priority, IReadOnlyList<string> Contexts, Binding Binding, IReadOnlyList<Binding> AltBindings, string? AppAction,
    Safety Safety, string? StateReadout, Unavailable Unavailable, string Confidence, string? Verify, int Order)
{
    /// <summary><c>global</c> = the app's own global hotkey: it works while the app is in the background.</summary>
    public bool IsGlobal { get; init; }
    /// <summary>Set when a user rebind replaced the pack default (the PI shows "your bind").</summary>
    public string? ReboundFrom { get; init; }
    /// <summary>
    /// A binding an AI assistant proposed (pack field <c>pendingBinding</c>, written only by the AI channel). It never
    /// runs: the slot shows REVIEW until the user approves it locally (the PI button, or a hold on a physical deck that
    /// shows the new chord). Review B2 / lead decision 2.
    /// </summary>
    public Binding? PendingBinding { get; init; }
    /// <summary>Who proposed <see cref="PendingBinding"/> (the sanitized client name) and when (ISO time), for the PI.</summary>
    public string? PendingClient { get; init; }
    public string? PendingAt { get; init; }
    /// <summary>The binding came from an approved AI proposal (pack field <c>aiBound</c>): always <c>confirm</c>, badged "AI".</summary>
    public bool AiBound { get; init; }
}

public sealed record TurnStep(double? PerPress, string Unit, IReadOnlyDictionary<string, double> ModifierSteps);

public sealed record AccelerationRow(int MinTicks, double PressesPerTick);

public sealed record Acceleration(IReadOnlyList<AccelerationRow> Curve, int MaxPressesPerEvent, int MinIntervalMs)
{
    public static Acceleration Default { get; } = new([new(1, 1)], 24, 25);
}

public sealed record TurnSpec(Binding Left, Binding Right, TurnStep Step, Acceleration Acceleration, double? ClampMin, double? ClampMax, bool Invert);

public sealed record PackControl(string Id, string Label, string Glyph, VerbCategory Category, int Priority, IReadOnlyList<string> Contexts,
    TurnSpec Turn, string? PushVerb, string? Readout, Safety Safety, Unavailable Unavailable, string Confidence, int Order)
{
    public string? Monogram { get; init; }
}

public enum ReadoutSourceKind { Sight, GameLink, Extension, Module, Counted, Window, File }

public sealed record ReadoutSource(ReadoutSourceKind Kind, string? Region, string? Field, string? Topic, string? Control, ModuleVerbStatus? Status);

public sealed record PackReadout(string Id, string Label, IReadOnlyList<string> Contexts, ReadoutSource Source, string? Unit, string? Format,
    double? RangeMin, double? RangeMax, string Widget, bool StreamerHide, double? RefreshHz, Unavailable? Unavailable, int Order);

public sealed record SightRegionInfo(string Id, string What, string? ValueType);

public sealed record RebindLocation(string Path, string Format, string? Note);

public sealed record UserBindingsInfo(string Storage, string Summary, IReadOnlyList<RebindLocation> Locations, string? KeyNameMap, string Confidence)
{
    /// <summary>The file also holds secrets (Discord's login token): never read it; the PI asks the user instead.</summary>
    public bool NeverRead { get; init; }
}

public sealed record LayoutKey(int X, int Y, string Verb);
public sealed record LayoutDial(int Dial, int Layer, string Control);
public sealed record LayoutScreen(string Slot, string Readout);

/// <summary>A pack's proposed placement for one device kind and context (the generator follows it on page 1).</summary>
public sealed record LayoutProposal(string Device, string Context, IReadOnlyList<LayoutKey> Keys, IReadOnlyList<LayoutDial> Dials,
    IReadOnlyList<LayoutScreen> Screen, string Rationale);

/// <summary>Where a pack came from (later sources override earlier ones per item id).</summary>
public enum PackOrigin { Shipped, Plugin, User }

/// <summary>A loaded, merged and validated context pack.</summary>
public sealed record ContextPack
{
    public required string Id { get; init; }
    public required string Name { get; init; }
    public string? Vendor { get; init; }
    public required PackKind Kind { get; init; }
    public required string PackVersion { get; init; }
    public IReadOnlyList<string> Extends { get; init; } = [];
    public PackLayer Layer { get; init; } = PackLayer.App;
    /// <summary><c>foreground</c> (default), <c>running</c> (companion: also while the process runs), <c>always</c>.</summary>
    public string Activation { get; init; } = "foreground";
    public required PackPolicy Policy { get; init; }
    public required PackKeyMode KeyMode { get; init; }
    /// <summary>
    /// How long each injected tap holds its keys (ms). Frontier's Cobra engine (Planet Coaster 1/2) can miss very short
    /// taps, so scancode packs default to 50 ms; app packs to 0 (one SendInput batch). Pack field <c>keyHoldMs</c> (0–500).
    /// </summary>
    public int KeyHoldMs { get; init; }
    public required PackMatch Match { get; init; }
    public required IReadOnlyList<PackContext> Contexts { get; init; }
    public required IReadOnlyList<PackVerb> Verbs { get; init; }
    public IReadOnlyList<PackControl> Controls { get; init; } = [];
    public IReadOnlyList<PackReadout> Readouts { get; init; } = [];
    public IReadOnlyList<SightRegionInfo> SightRegions { get; init; } = [];
    public required UserBindingsInfo UserBindings { get; init; }
    public IReadOnlyList<LayoutProposal> Layouts { get; init; } = [];
    public string Confidence { get; init; } = "medium";
    public string VerifiedVersion { get; init; } = "unknown";
    public PackOrigin Origin { get; init; } = PackOrigin.Shipped;
    /// <summary>Files this pack was built from (shipped resource names, override paths), for the PI.</summary>
    public IReadOnlyList<string> Files { get; init; } = [];

    public bool IsDisplayOnly => !Policy.InputAllowed;

    public PackContext DefaultContext => Contexts.FirstOrDefault(c => c.IsDefault) ?? Contexts[0];

    public PackContext? FindContext(string id) => Contexts.FirstOrDefault(c => c.Id == id);
    public PackVerb? FindVerb(string id) => Verbs.FirstOrDefault(v => v.Id == id);
    public PackControl? FindControl(string id) => Controls.FirstOrDefault(c => c.Id == id);
    public PackReadout? FindReadout(string id) => Readouts.FirstOrDefault(r => r.Id == id);

    /// <summary>
    /// Whether an item listed for <paramref name="itemContexts"/> is valid in <paramref name="contextId"/>: <c>*</c>, the
    /// context itself, or its parent (the validator's rule). Returns the tier: 0 direct or <c>*</c>, 1 via the parent, -1 not valid.
    /// </summary>
    public int ValidityTier(IReadOnlyList<string> itemContexts, string contextId)
    {
        if (itemContexts.Contains("*") || itemContexts.Contains(contextId)) return 0;
        var parent = FindContext(contextId)?.Parent;
        return parent is not null && itemContexts.Contains(parent) ? 1 : -1;
    }
}
