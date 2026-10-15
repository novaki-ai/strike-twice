/** Passives, level-up choices, evolutions and the meta shop. */
import type { Stats, PassiveInst } from './types';
import type { Game } from './game';
import { WEAPONS } from './weapons';

export interface PassiveDef {
  id: string;
  name: string;
  icon: string;
  max: number;
  desc: string; // per level
  apply(s: Stats, lvl: number): void;
}

export const PASSIVES: Record<string, PassiveDef> = {
  sulfur: { id: 'sulfur', name: 'Sulfur Tip', icon: 'sulfur', max: 5, desc: '+10% damage', apply: (s, l) => { s.might += 0.1 * l; } },
  kindling: { id: 'kindling', name: 'Dry Kindling', icon: 'kindling', max: 5, desc: '-7% weapon cooldown', apply: (s, l) => { s.cooldown *= Math.pow(0.93, l); } },
  powder: { id: 'powder', name: 'Black Powder', icon: 'powder', max: 5, desc: '+10% area', apply: (s, l) => { s.area += 0.1 * l; } },
  bellows: { id: 'bellows', name: 'Bellows', icon: 'bellows', max: 5, desc: '+10% projectile speed and duration', apply: (s, l) => { s.projSpeed += 0.1 * l; s.duration += 0.1 * l; } },
  luckybox: { id: 'luckybox', name: 'Lucky Matchbox', icon: 'luckybox', max: 5, desc: '+12% luck, +2% crit chance', apply: (s, l) => { s.luck += 0.12 * l; s.crit += 0.02 * l; } },
  varnish: { id: 'varnish', name: 'Thick Varnish', icon: 'varnish', max: 5, desc: '+1 armor', apply: (s, l) => { s.armor += l; } },
  shoes: { id: 'shoes', name: 'Tap Shoes', icon: 'shoes', max: 5, desc: '+8% move speed, faster dash', apply: (s, l) => { s.speed *= 1 + 0.08 * l; s.dashCd = Math.max(0.6, s.dashCd - 0.15 * l); } },
  lens: { id: 'lens', name: 'Magnifying Lens', icon: 'lens', max: 5, desc: '+4% crit chance, +15% crit damage', apply: (s, l) => { s.crit += 0.04 * l; s.critMult += 0.15 * l; } },
  wool: { id: 'wool', name: 'Static Wool', icon: 'wool', max: 5, desc: '+30% pickup range', apply: (s, l) => { s.magnet *= 1 + 0.3 * l; } },
  oil: { id: 'oil', name: 'Lamp Oil', icon: 'oil', max: 5, desc: '+25% burn damage, +5% chance to ignite', apply: (s, l) => { s.burn += 0.25 * l; s.ignite += 0.05 * l; } },
  coal: { id: 'coal', name: 'Coal Heart', icon: 'coal', max: 5, desc: '+20 max health, +0.25 health/sec', apply: (s, l) => { s.maxHp += 20 * l; s.regen += 0.25 * l; } },
  twinwick: { id: 'twinwick', name: 'Twin Wick', icon: 'twinwick', max: 2, desc: '+1 projectile for all weapons', apply: (s, l) => { s.amount += l; } },
  ash: { id: 'ash', name: 'Ash Urn', icon: 'ash', max: 5, desc: '+10% experience', apply: (s, l) => { s.growth += 0.1 * l; } },
  foil: { id: 'foil', name: 'Gold Foil', icon: 'foil', max: 5, desc: '+15% coins, +5% luck', apply: (s, l) => { s.greed += 0.15 * l; s.luck += 0.05 * l; } },
  phoenix: { id: 'phoenix', name: 'Phoenix Feather', icon: 'phoenix', max: 1, desc: '+1 revive: rise again at half health', apply: (s, l) => { s.revives += l; } },
};

export function applyPassives(s: Stats, list: PassiveInst[]) {
  for (const p of list) PASSIVES[p.id]?.apply(s, p.level);
}

export interface Choice {
  kind: 'weapon' | 'passive' | 'evo' | 'heal' | 'coins';
  id: string;
  level: number; // resulting level
  name: string;
  icon: string;
  text: string;
  isNew: boolean;
}

export function describeChoice(c: Choice): string {
  return c.text;
}

/** Build the candidate pool for level-up / chests. */
function candidates(g: Game): { c: Choice; w: number }[] {
  const p = g.player;
  const out: { c: Choice; w: number }[] = [];
  // evolutions first
  for (const w of p.weapons) {
    const def = WEAPONS[w.id];
    if (!w.evo && w.level >= 8 && p.passives.some((q) => q.id === def.evo.passive)) {
      out.push({ c: { kind: 'evo', id: w.id, level: 9, name: def.evo.name, icon: def.icon, text: def.evo.desc, isNew: false }, w: 40 });
    }
  }
  for (const w of p.weapons) {
    const def = WEAPONS[w.id];
    if (w.level < 8) out.push({ c: { kind: 'weapon', id: w.id, level: w.level + 1, name: def.name, icon: def.icon, text: def.levels[w.level - 1], isNew: false }, w: 1.35 });
  }
  for (const q of p.passives) {
    const def = PASSIVES[q.id];
    if (q.level < def.max) out.push({ c: { kind: 'passive', id: q.id, level: q.level + 1, name: def.name, icon: def.icon, text: def.desc, isNew: false }, w: 1.1 });
  }
  if (p.weapons.length < g.weaponSlotsMax) {
    for (const id of Object.keys(WEAPONS)) {
      if (p.weapons.some((w) => w.id === id) || g.banished.has(id)) continue;
      const def = WEAPONS[id];
      if (def.locked && !g.unlockedWeapons.includes(id)) continue;
      out.push({ c: { kind: 'weapon', id, level: 1, name: def.name, icon: def.icon, text: def.desc, isNew: true }, w: 1.0 });
    }
  }
  if (p.passives.length < g.passiveSlotsMax) {
    for (const id of Object.keys(PASSIVES)) {
      if (p.passives.some((q) => q.id === id) || g.banished.has(id)) continue;
      const def = PASSIVES[id];
      out.push({ c: { kind: 'passive', id, level: 1, name: def.name, icon: def.icon, text: def.desc, isNew: true }, w: id === 'phoenix' ? 0.25 : 0.9 });
    }
  }
  return out;
}

export function rollChoices(g: Game, n: number): Choice[] {
  const pool = candidates(g);
  const picked: Choice[] = [];
  // guarantee evolutions show up
  for (const it of pool) if (it.c.kind === 'evo' && picked.length < n) picked.push(it.c);
  let rest = pool.filter((it) => it.c.kind !== 'evo');
  const luck = g.player.stats.luck;
  while (picked.length < n && rest.length) {
    const it = g.rng.weighted(rest, (x) => x.w * (x.c.isNew ? 1 : luck));
    picked.push(it.c);
    rest = rest.filter((x) => x !== it);
  }
  if (picked.length === 0) {
    picked.push({ kind: 'heal', id: 'heal', level: 0, name: 'Toasted Marshmallow', icon: 'marshmallow', text: 'Restore 40% health', isNew: false });
    picked.push({ kind: 'coins', id: 'coins', level: 0, name: 'Coin Purse', icon: 'coin', text: '+30 coins', isNew: false });
  }
  return picked;
}

export function applyChoice(g: Game, c: Choice) {
  const p = g.player;
  switch (c.kind) {
    case 'weapon': {
      const w = p.weapons.find((x) => x.id === c.id);
      if (w) w.level = Math.min(8, w.level + 1);
      else g.addWeapon(c.id);
      break;
    }
    case 'passive': {
      const q = p.passives.find((x) => x.id === c.id);
      if (q) q.level++;
      else p.passives.push({ id: c.id, level: 1 });
      if (c.id === 'phoenix') p.revives++;
      g.recalcStats();
      break;
    }
    case 'evo': {
      const w = p.weapons.find((x) => x.id === c.id);
      if (w) { w.evo = true; w.cd = 0; g.stats.evolutions++; }
      break;
    }
    case 'heal':
      g.heal(p.stats.maxHp * 0.4);
      break;
    case 'coins':
      g.coinsRun += 30;
      g.stats.coins += 30;
      break;
  }
}

/** Chest: 1-3 automatic upgrades (evolutions prioritised). */
export function rollChest(g: Game, count: number): Choice[] {
  const got: Choice[] = [];
  for (let i = 0; i < count; i++) {
    const c = rollChoices(g, 1)[0];
    if (!c) break;
    applyChoice(g, c);
    got.push(c);
  }
  return got;
}

/* ------------------------------------------------------------------ meta shop */

export interface ShopItem {
  id: string;
  name: string;
  icon: string;
  desc: string;
  max: number;
  cost: (rank: number) => number;
  kind: 'stat' | 'blueprint' | 'perk';
}

export const SHOP: ShopItem[] = [
  { id: 'hp', name: 'Thicker Wood', icon: 'heart', desc: '+10 max health per rank', max: 5, kind: 'stat', cost: (r) => 40 + r * 40 },
  { id: 'might', name: 'Sharper Sulfur', icon: 'sulfur', desc: '+5% damage per rank', max: 5, kind: 'stat', cost: (r) => 60 + r * 50 },
  { id: 'armor', name: 'Varnish Coat', icon: 'varnish', desc: '+1 armor per rank', max: 3, kind: 'stat', cost: (r) => 80 + r * 80 },
  { id: 'speed', name: 'Quick Feet', icon: 'shoes', desc: '+5% move speed per rank', max: 3, kind: 'stat', cost: (r) => 50 + r * 50 },
  { id: 'cooldown', name: 'Kindling Stash', icon: 'kindling', desc: '-3% cooldowns per rank', max: 3, kind: 'stat', cost: (r) => 80 + r * 70 },
  { id: 'magnet', name: 'Static Socks', icon: 'wool', desc: '+15% pickup range per rank', max: 3, kind: 'stat', cost: (r) => 30 + r * 30 },
  { id: 'growth', name: 'Ash Wisdom', icon: 'ash', desc: '+5% experience per rank', max: 5, kind: 'stat', cost: (r) => 50 + r * 50 },
  { id: 'greed', name: 'Penny Pincher', icon: 'foil', desc: '+10% coins per rank', max: 5, kind: 'stat', cost: (r) => 30 + r * 40 },
  { id: 'luck', name: 'Four-Leaf Box', icon: 'luckybox', desc: '+5% luck per rank', max: 3, kind: 'stat', cost: (r) => 60 + r * 60 },
  { id: 'revive', name: 'Second Strike', icon: 'phoenix', desc: 'Start every run with a revive', max: 1, kind: 'perk', cost: () => 400 },
  { id: 'reroll', name: 'Loaded Dice', icon: 'reroll', desc: '+1 reroll of level-up choices per run', max: 3, kind: 'perk', cost: (r) => 60 + r * 60 },
  { id: 'banish', name: 'Candle Snuffer', icon: 'banish', desc: '+1 banish per run (remove an option for good)', max: 3, kind: 'perk', cost: (r) => 60 + r * 60 },
  { id: 'choice', name: 'Bigger Matchbox', icon: 'chest', desc: '4 choices on every level-up', max: 1, kind: 'perk', cost: () => 300 },
  { id: 'bp_glare', name: 'Blueprint: Glare', icon: 'glare', desc: 'Adds the Glare beam to the weapon pool', max: 1, kind: 'blueprint', cost: () => 120 },
  { id: 'bp_cinders', name: 'Blueprint: Falling Cinders', icon: 'cinders', desc: 'Adds Falling Cinders to the weapon pool', max: 1, kind: 'blueprint', cost: () => 150 },
  { id: 'bp_breath', name: 'Blueprint: Lighter Breath', icon: 'breath', desc: 'Adds Lighter Breath to the weapon pool', max: 1, kind: 'blueprint', cost: () => 150 },
  { id: 'bp_boomerang', name: 'Blueprint: Tinder Boomerang', icon: 'boomerang', desc: 'Adds the Tinder Boomerang to the weapon pool', max: 1, kind: 'blueprint', cost: () => 180 },
  { id: 'bp_sentry', name: 'Blueprint: Candle Sentry', icon: 'sentry', desc: 'Adds the Candle Sentry to the weapon pool', max: 1, kind: 'blueprint', cost: () => 200 },
];

/** Translate shop ranks into starting stat bonuses. */
export function metaStats(shop: Record<string, number>): Partial<Stats> {
  const r = (k: string) => shop[k] || 0;
  return {
    maxHp: 10 * r('hp'),
    might: 0.05 * r('might'),
    armor: r('armor'),
    speed: 0.05 * r('speed'),
    cooldown: -0.03 * r('cooldown'),
    magnet: 0.15 * r('magnet'),
    growth: 0.05 * r('growth'),
    greed: 0.1 * r('greed'),
    luck: 0.05 * r('luck'),
    revives: r('revive'),
  };
}

export const STARTERS = ['ember', 'whip', 'ring', 'halo', 'volley', 'cracker', 'trail', 'aura', 'spark'];
