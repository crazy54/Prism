// Smart Deck engine tests (SD1) and the one-profile setup, AI preferences and providers (SD2).
//   dotnet run --project tests/PrismControl.Smart.Tests [-- --filter Name] [--exclude integration]
//   --render-previews <dir>   generated decks (Galleon, Stream Deck +, XL) for Planet Coaster 2, Chrome, VS Code and
//                             Windows Terminal, Night and Day, plus index.html at real sizes
//   --write-icons <dir>       the default key images of the two actions (plugin/imgs/actions/smart)
//   --write-profiles <dir> [--version x.y.z.w]
//                             the bundled "Prism Smart · <device>" profiles + profiles.manifest.json (the manifest's
//                             Profiles entries) for the packing step (src/PrismControl.Smart/plugin/profiles)
//   --render-profiles <dir>   the generated profile layouts (every device, default pins + a custom one) as index.html
var icons = Array.IndexOf(args, "--write-icons");
if (icons >= 0)
    return PrismControl.Smart.Tests.SmartPreviews.WriteIcons(icons + 1 < args.Length ? args[icons + 1] : "imgs");
var previews = Array.IndexOf(args, "--render-previews");
if (previews >= 0)
    return await PrismControl.Smart.Tests.SmartPreviews.WriteAsync(previews + 1 < args.Length ? args[previews + 1] : "previews");
var profiles = Array.IndexOf(args, "--write-profiles");
if (profiles >= 0)
{
    var v = Array.IndexOf(args, "--version");
    var files = PrismControl.Smart.Profiles.BundledProfiles.Write(profiles + 1 < args.Length ? args[profiles + 1] : "profiles", v >= 0 && v + 1 < args.Length ? args[v + 1] : null);
    foreach (var f in files) Console.WriteLine(f);
    return 0;
}
var layouts = Array.IndexOf(args, "--render-profiles");
if (layouts >= 0)
    return PrismControl.Smart.Tests.ProfilePreviews.Write(layouts + 1 < args.Length ? args[layouts + 1] : "profile-previews");
return await PrismControl.Testing.TestRunner.RunAsync(args, typeof(PrismControl.Smart.Tests.Rig).Assembly);
