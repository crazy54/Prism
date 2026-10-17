using PrismControl.Testing;
using PrismControl.Tests;

if (args.Length >= 2 && args[0] == "--render-previews")
    return Previews.Write(args[1]);
return await TestRunner.RunAsync(args, typeof(Previews).Assembly);
