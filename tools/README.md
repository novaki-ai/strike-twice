# tools/

Everything used to make and check the game. None of it ships in `dist/`.

## Asset pipeline

All images, music and voices were generated with the `varlik` CLI. Raw outputs go to `assets-raw/` (not committed);
processed, game-ready files live in `public/assets/`.

| File | What it does |
|---|---|
| `jobs_*.txt` | Image prompts, one per line (`name \| varlik flags \| prompt`). `{STYLE}` expands to the shared art-style text. |
| `gen.py` | Runs a job file in parallel: `python3 tools/gen.py tools/jobs_sprites.txt assets-raw/img 6` |
| `music.sh`, `music2.sh` | The `varlik music` prompts for every track. |
| `voices.sh` | The `varlik voice` lines (narrator, Novaki, bosses) with voice and delivery style. |
| `process.py` + `assets_list.py` | Despill the magenta key, trim, slice sprite sheets (grid or blob based), make tiles seamless, export WebP. `python3 tools/process.py sprites tiles pics props icons extra decals interludes` |
| `frames.py` | Scales each enemy's second animation frame to match the first and writes `src/game/frames.ts`. |
| `audio.sh` | Loudness-normalizes voices and music (ffmpeg) and trims fading tails. |
| `rms.py` | Prints a per-second loudness profile of audio files (used to pick loop points). |

## Tests (Playwright, headless Chromium on the GPU)

Build first (`npm run build`), then serve `dist/` under a sub-path and run any script:

```bash
node tools/test/serve.mjs dist 4317 &      # http://localhost:4317/games/novaki/
node tools/test/qa_spec.mjs                # NOVAKI_QA interface, end to end (21 checks)
```

| Script | Checks |
|---|---|
| `qa_spec.mjs` | Every `NOVAKI_QA` function as a judge harness would use it, including both boss-kill paths. |
| `smoke.mjs`, `screens.mjs` | Menus and screens (set `TOUCH=1 VW=390 VH=844` for a phone; `BROWSER=webkit|firefox` too). |
| `determinism.mjs` | Same seed + same inputs in two fresh pages gives an identical simulation; pool integrity. |
| `bot.mjs` | Fast-forward bot that plays whole runs (`SEED=7 INV=0`); used for pacing and balance. |
| `chaos.mjs`, `chaos_mobile.mjs` | Thousands of random keys, clicks and QA calls; fails on any console error. |
| `perf.mjs`, `soak.mjs`, `throttle.mjs` | 1080p stress with 600 enemies, long real-time soak, CPU-throttled runs. |
| `xbrowser.mjs` | Menus, a big run, boss skips and the victory flow in Firefox / WebKit (`BROWSER=...`). |
| `weapons.mjs` | Every weapon and evolution in isolation (damage, screenshots). |
| `hosts.mjs` | No request leaves the game's origin or sub-path. |
| others | Focused checks for single features (flare, relics, interludes, gamepad, rotation, ...). |

Firefox and WebKit can be installed into the gitignored `.pw-browsers/` folder with
`PLAYWRIGHT_BROWSERS_PATH=$PWD/.pw-browsers npx playwright install firefox webkit`.
