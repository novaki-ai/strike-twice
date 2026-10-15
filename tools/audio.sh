#!/bin/bash
# Normalize voice lines and re-encode music for the web build.
cd "$(dirname "$0")/.."
for f in assets-raw/voice/*.mp3; do
  n=$(basename "$f")
  ffmpeg -y -v error -i "$f" -af "loudnorm=I=-15:TP=-1.5:LRA=11,aresample=44100" -ac 1 -b:a 64k "public/assets/voice/$n"
done
for f in assets-raw/music/*.mp3; do
  n=$(basename "$f")
  ffmpeg -y -v error -i "$f" -af "loudnorm=I=-16:TP=-1.5:LRA=11" -ar 44100 -ac 2 -b:a 128k "public/assets/music/$n"
done
du -sh public/assets/voice public/assets/music
# boss1_b fades out over its last ~9 s; keep only the full-energy part (the engine crossfades loops)
ffmpeg -y -v error -i assets-raw/music/boss1_b.mp3 -t 20.5 -af "loudnorm=I=-16:TP=-1.5:LRA=11" -ar 44100 -ac 2 -b:a 128k public/assets/music/boss1_b.mp3
