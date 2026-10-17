<!-- Copied from aaa-prism-play/research/cs2-fixtures/ (Prism Play, 2026-10-16) for test/gamelink-*.test.js. Fictional data only. The § references point at research/cs2-gsi.md; the regeneration scripts mentioned below are scratch tools outside this package. -->

# CS2 GSI fixtures (Game Link: CS2)

These files are a replayable sequence of Counter-Strike 2 Game State Integration POST bodies. They show what our listener receives from a **live player**. They cover:

- main menu, map load and warmup;
- a full competitive round: freezetime, buying, round start, taking damage, a flashbang fade, a kill, a headshot double kill with low ammo, a reload, the bomb plant, a defuse and the round win;
- a later round: death, spectating a teammate, the round loss, and the round end with no `player` node;
- halftime and the side swap, match point, gameover, and the return to the menu;
- a short Deathmatch death and respawn.

`spectator-only/` holds one example of what GOTV, a demo or the spectator team receives. Live play never gets it. Game Link must ignore it.

The full research, rules and sources are in `../cs2-gsi.md`. Section numbers below (§) refer to that file.

## Conventions

| | |
|---|---|
| Our player (provider and self) | `76561198000000001`, name `PrismPilot` |
| Teammate we spectate | `76561198000000002`, `Lumen` |
| Spectator example players | `76561198000000003` `Halcyon`, `76561198000000004` `Vesper` |
| Auth token in every body | `prism-gsi-example-token-0001` (fictional) |
| `provider.version` | `14191`, from PatchVersion 1.41.9.1 (2026-10-15) by the rule `1.41.9.1 → 14191`. Don't gate on it: CS2 has sent 13968 and up. |
| `provider.timestamp` | Integer Unix seconds starting 2026-10-10 19:00 UTC (fictional). Several posts can share one second. |
| Names, money, scores, skins | Fictional. Skins are all `default`, maps are real map names. |
| cfg assumed (§1.6) | uri `http://127.0.0.1:38140/v1/cs2`, buffer `0.0`, throttle `0.05`, heartbeat `5.0`, timeout `2.0`. Components: provider, map, map_round_wins, round, player_id, player_state, player_weapons, player_match_stats |

**Shapes are exactly real.** These were copied from real CS2 captures: the key order, which keys exist when, string versus number types, the `weapon_N` keys, `defusekit` appearing only when true, warmup having no `round` node, and gameover arriving with `round.phase: "freezetime"`. Sources are listed per file below. The captures we used:

| Short name | URL | Build |
|---|---|---|
| Necko1 | https://github.com/Necko1/necko7/tree/master/src/cs2/fixtures | v14185, 2026-09 |
| aon4o | https://github.com/aon4o/cs2-gsi-parser/blob/main/request_samples.json | v14108 |
| sngrotesque | https://github.com/sngrotesque/CS2_Die2Play/tree/master/python/test | v14166 |
| TriggerPad | https://github.com/Ashlixy17/TriggerPad/blob/main/Server/bin/Debug/net8.0/log.txt | v14169 |

All values are fictional. "Capture-based" means the transition and its delta blocks copy a real one. "Synthesized" means we built it from the real shapes.

**The flash frames are a hypothesis.** We found no real CS2 time series of `player.state.flashed` anywhere. The curve is 255 at once, a plateau, then `255·(t_left/3)²` over the last 3 s, decimated to 0.5 s steps. In a real fade about 20 posts/s arrive with throttle 0.05. Record a real fade before tuning visuals (§9).

**Deltas follow the rules seen in captures** (§3.7):

- A changed leaf goes in `previously` with its old value.
- A new nested key goes in `added` as `true`.
- A removed nested key goes in `previously` with its whole old value, e.g. every weapon on death.
- A removed top-level node goes in `previously` as `true`, e.g. `"player": true`.
- A top-level node that re-appears gets **no** `added` entry.
- `provider` changes are never reported.
- Heartbeats and full-state resync posts carry neither block.

Don't build logic on these blocks. Diff against your own last state.

**`sequence.json`** has the replay order. Per frame it gives `atMs` (receive time from the start), `note`, `basis` and `expect`. `expect` is the list of events the reference rules in §7.4 derive. `cs2-researcher/scripts/derive_events.py` produced them by replaying this folder.

Four frames (`03`, `31`, `33`, `38`) are full-state posts after a time jump. They stand in for "first post after a failure". A deriver must re-baseline on them silently (`resync`) and must not fire 600 s worth of kills and money.

## Index

| File | t (s) | What it shows | Basis | Expected events (§7.4) |
|---|---|---|---|---|
| `00-main-menu.json` | 0.0 | Main menu. Only provider + a 3-field player. No map/round. | capture-based: Necko1 live-gameplay seq 4; sngrotesque cs2_gsi_0001 | context:menu |
| `01-map-loading.json` | 9.0 | Loading into a match: map only, player gone (previously.player = true), no 'added' for map. | capture-based: sngrotesque cs2_gsi_0016 (previously {player:true}); Necko1 warmup | context:loading, matchJoined, mapPhase:warmup |
| `02-warmup.json` | 13.0 | Warmup: map.phase warmup, no round node, money 16000. Player re-appears without an 'added' entry. | capture-based: Necko1 live-gameplay warmup frames (no round node, money 16000) | context:live |
| `03-freezetime.json` | 613.0 | Round 7 freezetime (map.round = 6 rounds completed). Shown as a full-state post (e.g. first post after the listener restarted mid-match), so no deltas. | capture-based: Necko1 frame 30 (freezetime), map_round_wins keys per CounterStrike2GSI | resync |
| `04-buy-rifle-armor.json` | 615.1 | Bought M4A1-S (2900) + kevlar & helmet (1000). Money and equip_value move; weapon_2 added. | synthesized: from real shapes (Necko1 buy frames); prices are CS2 store prices | weaponSwitch, money -3900 |
| `05-buy-kit-flash.json` | 616.0 | Bought defuse kit (400) + flashbang (200). state.defusekit appears only once owned. | synthesized: defusekit key per CounterStrike2GSI PlayerState / client strings | money -600 |
| `06-round-live.json` | 628.0 | Freezetime over: round.phase live (previously.round.phase = freezetime). Round clock starts (1:55). | capture-based: sngrotesque cs2_gsi_0019-style phase change | roundLive |
| `07-hurt.json` | 649.4 | Took 27 damage (armor 100 -> 91). | synthesized: same shape as Necko1 damage frames | hurt -27 |
| `08-flash-onset.json` | 653.7 | flashed = 255 (100% white). | synthesized: hypothesis curve (no real CS2 flash time series found), decimated | flashOnset, flashFull |
| `09-flash-fade-1.json` | 656.1 | flashed = 177 (69% white). | synthesized: hypothesis curve (no real CS2 flash time series found), decimated | (none) |
| `10-flash-fade-2.json` | 656.6 | flashed = 113 (44% white). | synthesized: hypothesis curve (no real CS2 flash time series found), decimated | (none) |
| `11-flash-fade-3.json` | 657.1 | flashed = 64 (25% white). | synthesized: hypothesis curve (no real CS2 flash time series found), decimated | (none) |
| `12-flash-fade-4.json` | 657.6 | flashed = 28 (11% white). | synthesized: hypothesis curve (no real CS2 flash time series found), decimated | (none) |
| `13-flash-fade-5.json` | 658.1 | flashed = 7 (3% white). | synthesized: hypothesis curve (no real CS2 flash time series found), decimated | (none) |
| `14-flash-clear.json` | 658.6 | flashed = 0 (0% white). | synthesized: hypothesis curve (no real CS2 flash time series found), decimated | flashClear |
| `15-kill.json` | 660.4 | Kill: round_kills 0 -> 1, kill reward +300 arrives at once, match_stats.kills +1, score +2, clip 20 -> 13. | synthesized: same fields as Necko1 local kill frames | kill, money +300 |
| `16-kill-headshot.json` | 663.0 | Headshot kill: round_kills 2 and round_killhs 1 in the same post (double kill). Clip 4/20 = low ammo. | synthesized | kill (hs), double, lowAmmo, money +300 |
| `17-reload-start.json` | 664.2 | Reload pressed: state reloading, clip unchanged (4). | capture-based: Necko1 frames 22-24 (glock) | reloadStart |
| `18-reload-done.json` | 666.3 | Magazine swapped: clip 20, reserve 3 -> 2 magazines (remaining 4 rounds discarded, 2026-03-18 rules). State is still 'reloading' for one more post. | capture-based: Necko1 frame 23 | (none) |
| `19-reload-end.json` | 666.6 | Back to active. | capture-based: Necko1 frame 24 | reloadEnd |
| `20-bomb-planted.json` | 681.4 | Bomb planted: added.round.bomb = true. The ONLY fuse signal in live play: start a local 40 s clock at receipt. Valve delays this signal for players on a team, so the clock runs late (see cs2-gsi.md). | capture-based: aon4o request_samples idx 8 (added {round:{bomb:true}}) | bombPlanted |
| `21-defusing-heartbeat.json` | 703.4 | Defusing with a kit (5 s). Live play exposes NO defuse state; this is just a heartbeat (no deltas). (heartbeat) | capture-based: heartbeats carry no previously/added (sngrotesque cs2_gsi_0020-0024) | (none) |
| `22-round-win-defuse.json` | 708.6 | Round over: bomb defused, win_team CT, map.round 6 -> 7, CT score 5, round_wins['7'] added, MVP +1, score +3 for the defuse, money +3500 team win +300 defuse bonus. | capture-based: aon4o request_samples idx 13 (over + win_team + bomb defused in one post) | roundWon, bombDefused, mvp, money +3800 |
| `23-freezetime-round8.json` | 715.6 | Round 8 freezetime: round.bomb and win_team removed (previously shows old values), health back to 100, round_kills reset. | capture-based: aon4o request_samples idx 15; Necko1 frame 30 | roundStart |
| `24-round8-live.json` | 730.6 | Round 8 live. | synthesized | roundLive |
| `25-hurt-heavy.json` | 761.6 | Took 62 (100 -> 38). | synthesized | hurt -62 |
| `26-death.json` | 762.3 | Death: health 0, armor 0, helmet false, defusekit key removed, weapons {} (previously lists every lost weapon in full), deaths +1, equip_value unchanged. Still our own steamid. | capture-based: Necko1 frame 17; TriggerPad log idx 45 | hurt -38, death |
| `27-spectating-teammate.json` | 765.4 | Spectating: player.steamid != provider.steamid. All player fields are the TEAMMATE's. previously holds OUR old values (steamid, name, slot, state...). | capture-based: Necko1 frame 18 | context:observing |
| `28-spectating-teammate-flashed.json` | 769.5 | Observed teammate flashed (240). Self-only Game Link must ignore this. | synthesized | (none) |
| `29-round-loss.json` | 778.5 | Round lost (win_team T) while spectating; last teammate died. | capture-based: Necko1 frame 28 | roundLost |
| `30-round-over-no-player.json` | 781.6 | Player node gone at round end (previously.player = true). | capture-based: Necko1 frame 29 | context:between |
| `31-halftime.json` | 1081.7 | Halftime: the post that ends round 12 already says map.phase intermission (round.phase over). Scores are side-labelled: we are CT with 8. | capture-based: Necko1 live-vertigo seq 226-231 (Wingman, halftime after round 8) | context:live, resync |
| `32-second-half-freezetime.json` | 1101.7 | Round 13 freezetime: team flipped CT -> T AND the side scores swapped (team_t is now our 8), money 800. | capture-based: Necko1 live-vertigo seq 231 (team flip + CT/T scores swap in the same post) | sideSwap CT->T, mapPhase:live, roundStart, weaponSwitch, money -9050 |
| `33-round23-over.json` | 2001.7 | Round 23 just won (T 12 : CT 11). Full-state post after a time jump. | synthesized | resync |
| `34-match-point.json` | 2008.7 | Round 24 freezetime, T 12 : CT 11: we (T) are on match point (13 wins in MR12). Derived, not a field. Kept the AK (17/30, 2 mags); money +3250 win reward. | synthesized | roundStart, matchPoint, money +3250 |
| `35-final-round-live.json` | 2123.7 | Round 24 live. | synthesized | roundLive |
| `36-gameover-win.json` | 2184.7 | Gameover straight from live (no separate 'over' post): map.phase gameover, round.phase FREEZETIME with win_team T, T 13 : CT 11. We (T) won the match. | capture-based: Necko1 live-vertigo seq 458 (live -> gameover/freezetime/win_team in one post) | mapPhase:gameover, roundWon, gameover:win, hurt -36, kill, kill, double, mvp, money +600 |
| `37-back-to-menu.json` | 2214.7 | Left the match: map and round removed (previously.map/round = true), player back to 3 fields. | capture-based: Necko1 seq 4 / sngrotesque cs2_gsi_0001 | context:menu |
| `38-dm-live.json` | 2274.7 | Deathmatch (mode deathmatch): one long live round; round_kills keeps counting across lives. | synthesized: shape as competitive; DM money, score scale and round_kills behaviour unverified | context:live, resync |
| `39-dm-death.json` | 2282.7 | DM death: health 0, weapons {}. | synthesized: same death shape as Necko1 frame 17 | hurt -100, death |
| `40-dm-respawn.json` | 2284.8 | DM respawn: health 0 -> 100 while round.phase stays live (this is the respawn signal). | synthesized | respawn |

`spectator-only/gotv-bomb-defusing.json` is not in the sequence. It is synthesized from real spectator shapes in https://github.com/Starfie1d1272/Mizar/tree/main/fixtures/gsi.

It shows the blocks a live player never receives: `allplayers`, `phase_countdowns` (`"phase": "defuse"`, `"phase_ends_in": "5.0"`), `bomb` (`"state": "defusing"`, `"countdown": "5.034"`, defuser steamid), `grenades`, `round_totaldmg`, `position` and `forward`. Two quirks:

- The `bomb` key order in this file is unverified; the source captures are key-sorted.
- `allplayers` is trimmed to 2 of 10 players.

Game Link must:

- not subscribe to these components;
- ignore them if they ever arrive;
- mark the context as "watching", not "live".

## Replaying

1. Read `sequence.json`.
2. For each frame, POST the file body to the listener at `atMs` (or as fast as possible), with:
   - `Content-Type: application/json`
   - `User-Agent: Valve/Steam HTTP Client 1.0 (730)`
   - `Host: 127.0.0.1:38140`
3. Compare the derived events with `expect`.

The token check must accept `prism-gsi-example-token-0001` only in tests.

Regenerate the files with `python -I gen_fixtures.py` then `python -I derive_events.py`, both in `E:/Development Workspaces/aaa-prism-play/cs2-researcher/scripts/`. These are scratch tools, not shipped code.
