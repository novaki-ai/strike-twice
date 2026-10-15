# Novaki: Strike Twice

*A 1930s rubber-hose cartoon action roguelite for the browser.*

> In the land of Tinderbox every match gets to shine exactly once. Novaki had his moment long ago and is now a
> spent, smoking, grumpy match with crooked glasses. When the Snuffer puts out every flame in the land, the one
> match nobody bothered to count has to strike again.

## Build & play

```bash
npm install
npm run build      # -> dist/ (static, relative URLs, works from any sub-path)
npx vite preview   # or serve dist/ with any static file server
```

`npm run dev` starts the Vite dev server. Everything the game needs ships inside `dist/` (no runtime requests to
other hosts). Desktop and mobile browsers are supported (WebGL via PixiJS 8).

### Controls

| | Keyboard | Gamepad | Touch |
|---|---|---|---|
| Move | WASD / arrow keys | Left stick / d-pad | Drag anywhere (floating joystick) |
| Dash (short invulnerable burst) | Space / Shift | A / RB | DASH button |
| Pause | Esc / P | Start | II button |
| Menus | Arrows + Enter, Esc to go back | Stick + A, B to go back | Tap |
| Level-up cards | 1-4, or arrows + Enter | Stick + A | Tap |

Weapons fire automatically: you move, dodge, collect embers (XP) and choose upgrades.

## What I built

**Structure of a run (about 18-22 minutes):** three stages, each about 4.5-5 minutes of escalating waves (with swarm
migrations, encirclements, elites carrying treasure and destructible props), then a boss in a closed arena.
Your build carries over between stages. Beating the third boss plays the ending and wins the run.

| Stage | Look & music | Enemies | Boss |
|---|---|---|---|
| 1. The Mothwood | dusk forest, spooky-cute swing | Mothling, Mold Blob, Toadstool, Stag Beetle, Soggy Stump | **Duchess Dustwing** (dust spirals, telegraphed swoops, fan gusts, moth broods; enraged phase) |
| 2. Drizzleport | rainy harbor at night, noir big band | Raindrop, Puddle Slime, Bullfrog, Storm Cloud, Water Balloon, Watering Can | **Baron von Drizzle** (downpour circles, lightning lines, umbrella bullet rings, slanted rain, summons; storm phase) |
| 3. The Snuffer's Spire | dark candle castle, danse-macabre swing | Wax Ghost, Snufflet, Frost Wisp, Wax Knight, Smoke Wraith (+ returning foes) | **The Snuffer** (shadow-tracking slam with shockwave, rotating spokes, sweeping walls with gaps, "lights out" darkness + homing smoke, summons; 3 phases with voiced phase line and music change) |

**Enemies (16 types, all with distinct behaviour):** chaser, sine-weaving flier, spore-ring shooter, telegraphed
charger, knockback-resistant tank, fast chaser, splitter (splits in two), hopper, artillery cloud (telegraphed
lightning), kamikaze (telegraphed burst), healer (heals allies), blinker (vanishes and reappears beside you),
orbit-and-dive, ranged burst shooter, frontal shield (must be flanked), phasing wraith (intangible part of the
time). Elite versions glow and drop a treasure matchbox.

**Build system:** 14 weapons x 8 levels, 15 trinkets (passives), and **14 evolutions** (weapon at level 8 + its partner
trinket), e.g. Ember Toss + Sulfur Tip = Sulfur Storm, Smoke Rings + Ash Urn = Smog Cyclone, Static Crackle + Static Wool
= Ball Lightning, Glare + Magnifying Lens = Burning Gaze. Burn, crit, area, cooldown, projectile-count, pierce and
duration stats interact across weapons. Level-up offers 3 cards (4 with a Workshop perk), with reroll, banish and skip.
Chests from elites and bosses grant upgrades and prioritise evolutions. Pickups: healing marshmallow, magnet,
screen-clearing firecracker, time-freezing pocket watch, golden match (invincible + ablaze), coins.

**Meta-progression (saved in `localStorage`):** cinder coins earned every run (kept on death) are spent in
*Novaki's Workshop* on 13 permanent upgrades and 5 weapon blueprints that add new weapons to the pool. Nine starting
weapons unlock through achievements (beat bosses, reach levels, total kills, survive 10 minutes, win). Winning unlocks
**Inferno Mode** (tougher enemies and bosses, +50% coins). Records screen with lifetime stats.

**Story & voice:** a voiced, illustrated intro (4 panels) and ending (3 panels) with subtitles, a voiced narrator
card for each chapter, voiced intro/defeat lines for every boss (plus the Snuffer's phase line), Novaki's own
deadpan quips (boss reactions, death), and a voiced game-over line. 24 voice clips in total.

**Presentation:** Novaki is a generated torso sprite with code-drawn, animated rubber-hose arms and legs (walk cycle,
swinging gloves, dash pose, hurt flash, KO pose), smoke curling from his charcoal head and a flame when he levels up.
Dynamic lighting (multiply light map) darkens each stage differently; fire projectiles, explosions and pickups light
the scene; the final boss can smother the light. Film grain, vignette, rain, hit-flash, knockback, damage numbers,
screen shake, hit-stop slow-motion on boss deaths, inked "boom" explosions, telegraphs for every dangerous attack.

**Audio:** 17 music clips (menu, intro, three stages x 2, three bosses + final phase, workshop, victory, ending,
game over) crossfaded into seamless loops in WebAudio; 31 sound effects synthesized in code; music ducks under voice.

**Menus:** title, main menu, starting-weapon select, Workshop, settings (music / sound / voice volume, screen shake,
screen flashes, damage numbers, subtitles, FPS counter, fullscreen, reset progress), How to Play (controls, evolution
table, illustrated bestiary), records & credits, pause (build + stats), level-up, chest, stage clear, game over and
victory screens with run stats and per-weapon damage.

**Performance:** pooled entities, spatial hash collisions, batched sprites in runtime-built texture atlases, fixed
60 Hz simulation with render interpolation. Measured in headless Chromium on this machine (Intel Arc iGPU): steady
60 FPS at 1920x1080 with 600 enemies, six evolved weapons, ~1,100 particles and 450+ boss bullets (about 2.5 ms CPU
per frame).

## QA interface

`window.NOVAKI_QA` implements `state()`, `start(options)`, `setInvincible(on)`, `addXp(amount)`, `chooseUpgrade(index)`,
`skipTo(stage, point)`, `killBoss()` and `spawnEnemies(count)` as specified. Notes:

- `state().screen` is one of `menu`, `playing`, `paused`, `levelup`, `chest`, `stageclear`, `gameover`, `victory`
  (also `title`, `loadout`, `shop`, `settings`, `howto`, `records`, `intro`, `loading`). The ending cutscene reports `victory`.
- `state()` also returns `boss`, `weapons`, `passives`, `levelUpChoices`, `kills`, `seed`, `fps` and `perf` as extras.
- `start({ seed, weapon, inferno })`: `seed` makes the run deterministic (seeded PRNG + fixed-step simulation);
  `weapon` picks the starting weapon. It skips the intro cutscene and the weapon-select screen.
- `skipTo(stage, 'start' | 'boss')`: when jumping ahead it grants catch-up levels (level 12 for stage 2, 22 for stage 3,
  upgrades picked by the seeded RNG) so the later content is fair; runs that used `skipTo` are marked "QA-assisted" and do
  not set best times.
- `killBoss()` uses the normal defeat path (death animation, voiced line, boss XP and treasure, stage clear, next stage
  or ending + victory). Boss XP can trigger level-ups first; the stage-clear screen waits for them and then
  auto-advances after a few seconds.

## Assets

Every image, voice line and music track was generated with `varlik` (see `tools/` for the job lists:
`jobs_sprites.txt`, `jobs_batch2.txt`, `jobs_icons.txt`, `voices.sh`). Raw generations live in `assets-raw/`
(not committed); `tools/process.py` despills the magenta key, trims, slices sprite sheets, makes ground textures
seamless and exports WebP; `tools/audio.sh` loudness-normalizes voices and music. Fonts (Luckiest Guy, Fredoka) are
open-source npm packages (`@fontsource`). Sound effects are synthesized in code.

## What I would improve with more time

- Real multi-frame animation for enemies and bosses (they are single generated sprites animated with squash, bob, sway
  and flip).
- More bespoke visuals per weapon level, more boss attack variety in later phases, and an endless mode.
- Real-device testing on Safari/iOS and Firefox (only Chromium was available here; the code avoids engine-specific APIs).
- More balance passes with human players; I tuned with an automated bot, which plays worse than a decent human.

## Known issues

- Balance was tuned with a bot; the first run may feel hard or easy depending on the player. Workshop upgrades help.
- Music clips are 30-second generations looped with crossfades, so repetition is noticeable over long stages.
