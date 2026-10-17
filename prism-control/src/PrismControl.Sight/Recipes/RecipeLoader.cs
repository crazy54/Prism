using System.Reflection;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using PrismControl.Sight.Detectors;
using PrismControl.Sight.Imaging;
using PrismControl.Sight.Text;

namespace PrismControl.Sight.Recipes;

/// <summary>Reads files a recipe refers to (templates, glyph sets), relative to the recipe.</summary>
public interface IRecipeAssets
{
    byte[]? Read(string relativePath);
}

/// <summary>Assets next to a recipe file on disk. Paths may not escape the recipe's folder.</summary>
public sealed class FolderAssets(string folder) : IRecipeAssets
{
    private readonly string _root = Path.GetFullPath(folder);

    public byte[]? Read(string relativePath)
    {
        var full = Path.GetFullPath(Path.Combine(_root, relativePath));
        if (!full.StartsWith(_root + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)) return null;
        return File.Exists(full) ? File.ReadAllBytes(full) : null;
    }
}

/// <summary>Assets embedded in this assembly under sight/recipes/.</summary>
public sealed class EmbeddedAssets : IRecipeAssets
{
    public byte[]? Read(string relativePath)
    {
        var name = "sight/recipes/" + relativePath.Replace('\\', '/');
        using var s = typeof(EmbeddedAssets).Assembly.GetManifestResourceStream(name);
        if (s is null) return null;
        using var ms = new MemoryStream();
        s.CopyTo(ms);
        return ms.ToArray();
    }
}

/// <summary>In-memory assets (tests, synthetic recipes).</summary>
public sealed class MemoryAssets : IRecipeAssets
{
    private readonly Dictionary<string, byte[]> _files = new(StringComparer.OrdinalIgnoreCase);
    public MemoryAssets Add(string path, byte[] bytes) { _files[path.Replace('\\', '/')] = bytes; return this; }
    public byte[]? Read(string relativePath) => _files.TryGetValue(relativePath.Replace('\\', '/'), out var b) ? b : null;
}

public sealed class RecipeException(IReadOnlyList<string> errors) : Exception("invalid recipe:\n  " + string.Join("\n  ", errors))
{
    public IReadOnlyList<string> Errors { get; } = errors;
}

/// <summary>
/// Parses and validates a recipe (strict JSON: unknown properties are errors) and compiles it. Every problem is
/// reported with its JSON path, all at once, so a calibrator can fix a recipe in one pass.
/// </summary>
public static partial class RecipeLoader
{
    public const int MaxRegions = 64;
    public const int MaxReadouts = 48;   // Game Link detail: ≤ 48 keys per level

    private static readonly JsonSerializerOptions Options = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        ReadCommentHandling = JsonCommentHandling.Skip,
        AllowTrailingCommas = true,
        UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow,
        WriteIndented = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    private static readonly HashSet<string> ReservedGames = ["v", "game", "source", "at", "rev", "status", "player", "weapon", "stats", "round", "match", "events", "cs2", "demo", "detail", "session"];

    [GeneratedRegex(@"^[a-z0-9][a-z0-9.\-]{1,63}$")] private static partial Regex RecipeIdRx();
    [GeneratedRegex(@"^[a-z][a-z0-9]{1,23}$")] private static partial Regex GameIdRx();
    [GeneratedRegex(@"^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)*$")] private static partial Regex DottedIdRx();
    [GeneratedRegex(@"^[a-z][a-zA-Z0-9]{0,31}$")] private static partial Regex FieldRx();

    public static string Serialize(RecipeDto dto) => JsonSerializer.Serialize(dto, Options);

    public static RecipeDto ParseDto(string json)
    {
        try { return JsonSerializer.Deserialize<RecipeDto>(json, Options) ?? throw new RecipeException(["the file is empty"]); }
        catch (JsonException ex) { throw new RecipeException([$"{ex.Path ?? "$"}: {ex.Message}"]); }
    }

    public static CompiledRecipe Load(string path)
    {
        var json = File.ReadAllText(path);
        return Compile(ParseDto(json), new FolderAssets(Path.GetDirectoryName(Path.GetFullPath(path))!), path);
    }

    public static CompiledRecipe FromJson(string json, IRecipeAssets? assets = null, string origin = "memory") => Compile(ParseDto(json), assets ?? new MemoryAssets(), origin);

    /// <summary>The recipes shipped in this assembly (Recipes/Builtin).</summary>
    public static IReadOnlyList<(string Name, string Json)> BuiltinJson()
    {
        var asm = typeof(RecipeLoader).Assembly;
        var list = new List<(string, string)>();
        foreach (var name in asm.GetManifestResourceNames().Where(n => n.StartsWith("sight/recipes/", StringComparison.Ordinal) && n.EndsWith(".json", StringComparison.Ordinal)))
        {
            if (name.Count(c => c == '/') != 2) continue;   // top level only (sub-folders hold assets such as glyph sets)
            using var s = asm.GetManifestResourceStream(name)!;
            using var r = new StreamReader(s);
            list.Add((name["sight/recipes/".Length..], r.ReadToEnd()));
        }
        return list;
    }

    public static string SchemaJson()
    {
        using var s = typeof(RecipeLoader).Assembly.GetManifestResourceStream("sight/recipe.schema.json")!;
        using var r = new StreamReader(s);
        return r.ReadToEnd();
    }

    public static CompiledRecipe Compile(RecipeDto d, IRecipeAssets assets, string origin = "memory")
    {
        var errors = new List<string>();
        void Err(string path, string msg) => errors.Add($"{path}: {msg}");

        if (d.V != 1) Err("v", "must be 1");
        if (!RecipeIdRx().IsMatch(d.Id ?? "")) Err("id", "lowercase letters, digits, '.', '-' (2–64 characters)");
        if (!GameIdRx().IsMatch(d.Game ?? "") || ReservedGames.Contains(d.Game ?? "")) Err("game", "a Game Link game id: /^[a-z][a-z0-9]{1,23}$/, not a reserved key");
        if (d.Status is not ("draft" or "calibrated")) Err("status", "draft or calibrated");
        if (d.Match.Processes.Count == 0) Err("match.processes", "at least one executable name");
        for (var i = 0; i < d.Match.Processes.Count; i++)
            if (!d.Match.Processes[i].EndsWith(".exe", StringComparison.OrdinalIgnoreCase) || d.Match.Processes[i].Contains('\\') || d.Match.Processes[i].Contains('/'))
                Err($"match.processes[{i}]", "an executable file name such as \"Game.exe\"");
        var hud = d.Hud;
        if (hud.ReferenceHeight <= 0) Err("hud.referenceHeight", "must be > 0");
        if (hud.MinScale <= 0 || hud.MaxScale < hud.MinScale) Err("hud", "0 < minScale ≤ maxScale");
        if (hud.Scale < hud.MinScale || hud.Scale > hud.MaxScale) Err("hud.scale", "must be within [minScale, maxScale]");
        if (hud.MaxAspect is <= 0 || hud.MinAspect is <= 0) Err("hud", "aspects must be > 0");

        // Regions
        if (d.Regions.Count == 0) Err("regions", "at least one region");
        if (d.Regions.Count > MaxRegions) Err("regions", $"at most {MaxRegions}");
        var regionIndex = new Dictionary<string, int>(StringComparer.Ordinal);
        for (var i = 0; i < d.Regions.Count; i++)
        {
            var r = d.Regions[i];
            var p = $"regions[{i}]";
            if (!DottedIdRx().IsMatch(r.Id ?? "")) Err($"{p}.id", "letters, digits, '_' and dots (\"pc2.builder.bankValue\")");
            else if (!regionIndex.TryAdd(r.Id!, i)) Err($"{p}.id", $"duplicate '{r.Id}'");
            if (!HudGeometry.TryParseAnchor(r.Anchor, out _)) Err($"{p}.anchor", $"'{r.Anchor}' is not one of top-left, top, top-right, left, center, right, bottom-left, bottom, bottom-right");
            if (r.W <= 0 || r.H <= 0) Err(p, "w and h must be > 0");
            if (r.RateHz is { } rate && (rate <= 0 || rate > 60)) Err($"{p}.rateHz", "in (0, 60]");
        }

        // Detectors
        var detectors = new List<Detector>();
        var detIndex = new Dictionary<string, int>(StringComparer.Ordinal);
        for (var i = 0; i < d.Detectors.Count; i++)
        {
            var x = d.Detectors[i];
            var p = $"detectors[{i}]";
            if (!DottedIdRx().IsMatch(x.Id ?? "")) { Err($"{p}.id", "letters, digits, '_' and dots"); continue; }
            if (detIndex.ContainsKey(x.Id!)) { Err($"{p}.id", $"duplicate '{x.Id}'"); continue; }
            if (!regionIndex.TryGetValue(x.Region ?? "", out var ri)) { Err($"{p}.region", $"unknown region '{x.Region}'"); continue; }
            if (x.RateHz is { } rate && (rate <= 0 || rate > 60)) Err($"{p}.rateHz", "in (0, 60]");
            var det = CompileDetector(x, ri, p, assets, Err);
            if (det is null) continue;
            det.Index = detectors.Count;
            detIndex[x.Id!] = det.Index;
            detectors.Add(det);
        }

        // Regions → compiled (rate = explicit, else the fastest detector)
        var regions = new List<CompiledRegion>();
        for (var i = 0; i < d.Regions.Count; i++)
        {
            var r = d.Regions[i];
            HudGeometry.TryParseAnchor(r.Anchor, out var anchor);
            var mine = detectors.Where(x => x.RegionIndex == i).ToList();
            var rate = r.RateHz ?? (mine.Count == 0 ? 2 : mine.Max(x => x.RateHz));
            regions.Add(new CompiledRegion
            {
                Index = i, Id = r.Id, Anchor = anchor, X = r.X, Y = r.Y, W = r.W, H = r.H, ScaleWithHud = r.ScaleWithHud,
                RateHz = rate, Detectors = mine.Select(x => x.Index).ToList(), HasText = mine.Any(x => x.Kind == DetectorKind.Ocr),
            });
        }

        // Contexts
        var contexts = new List<CompiledContext>();
        var ctxIds = new HashSet<string>(StringComparer.Ordinal);
        for (var i = 0; i < d.Contexts.Count; i++)
        {
            var c = d.Contexts[i];
            var p = $"contexts[{i}]";
            if (!FieldRx().IsMatch(c.Id ?? "")) { Err($"{p}.id", "camelCase /^[a-z][a-zA-Z0-9]{0,31}$/"); continue; }
            if (!ctxIds.Add(c.Id!)) { Err($"{p}.id", $"duplicate '{c.Id}'"); continue; }
            if (c.EnterMs < 0 || c.ExitMs < 0) Err(p, "enterMs and exitMs must be ≥ 0");
            ContextExpression expr;
            try { expr = ContextExpression.Parse(c.When); }
            catch (FormatException ex) { Err($"{p}.when", ex.Message); continue; }
            foreach (var id in expr.DetectorIds.Where(id => !detIndex.ContainsKey(id))) Err($"{p}.when", $"unknown detector '{id}'");
            contexts.Add(new CompiledContext(c.Id!, c.Label ?? c.Id!, expr, c.Priority, c.EnterMs, c.ExitMs));
        }

        // Readouts
        var readouts = new List<CompiledReadout>();
        if (d.Readouts.Count > MaxReadouts) Err("readouts", $"at most {MaxReadouts}");
        var roIds = new HashSet<string>(StringComparer.Ordinal);
        for (var i = 0; i < d.Readouts.Count; i++)
        {
            var r = d.Readouts[i];
            var p = $"readouts[{i}]";
            if (!FieldRx().IsMatch(r.Id ?? "")) { Err($"{p}.id", "camelCase /^[a-z][a-zA-Z0-9]{0,31}$/ (it becomes a Game Link field)"); continue; }
            if (!roIds.Add(r.Id!)) { Err($"{p}.id", $"duplicate '{r.Id}'"); continue; }
            if (!detIndex.TryGetValue(r.From ?? "", out var di)) { Err($"{p}.from", $"unknown detector '{r.From}'"); continue; }
            var det = detectors[di];
            var kind = ReadoutKindFor(r.Type, det, out var kindError);
            if (kindError is not null) { Err($"{p}.type", kindError); continue; }
            if (r.Min is { } mn && r.Max is { } mx && mn >= mx) Err(p, "min must be < max");
            foreach (var cid in r.Contexts ?? []) if (!d.Contexts.Any(c => c.Id == cid)) Err($"{p}.contexts", $"unknown context '{cid}'");
            if (r.StaleAfterMs is <= 0) Err($"{p}.staleAfterMs", "must be > 0");
            if (r.ConfirmReads is < 1 or > 10) Err($"{p}.confirmReads", "1..10");
            if (r.Precision is < 0 or > 6) Err($"{p}.precision", "0..6");
            readouts.Add(new CompiledReadout(r.Id!, r.Label ?? r.Id!, di, det.Id, d.Regions[det.RegionIndex].Id, kind, r.Unit, r.Min, r.Max, r.Contexts ?? [],
                r.StaleAfterMs ?? 1500, r.ConfirmReads ?? (det.Kind == DetectorKind.Ocr ? 2 : 1), r.Precision));
        }

        // Controls
        var controls = new List<CompiledControl>();
        var ctlIds = new HashSet<string>(StringComparer.Ordinal);
        for (var i = 0; i < d.Controls.Count; i++)
        {
            var c = d.Controls[i];
            var p = $"controls[{i}]";
            if (!DottedIdRx().IsMatch(c.Id ?? "")) { Err($"{p}.id", "letters, digits, '_' and dots"); continue; }
            if (!ctlIds.Add(c.Id!)) { Err($"{p}.id", $"duplicate '{c.Id}'"); continue; }
            var kind = c.Kind switch { "button" => ControlKind.Button, "stepper" => ControlKind.Stepper, "slider" => ControlKind.Slider, _ => (ControlKind?)null };
            if (kind is null) { Err($"{p}.kind", "button, stepper or slider"); continue; }
            if (!detIndex.TryGetValue(c.Locate ?? "", out var li) || detectors[li].Kind != DetectorKind.Template) { Err($"{p}.locate", $"'{c.Locate}' must be a template detector"); continue; }
            if (c.MinScore is < 0.5 or > 1) Err($"{p}.minScore", "0.5..1 (never act on a weak match)");
            if (kind == ControlKind.Stepper && (c.Increase is null || c.Decrease is null)) Err(p, "a stepper needs increase and decrease points");
            CompiledSlider? slider = null;
            if (c.Slider is { } s)
            {
                var horizontal = s.Orientation == "horizontal";
                if (s.Orientation is not ("horizontal" or "vertical")) Err($"{p}.slider.orientation", "horizontal or vertical");
                var towards = s.IncreaseTowards ?? (horizontal ? "right" : "up");
                if (horizontal ? towards is not ("right" or "left") : towards is not ("up" or "down")) Err($"{p}.slider.increaseTowards", horizontal ? "right or left" : "up or down");
                int? handle = null;
                if (s.Handle is not null)
                {
                    if (detIndex.TryGetValue(s.Handle, out var hi) && detectors[hi].Kind == DetectorKind.Template) handle = hi;
                    else Err($"{p}.slider.handle", $"'{s.Handle}' must be a template detector");
                }
                if (s.StepUnits <= 0) Err($"{p}.slider.stepUnits", "must be > 0");
                slider = new CompiledSlider(horizontal, towards is "right" or "down" ? horizontal : towards == "up" ? !horizontal : false, handle, s.StepUnits);
                // IncreaseTowardsEnd: true = increase towards larger x (right) or smaller y (up).
                slider = slider with { IncreaseTowardsEnd = horizontal ? towards == "right" : towards == "up" };
            }
            else if (kind == ControlKind.Slider) Err(p, "a slider needs slider geometry");
            CompiledWheel? wheel = c.Wheel is { } w
                ? new CompiledWheel(Math.Clamp(w.NotchesPerStep, 1, 10), w.Increase != "down", Pt(w.Point ?? c.Point))
                : null;
            if (c.Wheel is { Increase: not ("up" or "down") }) Err($"{p}.wheel.increase", "up or down");
            var methods = new List<AdjustMethod>();
            foreach (var m in c.Methods ?? [])
            {
                var mm = m switch { "buttons" => AdjustMethod.Buttons, "drag" => AdjustMethod.Drag, "wheel" => AdjustMethod.Wheel, _ => (AdjustMethod?)null };
                if (mm is null) Err($"{p}.methods", $"'{m}' is not buttons, wheel or drag");
                else methods.Add(mm.Value);
            }
            if (methods.Count == 0)
            {
                if (c.Increase is not null && c.Decrease is not null) methods.Add(AdjustMethod.Buttons);
                if (wheel is not null) methods.Add(AdjustMethod.Wheel);
                if (slider is not null) methods.Add(AdjustMethod.Drag);
            }
            if (methods.Contains(AdjustMethod.Buttons) && (c.Increase is null || c.Decrease is null)) Err($"{p}.methods", "buttons needs increase and decrease points");
            if (methods.Contains(AdjustMethod.Wheel) && wheel is null) Err($"{p}.methods", "wheel needs a wheel block");
            if (methods.Contains(AdjustMethod.Drag) && slider is null) Err($"{p}.methods", "drag needs a slider block");
            if (c.Readout is not null && !d.Readouts.Any(r => r.Id == c.Readout)) Err($"{p}.readout", $"unknown readout '{c.Readout}'");
            ContextExpression? verify = null;
            if (c.Verify is not null)
            {
                try
                {
                    verify = ContextExpression.Parse(c.Verify);
                    foreach (var id in verify.DetectorIds.Where(id => !detIndex.ContainsKey(id))) Err($"{p}.verify", $"unknown detector '{id}'");
                }
                catch (FormatException ex) { Err($"{p}.verify", ex.Message); }
            }
            ContextExpression? requires = null;
            if (c.Requires is not null)
            {
                try
                {
                    requires = ContextExpression.Parse(c.Requires);
                    foreach (var id in requires.DetectorIds.Where(id => !detIndex.ContainsKey(id))) Err($"{p}.requires", $"unknown detector '{id}'");
                }
                catch (FormatException ex) { Err($"{p}.requires", ex.Message); }
            }
            if (c.SettleMs is < 0 or > 2000 || c.IntervalMs is < 10 or > 1000) Err(p, "settleMs 0..2000, intervalMs 10..1000");
            controls.Add(new CompiledControl(c.Id!, c.Label ?? c.Id!, kind.Value, li, d.Regions[detectors[li].RegionIndex].Id, c.MinScore,
                Pt(c.Point), c.Increase is null ? null : Pt(c.Increase), c.Decrease is null ? null : Pt(c.Decrease), slider, wheel, methods,
                c.Readout, verify, c.SettleMs, c.IntervalMs, requires));
        }

        int? whiteRef = null;
        if (d.Color?.WhiteReference is { } wr)
        {
            if (regionIndex.TryGetValue(wr.Region, out var wi)) whiteRef = wi;
            else Err("color.whiteReference.region", $"unknown region '{wr.Region}'");
            if (wr.Level is <= 0 or > 1) Err("color.whiteReference.level", "0 < level ≤ 1");
        }
        if (d.Color?.PaperWhiteNits is { } pw && pw is < 40 or > 2000) Err("color.paperWhiteNits", "40..2000 nits");

        if (errors.Count > 0) throw new RecipeException(errors);
        return new CompiledRecipe
        {
            Source = d, Id = d.Id!, Game = d.Game!, Title = d.Title ?? d.Id!, IsDraft = d.Status != "calibrated",
            Processes = d.Match.Processes, WindowClasses = d.Match.WindowClasses ?? [], Hud = d.Hud,
            PaperWhiteNits = d.Color?.PaperWhiteNits, WhiteReferenceRegion = whiteRef, WhiteReferenceLevel = d.Color?.WhiteReference?.Level ?? 1.0,
            Regions = regions, Detectors = detectors, Contexts = contexts, Readouts = readouts, Controls = controls, Origin = origin,
        };
    }

    private static ControlPoint Pt(PointDto? p) => p is null ? new ControlPoint(0.5, 0.5) : new ControlPoint(p.X, p.Y);

    private static ReadoutKind ReadoutKindFor(string? type, Detector det, out string? error)
    {
        error = null;
        var parsed = type switch
        {
            null => (ReadoutKind?)null,
            "number" => ReadoutKind.Number, "percent" => ReadoutKind.Percent, "bool" => ReadoutKind.Bool,
            "label" => ReadoutKind.Label, "text" => ReadoutKind.Text,
            _ => null,
        };
        if (type is not null && parsed is null) { error = $"'{type}' is not number, percent, bool, label or text"; return ReadoutKind.Number; }
        var natural = det switch
        {
            BarDetector => ReadoutKind.Number,
            ColorDetector or ChangeDetector => ReadoutKind.Bool,
            TemplateDetector => ReadoutKind.Label,
            OcrDetector o => o.Parse.Type switch { ParseType.Text => ReadoutKind.Text, ParseType.Enum => ReadoutKind.Label, ParseType.Percent => ReadoutKind.Percent, _ => ReadoutKind.Number },
            _ => ReadoutKind.Number,
        };
        var k = parsed ?? natural;
        var numeric = k is ReadoutKind.Number or ReadoutKind.Percent;
        var detNumeric = det is BarDetector or ChangeDetector or ColorDetector or TemplateDetector || (det is OcrDetector od && od.Parse.Type is not (ParseType.Text or ParseType.Enum));
        if (numeric && !detNumeric) error = $"detector '{det.Id}' gives text, not numbers";
        if (k is ReadoutKind.Label && det is not (TemplateDetector or OcrDetector)) error = $"detector '{det.Id}' gives no labels";
        if (k is ReadoutKind.Text && det is not OcrDetector) error = $"detector '{det.Id}' gives no text";
        return k;
    }

    private static Detector? CompileDetector(DetectorDto x, int ri, string p, IRecipeAssets assets, Action<string, string> err)
    {
        switch (x.Kind)
        {
            case "color":
            {
                if (!Bgra.TryParse(x.Color, out var c)) { err($"{p}.color", "a #RRGGBB color"); return null; }
                var tol = x.Tolerance ?? 32;
                var mf = x.MinFraction ?? 0.6;
                if (tol is < 0 or > 255) err($"{p}.tolerance", "0..255");
                if (mf is <= 0 or > 1) err($"{p}.minFraction", "(0, 1]");
                return new ColorDetector(x.Id, ri, x.RateHz, c, tol, mf);
            }
            case "bar":
            {
                var dir = x.Direction switch { "right" => BarDirection.Right, "left" => BarDirection.Left, "up" => BarDirection.Up, "down" => BarDirection.Down, _ => (BarDirection?)null };
                if (dir is null) { err($"{p}.direction", "right, left, up or down (the way the bar grows)"); return null; }
                var mode = x.Mode ?? (x.Color is null ? "bright" : "color");
                Bgra? fill = null;
                if (mode == "color")
                {
                    if (!Bgra.TryParse(x.Color, out var f)) { err($"{p}.color", "mode color needs a #RRGGBB fill color"); return null; }
                    fill = f;
                }
                else if (mode != "bright") { err($"{p}.mode", "color or bright"); return null; }
                var thr = x.Threshold ?? 0.5;
                if (thr is <= 0 or >= 1) err($"{p}.threshold", "(0, 1)");
                var band = x.Band ?? 0.5;
                if (band is <= 0 or > 1) err($"{p}.band", "(0, 1]");
                var min = x.Min ?? 0;
                var max = x.Max ?? 100;
                if (max <= min) err(p, "max must be > min");
                return new BarDetector(x.Id, ri, x.RateHz, dir.Value, fill, x.Tolerance ?? 40, thr, band, min, max);
            }
            case "template":
            {
                if (x.Templates is not { Count: > 0 }) { err($"{p}.templates", "at least one template"); return null; }
                var list = new List<TemplateImage>();
                for (var t = 0; t < x.Templates.Count; t++)
                {
                    var tr = x.Templates[t];
                    var tp = $"{p}.templates[{t}]";
                    if (string.IsNullOrWhiteSpace(tr.Label)) { err($"{tp}.label", "required"); continue; }
                    if (list.Any(l => l.Label == tr.Label)) { err($"{tp}.label", $"duplicate '{tr.Label}'"); continue; }
                    byte[]? bytes = null;
                    if (tr.Png is not null)
                    {
                        try { bytes = Convert.FromBase64String(tr.Png); }
                        catch (FormatException) { err($"{tp}.png", "not base64"); continue; }
                    }
                    else if (tr.File is not null)
                    {
                        bytes = assets.Read(tr.File);
                        if (bytes is null) { err($"{tp}.file", $"'{tr.File}' not found next to the recipe"); continue; }
                    }
                    else { err(tp, "file or png is required"); continue; }
                    try
                    {
                        var img = PngCodec.Decode(bytes);
                        if (img.Width < 3 || img.Height < 3) { err(tp, "the template is smaller than 3×3"); continue; }
                        list.Add(new TemplateImage(tr.Label, img.ToGray()));
                    }
                    catch (Exception ex) when (ex is InvalidDataException or NotSupportedException) { err(tp, ex.Message); }
                }
                var thr = x.Threshold ?? 0.8;
                if (thr is <= 0 or >= 1) err($"{p}.threshold", "(0, 1)");
                return list.Count == 0 ? null : new TemplateDetector(x.Id, ri, x.RateHz, list, thr);
            }
            case "ocr":
            {
                var engine = x.Engine switch { null or "auto" => OcrEngineMode.Auto, "windows" => OcrEngineMode.Windows, "glyphs" => OcrEngineMode.Glyphs, _ => (OcrEngineMode?)null };
                if (engine is null) { err($"{p}.engine", "auto, windows or glyphs"); return null; }
                var pol = x.Text switch { null or "auto" => TextPolarity.Auto, "light" => TextPolarity.Light, "dark" => TextPolarity.Dark, _ => (TextPolarity?)null };
                if (pol is null) { err($"{p}.text", "light, dark or auto"); return null; }
                if (x.Parse is { Type: not ("number" or "integer" or "percent" or "text" or "enum" or "duration") }) { err($"{p}.parse.type", "number, integer, percent, text, enum or duration"); return null; }
                if (x.Parse is { Type: "enum", Values: null or { Count: 0 } }) { err($"{p}.parse.values", "enum needs values"); return null; }
                var spec = ParseSpec.From(x.Parse);
                GlyphSet? glyphs = null;
                if (x.Glyphs is not null)
                {
                    var bytes = assets.Read(x.Glyphs);
                    if (bytes is null) err($"{p}.glyphs", $"'{x.Glyphs}' not found next to the recipe");
                    else
                    {
                        try { glyphs = GlyphSet.FromJson(System.Text.Encoding.UTF8.GetString(bytes)); }
                        catch (Exception ex) when (ex is FormatException or JsonException) { err($"{p}.glyphs", ex.Message); }
                    }
                }
                if (engine == OcrEngineMode.Glyphs && glyphs is null && x.Glyphs is not null) return null;
                var strip = x.StripSuperscript ?? spec.Unit == "°";
                return new OcrDetector(x.Id, ri, x.RateHz, engine.Value, pol.Value, x.Whitelist, strip, spec, glyphs, x.Threshold ?? 0.55);
            }
            case "change":
            {
                var thr = x.Threshold ?? 0.02;
                if (thr is <= 0 or >= 1) err($"{p}.threshold", "(0, 1)");
                return new ChangeDetector(x.Id, ri, x.RateHz, thr);
            }
            default:
                err($"{p}.kind", $"'{x.Kind}' is not color, bar, template, ocr or change");
                return null;
        }
    }
}
