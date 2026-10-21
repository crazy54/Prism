using PrismControl.Core.Data;
using PrismControl.Testing;

namespace PrismControl.Tests;

public class BinaryTopicTests
{
    [Test]
    public void In_process_readers_get_the_published_bytes_and_a_change_key()
    {
        var topic = new BinaryTopic("/v1/test/art", TimeSpan.Zero, TimeProvider.System);
        Assert.True(topic.Current is null, "nothing published yet");
        var pub = Assert.NotNull(topic.Claim("test"));

        byte[] first = [0x89, 0x50, 0x4e, 0x47, 1, 2, 3];
        pub.Publish(first, "image/png");
        var a = Assert.NotNull(topic.Current);
        Assert.Equal("image/png", a.Mime);
        Assert.True(a.Data.Span.SequenceEqual(first), "the bytes exactly as published");
        Assert.Equal(topic.CurrentEtag, a.Etag);

        pub.Publish([0xff, 0xd8, 0xff, 9, 9], "image/jpeg");
        var b = Assert.NotNull(topic.Current);
        Assert.Equal("image/jpeg", b.Mime);
        Assert.False(a.Etag == b.Etag, "new bytes, new change key");
    }
}
