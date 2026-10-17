# bash completion for prism-term
#   source this file, or copy it to ~/.local/share/bash-completion/completions/prism-term
# Facet, gallery, theme, palette and format names come from prism-term itself (--ids).

_prism_term() {
  local cur prev cmd i
  COMPREPLY=()
  cur="${COMP_WORDS[COMP_CWORD]}"
  prev="${COMP_WORDS[COMP_CWORD-1]}"
  local commands="play showcase list galleries info snapshot banner spin spinners dashboard demo caps themes theme palettes help"
  local opts="--theme --day --night --mode --palette --set --fps --duration --size --seed --at --frames --depth --ascii --sextant --no-sextant --transparent --no-hud --no-intro --reduced-motion --gallery --category --kind --json --ids --font --shadow --text --style --quiet --no-passthrough --help --version -o"

  case "$prev" in
    --theme) COMPREPLY=($(compgen -W "$(prism-term themes --ids 2>/dev/null) day night auto" -- "$cur")); return ;;
    --gallery) COMPREPLY=($(compgen -W "$(prism-term galleries --ids 2>/dev/null)" -- "$cur")); return ;;
    --palette) COMPREPLY=($(compgen -W "$(prism-term palettes --ids 2>/dev/null)" -- "$cur")); return ;;
    --mode) COMPREPLY=($(compgen -W "braille sextant quad half ascii auto block" -- "$cur")); return ;;
    --depth) COMPREPLY=($(compgen -W "truecolor 256 16 mono" -- "$cur")); return ;;
    --kind) COMPREPLY=($(compgen -W "scene widget art text spinner progress chart tui diagram" -- "$cur")); return ;;
    -o) COMPREPLY=($(compgen -f -- "$cur")); return ;;
    --size|--fps|--duration|--seed|--at|--frames|--set|--category|--font|--text|--style) return ;;
  esac

  cmd=""
  for ((i = 1; i < COMP_CWORD; i++)); do
    case "${COMP_WORDS[i]}" in
      --) [ "$cmd" = spin ] && return ;;
      -*) ;;
      *) cmd="${COMP_WORDS[i]}"; break ;;
    esac
  done

  if [[ "$cur" == -* ]]; then
    COMPREPLY=($(compgen -W "$opts" -- "$cur"))
  elif [ -z "$cmd" ]; then
    COMPREPLY=($(compgen -W "$commands $(prism-term list --ids 2>/dev/null)" -- "$cur"))
  else
    case "$cmd" in
      play|info|snapshot|showcase) COMPREPLY=($(compgen -W "$(prism-term list --ids 2>/dev/null)" -- "$cur")) ;;
      theme) COMPREPLY=($(compgen -W "$(prism-term theme --ids 2>/dev/null)" -- "$cur")) ;;
    esac
  fi
}
complete -F _prism_term prism-term
