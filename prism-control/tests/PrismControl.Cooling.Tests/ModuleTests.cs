using PrismControl.Testing;

namespace PrismControl.Cooling.Tests;

public class ModuleTests
{
    [Test]
    public void Module_is_named_cooling() => Assert.Equal("cooling", new CoolingModule().Name);
}
