using PrismControl.Core.Art;

namespace PrismControl.Browser.Render;

/// <summary>
/// The browser actions' glyphs in Prism Control's icon family (24-unit grid, 1.5 hairline, round caps and joins, live area
/// about 3–21; accents and glass facets take the domain hue). Generic shapes only: no browser, site or brand logo.
/// The action list icons, default key images and dial icons in plugin/imgs are generated from these same paths
/// (tests: --write-icons).
/// </summary>
public static class BrowserGlyphs
{
    private static IconPart S(string d, double o = 1) => new(IconInk.Stroke, d, o);
    private static IconPart A(string d, double o = 1) => new(IconInk.Accent, d, o);
    private static IconPart F(string d, double o = 1) => new(IconInk.Facet, d, o);
    private static IconPart Fill(string d, double o = 1) => new(IconInk.Solid, d, o);
    private static IconPart AFill(string d, double o = 1) => new(IconInk.AccentSolid, d, o);

    private const string TabBody = "M3.5 9.5H20.5V17.5A2.5 2.5 0 0 1 18 20H6A2.5 2.5 0 0 1 3.5 17.5Z";
    private const string TabEar = "M3.5 9.5V6.5A2.5 2.5 0 0 1 6 4H10.6A2 2 0 0 1 12.45 5.25L14.25 9.5";
    private const string Globe = "M4 12a8 8 0 1 0 16 0a8 8 0 1 0 -16 0Z";
    private const string Eye = "M2.75 12C5.1 7.75 8.4 5.75 12 5.75S18.9 7.75 21.25 12C18.9 16.25 15.6 18.25 12 18.25S5.1 16.25 2.75 12Z";
    private const string Pupil = "M9.25 12a2.75 2.75 0 1 0 5.5 0a2.75 2.75 0 1 0 -5.5 0Z";
    private const string MicBody = "M12 3.5A2.75 2.75 0 0 1 14.75 6.25V11.25A2.75 2.75 0 0 1 9.25 11.25V6.25A2.75 2.75 0 0 1 12 3.5Z";
    private const string CameraBody = "M5 7.25H13.5A2 2 0 0 1 15.5 9.25V14.75A2 2 0 0 1 13.5 16.75H5A2 2 0 0 1 3 14.75V9.25A2 2 0 0 1 5 7.25Z";

    public static readonly IconGlyph Tab = new("browser.tab", [F(TabEar + "Z"), S(TabBody), A(TabEar)]);
    public static readonly IconGlyph Tabs = new("browser.tabs-dial", [
        S("M6.5 6.25V5.5A2 2 0 0 1 8.5 3.5H18.5A2 2 0 0 1 20.5 5.5V13.5A2 2 0 0 1 18.5 15.5H17.75", 0.5),
        F("M3.5 10.5H17V18.5A2 2 0 0 1 15 20.5H5.5A2 2 0 0 1 3.5 18.5Z"),
        S("M3.5 10.5H17V18.5A2 2 0 0 1 15 20.5H5.5A2 2 0 0 1 3.5 18.5Z"),
        A("M3.5 10.5V8.75A2 2 0 0 1 5.5 6.75H9.25A1.75 1.75 0 0 1 10.85 7.8L12 10.5"),
    ]);
    public static readonly IconGlyph Media = new("browser.media", [
        S("M5.5 3.5H18.5A2 2 0 0 1 20.5 5.5V14.5A2 2 0 0 1 18.5 16.5H5.5A2 2 0 0 1 3.5 14.5V5.5A2 2 0 0 1 5.5 3.5Z"),
        F("M10 6.75V13.25L15 10Z"), A("M10 6.75V13.25L15 10Z"),
        S("M3.5 20H20.5", 0.45), A("M3.5 20H12.5"), AFill("M11 20a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0 -3 0Z"),
    ]);
    public static readonly IconGlyph Scrub = new("browser.scrub", [
        S("M3 15.5H21", 0.45), A("M3 15.5H13.5"), AFill("M11.5 15.5a2 2 0 1 0 4 0a2 2 0 1 0 -4 0Z"),
        F("M8.5 4.5V11L13.75 7.75Z"), S("M8.5 4.5V11L13.75 7.75Z"),
        S("M3 19.5H5M19 19.5H21", 0.55),
    ]);
    public static readonly IconGlyph Speed = new("browser.speed", [
        S("M4.6 17.9A8.5 8.5 0 1 1 19.4 17.9"),
        S("M7.05 8.05L7.9 8.9M12 5.5V6.75M16.95 8.05L16.1 8.9", 0.55),
        A("M12 13.5L16.25 9.25"), AFill("M10.5 13.5a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0 -3 0Z"),
    ]);
    public static readonly IconGlyph Page = new("browser.page", [
        F("M6 3.5H14.25L18 7.25V20.5H6Z"), S("M6 3.5H14.25L18 7.25V20.5H6Z"), S("M14.25 3.5V7.25H18", 0.55),
        A("M12 10V17.5M9.75 12.25L12 10L14.25 12.25M9.75 15.25L12 17.5L14.25 15.25"),
    ]);
    public static readonly IconGlyph Download = new("browser.download", [
        A("M12 3.5V14"), A("M7.75 9.75L12 14L16.25 9.75"),
        S("M4 15V18A2.5 2.5 0 0 0 6.5 20.5H17.5A2.5 2.5 0 0 0 20 18V15"),
    ]);
    public static readonly IconGlyph DownloadDone = new("browser.download-done", [
        A("M7 12.25L10.5 15.75L17 8.5"),
        S("M4 15V18A2.5 2.5 0 0 0 6.5 20.5H17.5A2.5 2.5 0 0 0 20 18V15", 0.55),
    ]);
    public static readonly IconGlyph Site = new("browser.site", [
        F(Globe), S(Globe), S("M12 4C9.4 6.6 9.4 17.4 12 20C14.6 17.4 14.6 6.6 12 4Z", 0.6), S("M4 12H20", 0.6),
        AFill("M16.25 5.25a3 3 0 1 0 6 0a3 3 0 1 0 -6 0Z"),
    ]);
    public static readonly IconGlyph GlobeGlyph = new("browser.globe", [
        F(Globe), S(Globe), S("M12 4C9.4 6.6 9.4 17.4 12 20C14.6 17.4 14.6 6.6 12 4Z", 0.6), S("M4 12H20", 0.6),
    ]);
    public static readonly IconGlyph Back = new("browser.back", [S("M5.5 12H19.5", 0.55), A("M11 6.5L5.5 12L11 17.5")]);
    public static readonly IconGlyph Forward = new("browser.forward", [S("M4.5 12H18.5", 0.55), A("M13 6.5L18.5 12L13 17.5")]);
    public static readonly IconGlyph Reload = new("browser.reload", [S("M19 12A7 7 0 1 1 16.95 7.05"), A("M17.5 3.5V7.5H13.5")]);
    public static readonly IconGlyph Nav = new("browser.nav", [A("M9.5 7L4.5 12L9.5 17"), A("M14.5 7L19.5 12L14.5 17"), S("M10.75 12H13.25", 0.55)]);
    public static readonly IconGlyph Reopen = new("browser.reopen", [
        F(TabEar + "Z", 0.8), S(TabBody, 0.55), S(TabEar, 0.55),
        A("M8.5 15A3.5 3.5 0 1 0 9.55 12.5"), A("M8.75 10.75V12.75H10.75"),
    ]);
    public static readonly IconGlyph Group = new("browser.group", [
        S("M4 5.5H13.5M4 12H13.5M4 18.5H13.5"),
        A("M17.25 4.5H19.5V19.5H17.25"), F("M17.25 4.5H19.5V19.5H17.25Z"),
    ]);
    public static readonly IconGlyph Split = new("browser.split", [
        F("M5.5 4.5H12V19.5H5.5A2 2 0 0 1 3.5 17.5V6.5A2 2 0 0 1 5.5 4.5Z"),
        S("M5.5 4.5H18.5A2 2 0 0 1 20.5 6.5V17.5A2 2 0 0 1 18.5 19.5H5.5A2 2 0 0 1 3.5 17.5V6.5A2 2 0 0 1 5.5 4.5Z"),
        A("M12 4.5V19.5"),
    ]);
    public static readonly IconGlyph Privacy = new("browser.privacy", [F(Eye), S(Eye), A(Pupil)]);
    public static readonly IconGlyph PrivacyDomain = new("browser.privacy-domain", [F(Eye, 0.6), S(Eye), A("M9.25 12H14.75")]);
    public static readonly IconGlyph PrivacyHidden = new("browser.privacy-hidden", [S(Eye, 0.55), A("M4.5 19.5L19.5 4.5")]);
    public static readonly IconGlyph Panic = new("browser.panic", [
        F("M12 3.5L19.5 6.5V11.5C19.5 16 16.5 19.25 12 20.75C7.5 19.25 4.5 16 4.5 11.5V6.5Z"),
        S("M12 3.5L19.5 6.5V11.5C19.5 16 16.5 19.25 12 20.75C7.5 19.25 4.5 16 4.5 11.5V6.5Z"),
        A("M12 8V12.75"), AFill("M11 15.75a1 1 0 1 0 2 0a1 1 0 1 0 -2 0Z"),
    ]);
    public static readonly IconGlyph Mic = new("browser.mic", [F(MicBody), S(MicBody), S("M6.5 11A5.5 5.5 0 0 0 17.5 11"), A("M12 16.5V20.5M9.25 20.5H14.75")]);
    public static readonly IconGlyph MicOff = new("browser.mic-off", [S(MicBody, 0.55), S("M6.5 11A5.5 5.5 0 0 0 17.5 11", 0.55), S("M12 16.5V20.5", 0.55), A("M4.5 4.5L19.5 19.5")]);
    public static readonly IconGlyph Camera = new("browser.camera", [F(CameraBody), S(CameraBody), A("M15.5 10.75L20.5 8V16L15.5 13.25")]);
    public static readonly IconGlyph CameraOff = new("browser.camera-off", [S(CameraBody, 0.55), S("M15.5 10.75L20.5 8V16L15.5 13.25", 0.55), A("M4.5 4.5L19.5 19.5")]);
    public static readonly IconGlyph HangUp = new("browser.hangup", [
        F("M3 13.25C7.5 8.75 16.5 8.75 21 13.25L19.25 15.75L15.75 14.25V12.25C13.25 11.5 10.75 11.5 8.25 12.25V14.25L4.75 15.75Z"),
        A("M3 13.25C7.5 8.75 16.5 8.75 21 13.25L19.25 15.75L15.75 14.25V12.25C13.25 11.5 10.75 11.5 8.25 12.25V14.25L4.75 15.75Z"),
    ]);
    public static readonly IconGlyph Meet = new("browser.meet", [
        F(MicBody), S(MicBody), S("M6.5 11A5.5 5.5 0 0 0 17.5 11"), A("M12 16.5V20.5M9.25 20.5H14.75"),
    ]);
    public static readonly IconGlyph Preview = new("browser.preview", [
        S("M5 4.5H19A1.5 1.5 0 0 1 20.5 6V15A1.5 1.5 0 0 1 19 16.5H5A1.5 1.5 0 0 1 3.5 15V6A1.5 1.5 0 0 1 5 4.5Z"),
        F("M6.5 13.5L10 9.75L12.5 12.25L14.5 10.25L17.5 13.5Z"), A("M6.5 13.5L10 9.75L12.5 12.25L14.5 10.25L17.5 13.5"),
        S("M9 20H15M12 16.5V20", 0.55),
    ]);
    public static readonly IconGlyph Plug = new("browser.connect", [
        S("M8.5 3.5V7.5M15.5 3.5V7.5"), F("M6.5 7.5H17.5V11A5.5 5.5 0 0 1 6.5 11Z"), S("M6.5 7.5H17.5V11A5.5 5.5 0 0 1 6.5 11Z"),
        A("M12 16.5V20.5"),
    ]);
    public static readonly IconGlyph Lock = new("browser.permission", [
        S("M6.5 10.5H17.5A1.5 1.5 0 0 1 19 12V18.5A1.5 1.5 0 0 1 17.5 20H6.5A1.5 1.5 0 0 1 5 18.5V12A1.5 1.5 0 0 1 6.5 10.5Z"),
        A("M8.5 10.5V7.5A3.5 3.5 0 0 1 15.5 7.5"), AFill("M11 15.25a1 1 0 1 0 2 0a1 1 0 1 0 -2 0Z"),
    ]);
    public static readonly IconGlyph Shield = new("browser.safe-mode", [
        S("M12 3.5L19.5 6.5V11.5C19.5 16 16.5 19.25 12 20.75C7.5 19.25 4.5 16 4.5 11.5V6.5Z"),
        A("M8.75 12L11 14.25L15.5 9.75"),
    ]);
    public static readonly IconGlyph Speaker = new("browser.speaker", [
        Fill("M4.5 9.25H7.25L11.5 5.5V18.5L7.25 14.75H4.5A1 1 0 0 1 3.5 13.75V10.25A1 1 0 0 1 4.5 9.25Z"),
        S("M14.75 9A4.25 4.25 0 0 1 14.75 15M17.25 6.5A7.75 7.75 0 0 1 17.25 17.5"),
    ]);
    public static readonly IconGlyph SpeakerMuted = new("browser.speaker-muted", [
        Fill("M4.5 9.25H7.25L11.5 5.5V18.5L7.25 14.75H4.5A1 1 0 0 1 3.5 13.75V10.25A1 1 0 0 1 4.5 9.25Z"),
        A("M15 9.5L20 14.5M20 9.5L15 14.5"),
    ]);
    public static readonly IconGlyph Undo = new("browser.undo", [A("M8.5 4.5L4.5 8.5L8.5 12.5"), S("M4.5 8.5H14A5.5 5.5 0 0 1 14 19.5H8")]);
    public static readonly IconGlyph Pip = new("browser.pip", [
        S("M5 4.5H19A1.5 1.5 0 0 1 20.5 6V18A1.5 1.5 0 0 1 19 19.5H5A1.5 1.5 0 0 1 3.5 18V6A1.5 1.5 0 0 1 5 4.5Z"),
        F("M12.5 12H18V16.5H12.5Z"), A("M12.5 12H18V16.5H12.5Z"),
    ]);

    public static IEnumerable<IconGlyph> All =>
    [
        Tab, Tabs, Media, Scrub, Speed, Page, Download, DownloadDone, Site, GlobeGlyph, Back, Forward, Reload, Nav, Reopen, Group, Split,
        Privacy, PrivacyDomain, PrivacyHidden, Panic, Mic, MicOff, Camera, CameraOff, HangUp, Meet, Preview, Plug, Lock, Shield, Speaker,
        SpeakerMuted, Undo, Pip,
    ];
}
