// Terminal emulator color schemes for Prism's themes.
//
//   exportTheme('alacritty', 'prism-light')  → the file's text
//   FORMATS                                  → { id: { name, dir, file(slug), install } }
//
// Prism Night / Prism Day use the ANSI-16 schemes designed in design/tokens.json
// (TERMINAL_SCHEMES in src/themes.js). Every other Prism theme gets a scheme
// derived from its tokens (red = neg, green = pos, yellow = warn, blue = info,
// magenta = accent, …), so `exportTheme('kitty', 'primer-dark')` works too.
// Nothing here touches the filesystem or applies anything — it returns text.
// scripts/export-themes.mjs writes the checked-in files under themes/.
//
// Browser-safe (no node:*).

import { getTheme, terminalScheme, THEME_IDS } from './palettes.js';
import { toHex, mixOklab, toOklab, fromOklab } from './color.js';

const NAMES = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'];
const hx = (c) => toHex(c);
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const slugOf = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const SITE = 'https://prism.jeremyfhall.com/terminal/';

/** Shift an Oklab lightness (for derived brights). */
function lighten(c, dL) {
  const [L, a, b] = toOklab(c);
  return fromOklab([Math.max(0, Math.min(1, L + dL)), a, b]);
}

/**
 * The full scheme for a theme: { id, name, mode, background, foreground, cursor,
 * cursorText, selectionBackground, selectionForeground, ansi[16], accent, line,
 * panel, muted, dim, derived } — all '#rrggbb'.
 */
export function schemeFor(themeId = 'prism-dark') {
  const th = getTheme(themeId);
  const base = { id: th.id, name: th.name, mode: th.mode, accent: hx(th.accent), line: hx(th.line), panel: hx(th.panel), muted: hx(th.muted), dim: hx(th.dim) };
  const designed = terminalScheme(th.id);
  if (designed) {
    return { ...base, derived: false, background: designed.background, foreground: designed.foreground, cursor: designed.cursor, cursorText: designed.cursorText, selectionBackground: designed.selectionBackground, selectionForeground: designed.selectionForeground, ansi: designed.ansi.map((c) => c.toLowerCase()) };
  }
  const dark = th.mode !== 'light';
  const cyan = mixOklab(th.info, th.pos, 0.5);
  const normal = [dark ? th.panel2 : th.ink, th.neg, th.pos, th.warn, th.info, th.accent, cyan, dark ? th.muted : th.dim];
  const bright = [th.dim, ...normal.slice(1, 7).map((c) => lighten(c, dark ? 0.08 : -0.08)), dark ? th.ink : th.muted];
  return {
    ...base, derived: true,
    background: hx(th.bg), foreground: hx(th.ink), cursor: hx(th.accent), cursorText: hx(th.bg),
    selectionBackground: hx(mixOklab(th.accent, th.bg, dark ? 0.72 : 0.78)), selectionForeground: hx(th.ink),
    ansi: [...normal, ...bright].map(hx),
  };
}

const header = (s, lead, lines) => [`${lead} ${s.name} — Prism's ${s.mode === 'light' ? 'Day' : 'Night'} terminal colors (Refraction).${s.derived ? ' Derived from the theme tokens.' : ''}`, ...lines.map((l) => `${lead} ${l}`.trimEnd())].join('\n');

// ── formats ──────────────────────────────────────────────────────────────────

function windowsTerminal(s) {
  const names = ['black', 'red', 'green', 'yellow', 'blue', 'purple', 'cyan', 'white'];
  const o = { name: s.name, background: s.background, foreground: s.foreground, cursorColor: s.cursor, selectionBackground: s.selectionBackground };
  s.ansi.forEach((c, i) => { o[i < 8 ? names[i] : 'bright' + names[i - 8][0].toUpperCase() + names[i - 8].slice(1)] = c; });
  return JSON.stringify(o, null, 2) + '\n';
}

function iterm2(s) {
  const entries = {};
  s.ansi.forEach((c, i) => { entries[`Ansi ${i} Color`] = c; });
  Object.assign(entries, {
    'Background Color': s.background, 'Foreground Color': s.foreground, 'Bold Color': s.foreground,
    'Cursor Color': s.cursor, 'Cursor Text Color': s.cursorText, 'Cursor Guide Color': s.selectionBackground,
    'Selection Color': s.selectionBackground, 'Selected Text Color': s.selectionForeground,
    'Link Color': s.accent, 'Badge Color': s.accent,
  });
  const comp = (v) => String(Math.round((v / 255) * 1e6) / 1e6);
  const body = Object.keys(entries).sort().map((k) => {
    const [r, g, b] = rgb(entries[k]);
    return `\t<key>${k}</key>\n\t<dict>\n\t\t<key>Alpha Component</key>\n\t\t<real>1</real>\n\t\t<key>Blue Component</key>\n\t\t<real>${comp(b)}</real>\n\t\t<key>Color Space</key>\n\t\t<string>sRGB</string>\n\t\t<key>Green Component</key>\n\t\t<real>${comp(g)}</real>\n\t\t<key>Red Component</key>\n\t\t<real>${comp(r)}</real>\n\t</dict>`;
  }).join('\n');
  const note = header(s, '', [`iTerm2: Settings → Profiles → Colors → Color Presets… → Import…, then pick "${slugOf(s.name)}".`]).replace(/--/g, '-');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<!--\n${note}\n-->\n<plist version="1.0">\n<dict>\n${body}\n</dict>\n</plist>\n`;
}

const tomlStr = (v) => JSON.stringify(v);

function alacritty(s) {
  const tbl = (name, pairs) => `[${name}]\n${pairs.map(([k, v]) => `${k} = ${tomlStr(v)}`).join('\n')}\n`;
  return [
    header(s, '#', ['Alacritty ≥ 0.13: save as ~/.config/alacritty/themes/' + slugOf(s.name) + '.toml and add to alacritty.toml:', `  [general]`, `  import = ["~/.config/alacritty/themes/${slugOf(s.name)}.toml"]`, '(Alacritty 0.13 takes a top-level `import = [...]` instead of [general].)']) + '\n',
    tbl('colors.primary', [['background', s.background], ['foreground', s.foreground]]),
    tbl('colors.cursor', [['text', s.cursorText], ['cursor', s.cursor]]),
    tbl('colors.vi_mode_cursor', [['text', s.cursorText], ['cursor', s.cursor]]),
    tbl('colors.selection', [['text', s.selectionForeground], ['background', s.selectionBackground]]),
    tbl('colors.normal', NAMES.map((n, i) => [n, s.ansi[i]])),
    tbl('colors.bright', NAMES.map((n, i) => [n, s.ansi[i + 8]])),
  ].join('\n');
}

function kitty(s) {
  const lines = [
    '# vim:ft=kitty', `## name: ${s.name}`, '## author: Prism', '## license: MIT', `## upstream: ${SITE}`,
    `## blurb: Refraction ${s.mode === 'light' ? 'Day' : 'Night'} — Prism's terminal palette.`, '',
    header(s, '#', [`kitty: save as ~/.config/kitty/themes/${slugOf(s.name)}.conf, then \`kitten themes\` → "${s.name}",`, `or add \`include themes/${slugOf(s.name)}.conf\` to kitty.conf.`]), '',
    `foreground ${s.foreground}`, `background ${s.background}`,
    `selection_foreground ${s.selectionForeground}`, `selection_background ${s.selectionBackground}`,
    `cursor ${s.cursor}`, `cursor_text_color ${s.cursorText}`, `url_color ${s.accent}`,
    `active_border_color ${s.accent}`, `inactive_border_color ${s.line}`, `bell_border_color ${s.ansi[3]}`,
    `active_tab_foreground ${s.cursorText}`, `active_tab_background ${s.accent}`,
    `inactive_tab_foreground ${s.muted}`, `inactive_tab_background ${s.panel}`, `tab_bar_background ${s.background}`,
    `mark1_foreground ${s.background}`, `mark1_background ${s.accent}`, '',
    ...s.ansi.map((c, i) => `color${i} ${c}`),
  ];
  return lines.join('\n') + '\n';
}

function wezterm(s) {
  const arr = (a) => `[${a.map(tomlStr).join(', ')}]`;
  return [
    header(s, '#', [`WezTerm: save in ~/.config/wezterm/colors/ and set  config.color_scheme = '${s.name}'`]),
    '',
    '[colors]',
    `foreground = ${tomlStr(s.foreground)}`, `background = ${tomlStr(s.background)}`,
    `cursor_bg = ${tomlStr(s.cursor)}`, `cursor_fg = ${tomlStr(s.cursorText)}`, `cursor_border = ${tomlStr(s.cursor)}`,
    `selection_bg = ${tomlStr(s.selectionBackground)}`, `selection_fg = ${tomlStr(s.selectionForeground)}`,
    `split = ${tomlStr(s.line)}`, `scrollbar_thumb = ${tomlStr(s.line)}`, `compose_cursor = ${tomlStr(s.ansi[3])}`,
    `ansi = ${arr(s.ansi.slice(0, 8))}`,
    `brights = ${arr(s.ansi.slice(8))}`,
    '',
    '[metadata]',
    `name = ${tomlStr(s.name)}`, 'author = "Prism"', `origin_url = ${tomlStr(SITE)}`, `aliases = [${tomlStr(slugOf(s.name))}]`,
    '',
  ].join('\n');
}

function ghostty(s) {
  return [
    header(s, '#', [`Ghostty: save as ~/.config/ghostty/themes/${slugOf(s.name)}, then in the config:`, '  theme = light:prism-day,dark:prism-night   (follows the system appearance)', `  theme = ${slugOf(s.name)}                   (always this one)`]),
    '',
    ...s.ansi.map((c, i) => `palette = ${i}=${c}`),
    `background = ${s.background}`, `foreground = ${s.foreground}`,
    `cursor-color = ${s.cursor}`, `cursor-text = ${s.cursorText}`,
    `selection-background = ${s.selectionBackground}`, `selection-foreground = ${s.selectionForeground}`,
    '',
  ].join('\n');
}

function foot(s) {
  const h = (c) => c.slice(1);
  return [
    header(s, '#', [`foot: save as ~/.config/foot/${slugOf(s.name)}.ini and add to foot.ini:`, `  [main]`, `  include=~/.config/foot/${slugOf(s.name)}.ini`, 'The cursor keeps foot\'s default (inverted fore/background).']),
    '',
    '[colors]',
    `foreground=${h(s.foreground)}`, `background=${h(s.background)}`,
    ...s.ansi.slice(0, 8).map((c, i) => `regular${i}=${h(c)}`),
    ...s.ansi.slice(8).map((c, i) => `bright${i}=${h(c)}`),
    `selection-foreground=${h(s.selectionForeground)}`, `selection-background=${h(s.selectionBackground)}`,
    `urls=${h(s.accent)}`,
    '',
  ].join('\n');
}

function gnomeTerminal(s) {
  const q = (v) => `"'${v}'"`;
  const palette = `"[${s.ansi.map((c) => `'${c}'`).join(', ')}]"`;
  return `#!/bin/sh
${header(s, '#', [
  'GNOME Terminal. This script only PRINTS dconf commands; it changes nothing.',
  'Review the output, then apply it to a profile yourself:',
  `  sh ${slugOf(s.name)}.sh [PROFILE-UUID] | sh`,
  'Without a UUID it reads (never writes) your default profile id via gsettings.',
  'List profile ids: gsettings get org.gnome.Terminal.ProfilesList list',
])}
PROFILE="\${1:-}"
if [ -z "$PROFILE" ] && command -v gsettings >/dev/null 2>&1; then
  PROFILE=$(gsettings get org.gnome.Terminal.ProfilesList default 2>/dev/null | tr -d "'")
fi
[ -n "$PROFILE" ] || PROFILE="YOUR-PROFILE-UUID"
P="/org/gnome/terminal/legacy/profiles:/:$PROFILE"
cat <<EOF
dconf write $P/use-theme-colors false
dconf write $P/palette ${palette}
dconf write $P/background-color ${q(s.background)}
dconf write $P/foreground-color ${q(s.foreground)}
dconf write $P/bold-color-same-as-fg true
dconf write $P/cursor-colors-set true
dconf write $P/cursor-background-color ${q(s.cursor)}
dconf write $P/cursor-foreground-color ${q(s.cursorText)}
dconf write $P/highlight-colors-set true
dconf write $P/highlight-background-color ${q(s.selectionBackground)}
dconf write $P/highlight-foreground-color ${q(s.selectionForeground)}
EOF
`;
}

function konsole(s) {
  const c = (h) => `Color=${rgb(h).join(',')}`;
  const bg = s.background;
  const faint = (h) => hx(mixOklab(parseInt(h.slice(1), 16), parseInt(bg.slice(1), 16), 0.4));
  const sec = (name, h) => `[${name}]\n${c(h)}\n`;
  const out = [header(s, '#', [`Konsole: save as ~/.local/share/konsole/${slugOf(s.name)}.colorscheme, then Settings → Edit Current Profile → Appearance.`]), ''];
  out.push(sec('Background', bg), sec('BackgroundFaint', bg), sec('BackgroundIntense', s.panel));
  for (let i = 0; i < 8; i++) out.push(sec(`Color${i}`, s.ansi[i]), sec(`Color${i}Faint`, faint(s.ansi[i])), sec(`Color${i}Intense`, s.ansi[i + 8]));
  out.push(sec('Foreground', s.foreground), sec('ForegroundFaint', s.dim), sec('ForegroundIntense', s.ansi[s.mode === 'light' ? 0 : 15]));
  out.push(`[General]\nBlur=false\nColorRandomization=false\nDescription=${s.name}\nFillStyle=Tile\nOpacity=1\nWallpaper=\nWallpaperFlipType=NoFlip\nWallpaperOpacity=1\n`);
  return out.join('\n');
}

function xresources(s) {
  const row = (k, v) => `*.${k}: `.padEnd(24) + v;
  return [
    header(s, '!', [`X11 (xterm, urxvt, st with xresources): merge with  xrdb -merge ${slugOf(s.name)}.Xresources`]),
    row('foreground', s.foreground), row('background', s.background),
    row('cursorColor', s.cursor), row('pointerColorBackground', s.cursorText),
    row('highlightColor', s.selectionBackground), row('highlightTextColor', s.selectionForeground),
    row('colorBD', s.foreground), row('colorUL', s.accent),
    ...s.ansi.map((c, i) => row(`color${i}`, c)),
    '',
  ].join('\n');
}

function vscode(s) {
  const pre = 'terminal.ansi';
  const o = {
    'terminal.background': s.background, 'terminal.foreground': s.foreground,
    'terminalCursor.foreground': s.cursor, 'terminalCursor.background': s.cursorText,
    'terminal.selectionBackground': s.selectionBackground, 'terminal.selectionForeground': s.selectionForeground,
  };
  s.ansi.forEach((c, i) => { const n = NAMES[i % 8]; o[pre + (i < 8 ? '' : 'Bright') + n[0].toUpperCase() + n.slice(1)] = c; });
  return JSON.stringify({ 'workbench.colorCustomizations': o }, null, 2) + '\n';
}

/** Every supported format: id → { name, dir, file(slug), install, render(scheme) }. */
export const FORMATS = {
  'windows-terminal': { name: 'Windows Terminal', dir: 'windows-terminal', file: (slug) => `${slug}.json`, install: 'paste the object into "schemes" in settings.json, then pick it under Profiles → Appearance → Color scheme', render: windowsTerminal },
  iterm2: { name: 'iTerm2', dir: 'iterm2', file: (slug) => `${slug}.itermcolors`, install: 'Settings → Profiles → Colors → Color Presets… → Import…', render: iterm2 },
  alacritty: { name: 'Alacritty', dir: 'alacritty', file: (slug) => `${slug}.toml`, install: 'import it from alacritty.toml ([general] import = [...])', render: alacritty },
  kitty: { name: 'kitty', dir: 'kitty', file: (slug) => `${slug}.conf`, install: 'copy to ~/.config/kitty/themes/ and run `kitten themes`', render: kitty },
  wezterm: { name: 'WezTerm', dir: 'wezterm', file: (slug) => `${slug}.toml`, install: 'copy to ~/.config/wezterm/colors/ and set config.color_scheme', render: wezterm },
  ghostty: { name: 'Ghostty', dir: 'ghostty', file: (slug) => slug, install: 'copy to ~/.config/ghostty/themes/ and set theme = light:prism-day,dark:prism-night', render: ghostty },
  foot: { name: 'foot', dir: 'foot', file: (slug) => `${slug}.ini`, install: 'include it from foot.ini ([main] include=…)', render: foot },
  'gnome-terminal': { name: 'GNOME Terminal', dir: 'gnome-terminal', file: (slug) => `${slug}.sh`, install: 'run it to PRINT the dconf commands, review, then pipe to sh', render: gnomeTerminal },
  konsole: { name: 'Konsole', dir: 'konsole', file: (slug) => `${slug}.colorscheme`, install: 'copy to ~/.local/share/konsole/ and pick it in the profile', render: konsole },
  xresources: { name: 'Xresources', dir: 'xresources', file: (slug) => `${slug}.Xresources`, install: 'xrdb -merge the file (xterm, urxvt, …)', render: xresources },
  vscode: { name: 'VS Code terminal', dir: 'vscode', file: (slug) => `${slug}.json`, install: 'merge into settings.json (workbench.colorCustomizations)', render: vscode },
};

const ALIASES = { wt: 'windows-terminal', windows: 'windows-terminal', iterm: 'iterm2', gnome: 'gnome-terminal', x11: 'xresources', xterm: 'xresources', code: 'vscode', 'vs-code': 'vscode' };

/** Normalize a format name ('wt', 'iTerm', 'gnome', …) to a FORMATS key, or null. */
export function formatId(name) {
  const k = String(name || '').trim().toLowerCase();
  return FORMATS[k] ? k : ALIASES[k] || null;
}

/** The file name a format uses for a theme ('prism-night.toml', …). */
export function themeFileName(format, themeId = 'prism-dark') {
  const f = FORMATS[formatId(format)];
  if (!f) throw new Error(`unknown terminal format "${format}" (${Object.keys(FORMATS).join(', ')})`);
  return f.file(slugOf(getTheme(themeId).name));
}

/**
 * Render a terminal emulator color scheme for a Prism theme.
 * @param {string} format   a FORMATS key (or alias: wt, iterm, gnome, x11, code)
 * @param {string} themeId  a Prism theme id (default Prism Night); 'day' / 'night' work
 * @returns {string} the file contents
 */
export function exportTheme(format, themeId = 'prism-dark') {
  const id = formatId(format);
  if (!id) throw new Error(`unknown terminal format "${format}" (${Object.keys(FORMATS).join(', ')})`);
  if (themeId && typeof themeId === 'string' && !/^(auto|day|night|light|dark)$/i.test(themeId) && !THEME_IDS.includes(themeId) && !THEME_IDS.some((t) => t.startsWith(themeId + '-'))) {
    throw new Error(`unknown theme "${themeId}"`);
  }
  return FORMATS[id].render(schemeFor(themeId));
}
