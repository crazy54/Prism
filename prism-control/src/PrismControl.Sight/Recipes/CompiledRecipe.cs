using PrismControl.Sight.Detectors;
using PrismControl.Sight.Imaging;

namespace PrismControl.Sight.Recipes;

public sealed class CompiledRegion
{
    public required int Index { get; init; }
    public required string Id { get; init; }
    public required Anchor Anchor { get; init; }
    public required double X { get; init; }
    public required double Y { get; init; }
    public required double W { get; init; }
    public required double H { get; init; }
    public required bool ScaleWithHud { get; init; }
    public required double RateHz { get; init; }
    public required IReadOnlyList<int> Detectors { get; init; }
    /// <summary>True when an OCR detector reads it (change gating then compares ink, not raw pixels).</summary>
    public bool HasText { get; init; }

    public PixelRect Resolve(in HudGeometry g) => g.Resolve(Anchor, X, Y, W, H, ScaleWithHud);
}

public sealed record CompiledContext(string Id, string Label, ContextExpression When, int Priority, int EnterMs, int ExitMs);

public enum ReadoutKind { Number, Percent, Bool, Label, Text }

public sealed record CompiledReadout(string Id, string Label, int Detector, string DetectorId, string RegionId, ReadoutKind Kind, string? Unit,
    double? Min, double? Max, IReadOnlyList<string> Contexts, int StaleAfterMs, int ConfirmReads, int? Precision);

public enum ControlKind { Button, Stepper, Slider }

public enum AdjustMethod { Auto, Buttons, Drag, Wheel }

public sealed record ControlPoint(double X, double Y);

public sealed record CompiledSlider(bool Horizontal, bool IncreaseTowardsEnd, int? HandleDetector, double StepUnits);

public sealed record CompiledWheel(int NotchesPerStep, bool UpIncreases, ControlPoint Point);

public sealed record CompiledControl(string Id, string Label, ControlKind Kind, int LocateDetector, string RegionId, double MinScore,
    ControlPoint Point, ControlPoint? Increase, ControlPoint? Decrease, CompiledSlider? Slider, CompiledWheel? Wheel,
    IReadOnlyList<AdjustMethod> Methods, string? Readout, ContextExpression? Verify, int SettleMs, int IntervalMs, ContextExpression? Requires = null);

/// <summary>A validated recipe, ready to run: regions with rates, detector instances, contexts, readouts, controls.</summary>
public sealed class CompiledRecipe
{
    public required RecipeDto Source { get; init; }
    public required string Id { get; init; }
    public required string Game { get; init; }
    public required string Title { get; init; }
    public required bool IsDraft { get; init; }
    public required IReadOnlyList<string> Processes { get; init; }
    public required IReadOnlyList<string> WindowClasses { get; init; }
    public required HudDto Hud { get; init; }
    public double? PaperWhiteNits { get; init; }
    public int? WhiteReferenceRegion { get; init; }
    public double WhiteReferenceLevel { get; init; } = 1.0;
    public required IReadOnlyList<CompiledRegion> Regions { get; init; }
    public required IReadOnlyList<Detector> Detectors { get; init; }
    public required IReadOnlyList<CompiledContext> Contexts { get; init; }
    public required IReadOnlyList<CompiledReadout> Readouts { get; init; }
    public required IReadOnlyList<CompiledControl> Controls { get; init; }
    /// <summary>Where it came from ("builtin:pc2-coaster-builder.json", a file path, "memory").</summary>
    public string Origin { get; init; } = "memory";

    public bool Matches(string processName, string? windowClass)
    {
        if (!Processes.Any(p => string.Equals(p, processName, StringComparison.OrdinalIgnoreCase))) return false;
        return WindowClasses.Count == 0 || (windowClass is not null && WindowClasses.Any(c => string.Equals(c, windowClass, StringComparison.Ordinal)));
    }

    public CompiledRegion? Region(string id) => Regions.FirstOrDefault(r => r.Id == id);
    public Detector? Detector(string id) => DetectorById(id);

    private Dictionary<string, Detector>? _byId;

    /// <summary>O(1) lookup (context rules evaluate every frame).</summary>
    public Detector? DetectorById(string id) =>
        (_byId ??= Detectors.ToDictionary(d => d.Id, StringComparer.Ordinal)).GetValueOrDefault(id);
    public CompiledControl? Control(string id) => Controls.FirstOrDefault(c => c.Id == id);

    /// <summary>A readout by its id, or by the region it reads (packs name Sight regions: "pc2.builder.bankValue").</summary>
    public CompiledReadout? Readout(string idOrRegion) =>
        Readouts.FirstOrDefault(r => r.Id == idOrRegion) ?? Readouts.FirstOrDefault(r => r.RegionId == idOrRegion);
}
