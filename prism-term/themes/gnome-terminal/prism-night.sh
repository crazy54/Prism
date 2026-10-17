#!/bin/sh
# Prism Night — Prism's Night terminal colors (Refraction).
# GNOME Terminal. This script only PRINTS dconf commands; it changes nothing.
# Review the output, then apply it to a profile yourself:
#   sh prism-night.sh [PROFILE-UUID] | sh
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
dconf write $P/palette "['#1d202b', '#f28885', '#7ad59c', '#ecca76', '#81aaf7', '#b8a2f2', '#67cfe3', '#c6c7d3', '#76798e', '#ffaaa7', '#a5eac1', '#f7e59f', '#aac8ff', '#d9c6fe', '#9eeaf2', '#f6f6fb']"
dconf write $P/background-color "'#0a0c12'"
dconf write $P/foreground-color "'#e6e6ef'"
dconf write $P/bold-color-same-as-fg true
dconf write $P/cursor-colors-set true
dconf write $P/cursor-background-color "'#b8a2f2'"
dconf write $P/cursor-foreground-color "'#0a0c12'"
dconf write $P/highlight-colors-set true
dconf write $P/highlight-background-color "'#2e2748'"
dconf write $P/highlight-foreground-color "'#f0f0f5'"
EOF
