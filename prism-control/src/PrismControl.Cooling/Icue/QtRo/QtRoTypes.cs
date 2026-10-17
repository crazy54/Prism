using System.Globalization;
using System.Text;

namespace PrismControl.Cooling.Icue.QtRo;

internal sealed record QEnumDef(string Name, bool IsFlag, bool IsScoped, uint Size, IReadOnlyList<(string Key, int Value)> Keys);
internal sealed record QGadgetDef(string ClassName, IReadOnlyList<(string Name, string Type)> Props, IReadOnlyList<QEnumDef> Enums);
internal sealed record QSignalDef(string Signature, IReadOnlyList<string> ParamNames);
internal sealed record QMethodDef(string Signature, string ReturnType, IReadOnlyList<string> ParamNames);
internal sealed record QPropDef(string Name, string Type, string Notify);
internal sealed record QtRoObjectInfo(string Name, string TypeName, string Signature);

/// <summary>A dynamic replica's class definition (from InitDynamicPacket) plus its initial property values.</summary>
internal sealed class QClassDef
{
    public string TypeName { get; init; } = "";
    public List<QEnumDef> Enums { get; } = [];
    public List<QGadgetDef> Gadgets { get; } = [];
    public List<QSignalDef> Signals { get; } = [];
    public List<QMethodDef> Methods { get; } = [];
    public List<QPropDef> Props { get; } = [];
    public List<object?> PropValues { get; } = [];

    /// <summary>The index QtRO expects in an InvokePacket (position in the method list; signals are not counted).</summary>
    public int MethodIndex(string signature) => Methods.FindIndex(m => m.Signature == signature);

    public int SignalIndex(string signature) => Signals.FindIndex(s => s.Signature == signature);
}

/// <summary>A decoded POD / gadget (fields in definition order).</summary>
internal sealed class QGadget
{
    public string Type { get; init; } = "";
    public List<(string Name, object? Value)> Fields { get; } = [];

    public object? this[string name] => Fields.FirstOrDefault(f => f.Name == name).Value;

    public override string ToString() => Type + "{" + string.Join(", ", Fields.Select(f => f.Name + "=" + f.Value)) + "}";
}

/// <summary>
/// Decodes class definitions and QVariants from the QtRO wire. Gadget/enum definitions learned from a definition
/// are remembered so later values of those types decode. Not thread-safe: used only by the client's read loop.
/// Unlike the research probe there is no "guess the POD field count" fallback: an unknown type is a FormatException
/// (none of the allowlisted calls return one).
/// </summary>
internal sealed class QVariantDecoder
{
    private readonly Dictionary<string, QGadgetDef> _gadgets = new(StringComparer.Ordinal);
    private readonly Dictionary<string, QEnumDef> _enums = new(StringComparer.Ordinal);
    private int _depth;

    public QClassDef ParseDefinition(QReader r)
    {
        var d = new QClassDef { TypeName = r.QString() ?? "" };
        var ne = r.Count();
        for (var i = 0; i < ne; i++)
        {
            var e = ReadEnum(r);
            d.Enums.Add(e);
            _enums[e.Name] = e;
        }
        ParseGadgets(r, d);
        var ns = r.Count();
        for (var i = 0; i < ns; i++) d.Signals.Add(new QSignalDef(r.QBytes(), r.QByteArrayList()));
        var nm = r.Count();
        for (var i = 0; i < nm; i++) d.Methods.Add(new QMethodDef(r.QBytes(), r.QBytes(), r.QByteArrayList()));
        var np = r.Count();
        for (var i = 0; i < np; i++) d.Props.Add(new QPropDef(r.QBytes(), r.QBytes(), r.QBytes()));
        return d;
    }

    private QEnumDef ReadEnum(QReader r)
    {
        var name = r.QBytes();
        var isFlag = r.Bool();
        var isScoped = r.Bool();
        var size = r.U32();
        var keyCount = r.Count(4096);
        var keys = new List<(string, int)>(keyCount);
        for (var k = 0; k < keyCount; k++) keys.Add((r.QBytes(), r.S32()));
        return new QEnumDef(name, isFlag, isScoped, size, keys);
    }

    private void ParseGadgets(QReader r, QClassDef? d)
    {
        var nq = r.Count();
        for (var i = 0; i < nq; i++) r.QBytes(); // Qt enum names (metatype registration only)
        var ng = r.Count();
        for (var i = 0; i < ng; i++)
        {
            var cls = r.QBytes();
            var np = r.Count();
            var props = new List<(string, string)>(np);
            for (var j = 0; j < np; j++) props.Add((r.QBytes(), r.QBytes()));
            var nen = r.Count();
            var ens = new List<QEnumDef>(nen);
            for (var j = 0; j < nen; j++)
            {
                var e = ReadEnum(r);
                ens.Add(e);
                _enums[cls + "::" + e.Name] = e;
                _enums[e.Name] = e;
            }
            var g = new QGadgetDef(cls, props, ens);
            d?.Gadgets.Add(g);
            _gadgets[cls] = g;
        }
    }

    public object? ReadVariant(QReader r)
    {
        if (++_depth > 32) throw new FormatException("QVariant nesting too deep.");
        try
        {
            var typeId = r.U32();
            r.S8(); // isNull: the value is still streamed
            if (typeId == 0) return null;
            var userName = typeId == QMetaTypeId.User ? r.QBytes() : null;
            return ReadValue(r, typeId, userName);
        }
        finally { _depth--; }
    }

    private object? ReadValue(QReader r, uint typeId, string? userName)
    {
        switch (typeId)
        {
            case QMetaTypeId.Bool: return r.Bool();
            case QMetaTypeId.Int: return r.S32();
            case QMetaTypeId.UInt: return r.U32();
            case QMetaTypeId.LongLong or QMetaTypeId.Long: return r.S64();
            case QMetaTypeId.ULongLong or QMetaTypeId.ULong: return r.U64();
            case QMetaTypeId.Double or QMetaTypeId.Float: return r.F64(); // float is streamed as double (DoublePrecision)
            case QMetaTypeId.QChar: return (char)r.U16();
            case QMetaTypeId.QVariantMap or QMetaTypeId.QVariantHash:
            {
                var n = r.Count();
                var m = new Dictionary<string, object?>(n, StringComparer.Ordinal);
                for (var i = 0; i < n; i++) { var k = r.QString() ?? ""; m[k] = ReadVariant(r); }
                return m;
            }
            case QMetaTypeId.QVariantList:
            {
                var n = r.Count();
                var l = new List<object?>(n);
                for (var i = 0; i < n; i++) l.Add(ReadVariant(r));
                return l;
            }
            case QMetaTypeId.QString: return r.QString();
            case QMetaTypeId.QStringList:
            {
                var n = r.Count();
                var l = new List<string?>(n);
                for (var i = 0; i < n; i++) l.Add(r.QString());
                return l;
            }
            case QMetaTypeId.QByteArray: { var b = r.QByteArray(); return b is null ? null : Encoding.Latin1.GetString(b); }
            case QMetaTypeId.QDate: return r.S64();
            case QMetaTypeId.QTime: return r.U32();
            case QMetaTypeId.QUrl: return r.QString();
            case QMetaTypeId.QUuid: return new Guid(r.Raw(16), bigEndian: true).ToString();
            case QMetaTypeId.Short: return r.S16();
            case QMetaTypeId.UShort: return r.U16();
            case QMetaTypeId.Char or QMetaTypeId.SChar: return r.S8();
            case QMetaTypeId.UChar: return r.U8();
            case QMetaTypeId.QVariant: return ReadVariant(r);
            case QMetaTypeId.User: return ReadUser(r, userName ?? "");
            default: throw new FormatException("Unsupported QVariant type id " + typeId.ToString(CultureInfo.InvariantCulture) + ".");
        }
    }

    private object? ReadUser(QReader r, string type)
    {
        if (type == "QRemoteObjectPackets::QSQ_")
        {
            // A sequential container: type names, then a nested big-endian stream with the element type and values.
            r.QBytes();
            r.QBytes();
            var values = r.QByteArray() ?? [];
            var inner = new QReader(values, bigEndian: true);
            var elementType = inner.QBytes();
            var count = inner.Count();
            var list = new List<object?>(count);
            for (var i = 0; i < count; i++) list.Add(LoadRaw(inner, elementType));
            return list;
        }
        if (type == "QRemoteObjectPackets::QAS_")
        {
            r.QBytes();
            r.QBytes();
            r.QBytes();
            var values = r.QByteArray() ?? [];
            var inner = new QReader(values, bigEndian: true);
            var keyType = inner.QBytes();
            var valueType = inner.QBytes();
            var count = inner.Count();
            var map = new List<KeyValuePair<object?, object?>>(count);
            for (var i = 0; i < count; i++) map.Add(new(LoadRaw(inner, keyType), LoadRaw(inner, valueType)));
            return map;
        }
        if (type == "QRemoteObjectPackets::QRO_")
        {
            r.QString();
            r.QString();
            var kind = r.U8();
            var classDef = r.QByteArray() ?? [];
            var isNull = r.Bool();
            var parameters = isNull ? null : r.QByteArray();
            if (kind == 2 /* gadget */ && classDef.Length > 0)
            {
                ParseGadgets(new QReader(classDef, bigEndian: true), null);
                if (parameters is not null) return ReadVariant(new QReader(parameters, bigEndian: true));
            }
            return null;
        }
        return LoadRaw(r, type);
    }

    /// <summary>Loads a value of a named type without a QVariant header (QMetaType::load semantics).</summary>
    private object? LoadRaw(QReader r, string type)
    {
        switch (type)
        {
            case "bool": return r.Bool();
            case "int" or "qint32": return r.S32();
            case "uint" or "quint32": return r.U32();
            case "qlonglong" or "qint64" or "long": return r.S64();
            case "qulonglong" or "quint64" or "ulong": return r.U64();
            case "double" or "float" or "qreal": return r.F64();
            case "short" or "qint16": return r.S16();
            case "ushort" or "quint16": return r.U16();
            case "char" or "qint8" or "signed char": return r.S8();
            case "uchar" or "quint8": return r.U8();
            case "QString": return r.QString();
            case "QByteArray": { var b = r.QByteArray(); return b is null ? null : Encoding.Latin1.GetString(b); }
            case "QStringList": return ReadValue(r, QMetaTypeId.QStringList, null);
            case "QVariant": return ReadVariant(r);
            case "QVariantList": return ReadValue(r, QMetaTypeId.QVariantList, null);
            case "QVariantMap": return ReadValue(r, QMetaTypeId.QVariantMap, null);
        }
        if (_gadgets.TryGetValue(type, out var g))
        {
            // repc PODs stream every property as a QVariant (QtRemoteObjects::copyStoredProperties).
            var o = new QGadget { Type = type };
            foreach (var (pn, _) in g.Props) o.Fields.Add((pn, ReadVariant(r)));
            return o;
        }
        if (_enums.TryGetValue(type, out var e) || (type.Contains("::", StringComparison.Ordinal) && _enums.TryGetValue(type[(type.LastIndexOf(':') + 1)..], out e)))
            return e.Size switch { 1 => (int)r.S8(), 2 => r.S16(), _ => r.S32() };
        throw new FormatException("Unknown QtRO value type '" + type + "'.");
    }
}
