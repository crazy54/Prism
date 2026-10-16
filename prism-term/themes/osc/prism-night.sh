#!/bin/sh
# Prism Night — Prism's Night terminal colors (Refraction).
# Any xterm-compatible terminal (xterm, VTE / GNOME, kitty, WezTerm, foot, iTerm2, Windows Terminal, …),
# also on a remote host over SSH: the escape codes travel to YOUR terminal. Run it, or paste the printf line;
# it lasts for this terminal session. Over SSH: ssh host 'sh -s' < prism-night.sh
# Undo: printf '\033]104\007\033]110\007\033]111\007\033]112\007'
# In tmux, run it outside tmux (or set allow-passthrough on and wrap it in tmux passthrough).
printf '\033]4;0;#1d202b\007\033]4;1;#f28885\007\033]4;2;#7ad59c\007\033]4;3;#ecca76\007\033]4;4;#81aaf7\007\033]4;5;#b8a2f2\007\033]4;6;#67cfe3\007\033]4;7;#c6c7d3\007\033]4;8;#76798e\007\033]4;9;#ffaaa7\007\033]4;10;#a5eac1\007\033]4;11;#f7e59f\007\033]4;12;#aac8ff\007\033]4;13;#d9c6fe\007\033]4;14;#9eeaf2\007\033]4;15;#f6f6fb\007\033]10;#e6e6ef\007\033]11;#0a0c12\007\033]12;#b8a2f2\007\033]17;#2e2748\007'
