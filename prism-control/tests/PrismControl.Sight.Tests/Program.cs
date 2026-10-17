// Prism Sight tests and the calibration/probe host. Modes (two leading dashes):
//   run-recipe <recipe.json> <framesDir> [hud-scale <x>] [json]   run a recipe on PNG frames, print readouts
//   inspect <recipe.json> <frame.png> <out.png> [hud-scale <x>]   draw the regions over a frame (overlay-free review)
//   check-labeled <recipe.json> <dir>                              labeled-frame regression (frame.png + expected.json)
//   harvest-glyphs <recipe.json> <dir> <detectorId> <out.json>    build a calibrated glyph set from labeled frames
//   synth <outDir>                                                 write synthetic HUD frames + expected.json
//   hdr-probe [out.txt]                                            HDR capture verification on our own windows
//   ocr-probe                                                      Windows.Media.Ocr availability and speed
//   perf [seconds]                                                 CPU/frame-time measurement on a synthetic 3440x1440 window
//   synthetic-game <w> <h> <seconds>                               (child of perf) the synthetic game window
using PrismControl.Sight.Tests;

string[] modes = ["hdr-probe", "ocr-probe", "perf", "synthetic-game", "run-recipe", "inspect", "check-labeled", "harvest-glyphs", "synth"];
var mode = args.Length > 0 && args[0].StartsWith("--", StringComparison.Ordinal) && modes.Contains(args[0][2..]) ? args[0][2..] : null;
string Arg(int i, string fallback = "") => args.Length > i ? args[i] : fallback;
switch (mode)
{
    case "hdr-probe": return await HdrProbe.RunAsync(Arg(1, Path.Combine(Fx.ScratchDir, "hdr-probe.txt")));
    case "ocr-probe": return await Probes.OcrProbeAsync();
    case "perf": return await PerfHarness.RunAsync(int.Parse(Arg(1, "20")));
    case "synthetic-game": return await PerfHarness.SyntheticGameAsync(int.Parse(Arg(1)), int.Parse(Arg(2)), int.Parse(Arg(3)));
    case "run-recipe": return await Tools.RunRecipeAsync(args[1..]);
    case "inspect": return Tools.Inspect(args[1..]);
    case "check-labeled": return await Tools.CheckLabeledAsync(args[1..]);
    case "harvest-glyphs": return Tools.HarvestGlyphs(args[1..]);
    case "synth": return Tools.Synth(args[1..]);
}
return await PrismControl.Testing.TestRunner.RunAsync(args, typeof(Fx).Assembly);
