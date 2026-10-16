# fish completion for prism-term
#   copy to ~/.config/fish/completions/prism-term.fish
# Facet, gallery, theme, palette and format names come from prism-term itself (--ids).

set -l commands play showcase list galleries info snapshot banner spin spinners dashboard demo caps themes theme palettes help

complete -c prism-term -f
complete -c prism-term -n "not __fish_seen_subcommand_from $commands" -a "$commands"
complete -c prism-term -n "not __fish_seen_subcommand_from $commands" -a "(prism-term list --ids 2>/dev/null)" -d facet
complete -c prism-term -n "__fish_seen_subcommand_from play info snapshot showcase" -a "(prism-term list --ids 2>/dev/null)" -d facet
complete -c prism-term -n "__fish_seen_subcommand_from theme" -a "(prism-term theme --ids 2>/dev/null)" -d format

complete -c prism-term -l theme -x -a "(prism-term themes --ids 2>/dev/null) day night auto" -d 'theme id, family, day, night or auto'
complete -c prism-term -l day -d 'the Day member of the family'
complete -c prism-term -l night -d 'the Night member of the family'
complete -c prism-term -l mode -x -a 'braille sextant quad half ascii auto block' -d 'canvas mode'
complete -c prism-term -l palette -x -a "(prism-term palettes --ids 2>/dev/null)" -d 'gradient palette'
complete -c prism-term -l set -x -d 'facet parameter key=value'
complete -c prism-term -l fps -x -d 'frame rate (1-240)'
complete -c prism-term -l duration -x -d 'seconds per facet'
complete -c prism-term -l size -x -d 'fixed size WxH (max 1000x500)'
complete -c prism-term -l seed -x -d 'deterministic seed'
complete -c prism-term -l at -x -d 'snapshot time (s)'
complete -c prism-term -l frames -x -d 'frames of an animated HTML snapshot'
complete -c prism-term -l depth -x -a 'truecolor 256 16 mono' -d 'force color depth'
complete -c prism-term -l ascii -d 'no Unicode at all'
complete -c prism-term -l sextant -d 'force sextant glyphs'
complete -c prism-term -l no-sextant -d 'no sextant glyphs'
complete -c prism-term -l transparent -d 'keep the terminal background'
complete -c prism-term -l no-hud -d 'hide the status bar'
complete -c prism-term -l no-intro -d 'skip First Light'
complete -c prism-term -l reduced-motion -d 'no intro, wipes or sweeps'
complete -c prism-term -l gallery -x -a "(prism-term galleries --ids 2>/dev/null)" -d gallery
complete -c prism-term -l category -x -d 'category name'
complete -c prism-term -l kind -x -a 'scene widget art text spinner progress chart tui diagram' -d 'facet kind'
complete -c prism-term -l json -d 'machine-readable output'
complete -c prism-term -l ids -d 'bare ids, one per line'
complete -c prism-term -l no-passthrough -d "spin: swallow the command's stdout"
complete -c prism-term -s o -r -F -d 'output file'
complete -c prism-term -l help -d usage
complete -c prism-term -l version -d version
