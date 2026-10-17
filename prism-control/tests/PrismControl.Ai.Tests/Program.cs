// Ai module tests (engineer AI1).
//   dotnet run --project tests/PrismControl.Ai.Tests [-- --filter Name] [--exclude integration]
//   --render-previews <dir>   real frames of every AI action (Night + Day) plus index.html at real sizes
//   --write-icons <dir>       the action-list icons and default key images (plugin/imgs/actions/ai/<id>/{icon,key}.svg)
var previews = Array.IndexOf(args, "--render-previews");
if (previews >= 0)
    return await PrismControl.Ai.Tests.AiPreviews.WriteAsync(previews + 1 < args.Length ? args[previews + 1] : "previews");
var icons = Array.IndexOf(args, "--write-icons");
if (icons >= 0)
    return PrismControl.Ai.Tests.AiPreviews.WriteIcons(icons + 1 < args.Length ? args[icons + 1] : "imgs");
return await PrismControl.Testing.TestRunner.RunAsync(args, typeof(PrismControl.Ai.Tests.TestRig).Assembly);
