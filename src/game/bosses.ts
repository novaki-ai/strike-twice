/** Boss definitions and attack-pattern state machines. */
import type { Game } from './game';
import type { Enemy } from './types';
import { audio } from '../core/audio';
import { vrange } from '../core/rng';
import { splashFx } from './enemies';

export interface BossDef {
  name: string;
  title: string;
  tex: string;
  hp: number;
  size: number;
  r: number;
  speed: number;
  dmg: number;
  xp: number;
  anim: string;
  animSpeed?: number;
  noFlip?: boolean;
  light?: number;
  shadowW?: number;
  anchorY?: number;
  attacks: string[][]; // per phase
  phases: number[]; // hp fractions where phase increases
  desc: string;
}

export const BOSSES: Record<string, BossDef> = {
  duchess: {
    name: 'Duchess Dustwing', title: 'Matriarch of the Mothwood', tex: 'b_duchess', hp: 4200, size: 175, r: 52, speed: 70, dmg: 14, xp: 0,
    anim: 'fly', animSpeed: 5, noFlip: true, light: 0xe8c8ff, shadowW: 160, anchorY: 0.85,
    attacks: [['spiral', 'swoop', 'gust', 'brood'], ['spiral', 'swoop', 'gust', 'brood', 'swoop']],
    phases: [0.5], desc: 'A vain moth duchess who hoards every light she can find.',
  },
  baron: {
    name: 'Baron von Drizzle', title: 'Lord of the Endless Rain', tex: 'b_baron', hp: 9800, size: 180, r: 58, speed: 60, dmg: 18, xp: 0,
    anim: 'float', noFlip: true, light: 0xbfe0ff, shadowW: 170, anchorY: 0.8,
    attacks: [['downpour', 'lightning', 'umbrella', 'summon'], ['downpour', 'lightning', 'umbrella', 'rain', 'summon', 'lightning']],
    phases: [0.5], desc: 'A pompous storm cloud who rains on every parade.',
  },
  snuffer: {
    name: 'The Snuffer', title: 'Extinguisher of All Flames', tex: 'b_snuffer', hp: 20500, size: 215, r: 50, speed: 55, dmg: 22, xp: 0,
    anim: 'float', noFlip: true, light: 0xd0d8ff, shadowW: 150, anchorY: 0.9,
    attacks: [['slam', 'spokes', 'sweep', 'snuffers'], ['slam', 'spokes', 'lightsout', 'sweep', 'slam'], ['slam', 'spokes', 'sweep', 'lightsout', 'slam', 'spokes']],
    phases: [0.6, 0.25], desc: 'The cold hand that put out every light in Tinderbox.',
  },
};

export function startBossFight(g: Game, id: string) {
  const def = BOSSES[id];
  const p = g.player;
  g.arena = { x: p.x, y: p.y - 60, r: 580 };
  const bx = g.arena.x, by = g.arena.y - 240;
  const e = g.spawnEnemy(id, bx, by - 500, {
    boss: { id, phase: 1, attack: null, at: 0, cdT: 2.6, invuln: true, dying: false, deathT: 0, rot: 0, entry: 0, data: {}, last: '', tx: bx, ty: by, count: 0 },
  });
  if (!e) return;
  e.maxHp = e.hp = def.hp;
  e.r = def.r;
  e.speed = def.speed;
  e.dmg = def.dmg;
  e.spawnT = 0;
  g.boss = e;
  g.bossActive = true;
  g.hooks.bossSpawn(id);
  audio.sfx('roar', 0.8);
  g.shake(8, 0.6);
}

function aimAngle(g: Game, e: Enemy) {
  return Math.atan2(g.player.y - 26 - (e.y - e.def.size * 0.45), g.player.x - e.x);
}

function bulletOrigin(e: Enemy) {
  return { x: e.x, y: e.y - e.def.size * 0.45 };
}

export function updateBoss(g: Game, e: Enemy, dt: number) {
  const B = e.boss;
  const def = e.def as BossDef;
  const p = g.player;
  e.t += dt;
  e.vx *= 0.9; e.vy *= 0.9;
  if (e.flash > 0) e.flash -= 0; // handled in game loop
  // entry: descend into the arena
  if (B.entry < 1.6) {
    B.entry += dt;
    const f = Math.min(1, B.entry / 1.6);
    const ease = 1 - Math.pow(1 - f, 3);
    e.y = B.ty - 500 * (1 - ease);
    e.x = B.tx;
    if (f >= 1) { B.invuln = false; }
    return;
  }
  if (B.dying) { bossDeath(g, e, dt); return; }
  // phase changes
  const frac = e.hp / e.maxHp;
  const nextTh = def.phases[B.phase - 1];
  if (nextTh !== undefined && frac <= nextTh) {
    B.phase++;
    B.cdT = 1.4;
    B.attack = null;
    g.hooks.bossPhase(B.id, B.phase);
    audio.sfx('roar', 0.9, 1.1);
    g.shake(10, 0.5);
    g.clearBullets(true);
    if (B.id === 'baron' && B.phase === 2) g.darkTarget += 0.15;
  }
  // movement
  if (!B.attack || !B.data.lockMove) {
    let tx = p.x, ty = p.y - 40;
    const want = B.id === 'snuffer' ? 150 : 220;
    const dx = e.x - p.x, dy = e.y - p.y;
    const d = Math.hypot(dx, dy) || 1;
    // orbit around the player at a comfortable distance
    const ang = Math.atan2(dy, dx) + dt * 0.35;
    tx = p.x + Math.cos(ang) * want;
    ty = p.y + Math.sin(ang) * want * 0.75 - 20;
    const mx = tx - e.x, my = ty - e.y;
    const md = Math.hypot(mx, my) || 1;
    const sp = e.speed * (B.phase > 1 ? 1.25 : 1);
    if (md > 8) { e.x += (mx / md) * sp * dt; e.y += (my / md) * sp * dt; }
    e.face = p.x > e.x ? 1 : -1;
    void d;
  }
  if (g.arena) g.clampToArena(e, 60);
  // attacks
  if (!B.attack) {
    B.cdT -= dt;
    if (B.cdT <= 0) {
      const list = def.attacks[Math.min(def.attacks.length, B.phase) - 1];
      let pick = g.rng.pick(list);
      if (pick === B.last) pick = g.rng.pick(list);
      B.attack = pick;
      B.last = pick;
      B.at = 0;
      B.count = 0;
      B.data = {};
    }
    return;
  }
  B.at += dt;
  const fast = B.phase > 1 ? 1.25 : 1;
  const done = ATTACKS[B.attack](g, e, B, dt, fast);
  if (done) {
    B.attack = null;
    B.data = {};
    B.cdT = (B.id === 'snuffer' ? 1.0 : 1.3) / fast - (B.phase >= 3 ? 0.3 : 0);
  }
}

type AttackFn = (g: Game, e: Enemy, B: any, dt: number, fast: number) => boolean;

const ATTACKS: Record<string, AttackFn> = {
  /* ---------------- Duchess Dustwing ---------------- */
  spiral(g, e, B, dt, fast) {
    const arms = B.phase > 1 ? 3 : 2;
    B.data.t = (B.data.t ?? 0) - dt;
    B.data.a = B.data.a ?? g.rng.angle();
    if (B.data.t <= 0) {
      B.data.t = 0.1 / fast;
      const o = bulletOrigin(e);
      for (let i = 0; i < arms; i++) {
        const a = B.data.a + (i / arms) * Math.PI * 2;
        g.spawnBullet(o.x, o.y, Math.cos(a) * 150, Math.sin(a) * 150, { r: 9, dmg: 10, life: 5, tint: 0xd9b8ff });
      }
      B.data.a += 0.23;
      audio.sfx('eshoot', 0.12, 0.8);
    }
    return B.at > 3.4;
  },
  swoop(g, e, B, dt, fast) {
    const p = g.player;
    if (B.count === 0) {
      B.count = 1;
      B.data.lockMove = true;
      const a = Math.atan2(p.y - e.y, p.x - e.x);
      B.data.a = a;
      B.data.sx = e.x; B.data.sy = e.y;
      g.tele({ kind: 'line', x: e.x, y: e.y, ang: a, len: 900, w: 110, dur: 0.85 / fast, color: 0xd9b8ff });
      audio.sfx('buzz', 0.5, 0.8);
    }
    const tWind = 0.85 / fast;
    if (B.at > tWind && B.at < tWind + 0.9) {
      const sp = 950;
      e.x += Math.cos(B.data.a) * sp * dt;
      e.y += Math.sin(B.data.a) * sp * dt;
      if (g.frameCount % 3 === 0) {
        const pa = B.data.a + Math.PI / 2 * (g.frameCount % 6 === 0 ? 1 : -1);
        g.spawnBullet(e.x, e.y - 60, Math.cos(pa) * 60, Math.sin(pa) * 60, { r: 8, dmg: 9, life: 3, tint: 0xe8d8b0, acc: 30 });
        g.puff(e.x, e.y - 40, 0xe8d8b0, 0.7, 0.8);
      }
      if (g.arena && Math.hypot(e.x - g.arena.x, e.y - g.arena.y) > g.arena.r - 70) B.at = tWind + 0.9;
    }
    if (B.at >= tWind + 0.9) {
      if (B.phase > 1 && B.count === 1 && !B.data.second) {
        B.data.second = true;
        B.count = 0;
        B.at = 0;
        return false;
      }
      B.data.lockMove = false;
      return true;
    }
    return false;
  },
  gust(g, e, B, dt, fast) {
    B.data.t = (B.data.t ?? 0.3) - dt;
    if (B.data.t <= 0 && B.count < 3) {
      B.data.t = 0.5 / fast;
      B.count++;
      const o = bulletOrigin(e);
      const a0 = aimAngle(g, e);
      const n = B.phase > 1 ? 9 : 7;
      for (let i = 0; i < n; i++) {
        const a = a0 + (i - (n - 1) / 2) * 0.16;
        g.spawnBullet(o.x, o.y, Math.cos(a) * 215, Math.sin(a) * 215, { r: 9, dmg: 11, life: 4, tint: 0xf0e0b0 });
      }
      audio.sfx('dash', 0.5, 0.7);
      g.puff(o.x, o.y, 0xf0e0b0, 1.2, 0.8);
    }
    return B.at > 1.9 / fast;
  },
  brood(g, e, B) {
    if (B.count === 0) {
      B.count = 1;
      const p = g.player;
      const n = B.phase > 1 ? 12 : 8;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const m = g.spawnEnemy('moth', p.x + Math.cos(a) * 280, p.y + Math.sin(a) * 230);
        if (m) m.noXp = false;
      }
      audio.sfx('buzz', 0.6, 1.2);
      g.hooks.toast('"My darlings, fetch!"', 'boss');
    }
    return B.at > 1.2;
  },

  /* ---------------- Baron von Drizzle ---------------- */
  downpour(g, e, B, dt, fast) {
    const p = g.player;
    if (B.count === 0) {
      B.count = 1;
      const n = B.phase > 1 ? 20 : 14;
      for (let i = 0; i < n; i++) {
        const onPlayer = i === 0;
        const a = g.rng.angle();
        const r = onPlayer ? 0 : g.rng.range(40, 280);
        const x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r;
        const delay = (0.9 + i * (1.4 / n)) / fast;
        g.tele({ kind: 'circle', x, y, r: 50, dur: delay, color: 0x7fb6e6, onDone: () => {
          const dx = g.player.x - x, dy = g.player.y - y;
          if (dx * dx + dy * dy < 54 * 54) g.hurtPlayer(16, null);
          splashFx(g, x, y, 50);
        } });
      }
      audio.sfx('thunder', 0.5, 1.2);
    }
    return B.at > 2.6 / fast;
  },
  lightning(g, e, B, dt, fast) {
    if (B.count === 0) {
      B.count = 1;
      const n = B.phase > 1 ? 5 : 3;
      const a0 = aimAngle(g, e);
      const ox = e.x, oy = e.y - 40;
      for (let i = 0; i < n; i++) {
        const a = a0 + (i - (n - 1) / 2) * 0.32;
        g.tele({ kind: 'line', x: ox, y: oy, ang: a, len: 1000, w: 54, dur: 1.05 / fast, color: 0xffe066, onDone: () => {
          const p = g.player;
          const dx = p.x - ox, dy = p.y - 26 - oy;
          const along = dx * Math.cos(a) + dy * Math.sin(a);
          const perp = Math.abs(-dx * Math.sin(a) + dy * Math.cos(a));
          if (along > 0 && perp < 34) g.hurtPlayer(20, null);
          const pts = [ox, oy];
          for (let s = 1; s <= 10; s++) pts.push(ox + Math.cos(a) * s * 100 + vrange(-14, 14), oy + Math.sin(a) * s * 100 + vrange(-14, 14));
          g.bolt(pts, 0xfff3a0, 5);
        } });
      }
      audio.sfx('buzz', 0.4, 2);
    }
    if (B.at > 1.05 / fast && !B.data.boom) {
      B.data.boom = true;
      audio.sfx('thunder', 0.9);
      g.shake(9, 0.35);
      if (g.settings.flashes) { g.flashT = 0.15; g.flashColor = 0xfff8d0; }
    }
    return B.at > 1.6 / fast;
  },
  umbrella(g, e, B, dt, fast) {
    B.data.t = (B.data.t ?? 0.2) - dt;
    if (B.data.t <= 0 && B.count < 3) {
      B.data.t = 0.65 / fast;
      B.count++;
      const o = bulletOrigin(e);
      const n = 24;
      const gap = g.rng.int(0, n - 1);
      const off = g.rng.next() * 0.3;
      for (let i = 0; i < n; i++) {
        if (Math.abs(i - gap) <= 1) continue;
        const a = (i / n) * Math.PI * 2 + off;
        g.spawnBullet(o.x, o.y, Math.cos(a) * 165, Math.sin(a) * 165, { r: 9, dmg: 12, life: 5, tint: 0x7fb6e6, turn: B.phase > 1 ? 0.35 * (B.count % 2 ? 1 : -1) : 0 });
      }
      audio.sfx('splash', 0.4, 1.3);
    }
    e.boss.rot = Math.sin(B.at * 10) * 0.15;
    if (B.at > 2.1 / fast) { e.boss.rot = 0; return true; }
    return false;
  },
  summon(g, e, B) {
    if (B.count === 0) {
      B.count = 1;
      const p = g.player;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        g.spawnEnemy(i % 3 === 0 ? 'balloon' : 'slime', p.x + Math.cos(a) * 300, p.y + Math.sin(a) * 240);
      }
      g.hooks.toast('"Puddles! Attend me!"', 'boss');
      audio.sfx('splash', 0.6, 0.8);
    }
    return B.at > 1.2;
  },
  rain(g, e, B, dt, fast) {
    // slanted rain sweeping across the arena
    B.data.t = (B.data.t ?? 0) - dt;
    if (B.data.t <= 0) {
      B.data.t = 0.12 / fast;
      const a = g.arena!;
      const x = a.x + g.rng.range(-a.r, a.r) - 200;
      const y = a.y - a.r - 20;
      g.spawnBullet(x, y, 110, 290, { r: 7, dmg: 10, life: 4.5, tint: 0x9fd0ff });
      g.spawnBullet(x + g.rng.range(100, 300), y, 110, 290, { r: 7, dmg: 10, life: 4.5, tint: 0x9fd0ff });
    }
    return B.at > 3.2;
  },

  /* ---------------- The Snuffer ---------------- */
  slam(g, e, B, dt, fast) {
    const p = g.player;
    if (B.count === 0) {
      B.count = 1;
      B.data.lockMove = true;
      B.invuln = true;
      B.data.tele = g.tele({ kind: 'circle', x: p.x, y: p.y, r: 125, dur: (1.7 / fast), color: 0xb48aff, follow: false });
      audio.sfx('dash', 0.6, 0.5);
    }
    const up = 0.35, track = 1.25 / fast, lock = 0.45 / fast;
    const t = B.at;
    const tl = B.data.tele;
    if (t < up) {
      e.alpha = 1 - t / up;
      e.hop = (t / up) * 400;
    } else if (t < up + track) {
      e.alpha = 0;
      // shadow follows the player
      tl.x += (p.x - tl.x) * Math.min(1, dt * 5);
      tl.y += (p.y - tl.y) * Math.min(1, dt * 5);
      e.x = tl.x; e.y = tl.y;
    } else if (t < up + track + lock) {
      e.alpha = Math.min(1, (t - up - track) / lock);
      e.hop = 400 * (1 - (t - up - track) / lock);
      e.x = tl.x; e.y = tl.y;
    } else if (!B.data.slammed) {
      B.data.slammed = true;
      e.hop = 0; e.alpha = 1;
      B.invuln = false;
      const dx = p.x - e.x, dy = p.y - e.y;
      if (dx * dx + dy * dy < 130 * 130) g.hurtPlayer(26, null);
      audio.sfx('slam', 1);
      g.shake(16, 0.5);
      g.explosionFx(e.x, e.y, 110, 0xb48aff, true);
      const n = B.phase >= 3 ? 30 : 22;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        g.spawnBullet(e.x, e.y - 20, Math.cos(a) * 180, Math.sin(a) * 180, { r: 9, dmg: 12, life: 4, tint: 0xb48aff });
      }
      for (let i = 0; i < 10; i++) g.puff(e.x + vrange(-60, 60), e.y + vrange(-20, 20), 0x4a4250, 1, 1.2);
    }
    if (t > up + track + lock + 0.7) {
      B.data.lockMove = false;
      e.hop = 0; e.alpha = 1; B.invuln = false;
      return true;
    }
    return false;
  },
  spokes(g, e, B, dt, fast) {
    const spokes = B.phase >= 3 ? 7 : B.phase === 2 ? 6 : 5;
    B.data.t = (B.data.t ?? 0) - dt;
    B.data.a = B.data.a ?? g.rng.angle();
    if (B.data.t <= 0) {
      B.data.t = 0.13 / fast;
      const o = bulletOrigin(e);
      const dir = B.phase >= 3 && Math.floor(B.at / 1.2) % 2 ? -1 : 1;
      B.data.a += 0.12 * dir;
      for (let i = 0; i < spokes; i++) {
        const a = B.data.a + (i / spokes) * Math.PI * 2;
        g.spawnBullet(o.x, o.y, Math.cos(a) * 170, Math.sin(a) * 170, { r: 9, dmg: 12, life: 5, tint: 0x8f86a8 });
      }
      audio.sfx('eshoot', 0.1, 0.6);
    }
    return B.at > 3.6;
  },
  lightsout(g, e, B) {
    const p = g.player;
    if (B.count === 0) {
      B.count = 1;
      g.extraDark = 0.38;
      g.hooks.toast('The Snuffer smothers the light!', 'boss');
      audio.sfx('roar', 0.6, 0.7);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        g.spawnEnemy('waxghost', p.x + Math.cos(a) * 250, p.y + Math.sin(a) * 200);
      }
    }
    B.data.t = (B.data.t ?? 0.8) - 1 / 60;
    if (B.data.t <= 0 && B.count < 5) {
      B.data.t = 1.1;
      B.count++;
      const o = bulletOrigin(e);
      const a = aimAngle(g, e);
      g.spawnBullet(o.x, o.y, Math.cos(a) * 120, Math.sin(a) * 120, { r: 13, dmg: 16, life: 5.5, tint: 0x6a5a80, homing: 1.4 });
      audio.sfx('eshoot', 0.3, 0.5);
    }
    if (B.at > 6.5) { g.extraDark = 0; return true; }
    return false;
  },
  sweep(g, e, B, dt, fast) {
    // walls of cold wind with a gap, crossing the arena
    B.data.t = (B.data.t ?? 0) - dt;
    const waves = B.phase >= 2 ? 3 : 2;
    if (B.data.t <= 0 && B.count < waves) {
      B.data.t = 1.1 / fast;
      B.count++;
      const a = g.arena!;
      const horizontal = g.rng.chance(0.5);
      const dir = g.rng.chance(0.5) ? 1 : -1;
      const n = 26;
      const gapC = g.rng.int(4, n - 6);
      for (let i = 0; i < n; i++) {
        if (i >= gapC && i <= gapC + 3) continue;
        const off = (i / (n - 1) - 0.5) * a.r * 2.1;
        const x = horizontal ? a.x - dir * (a.r + 10) : a.x + off;
        const y = horizontal ? a.y + off : a.y - dir * (a.r + 10);
        g.spawnBullet(x, y, horizontal ? dir * 175 : 0, horizontal ? 0 : dir * 175, { r: 10, dmg: 13, life: 8, tint: 0xbfe6ff });
      }
      audio.sfx('dash', 0.6, 0.6);
    }
    return B.at > (waves * 1.1 + 0.5) / fast;
  },
  snuffers(g, e, B) {
    if (B.count === 0) {
      B.count = 1;
      const p = g.player;
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        g.spawnEnemy('snufflet', p.x + Math.cos(a) * 300, p.y + Math.sin(a) * 240);
      }
      g.hooks.toast('"Snuff him out, my little bells!"', 'boss');
    }
    return B.at > 1.2;
  },
};

function bossDeath(g: Game, e: Enemy, dt: number) {
  const B = e.boss;
  if (B.deathT === 0) {
    g.clearBullets(true);
    g.teles.length = 0;
    g.extraDark = 0;
    g.slowmoT = 1.6;
    audio.sfx('bossdie', 1);
    for (const o of g.enemies) if (o.alive && !o.boss) g.despawn(o, true);
  }
  B.deathT += dt;
  B.invuln = true;
  e.boss.rot = Math.sin(B.deathT * 40) * 0.08;
  e.flash = Math.floor(B.deathT * 12) % 2 ? 0.05 : 0;
  if (Math.floor(B.deathT * 8) !== Math.floor((B.deathT - dt) * 8)) {
    g.explosionFx(e.x + vrange(-70, 70), e.y - vrange(20, 160), vrange(30, 60), 0xffc070, false);
    audio.sfx('explode', 0.4, vrange(0.8, 1.3), 0.02);
    g.shake(6, 0.2);
  }
  if (B.deathT > 2.4) {
    g.explosionFx(e.x, e.y - 80, 160, 0xfff1c4, true);
    g.shake(18, 0.6);
    if (g.settings.flashes) { g.flashT = 0.35; g.flashColor = 0xfff8e0; }
    audio.sfx('explode', 1, 0.7);
    for (let i = 0; i < 20; i++) g.dropPickup('coin', e.x + vrange(-90, 90), e.y + vrange(-60, 60), 3);
    for (let i = 0; i < 12; i++) g.dropPickup('xp', e.x + vrange(-90, 90), e.y + vrange(-60, 60), 20);
    g.dropPickup('heal', e.x, e.y + 30);
    g.magnetAll();
    e.alive = false;
    e.sp.visible = false;
    e.sh.visible = false;
    g.boss = null;
    g.bossActive = false;
    g.arena = null;
    g.stats.bossesKilled.push(B.id);
    g.hooks.bossDefeated(B.id);
  }
}
