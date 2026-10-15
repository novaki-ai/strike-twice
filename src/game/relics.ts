/** Relics: one-of-a-kind boons chosen at each stage clear. Stat parts apply in recalcStats,
 *  behaviour parts are checked through the helpers below from the core loop. */
import type { Stats } from './types';
import type { Game } from './game';
import type { Enemy } from './types';
import { audio } from '../core/audio';
import { vrange } from '../core/rng';

export interface RelicDef {
  id: string;
  name: string;
  icon: string;
  desc: string;
  apply?: (s: Stats) => void;
}

export const RELICS: Record<string, RelicDef> = {
  kindling: { id: 'kindling', name: 'Kindling Heart', icon: 'r_kindling', desc: 'Every 25 enemies snuffed restores 4 health.' },
  wrath: { id: 'wrath', name: 'Wick of Wrath', icon: 'r_wrath', desc: '+40% damage while below half health.' },
  ward: { id: 'ward', name: 'Ashen Ward', icon: 'r_ward', desc: 'An ash shield blocks one hit, recharging every 12 seconds.' },
  tithe: { id: 'tithe', name: 'Ember Tithe', icon: 'r_tithe', desc: '+25% experience and +25% pickup range.', apply: (s) => { s.growth += 0.25; s.magnet *= 1.25; } },
  dance: { id: 'dance', name: 'Dancing Flame', icon: 'r_dance', desc: 'Dashing leaves a trail of exploding embers. Dash recharges 25% faster.', apply: (s) => { s.dashCd *= 0.75; } },
  coat: { id: 'coat', name: 'Smoldering Coat', icon: 'r_coat', desc: 'Enemies that touch you burst into flames. +2 armor.', apply: (s) => { s.armor += 2; } },
  spare: { id: 'spare', name: 'Spare Match', icon: 'r_spare', desc: 'Rise again once at half health. +20 max health.', apply: (s) => { s.maxHp += 20; } },
  lucky: { id: 'lucky', name: 'Lucky Strike', icon: 'r_lucky', desc: '+12% crit chance. Critical hits spray sparks at nearby enemies.', apply: (s) => { s.crit += 0.12; } },
  bane: { id: 'bane', name: 'Bellbreaker', icon: 'r_bane', desc: '+30% damage against bosses and elites.' },
};

export const RELIC_ICONS = Object.values(RELICS).map((r) => r.icon);

export function applyRelics(s: Stats, relics: Set<string>) {
  for (const id of relics) RELICS[id]?.apply?.(s);
}

/** Three distinct relics the player does not own yet (seeded). */
export function rollRelics(g: Game, n = 3): RelicDef[] {
  const pool = Object.values(RELICS).filter((r) => !g.relics.has(r.id));
  g.rng.shuffle(pool);
  return pool.slice(0, n);
}

export function grantRelic(g: Game, id: string) {
  if (!RELICS[id] || g.relics.has(id)) return;
  g.relics.add(id);
  if (id === 'spare') g.player.revives++;
  if (id === 'ward') g.wardT = 0;
  g.recalcStats();
}

/** damage multiplier from relics for a hit on enemy e */
export function relicDamageMul(g: Game, e: Enemy): number {
  let m = 1;
  const p = g.player;
  if (g.relics.has('wrath') && p.hp < p.stats.maxHp * 0.5) m *= 1.4;
  if (g.relics.has('bane') && (e.boss || e.elite)) m *= 1.3;
  return m;
}

export function relicOnCrit(g: Game, e: Enemy, dmg: number) {
  if (!g.relics.has('lucky')) return;
  let n = 0;
  g.query(e.x, e.y, 70, (o) => {
    if (o === e || n >= 3) return n >= 3;
    if ((o.x - e.x) ** 2 + (o.y - e.y) ** 2 > 70 * 70) return;
    n++;
    g.damageEnemy(o, dmg * 0.3, null, { noCrit: true, small: true, fromX: e.x, fromY: e.y });
  });
  g.spark(e.x, e.y - 20, 0xffe066, 4, 160);
}

export function relicOnKill(g: Game) {
  if (!g.relics.has('kindling')) return;
  g.kindlingCount++;
  if (g.kindlingCount >= 25) {
    g.kindlingCount = 0;
    g.heal(4);
  }
}

/** returns true if the hit was blocked */
export function relicOnHurt(g: Game, src: Enemy | null): boolean {
  if (src && g.relics.has('coat') && !src.boss) {
    src.burnT = 3;
    src.burnDps = Math.max(src.burnDps, 15);
  }
  if (g.relics.has('ward') && g.wardT <= 0) {
    g.wardT = 12;
    const p = g.player;
    p.iframes = 0.6;
    audio.sfx('tick', 0.8, 0.6);
    audio.sfx('ring', 0.5, 1.4);
    g.particle(p.x, p.y - 30, g.fx.smokering, { life: 0.4, s0: 0.3, s1: 0.75, a0: 0.9, tint: 0xd8d0c0, layer: 2 });
    for (let i = 0; i < 8; i++) g.puff(p.x + vrange(-20, 20), p.y - vrange(10, 50), 0xb8b0a0, 0.5, 0.7);
    return true;
  }
  return false;
}

export function relicUpdate(g: Game, dt: number) {
  if (g.wardT > 0) g.wardT -= dt;
  const p = g.player;
  if (g.relics.has('dance') && p.dashT > 0) {
    g.danceT -= dt;
    if (g.danceT <= 0) {
      g.danceT = 0.05;
      g.blast(p.x, p.y, 42, 14 + p.level * 1.2, null, 0xffb040, false, 4);
    }
  }
}
