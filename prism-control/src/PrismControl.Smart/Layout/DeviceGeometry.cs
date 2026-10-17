using PrismControl.Core.Devices;

namespace PrismControl.Smart.Layout;

/// <summary>A key position: Stream Deck coordinates (column, row).</summary>
public readonly record struct KeySlot(int X, int Y) : IComparable<KeySlot>
{
    /// <summary>Reading order: row by row, left to right.</summary>
    public int CompareTo(KeySlot o) => Y != o.Y ? Y.CompareTo(o.Y) : X.CompareTo(o.X);
    public override string ToString() => $"{X},{Y}";
}

/// <summary>An encoder slot: Galleon dial (0 left, 1 right) + layer (0 top, 1 bottom); Stream Deck + dial 0–3, layer 0.</summary>
public readonly record struct DialSlot(int Dial, int Layer)
{
    public override string ToString() => Layer == 0 ? $"dial {Dial}" : $"dial {Dial} layer {Layer}";
}

/// <summary>
/// What the generator lays out on one device kind. Galleon 100 SD: 3×4 keys + 2 dials × 2 layers (each with a screen
/// widget TL/BL/TR/BR, no touch, no dial hold). Stream Deck +: 4×2 + 4 dials with strip segments. XL 8×4, MK.2 5×3,
/// Mini 3×2, Neo 4×2 (its info bar is drawn by the app, not plugins). Unknown devices use the reported grid.
/// </summary>
public sealed record DeviceGeometry(string Kind, string Name, int Columns, int Rows, int Dials, int Layers, bool HasTouch, bool HasInfoBar, int KeyPixels)
{
    public static readonly DeviceGeometry Galleon = new("galleon-100-sd", "Galleon 100 SD", 3, 4, 2, 2, false, false, 160);
    public static readonly DeviceGeometry Plus = new("stream-deck-plus", "Stream Deck +", 4, 2, 4, 1, true, false, 120);
    public static readonly DeviceGeometry XL = new("stream-deck-xl", "Stream Deck XL", 8, 4, 0, 1, false, false, 96);
    public static readonly DeviceGeometry MK2 = new("stream-deck", "Stream Deck MK.2", 5, 3, 0, 1, false, false, 72);
    public static readonly DeviceGeometry Mini = new("stream-deck-mini", "Stream Deck Mini", 3, 2, 0, 1, false, false, 80);
    public static readonly DeviceGeometry Neo = new("stream-deck-neo", "Stream Deck Neo", 4, 2, 0, 1, false, true, 96);

    public static IReadOnlyList<DeviceGeometry> Known { get; } = [Galleon, Plus, XL, MK2, Mini, Neo];

    public int KeyCount => Columns * Rows;
    public int EncoderSlots => Dials * Layers;
    public bool HasScreens => EncoderSlots > 0;

    /// <summary>Every key in reading order.</summary>
    public IReadOnlyList<KeySlot> AllKeys()
    {
        var list = new List<KeySlot>(KeyCount);
        for (var y = 0; y < Rows; y++)
            for (var x = 0; x < Columns; x++) list.Add(new KeySlot(x, y));
        return list;
    }

    /// <summary>Every encoder slot, layer 0 first (the layer the user turns most), then left to right.</summary>
    public IReadOnlyList<DialSlot> AllDials()
    {
        var list = new List<DialSlot>(EncoderSlots);
        for (var l = 0; l < Layers; l++)
            for (var d = 0; d < Dials; d++) list.Add(new DialSlot(d, l));
        return list;
    }

    public bool Contains(KeySlot k) => k.X >= 0 && k.X < Columns && k.Y >= 0 && k.Y < Rows;
    public bool Contains(DialSlot d) => d.Dial >= 0 && d.Dial < Dials && d.Layer >= 0 && d.Layer < Layers;

    /// <summary>The pack's screen-slot name for an encoder slot (Galleon TL/BL/TR/BR, Stream Deck + "0".."3").</summary>
    public string? ScreenSlot(DialSlot d)
    {
        if (Kind == Galleon.Kind) return (d.Dial, d.Layer) switch { (0, 0) => "TL", (0, _) => "BL", (_, 0) => "TR", _ => "BR" };
        return Dials > 0 ? d.Dial.ToString(System.Globalization.CultureInfo.InvariantCulture) : null;
    }

    /// <summary>The dial a "left"/"right"/index preference names.</summary>
    public int? DialFor(string preference) => preference.ToLowerInvariant() switch
    {
        "left" => Dials > 0 ? 0 : null,
        "right" => Dials > 0 ? Dials - 1 : null,
        var s when int.TryParse(s, out var i) && i >= 0 && i < Dials => i,
        _ => null,
    };

    /// <summary>Encoder coordinates → slot (Galleon: column = dial, row = layer; Plus: column = dial).</summary>
    public DialSlot DialFromCoordinates(Coordinates c) => Layers > 1 ? new DialSlot(c.Column, c.Row) : new DialSlot(c.Column, 0);

    public static DeviceGeometry For(DeviceInfo device) => device.Type switch
    {
        DeviceType.Galleon100SD => Galleon,
        DeviceType.Plus => Plus,
        DeviceType.PlusXL => new("stream-deck-plus-xl", device.Name, Math.Max(1, device.Columns), Math.Max(1, device.Rows), 6, 1, true, false, 112),
        DeviceType.XL => XL,
        DeviceType.StreamDeck when device.Columns == 5 && device.Rows == 3 => MK2,
        DeviceType.Mini => Mini,
        DeviceType.Neo => Neo,
        _ => new("generic-" + Math.Max(0, device.Columns) + "x" + Math.Max(0, device.Rows), device.Name, Math.Max(0, device.Columns), Math.Max(0, device.Rows),
            device.Capabilities.PhysicalDials, device.Capabilities.DialLayers, device.Capabilities.HasTouchStrip, false, device.Capabilities.KeyPixels),
    };
}
