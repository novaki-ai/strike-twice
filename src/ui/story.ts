/** Story script: cutscene panels and voiced lines. */
export interface Line { voice: string; who?: string; text: string }
export interface Panel { img: string; lines: Line[]; music?: string }

export const INTRO: Panel[] = [
  { img: 'story_intro1', lines: [{ voice: 'intro_1', text: 'Once upon a time, in the land of Tinderbox, every match got to shine exactly once.' }] },
  { img: 'story_intro2', lines: [{ voice: 'intro_2', text: 'Novaki had his moment long ago. One bright flash... and then, smoke. Folks called him spent, and mostly forgot he was there.' }] },
  { img: 'story_intro3', lines: [{ voice: 'intro_3', text: 'Then came the Snuffer. With him came the moths, the damp, and the cold. One by one, every flame in Tinderbox went out.' }] },
  { img: 'story_intro4', lines: [
    { voice: 'intro_4', text: 'Every flame, that is... except one stubborn little ember, still smoldering in a match nobody had bothered to count.' },
    { voice: 'novaki_intro', who: 'Novaki', text: "Hmph. Guess I'll do it myself." },
  ] },
];

export const ENDING: Panel[] = [
  { img: 'story_end1', lines: [{ voice: 'end_1', text: 'And so the Snuffer fell. From one stubborn ember, every flame in Tinderbox was lit once more.' }] },
  { img: 'story_end2', lines: [
    { voice: 'end_2', text: 'They called Novaki a hero. They threw him a parade. They even wrote him a song.' },
    { voice: 'novaki_end', who: 'Novaki', text: 'Great. Can I go back to bed now?' },
  ] },
  { img: 'story_end3', lines: [{ voice: 'end_3', text: 'And for once, nobody called him spent. Goodnight, Novaki.' }] },
];

export const CHAPTER_LINES: Record<number, Line> = {
  1: { voice: 'chapter1', text: 'Chapter One. The Mothwood, where every little light draws hungry wings.' },
  2: { voice: 'chapter2', text: "Chapter Two. Drizzleport, where it hasn't stopped raining in a hundred years." },
  3: { voice: 'chapter3', text: "Chapter Three. The Snuffer's Spire. Cold wax, black smoke, and not one candle left burning." },
};

export const BOSS_LINES: Record<string, { intro: Line; quip?: Line; defeat: Line; phase?: Line }> = {
  duchess: {
    intro: { voice: 'duchess_intro', who: 'Duchess Dustwing', text: 'Ooh, a little flicker! Come closer, darling. Mother only wants a tiny nibble of that glow.' },
    quip: { voice: 'novaki_boss1', who: 'Novaki', text: "A moth. Of course it's a moth." },
    defeat: { voice: 'duchess_defeat', who: 'Duchess Dustwing', text: 'My wings! My beautiful, dusty wings!' },
  },
  baron: {
    intro: { voice: 'baron_intro', who: 'Baron von Drizzle', text: 'Drip, drip, drip, little match! Every fire goes out in the end, and I, Baron von Drizzle, am the end!' },
    quip: { voice: 'novaki_boss2', who: 'Novaki', text: 'Rain. Fantastic. My favorite.' },
    defeat: { voice: 'baron_defeat', who: 'Baron von Drizzle', text: "Impossible! I'm... I'm evaporating!" },
  },
  snuffer: {
    intro: { voice: 'snuffer_intro', who: 'The Snuffer', text: 'A spent match, come all this way. How thoughtful. Allow me to put you out... properly.' },
    phase: { voice: 'snuffer_phase', who: 'The Snuffer', text: 'Enough! Let the dark swallow you whole!' },
    defeat: { voice: 'snuffer_defeat', who: 'The Snuffer', text: 'No... not the light... anything but the light...' },
  },
};

export const GAMEOVER_LINE: Line = { voice: 'gameover', text: 'The ember flickers... but a stubborn match always strikes again.' };
