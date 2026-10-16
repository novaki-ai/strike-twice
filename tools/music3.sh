#!/bin/bash
# A fourth clip per stage, so each stage playlist runs two minutes before repeating.
cd "$(dirname "$0")/../assets-raw"
V="vintage 1930s cartoon soundtrack recording, instrumental, no vocals, seamless loop"
gen() { varlik music "$2" --out "music/$1.mp3" > "logs/music_$1.log" 2>&1; echo "$1: $(tail -1 logs/music_$1.log)"; }
gen stage1_d "Sneaky 1930s cartoon forest swing at dusk, 150 bpm, plucked double bass, bassoon melody, muted cornet answers, xylophone glissandos, rattling woodblocks, spooky-playful minor key, video game action loop, $V" &
gen stage2_d "Rain-soaked 1930s harbor big band chase, 155 bpm, clarinet section riffs, growling trombone, rolling stride piano, snare brushes like rain, tense minor key, video game action loop, $V" &
gen stage3_d "Creepy 1930s cartoon castle swing, 160 bpm, pipe organ riffs, frantic fiddle, low tuba bass, ticking clock percussion, sinister minor key, relentless, video game final level loop, $V" &
wait
