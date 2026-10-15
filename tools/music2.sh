#!/bin/bash
# Extra clips so stage/boss playlists repeat less.
cd "$(dirname "$0")/../assets-raw"
V="vintage 1930s cartoon soundtrack recording, instrumental, no vocals, seamless loop"
gen() { varlik music "$2" --out "music/$1.mp3" > "logs/music_$1.log" 2>&1; echo "$1: $(tail -1 logs/music_$1.log)"; }
gen stage1_c "Playful creepy 1930s cartoon forest swing, fast 150 bpm, bouncy tuba bassline, clarinet and muted trumpet call and response, xylophone and woodblock accents, spooky minor key, video game action loop, $V" &
gen stage2_c "Driving 1930s jazz for a rainy night harbor chase, 155 bpm, baritone and alto saxophones, plunger-muted trombone, rolling piano, brushed snare and ride cymbal, tense minor key, video game action loop, $V" &
gen stage3_c "Haunted gothic tower swing, 160 bpm, eerie theremin-like violin, pipe organ, pizzicato strings, bass clarinet, galloping drums, dark minor key, relentless, video game final level loop, $V" &
gen boss1_b "Frantic 1930s cartoon boss fight, 170 bpm hot jazz, shrieking clarinets, brass hits, rapid xylophone, pounding toms, fluttering flutes like wings, intense minor key, video game boss loop, $V" &
gen boss2_b "Stormy 1930s big band boss battle, 165 bpm, booming brass, thunder timpani, frantic stride piano, swirling strings like wind and rain, intense minor key, video game boss loop, $V" &
wait
