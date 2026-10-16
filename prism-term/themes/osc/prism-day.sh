#!/bin/sh
# Prism Day — Prism's Day terminal colors (Refraction).
# Any xterm-compatible terminal (xterm, VTE / GNOME, kitty, WezTerm, foot, iTerm2, Windows Terminal, …),
# also on a remote host over SSH: the escape codes travel to YOUR terminal. Run it, or paste the printf line;
# it lasts for this terminal session. Over SSH: ssh host 'sh -s' < prism-day.sh
# Undo: printf '\033]104\007\033]110\007\033]111\007\033]112\007'
# In tmux, run it outside tmux (or set allow-passthrough on and wrap it in tmux passthrough).
printf '\033]4;0;#23222f\007\033]4;1;#b73232\007\033]4;2;#007240\007\033]4;3;#835c00\007\033]4;4;#2a5ec5\007\033]4;5;#7353bb\007\033]4;6;#006d7d\007\033]4;7;#e6e5ee\007\033]4;8;#55546a\007\033]4;9;#cf354b\007\033]4;10;#00823a\007\033]4;11;#8d6c00\007\033]4;12;#006fd8\007\033]4;13;#a04ac2\007\033]4;14;#007c87\007\033]4;15;#ffffff\007\033]10;#23222f\007\033]11;#f8f7fb\007\033]12;#7353bb\007\033]17;#ddd5f3\007'
