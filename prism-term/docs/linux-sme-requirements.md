# What Linux people expect from Prism's terminal catalog

*From the Sr. Linux / SRE engineers. Opinionated on purpose. If a facet would look wrong to someone who has spent a decade in `htop`, `journalctl` and `tmux`, it doesn't ship.*

## The ten things that matter most

1. **Recognition beats novelty.** The first thing an operator does is look for the tool they already know. Get the layouts, colours and wording right. htop meters are `[|||||   45.2%]`, green/red/blue/yellow. journald `err` is red and `warning` is yellow. `systemctl` shows a green `●` for *active (running)*.
2. **80×24 is the contract.** Every facet must look intentional at 80×24 and should still read at its `minSize`. Wider is a bonus, not the design.
3. **ASCII mode is not an afterthought.** `TERM=linux`, `LANG=C`, serial consoles and half the jump hosts out there have no braille, no sextants and often no box-drawing. Every ops facet must render as clean 7-bit ASCII when `caps.unicode` is false.
4. **256 colours is the safe default; truecolor is the upgrade.** tmux without `Tc`, screen and macOS Terminal.app all quantise truecolor, so palettes must survive that quantisation. Never encode meaning in a hue difference that a 256-colour cube collapses.
5. **No flicker, no cursor junk.** Over SSH and inside tmux there is no DEC 2026 synchronised output. Diffs must stay small, frames must be calm, and nothing may wrap the last column.
6. **Honest data.** Use fictional but plausible numbers that add up. Load averages track CPU, used + free = total, and pods move through Pending → ContainerCreating → Running. Use `.example` hosts and RFC 1918 / 5737 addresses only.
7. **Motion should mean something.** Meters drift, logs scroll, counters count and prompts type. Nothing should spin for the sake of spinning in a monitoring view.
8. **The curl site is a man page, not a landing page.** 80 columns, one screen per page, and a footer telling you the next command. It must be `grep`-able and pipe-safe.
9. **Plain text has to be a real variant.** Every terminal-site page needs a `.txt` twin with zero escape codes for `less`, `grep`, `NO_COLOR` and screen readers.
10. **Respect the operator's terminal.** Honour `NO_COLOR`, honour `FORCE_COLOR`, never emit escapes when piped (unless asked), restore the cursor on `Ctrl-C`, and never send a bell.

## Facet ideas by gallery (ranked, most-wanted first)

**ops — Linux & Ops** (the reason we're here)
1. *System Monitors:*
   - htop header: per-core `[|||| 37.0%]` CPU bars (green user, red system, blue nice, yellow steal), Mem/Swp bars, and `Tasks: 214, 1032 thr; 2 running` / `Load average: 0.84 0.71 0.66` / `Uptime: 41 days, 03:12:07`.
   - top summary block.
   - vmstat 1 rolling rows.
   - nmon-style CPU heat.
   - mpstat columns.
   - `sensors` temperatures.
   - `uptime` load sparkline.
2. *Disk & Storage:*
   - `df -h` with usage bars, red at ≥ 90 %.
   - `iostat -x` columns (r/s, w/s, %util).
   - `du` tree with bars.
   - `smartctl` health summary.
   - LVM/ZFS pool status (`zpool status` ONLINE/DEGRADED).
   - `ncdu`-style browser.
3. *Network:*
   - `ping` with a latency sparkline and the final rtt min/avg/max/mdev line.
   - `mtr`-style hop table.
   - `iftop`/`nload` RX/TX graphs.
   - `ss -tulpn` listening sockets.
   - `ip -br addr` coloured.
   - `traceroute` revealing hops.
   - bandwidth bars per interface.
4. *Processes & Services:*
   - `systemctl status` block (● loaded/active, Main PID, CGroup tree, last log lines).
   - `systemctl list-units --failed`.
   - `pstree -p`.
   - `ps aux --sort=-%cpu` top-N.
   - `journalctl -u` excerpt.
   - cron run table.
5. *Containers & Clusters:*
   - `docker pull` multi-layer progress (Pulling fs layer → Downloading [====>  ] 12.4MB/48.1MB → Pull complete).
   - `docker ps` table with STATUS "Up 3 hours (healthy)".
   - `kubectl get pods -w` with pods transitioning.
   - `kubectl top nodes`.
   - `k9s`-style header.
   - helm release table.
   - rollout status counting `3 of 5 updated replicas are available…`.
6. *Logs & Journals:*
   - `journalctl -f` with priority colours (crit/err red, warning yellow, notice bold, info plain, debug dim).
   - `tail -f` nginx access log with status-code colours.
   - `dmesg -T` with segfault/oom-kill lines.
   - logrotate summary.
   - `lnav`-style histogram bar.
7. *Login & MOTD:*
   - Ubuntu-style landscape-sysinfo MOTD (System load, Usage of /, Memory usage, Processes, IPv4 address, "N updates can be applied immediately").
   - `/etc/issue` banner.
   - neofetch/fastfetch-style system card with an ASCII logo.
   - last-login line.
   - "pending reboot" warning box.
   - fail2ban summary.
8. *Shell Prompts:*
   - bash PS1 `user@host:~/src$` that types a command and shows output.
   - git prompt with branch, dirty `*`, ahead/behind `↑2↓1`.
   - powerline segments (with an ASCII fallback).
   - exit-code-aware prompt (red `✗ 130`).
   - kube-context/namespace prompt.
   - Python venv prompt.
   - tmux status bar (session, windows, host, clock).
   - starship-style two-line prompt.

**fx:**
1. Doom fire with a correct palette.
2. Plasma.
3. Matrix rain, with the right katakana and an ASCII fallback.
4. Lava lamp.
5. CRT scanline/phosphor effect.
6. VHS glitch.
7. Interference rings.

**objects:**
1. donut.c (the canonical one, ASCII first).
2. Rotating cube.
3. Spinning globe with day/night.
4. Analog clock that tells the real `t`.
5. Gears meshing.
6. Hourglass.
7. Tux-ish penguin (an original drawing only, no trademarked logos).

**sim:**
1. Conway's Life.
2. Falling sand.
3. Snow over a cabin.
4. Langton's ant.
5. Boids.
6. Double pendulum.
7. Rain on a window.
8. Reaction-diffusion.

**retro:**
1. Sine scroller ("greetings to …").
2. Copper/raster bars.
3. A BBS login screen in ANSI art (original art).
4. A VU meter / spectrum analyser that bounces to the beat.
5. A cracktro with starfield + logo + scroller.
6. The outrun grid.
7. Kefrens bars.

**text:**
1. figlet-style banners in standard/small/block.
2. A typewriter with a blinking cursor.
3. A decrypt / "hacker" reveal.
4. A lolcat rainbow.
5. Wave text.
6. A neon flicker.
7. Text that rains down.

**loaders:**
1. The classic `|/-\`.
2. Braille dots (npm/ora's `⠋⠙⠹`).
3. The pulsing block `▖▘▝▗`.
4. Bouncing bar `[=   ]`.
5. An earth/moon phase spinner.
6. Arrows.
7. The "line" family from cli-spinners.
8. A truecolour gradient spinner.

**progress:**
1. `apt` / `dnf` progress lines (`Progress: [ 42%] [##########........]`).
2. pip/npm/cargo-style bars.
3. `wget` with `=>`, speed and ETA.
4. `curl -#` hash bar.
5. `rsync --progress` lines.
6. `pv` throughput.
7. A multi-progress for parallel downloads.
8. A rolling odometer counter.
9. A countdown to maintenance.
10. A stopwatch.
11. Pipeline steps: build → test → deploy, with ✓/✗.

**charts:**
1. Sparklines with min/max labels.
2. Braille line charts with axes.
3. Horizontal bar charts that sort themselves.
4. A latency histogram with p50/p95/p99 markers.
5. A heatmap (requests by hour × weekday).
6. A gauge.
7. KPI tiles with deltas.
8. A candlestick chart.

**ai:**
1. A token stream with a blinking cursor.
2. A "thinking…" shimmer.
3. Tool-call cards (`→ run_query … ✓ 214 rows`).
4. An agent plan checklist ticking off.
5. Attention heatmap.
6. An embedding scatter.
7. A context-window usage meter.

**status:**
1. Toasts (success/warn/error).
2. A status line with clock and git/kube segments.
3. Health dots per service.
4. An uptime bar (last 90 days, `██▇█▁█`).
5. CI pipeline status.
6. Log-level badges.
7. An incident banner.

**diagrams:**
1. A `tree` directory listing with a file-type flourish.
2. A box-drawn architecture flow with animated packets.
3. A network topology.
4. A sequence diagram.
5. A `git log --graph --oneline` graph.
6. A dependency tree (`npm ls`-style).

**callouts:**
1. Panels in single/double/rounded/heavy/ASCII styles.
2. NOTE/TIP/WARNING/CAUTION admonitions.
3. Aligned tables.
4. Section rules with titles.
5. Key-value blocks.
6. A changelog entry.

**input:**
1. A select list with `❯` cursor and filter-as-you-type.
2. Multi-select checkboxes `◉ ◯`.
3. A confirm `(Y/n)` prompt.
4. A password field with masking.
5. A command palette.
6. A slider.
7. A tab bar.
8. A date picker.

**maps:**
1. A braille world map with pulsing data centres.
2. A radar sweep with blips.
3. Traceroute hops on a map.
4. A datacentre rack floorplan with temps.

**lab:**
1. Easing curves plotted side by side.
2. A spring with damping.
3. Frame-timing visualisation.
4. A bezier editor demo.

**ascii (no Unicode at all):**
1. donut.c.
2. An aquarium (an original take on the asciiquarium idea).
3. A steam locomotive crossing (an original take on `sl`).
4. A cowsay-style speech bubble.
5. A figlet clock.
6. ASCII fire.
7. ASCII progress bars and spinners.

## Compatibility a facet must meet

| Environment | What breaks | Requirement |
|---|---|---|
| 80×24 default | anything sized for 120 cols | Design at `size` ≤ 80×24 unless the facet is a full-screen scene. Lay out from `ctx.width/height`. |
| SSH over a slow link | big repaints | Keep per-frame change small: no full-screen noise in ops facets, and use cell-diff-friendly motion. |
| tmux / screen | no DEC 2026, 256 colours unless `Tc` | Must look right at 256 colours. No reliance on synchronised output. |
| `TERM=linux` (VT console) | braille, sextants, most box drawing, truecolour | ASCII mode renders cleanly with `+-|` boxes and `#=.` bars. |
| `LANG=C` / `LC_ALL=C` | any non-ASCII byte | Same as above. Nothing may emit mojibake. |
| `NO_COLOR=1` | colour | Information survives without colour (symbols, brackets, words like `FAILED`). |
| `less -R` | cursor moves | Static pages must be pure SGR + text, with no cursor positioning. |
| macOS Terminal.app | truecolour (quantised to 256) | Palettes chosen so the 256-cube approximation still reads. |
| Windows Terminal / PowerShell | `curl` alias in Windows PowerShell 5 | Docs say `curl.exe -sL …` for Windows PowerShell; pwsh 7 is fine. |
| Piped output (`| grep`, `> file`) | escapes in files | The CLI drops escapes when not a TTY. Site `.txt` variants have none. |

## The curl-able terminal site

- **Entry:** `curl -sL prism.jeremyfhall.com/tty`. One screen (≤ 24 lines, 80 columns) containing:
  - a small banner;
  - one line saying what Prism Terminal is;
  - the gallery list with counts and the exact command for each (`curl -sL prism.jeremyfhall.com/t/ops`);
  - how to go live (`npx … prism-term`);
  - the plain-text hint (`append .txt`);
  - the help page (`/t/help`).
- **Gallery page** (`/t/<id>`):
  - the gallery title and blurb;
  - categories as headings;
  - one line per facet: `ops-htop    System Monitors   htop CPU/mem meters…`.
  - It may exceed one screen; the footer says `| less -R`.
- **Facet page** (`/f/<id>`):
  - a colour snapshot at its preferred size (≤ 80 columns);
  - title, description and tags;
  - the three commands: live with npx, snapshot, and use in code;
  - footer: previous/next in the gallery, and back to the gallery.
- **Footers on every page:** the next commands, right there. Never make me go back to a browser.
- **Plain text:** every page has `<path>.txt` with zero escapes. `curl -sL …/t/all.txt | grep -i spinner` must work as a search.
- **Colour default: 256-colour SGR (`38;5;n`), not truecolor.** It survives tmux, screen, Terminal.app, Windows conhost and every SSH chain. Pick palette entries from the 256 cube so nothing is lost. Truecolor stays for the live player, which detects capabilities. (If the pipeline wants a truecolor variant, add `<path>.24` — but the default URL must be 256.)
- **Nothing that moves.** A static host can't pace an animation, and dumping 500 frames at full speed into someone's terminal is rude. Static pages are stills. "Live" means `npx`.
- **Line endings:** `\n` only, ending with SGR reset `\e[0m` and a trailing newline so the prompt comes back clean.
- **Width discipline:** no line over 80 columns, ever, counting only printable characters.

## npx live player expectations

- `npx -y --package=https://prism.jeremyfhall.com/dl/prism-term.tgz prism-term` opens the in-terminal gallery: arrows to browse, `/` to search, Enter to play, `q` to quit.
- `… prism-term play ops-htop` runs one facet; `--ascii`, `--depth 256`, `--size 80x24` all work.
- It starts fast (< 1 s to first frame), restores the cursor and alt screen on `Ctrl-C`, never leaves the terminal in raw mode, and exits 0.
- It works in tmux, over SSH, in Windows Terminal, and on Linux and macOS with Node ≥ 18. It needs no network after the tarball is fetched.
- With `NO_COLOR` set or when not a TTY, `list` and `info` print plain text.

## Do not ship

- Fake "hacker" screens full of random hex that resemble nothing real. If it's ops, it's a real tool's layout.
- Spinners in a monitoring view that don't map to work.
- Numbers that don't add up (used > total, load 0.0 on a pegged box, percentages over 100).
- Real company names, real public IPs and real-looking credentials or tokens, even fake-looking ones.
- Box drawing that misaligns by a column, or our own layout text that wraps at 80. (A real tool's output that is genuinely wider than the terminal, like `kubectl rollout status` or `dmesg`, wraps hard at the edge just as a tty would. That's honest, not a bug.)
- Colour as the only signal (red vs green with no word or symbol).
- Escapes in `.txt` pages, or cursor motion in static pages.
- Anything that rings the bell, changes the window title, switches charsets (`\e(0`), or leaves the cursor hidden.
- Trademarked logos (distro logos, Tux reproductions). Draw original art.
