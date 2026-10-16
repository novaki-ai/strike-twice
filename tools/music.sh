#!/bin/bash
cd "$(dirname "$0")/../assets-raw"
V="vintage 1930s cartoon soundtrack recording, instrumental, no vocals, seamless loop"
gen() { varlik music "$2" --out "music/$1.mp3" > "logs/music_$1.log" 2>&1; echo "$1 done: $(tail -1 logs/music_$1.log)"; }
gen menu_b "Instrumental 1930s cartoon hot jazz main title theme, jaunty and mischievous with a hint of spooky mystery, muted trumpet melody, clarinet, honky-tonk piano, upright bass walking line, brushed swing drums, medium swing tempo around 130 bpm, catchy memorable hook, $V" &
gen intro "Whimsical gentle storybook underscore for a 1930s cartoon fairy tale opening, celesta and music box, soft pizzicato strings, warm clarinet, slow tempo, cozy but slightly melancholic and mysterious, $V" &
gen stage1_a "Spooky-cute 1930s cartoon forest chase music at dusk, fast swing tempo 150 bpm, pizzicato strings, bassoon and clarinet trading playful sneaky phrases, xylophone runs, woodblocks, upright bass, brushed drums, energetic action loop for a video game, minor key, $V" &
gen stage1_b "Energetic 1930s rubber hose cartoon jazz for a haunted moth forest, fast swing 150 bpm, muted trumpet wah-wah, clarinet, xylophone, slap upright bass, snappy snare, mischievous minor key action groove for a video game, $V" &
gen stage2_a "Rainy harbor town noir jazz turned into fast action, 1930s big band, saxophone section riffs, muted trumpet, rolling stride piano like raindrops, upright bass, swinging drums with ride cymbal, 155 bpm, driving and tense minor key, video game action loop, $V" &
gen stage2_b "Stormy 1930s swing band action music, fast tempo 155 bpm, tenor saxophone lead, trombone glissandos, rain-like piano trills, walking bass, tom-tom drum beat, moody minor key but energetic, video game level loop, $V" &
gen stage3_a "Dark gothic danse macabre hot jazz, 1930s cartoon castle of candles, fast minor key swing 160 bpm, pipe organ stabs, gypsy violin, accordion, plucked bass, rattling xylophone like bones, sinister and driving, video game final level loop, $V" &
gen stage3_b "Sinister 1930s cartoon haunted tower music, fast gypsy jazz manouche 160 bpm, aggressive violin and accordion, church organ chords, low brass, driving rhythm guitar, minor key, dark and relentless, video game final level loop, $V" &
wait
gen boss1 "Frantic 1930s big band boss battle music, very fast hot jazz 170 bpm, screaming trumpets, clarinet runs, timpani hits, tom-tom drum fills, fluttery woodwinds like wings, intense minor key, cartoon villain showdown, video game boss loop, $V" &
gen boss2 "Thunderous 1930s cartoon storm boss battle, fast big band 165 bpm, blaring brass stabs, timpani thunder rolls, stride piano, saxophone section, cymbal crashes like lightning, pompous villain march swing, intense minor key, video game boss loop, $V" &
gen boss3 "Epic final boss battle, dark 1930s big band fused with pipe organ and choir-like brass, very fast 170 bpm, menacing minor key, pounding timpani, wailing trumpets, frantic violin, climactic and relentless, cartoon apocalypse showdown, video game final boss loop, $V" &
gen boss3_b "Climactic desperate final phase boss music, 1930s orchestra and big band, extremely intense, fast 175 bpm, organ, brass fanfares, racing strings, timpani, heroic yet dark minor key, video game final boss loop, $V" &
gen victory "Triumphant joyful 1930s cartoon finale, bright major key swing band, trumpets fanfare, clarinet trills, happy stride piano, upbeat celebration, warm and heartfelt, ending credits feeling, $V" &
gen gameover "Short sad-funny 1930s cartoon game over music, slow wah-wah muted trombone, melancholic clarinet, soft piano, brushed drums, gentle and a little comedic, minor key, $V" &
gen shop "Cozy relaxed 1930s jazz for a little workshop, mellow clarinet and muted trumpet, soft stride piano, gentle brushed drums, upright bass, medium-slow swing 100 bpm, warm and friendly, $V" &
gen ending "Warm emotional storybook ending music, 1930s cartoon orchestra, gentle strings, celesta, warm clarinet melody, slowly swelling hopeful major key, tender and heartfelt, $V" &
wait
echo ALL DONE
