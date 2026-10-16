#!/bin/sh
# Prism Day — Prism's Day terminal colors (Refraction).
# GNOME Terminal. This script only PRINTS dconf commands; it changes nothing.
# Review the output, then apply it to a profile yourself:
#   sh prism-day.sh [PROFILE-UUID] | sh
# Without a UUID it reads (never writes) your default profile id via gsettings,
# and stops (exit 1) when it cannot find one.
# List profile ids: gsettings get org.gnome.Terminal.ProfilesList list
PROFILE="${1:-}"
if [ -z "$PROFILE" ] && command -v gsettings >/dev/null 2>&1; then
  PROFILE=$(gsettings get org.gnome.Terminal.ProfilesList default 2>/dev/null | tr -d "'")
fi
if [ -z "$PROFILE" ]; then
  echo "no GNOME Terminal profile found: pass its UUID (gsettings get org.gnome.Terminal.ProfilesList list)" >&2
  exit 1
fi
P="/org/gnome/terminal/legacy/profiles:/:$PROFILE"
cat <<EOF
dconf write $P/use-theme-colors false
dconf write $P/palette "['#23222f', '#b73232', '#007240', '#835c00', '#2a5ec5', '#7353bb', '#006d7d', '#e6e5ee', '#55546a', '#cf354b', '#00823a', '#8d6c00', '#006fd8', '#a04ac2', '#007c87', '#ffffff']"
dconf write $P/background-color "'#f8f7fb'"
dconf write $P/foreground-color "'#23222f'"
dconf write $P/bold-color-same-as-fg true
dconf write $P/cursor-colors-set true
dconf write $P/cursor-background-color "'#7353bb'"
dconf write $P/cursor-foreground-color "'#ffffff'"
dconf write $P/highlight-colors-set true
dconf write $P/highlight-background-color "'#ddd5f3'"
dconf write $P/highlight-foreground-color "'#20202e'"
EOF
