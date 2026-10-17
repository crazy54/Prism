using System.Buffers.Binary;
using System.Text;

namespace PrismControl.Cooling.Icue.QtRo;

// Minimal QDataStream (Qt 6) reader/writer for the Qt Remote Objects "QtRO 2.0" wire format, ported from the
// read-only research probe (research/icue-probe/CoolingProbe). Outer QtRO packets are LITTLE-endian; buffers
// nested inside QSQ_/QAS_/QRO_ values are fresh QDataStreams and therefore BIG-endian (Qt's default).

/// <summary>Reads Qt-serialized values from a byte range.</summary>
internal sealed class QReader
{
    private readonly byte[] _b;
    private int _p;
    private readonly int _end;

    public QReader(byte[] b, int offset, int count, bool bigEndian)
    {
        _b = b;
        _p = offset;
        _end = offset + count;
        BigEndian = bigEndian;
    }

    public QReader(byte[] b, bool bigEndian) : this(b, 0, b.Length, bigEndian) { }

    public bool BigEndian { get; }
    public int Pos { get => _p; set => _p = value; }
    public int Remaining => _end - _p;
    public bool AtEnd => _p >= _end;

    private ReadOnlySpan<byte> Take(int n)
    {
        // n > _end - _p, not _p + n > _end: a length near int.MaxValue from the wire must not overflow past the check.
        if (n < 0 || n > _end - _p) throw new FormatException($"QDataStream read past the end (want {n} at {_p}, end {_end}).");
        var s = new ReadOnlySpan<byte>(_b, _p, n);
        _p += n;
        return s;
    }

    public byte[] Raw(int n) => Take(n).ToArray();
    public byte U8() => Take(1)[0];
    public sbyte S8() => (sbyte)U8();
    public bool Bool() => U8() != 0;
    public ushort U16() { var s = Take(2); return BigEndian ? BinaryPrimitives.ReadUInt16BigEndian(s) : BinaryPrimitives.ReadUInt16LittleEndian(s); }
    public short S16() => (short)U16();
    public uint U32() { var s = Take(4); return BigEndian ? BinaryPrimitives.ReadUInt32BigEndian(s) : BinaryPrimitives.ReadUInt32LittleEndian(s); }
    public int S32() => (int)U32();
    public ulong U64() { var s = Take(8); return BigEndian ? BinaryPrimitives.ReadUInt64BigEndian(s) : BinaryPrimitives.ReadUInt64LittleEndian(s); }
    public long S64() => (long)U64();
    public double F64() => BitConverter.Int64BitsToDouble((long)U64());

    /// <summary>A count prefix with a sanity cap (a corrupt stream must not allocate gigabytes).</summary>
    public int Count(int max = 1 << 16)
    {
        var n = U32();
        if (n > max) throw new FormatException($"QDataStream count {n} exceeds {max}.");
        return (int)n;
    }

    /// <summary>QString: quint32 byte length (0xFFFFFFFF = null) + UTF-16 in the stream's byte order.</summary>
    public string? QString()
    {
        var n = U32();
        if (n == 0xFFFFFFFF) return null;
        if ((n & 1) != 0) throw new FormatException("Odd QString byte length.");
        var s = Take((int)n);
        return BigEndian ? Encoding.BigEndianUnicode.GetString(s) : Encoding.Unicode.GetString(s);
    }

    /// <summary>QByteArray and <c>const char*</c> share the framing: quint32 length (0xFFFFFFFF = null) + bytes.</summary>
    public byte[]? QByteArray()
    {
        var n = U32();
        if (n == 0xFFFFFFFF) return null;
        return Take((int)n).ToArray();
    }

    /// <summary>QByteArray or <c>const char*</c> (which carries a trailing NUL) as Latin-1 text.</summary>
    public string QBytes()
    {
        var b = QByteArray();
        if (b is null) return "";
        var len = b.Length;
        if (len > 0 && b[len - 1] == 0) len--;
        return Encoding.Latin1.GetString(b, 0, len);
    }

    public List<string> QByteArrayList()
    {
        var n = Count(4096);
        var l = new List<string>(n);
        for (var i = 0; i < n; i++) l.Add(QBytes());
        return l;
    }
}

/// <summary>Writes Qt-serialized values (packets to the server; the test fake server uses it for replies too).</summary>
internal sealed class QWriter
{
    private readonly MemoryStream _ms = new();

    public QWriter(bool bigEndian) => BigEndian = bigEndian;

    public bool BigEndian { get; }
    public long Length => _ms.Length;

    public QWriter U8(byte v) { _ms.WriteByte(v); return this; }
    public QWriter S8(sbyte v) => U8((byte)v);
    public QWriter Bool(bool v) => U8(v ? (byte)1 : (byte)0);

    public QWriter U16(ushort v)
    {
        Span<byte> b = stackalloc byte[2];
        if (BigEndian) BinaryPrimitives.WriteUInt16BigEndian(b, v); else BinaryPrimitives.WriteUInt16LittleEndian(b, v);
        _ms.Write(b);
        return this;
    }

    public QWriter U32(uint v)
    {
        Span<byte> b = stackalloc byte[4];
        if (BigEndian) BinaryPrimitives.WriteUInt32BigEndian(b, v); else BinaryPrimitives.WriteUInt32LittleEndian(b, v);
        _ms.Write(b);
        return this;
    }

    public QWriter S32(int v) => U32((uint)v);

    public QWriter F64(double v)
    {
        Span<byte> b = stackalloc byte[8];
        var bits = (ulong)BitConverter.DoubleToInt64Bits(v);
        if (BigEndian) BinaryPrimitives.WriteUInt64BigEndian(b, bits); else BinaryPrimitives.WriteUInt64LittleEndian(b, bits);
        _ms.Write(b);
        return this;
    }

    public QWriter QString(string? s)
    {
        if (s is null) return U32(0xFFFFFFFF);
        var bytes = BigEndian ? Encoding.BigEndianUnicode.GetBytes(s) : Encoding.Unicode.GetBytes(s);
        U32((uint)bytes.Length);
        _ms.Write(bytes);
        return this;
    }

    public QWriter QByteArray(byte[]? bytes)
    {
        if (bytes is null) return U32(0xFFFFFFFF);
        U32((uint)bytes.Length);
        _ms.Write(bytes);
        return this;
    }

    /// <summary>A <c>const char*</c> type name: Latin-1 bytes plus the trailing NUL Qt writes.</summary>
    public QWriter QBytes(string s)
    {
        var bytes = Encoding.Latin1.GetBytes(s + "\0");
        return QByteArray(bytes);
    }

    public QWriter Raw(ReadOnlySpan<byte> bytes) { _ms.Write(bytes); return this; }

    // ---- QVariant (Qt 6: quint32 type id, qint8 isNull, value)

    public QWriter VariantString(string? s) => U32(QMetaTypeId.QString).S8(s is null ? (sbyte)1 : (sbyte)0).QString(s);
    public QWriter VariantBool(bool v) => U32(QMetaTypeId.Bool).S8(0).Bool(v);
    public QWriter VariantInt(int v) => U32(QMetaTypeId.Int).S8(0).S32(v);

    public QWriter VariantStringList(IReadOnlyList<string> items)
    {
        U32(QMetaTypeId.QStringList).S8(0).U32((uint)items.Count);
        foreach (var s in items) QString(s);
        return this;
    }

    public byte[] ToArray() => _ms.ToArray();
}

/// <summary>The Qt 6 QMetaType ids the client understands.</summary>
internal static class QMetaTypeId
{
    public const uint Bool = 1, Int = 2, UInt = 3, LongLong = 4, ULongLong = 5, Double = 6, QChar = 7, QVariantMap = 8,
        QVariantList = 9, QString = 10, QStringList = 11, QByteArray = 12, QDate = 14, QTime = 15, QUrl = 17, QVariantHash = 28,
        QUuid = 30, Long = 32, Short = 33, Char = 34, ULong = 35, UShort = 36, UChar = 37, Float = 38, SChar = 40, QVariant = 41,
        User = 65536;
}

/// <summary>QtRO packet ids (qremoteobjectpacket_p.h, identical in Qt 6.7 and 6.9).</summary>
internal enum QtRoPacketType : ushort
{
    Invalid = 0,
    Handshake,
    InitPacket,
    InitDynamicPacket,
    AddObject,
    RemoveObject,
    InvokePacket,
    InvokeReplyPacket,
    PropertyChangePacket,
    ObjectList,
    Ping,
    Pong,
}

/// <summary>Builds one little-endian QtRO packet: [quint32 size-of-rest][quint16 packet id][payload].</summary>
internal static class QtRoPacket
{
    public static byte[] Build(QtRoPacketType type, Action<QWriter> payload)
    {
        var w = new QWriter(bigEndian: false);
        w.U32(0).U16((ushort)type);
        payload(w);
        var a = w.ToArray();
        BinaryPrimitives.WriteUInt32LittleEndian(a, (uint)(a.Length - 4));
        return a;
    }
}
