#!/bin/bash
# Voice lines for Novaki: Strike Twice (22 clips; quota is 25)
cd "$(dirname "$0")/../assets-raw/voice"
NARR="Sadaltager"; NARR_S="Warm, theatrical old-timey 1930s storybook narrator, like a classic radio announcer reading a fairy tale aloud, playful and a little dramatic, measured pace"
NOV="Algenib"; NOV_S="Dry, deadpan, sleepy and unimpressed young man, a raspy smoky voice, mumbled and sarcastic, slow"
v() { varlik voice "$3" --voice "$2" --style "$4" --out "$1.mp3" > "../logs/voice_$1.log" 2>&1; echo "$1: $(tail -1 ../logs/voice_$1.log)"; }
v intro_1 $NARR "Once upon a time, in the land of Tinderbox, every match got to shine exactly once." "$NARR_S" &
v intro_2 $NARR "Novaki had his moment long ago. One bright flash... and then, smoke. Folks called him spent, and mostly forgot he was there." "$NARR_S" &
v intro_3 $NARR "Then came the Snuffer. With him came the moths, the damp, and the cold. One by one, every flame in Tinderbox went out." "$NARR_S, turning ominous" &
v intro_4 $NARR "Every flame, that is... except one stubborn little ember, still smoldering in a match nobody had bothered to count." "$NARR_S, building to a hopeful finish" &
v novaki_intro $NOV "Hmph. Guess I'll do it myself." "$NOV_S" &
v chapter1 $NARR "Chapter One. The Mothwood, where every little light draws hungry wings." "$NARR_S" &
v chapter2 $NARR "Chapter Two. Drizzleport, where it hasn't stopped raining in a hundred years." "$NARR_S" &
v chapter3 $NARR "Chapter Three. The Snuffer's Spire. Cold wax, black smoke, and not one candle left burning." "$NARR_S, ominous" &
wait
v duchess_intro Despina "Ooh, a little flicker! Come closer, darling. Mother only wants a tiny nibble of that glow." "Vain theatrical villainess diva, purring and flirty in a creepy way, exaggerated old Hollywood glamour, dramatic" &
v duchess_defeat Despina "My wings! My beautiful, dusty wings!" "Shrieking dramatically in despair, an over-the-top diva wail" &
v baron_intro Fenrir "Drip, drip, drip, little match! Every fire goes out in the end, and I, Baron von Drizzle, am the end!" "Pompous blustering villain aristocrat, booming and theatrical, rolling his R's, cartoonish" &
v baron_defeat Fenrir "Impossible! I'm... I'm evaporating!" "Panicked, sputtering and dramatic cartoon villain, voice rising in disbelief" &
v snuffer_intro Charon "A spent match, come all this way. How thoughtful. Allow me to put you out... properly." "Deep, cold, slow and menacing, a hollow echoing villain voice, sinister and calm" &
v snuffer_phase Charon "Enough! Let the dark swallow you whole!" "Furious booming roar of a villain losing his temper, deep and menacing" &
v snuffer_defeat Charon "No... not the light... anything but the light..." "Weak, fading, horrified whisper of a defeated villain" &
v novaki_boss1 $NOV "A moth. Of course it's a moth." "$NOV_S" &
wait
v novaki_boss2 $NOV "Rain. Fantastic. My favorite." "$NOV_S, very sarcastic" &
v end_1 $NARR "And so the Snuffer fell. From one stubborn ember, every flame in Tinderbox was lit once more." "$NARR_S, triumphant and warm" &
v end_2 $NARR "They called Novaki a hero. They threw him a parade. They even wrote him a song." "$NARR_S, amused and celebratory" &
v novaki_end $NOV "Great. Can I go back to bed now?" "$NOV_S, tired" &
v end_3 $NARR "And for once, nobody called him spent. Goodnight, Novaki." "$NARR_S, gentle and tender, like the end of a bedtime story" &
v gameover $NARR "The ember flickers... but a stubborn match always strikes again." "$NARR_S, gentle and encouraging" &
wait
echo VOICES DONE
