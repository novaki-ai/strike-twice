/** Achievements: long-term goals checked at the end of each run (and a few live). */
import type { SaveData } from '../core/save';

export interface RunSummary {
  win: boolean;
  time: number;
  level: number;
  kills: number;
  stage: number;
  bosses: string[];
  evolutions: number;
  dmgTaken: number;
  flares: number;
  lamps: number;
  relics: number;
  inferno: boolean;
  daily: boolean;
  weapons: number;
  startWeapon: string;
  assisted: boolean;
}

export interface Achievement {
  id: string;
  name: string;
  desc: string;
  reward: number; // coins
  check(r: RunSummary, s: SaveData): boolean;
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first_blood', name: 'First Strike', desc: 'Snuff out 100 enemies in one run.', reward: 20, check: (r) => r.kills >= 100 },
  { id: 'moth_slayer', name: 'Lights Out, Duchess', desc: 'Defeat Duchess Dustwing.', reward: 40, check: (r) => r.bosses.includes('duchess') },
  { id: 'dry_spell', name: 'Dry Spell', desc: 'Defeat Baron von Drizzle.', reward: 60, check: (r) => r.bosses.includes('baron') },
  { id: 'relit', name: 'Strike Twice', desc: 'Defeat the Snuffer and relight Tinderbox.', reward: 100, check: (r) => r.win },
  { id: 'evolved', name: 'Now We\'re Cooking', desc: 'Evolve a weapon.', reward: 30, check: (r) => r.evolutions >= 1 },
  { id: 'triple_evo', name: 'Bonfire', desc: 'Evolve three weapons in one run.', reward: 80, check: (r) => r.evolutions >= 3 },
  { id: 'horde', name: 'Kindling Pile', desc: 'Snuff out 3,000 enemies in one run.', reward: 60, check: (r) => r.kills >= 3000 },
  { id: 'lamplighter', name: 'Lamplighter', desc: 'Relight 15 lamps in one run.', reward: 40, check: (r) => r.lamps >= 15 },
  { id: 'flare_fan', name: 'Strike, Strike, Strike', desc: 'Use 10 Flare-Ups in one run.', reward: 40, check: (r) => r.flares >= 10 },
  { id: 'untouched', name: 'Fireproof', desc: 'Clear stage 1 taking less than 30 damage.', reward: 60, check: (r) => r.bosses.includes('duchess') && r.dmgTaken < 30 },
  { id: 'speedrun', name: 'Quick Match', desc: 'Win in under 19 minutes.', reward: 120, check: (r) => r.win && r.time < 19 * 60 },
  { id: 'inferno_win', name: 'Inferno', desc: 'Win a run in Inferno Mode.', reward: 200, check: (r) => r.win && r.inferno },
  { id: 'daily_win', name: 'Daily Spark', desc: 'Win a Daily Strike.', reward: 80, check: (r) => r.win && r.daily },
  { id: 'lone_ember', name: 'One-Trick Match', desc: 'Win while carrying only two weapons.', reward: 150, check: (r) => r.win && r.weapons <= 2 },
  { id: 'veteran', name: 'Old Flame', desc: 'Play 10 runs.', reward: 50, check: (_r, s) => s.stats.runs >= 10 },
  { id: 'arsenal', name: 'Full Matchbox', desc: 'Unlock every starting spark.', reward: 100, check: (_r, s) => ['whip', 'ring', 'halo', 'volley', 'cracker', 'trail', 'aura', 'spark'].every((id) => s.unlocks.includes('start_' + id)) },
];

/** Returns the achievements newly earned by this run (and records them in the save). */
export function awardAchievements(r: RunSummary, s: SaveData): Achievement[] {
  if (r.assisted) return []; // QA skips don't count
  const got: Achievement[] = [];
  for (const a of ACHIEVEMENTS) {
    const key = 'ach_' + a.id;
    if (s.unlocks.includes(key)) continue;
    if (a.check(r, s)) {
      s.unlocks.push(key);
      s.coins += a.reward;
      got.push(a);
    }
  }
  return got;
}
