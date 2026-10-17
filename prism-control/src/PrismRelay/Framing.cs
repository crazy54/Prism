using System.Buffers.Binary;

namespace PrismRelay;

internal enum FrameKind { Frame, Oversize, Eof }

/// <summary>One frame read from a stream: the body, or "too big (drained and dropped)", or end of stream.</summary>
internal readonly record struct FrameRead(FrameKind Kind, byte[] Body, uint Length)
{
    public static readonly FrameRead Eof = new(FrameKind.Eof, [], 0);
}

/// <summary>u32 little-endian length + body: the native-messaging framing, used on stdio and on the pipe.</summary>
internal static class Framing
{
    /// <summary>Chrome's host → browser cap (a message larger than this makes Chrome drop the port).</summary>
    public const int BrowserCap = 1024 * 1024;
    /// <summary>Anything above this is not a frame at all: the stream is treated as broken.</summary>
    public const uint HardCap = 64u * 1024 * 1024;

    /// <summary>
    /// Reads one frame. Bodies up to <paramref name="softCap"/> are returned; bodies up to <see cref="HardCap"/> are
    /// drained and reported as <see cref="FrameKind.Oversize"/> (dropped); larger ones throw (a desynchronized stream).
    /// End of stream, even mid-frame, is <see cref="FrameKind.Eof"/>.
    /// </summary>
    public static async Task<FrameRead> ReadAsync(Stream s, int softCap, CancellationToken ct)
    {
        var header = new byte[4];
        if (!await FillAsync(s, header, ct).ConfigureAwait(false)) return FrameRead.Eof;
        var length = BinaryPrimitives.ReadUInt32LittleEndian(header);
        if (length > HardCap) throw new InvalidDataException("Frame length beyond the hard cap: the stream is desynchronized.");
        if (length > (uint)softCap)
        {
            var scratch = new byte[64 * 1024];
            var left = (long)length;
            while (left > 0)
            {
                var n = await s.ReadAsync(scratch.AsMemory(0, (int)Math.Min(scratch.Length, left)), ct).ConfigureAwait(false);
                if (n == 0) return FrameRead.Eof;
                left -= n;
            }
            return new FrameRead(FrameKind.Oversize, [], length);
        }
        var body = new byte[length];
        if (!await FillAsync(s, body, ct).ConfigureAwait(false)) return FrameRead.Eof;
        return new FrameRead(FrameKind.Frame, body, length);
    }

    public static byte[] Encode(ReadOnlySpan<byte> body)
    {
        var frame = new byte[4 + body.Length];
        BinaryPrimitives.WriteUInt32LittleEndian(frame, (uint)body.Length);
        body.CopyTo(frame.AsSpan(4));
        return frame;
    }

    private static async Task<bool> FillAsync(Stream s, Memory<byte> buffer, CancellationToken ct)
    {
        while (buffer.Length > 0)
        {
            var n = await s.ReadAsync(buffer, ct).ConfigureAwait(false);
            if (n == 0) return false;
            buffer = buffer[n..];
        }
        return true;
    }
}
