using System.Text.Json.Serialization;

namespace PrismControl.Sight.Recipes;

// The JSON shape of a recipe (v1). recipe.schema.json is the published schema; RecipeLoader validates semantics and
// compiles these DTOs into a CompiledRecipe. Unknown properties are errors (typos must not silently do nothing).

public sealed class RecipeDto
{
    [JsonPropertyName("$schema")] public string? Schema { get; set; }
    public int V { get; set; }
    public string Id { get; set; } = "";
    /// <summary>The Game Link game id (/^[a-z][a-z0-9]{1,23}$/): "pc2", "nms", …</summary>
    public string Game { get; set; } = "";
    public string? Title { get; set; }
    /// <summary>"draft" (regions not yet calibrated against real frames: never run live unless forced) or "calibrated".</summary>
    public string Status { get; set; } = "draft";
    public string? Notes { get; set; }
    public MatchDto Match { get; set; } = new();
    public HudDto Hud { get; set; } = new();
    public ColorDto? Color { get; set; }
    public List<RegionDto> Regions { get; set; } = [];
    public List<DetectorDto> Detectors { get; set; } = [];
    public List<ContextDto> Contexts { get; set; } = [];
    public List<ReadoutDto> Readouts { get; set; } = [];
    /// <summary>On-screen elements Sight can click or adjust (only from a fresh deck gesture, allowlisted games only).</summary>
    public List<ControlDto> Controls { get; set; } = [];
}

public sealed class MatchDto
{
    /// <summary>Executable names, case-insensitive ("PlanetCoaster2.exe").</summary>
    public List<string> Processes { get; set; } = [];
    /// <summary>Optional top-level window classes; empty = any class.</summary>
    public List<string>? WindowClasses { get; set; }
}

public sealed class HudDto
{
    /// <summary>The frame height (px) at which offsets are authored with HUD scale 1. 1080 by convention.</summary>
    public double ReferenceHeight { get; set; } = 1080;
    /// <summary>The game's UI scale setting that the offsets were authored at (usually 1). The user's value overrides it.</summary>
    public double Scale { get; set; } = 1.0;
    /// <summary>When set, the HUD lives in a centered box no wider than this aspect (16:9 = 1.7778) on wider screens.</summary>
    public double? MaxAspect { get; set; }
    /// <summary>When set, the HUD lives in a centered box no taller than width / minAspect on narrower screens (4:3, 16:10).</summary>
    public double? MinAspect { get; set; }
    public double MinScale { get; set; } = 0.5;
    public double MaxScale { get; set; } = 2.5;
}

public sealed class ColorDto
{
    /// <summary>HDR only: the HUD's white level in nits (the game's UI brightness). Null = the monitor's SDR white level.</summary>
    public double? PaperWhiteNits { get; set; }
    /// <summary>HDR only: a region whose brightest pixels are HUD white, used to measure paper white live.</summary>
    public WhiteReferenceDto? WhiteReference { get; set; }
}

public sealed class WhiteReferenceDto
{
    public string Region { get; set; } = "";
    /// <summary>The encoded level (0..1) those pixels have in an SDR capture (1 = pure white text).</summary>
    public double Level { get; set; } = 1.0;
}

public sealed class RegionDto
{
    public string Id { get; set; } = "";
    /// <summary>top-left | top | top-right | left | center | right | bottom-left | bottom | bottom-right (of the HUD box).</summary>
    public string Anchor { get; set; } = "top-left";
    /// <summary>Offset of the region's top-left corner from the anchor point, in HUD units (px at referenceHeight, HUD scale 1).</summary>
    public double X { get; set; }
    public double Y { get; set; }
    public double W { get; set; }
    public double H { get; set; }
    /// <summary>Samples per second; default = the fastest default of its detectors (bar/color 10, template 5, ocr 3, change 10).</summary>
    public double? RateHz { get; set; }
    /// <summary>False: the region keeps its size and offset regardless of the HUD scale (rare: elements the game never scales).</summary>
    public bool ScaleWithHud { get; set; } = true;
    public string? Notes { get; set; }
}

public sealed class DetectorDto
{
    public string Id { get; set; } = "";
    public string Region { get; set; } = "";
    /// <summary>color | bar | template | ocr | change</summary>
    public string Kind { get; set; } = "";
    public double? RateHz { get; set; }
    public string? Notes { get; set; }

    // color + bar
    /// <summary>color: the expected #RRGGBB. bar: the fill color (mode "color").</summary>
    public string? Color { get; set; }
    /// <summary>Max per-channel distance (0..255) for a pixel to count as that color. Default 32.</summary>
    public int? Tolerance { get; set; }
    /// <summary>color: the fraction of sampled pixels that must match for "present". Default 0.6.</summary>
    public double? MinFraction { get; set; }

    // bar
    /// <summary>The direction the bar grows: right | left | up | down.</summary>
    public string? Direction { get; set; }
    /// <summary>bar: "color" (pixels near Color are fill) or "bright" (luma above Threshold is fill). Default "color" when Color is set.</summary>
    public string? Mode { get; set; }
    /// <summary>bar (bright mode): the luma threshold 0..1. template: the NCC score for "present". ocr (glyphs): min glyph score.</summary>
    public double? Threshold { get; set; }
    /// <summary>bar: the fraction of the cross axis sampled around the center line. Default 0.5.</summary>
    public double? Band { get; set; }
    /// <summary>bar: the value at empty and at full (default 0 and 100).</summary>
    public double? Min { get; set; }
    public double? Max { get; set; }

    // template
    /// <summary>template: the labeled templates; the region is the search area (make it a little larger than the element).</summary>
    public List<TemplateRefDto>? Templates { get; set; }

    // ocr
    /// <summary>ocr: auto | windows | glyphs. auto = glyphs when a glyph set is available (cross-checked with Windows OCR), else Windows OCR.</summary>
    public string? Engine { get; set; }
    /// <summary>ocr: light | dark | auto — the text is lighter or darker than its background.</summary>
    public string? Text { get; set; }
    /// <summary>ocr: the characters that may appear. Look-alikes are mapped into it (O→0, l→1, S→5…), others dropped.</summary>
    public string? Whitelist { get; set; }
    /// <summary>ocr: remove a trailing superscript glyph (°, ²) before recognition; the unit is implied. Default true when Parse.Unit is "°".</summary>
    public bool? StripSuperscript { get; set; }
    public ParseDto? Parse { get; set; }
    /// <summary>ocr: a glyph set file (from "harvest-glyphs") for the game's HUD font.</summary>
    public string? Glyphs { get; set; }
}

public sealed class TemplateRefDto
{
    public string Label { get; set; } = "";
    /// <summary>A grayscale or color PNG, captured at the recipe's referenceHeight with HUD scale 1 (relative to the recipe).</summary>
    public string? File { get; set; }
    /// <summary>Alternatively the PNG inline, base64.</summary>
    public string? Png { get; set; }
}

public sealed class ParseDto
{
    /// <summary>number | integer | percent | text | enum | duration</summary>
    public string Type { get; set; } = "number";
    /// <summary>A unit suffix that may follow the value ("°", "m", "%", "km/h"); stripped before parsing.</summary>
    public string? Unit { get; set; }
    public string Decimal { get; set; } = ".";
    public string? Thousands { get; set; } = ",";
    /// <summary>enum: text (case-insensitive, after whitelist mapping) → label.</summary>
    public Dictionary<string, string>? Values { get; set; }
    /// <summary>Multiply the parsed number (e.g. 0.01).</summary>
    public double? Scale { get; set; }
}

public sealed class ContextDto
{
    public string Id { get; set; } = "";
    public string? Label { get; set; }
    /// <summary>A boolean expression over detector ids: <c>a &amp; !b</c>, <c>tool=coaster | tool=track</c>, <c>bankBar&gt;10</c>.</summary>
    public string When { get; set; } = "";
    /// <summary>The highest-priority active context is "the" context; all active ones are listed.</summary>
    public int Priority { get; set; }
    /// <summary>Hysteresis: the expression must hold this long to enter, and fail this long to leave.</summary>
    public int EnterMs { get; set; } = 250;
    public int ExitMs { get; set; } = 500;
}

public sealed class ReadoutDto
{
    public string Id { get; set; } = "";
    public string? Label { get; set; }
    /// <summary>The detector it reads.</summary>
    public string From { get; set; } = "";
    /// <summary>number | percent | bool | label | text. Default: number for bar/ocr numbers, bool for color/change, label for template.</summary>
    public string? Type { get; set; }
    public string? Unit { get; set; }
    /// <summary>Valid range: a parsed value outside it is rejected (never shown).</summary>
    public double? Min { get; set; }
    public double? Max { get; set; }
    /// <summary>Only valid while one of these contexts is active (else the value goes stale). Empty = always.</summary>
    public List<string>? Contexts { get; set; }
    /// <summary>A value not re-observed for this long is stale. Default 1500.</summary>
    public int? StaleAfterMs { get; set; }
    /// <summary>A changed value is "observed" only after this many consecutive identical reads (1 = immediately). Default 1, OCR 2.</summary>
    public int? ConfirmReads { get; set; }
    /// <summary>Decimals kept (rounding). Null = as read.</summary>
    public int? Precision { get; set; }
}

public sealed class PointDto
{
    /// <summary>Fractions of the located element's box (0..1; outside the box is allowed, e.g. 1.2 = just right of it).</summary>
    public double X { get; set; } = 0.5;
    public double Y { get; set; } = 0.5;
}

/// <summary>
/// An on-screen control: a button, a pair of ± buttons, or a slider, found in the latest frame by a template detector.
/// Sight acts on it only from a fresh deck gesture and only when it was found with at least <see cref="MinScore"/>.
/// </summary>
public sealed class ControlDto
{
    /// <summary>The id packs use (dotted names allowed: "pc2.builder.bankControl").</summary>
    public string Id { get; set; } = "";
    public string? Label { get; set; }
    /// <summary>button | stepper (± buttons) | slider</summary>
    public string Kind { get; set; } = "button";
    /// <summary>The template detector that locates the element (its box = the element).</summary>
    public string Locate { get; set; } = "";
    /// <summary>The located element's minimum confidence (the detector's NCC score) to act at all. Default 0.85.</summary>
    public double MinScore { get; set; } = 0.85;
    /// <summary>button: where to click, relative to the element box. Default the center.</summary>
    public PointDto? Point { get; set; }
    /// <summary>stepper/slider: the "+" and "−" click points relative to the element box.</summary>
    public PointDto? Increase { get; set; }
    public PointDto? Decrease { get; set; }
    /// <summary>slider: its geometry relative to the element box and how far one step drags.</summary>
    public SliderDto? Slider { get; set; }
    /// <summary>wheel: notches per step and which wheel direction increases.</summary>
    public WheelDto? Wheel { get; set; }
    /// <summary>The methods "auto" tries, in order: buttons | wheel | drag. Default: what the kind supports.</summary>
    public List<string>? Methods { get; set; }
    /// <summary>The readout that shows this control's value (verifies adjustments and drives closed loops).</summary>
    public string? Readout { get; set; }
    /// <summary>button: a context expression that must hold after the click for it to count as verified.</summary>
    public string? Verify { get; set; }
    /// <summary>A context expression that must hold in a fresh frame BEFORE acting (a macro's earlier step really happened,
    /// e.g. the Utilities tab is open). Otherwise nothing is sent and the call returns "not found".</summary>
    public string? Requires { get; set; }
    /// <summary>Wait after acting before re-reading (ms). Default 80.</summary>
    public int SettleMs { get; set; } = 80;
    /// <summary>Gap between repeated clicks or notches (ms), so the game registers each. Default 40.</summary>
    public int IntervalMs { get; set; } = 40;
}

public sealed class SliderDto
{
    /// <summary>horizontal | vertical</summary>
    public string Orientation { get; set; } = "horizontal";
    /// <summary>Which way is "increase": right | left | up | down. Default right (horizontal) / up (vertical).</summary>
    public string? IncreaseTowards { get; set; }
    /// <summary>The template detector that finds the handle inside the element (null: drag from the element center line).</summary>
    public string? Handle { get; set; }
    /// <summary>How far one step drags, in HUD units.</summary>
    public double StepUnits { get; set; } = 8;
}

public sealed class WheelDto
{
    public int NotchesPerStep { get; set; } = 1;
    /// <summary>up | down: the wheel direction that increases.</summary>
    public string Increase { get; set; } = "up";
    public PointDto? Point { get; set; }
}
