/** Weapons: 14 weapons x 8 levels, each with an evolution. */
import type { Game } from './game';
import type { Enemy, Proj, WeaponInst, Zone } from './types';
import { audio } from '../core/audio';
import { vrange } from '../core/rng';

export interface WeaponDef {
  id: string;
  name: string;
  icon: string;
  desc: string;
  levels: string[]; // text for L2..L8
  evo: { passive: string; name: string; desc: string };
  locked?: boolean;
  update(g: Game, w: WeaponInst, dt: number): void;
  projUpdate?(g: Game, p: Proj, dt: number): boolean | void;
  projHit?(g: Game, p: Proj, e: Enemy): void;
  projExpire?(g: Game, p: Proj): void;
  zoneUpdate?(g: Game, z: Zone, dt: number): void;
  zoneRender?(g: Game, z: Zone, dt: number): void;
}

const L = (w: WeaponInst, arr: number[]) => arr[Math.min(arr.length, w.level) - 1];

function cooldown(g: Game, w: WeaponInst, dt: number, base: number, fire: () => void) {
  w.cd -= dt;
  if (w.cd <= 0) {
    w.cd = base * g.player.stats.cooldown;
    fire();
  }
}

function aimAt(g: Game, maxR = 520): { x: number; y: number; e: Enemy | null } {
  const p = g.player;
  const e = g.nearestEnemy(p.x, p.y - 20, maxR);
  if (e) {
    const dx = e.x - p.x, dy = e.y - 20 - (p.y - 28);
    const d = Math.hypot(dx, dy) || 1;
    return { x: dx / d, y: dy / d, e };
  }
  return { x: p.moving ? p.dirX : p.face, y: p.moving ? p.dirY : 0, e: null };
}

function fireZone(g: Game, w: WeaponInst, x: number, y: number, r: number, dmg: number, life: number, burn = 0) {
  const z = g.spawnZone({ kind: 1, w, x, y, r, dmg, tick: 0.4, life, burn, knock: 0, data: { pool: 'fireA', pool2: 'fireB', light: 0xff9a40 } });
  z.sp = g.pool('fireA', g.addLayer, g.fx.glow);
  z.sp.anchor.set(0.5);
  z.sp.tint = 0xff7a2a;
  z.sp2 = g.pool('fireB', g.projLayer, g.fx.flame);
  z.sp2.anchor.set(0.5, 0.9);
  return z;
}

function renderFireZone(g: Game, z: Zone) {
  const f = z.t / z.maxLife;
  const fade = f > 0.75 ? 1 - (f - 0.75) / 0.25 : Math.min(1, z.t * 6);
  if (z.sp) {
    z.sp.x = z.x; z.sp.y = z.y;
    z.sp.scale.set((z.r * 2.2) / 128);
    z.sp.alpha = 0.55 * fade;
  }
  if (z.sp2) {
    const fl = 0.85 + 0.2 * Math.sin(g.time * 25 + z.x);
    z.sp2.x = z.x; z.sp2.y = z.y + z.r * 0.3;
    z.sp2.scale.set((z.r / 60) * fl, (z.r / 50) * fl * fade);
    z.sp2.alpha = fade;
  }
}

/* ===================================================================== */

export const WEAPONS: Record<string, WeaponDef> = {
  ember: {
    id: 'ember', name: 'Ember Toss', icon: 'ember',
    desc: 'Flicks a hot ember at the nearest enemy.',
    levels: ['+1 ember', '+3 damage', '+1 ember', '+1 pierce, +3 damage', '+1 ember', '+3 damage', '+1 pierce, +3 damage, faster'],
    evo: { passive: 'sulfur', name: 'Sulfur Storm', desc: 'A rapid barrage of embers that explode on impact.' },
    update(g, w, dt) {
      const cd = w.evo ? 0.55 : L(w, [0.9, 0.9, 0.88, 0.88, 0.85, 0.85, 0.8, 0.72]);
      cooldown(g, w, dt, cd, () => {
        const p = g.player;
        const n = L(w, [1, 2, 2, 3, 3, 4, 4, 4]) + p.stats.amount + (w.evo ? 2 : 0);
        const targets = g.nearestN(p.x, p.y, n, 520);
        const dmg = L(w, [12, 12, 15, 15, 18, 18, 21, 24]) * (w.evo ? 1.2 : 1);
        const pierce = L(w, [1, 1, 1, 1, 2, 2, 2, 3]) + p.stats.pierce;
        const spd = 400 * p.stats.projSpeed;
        for (let i = 0; i < n; i++) {
          let a: number;
          if (targets.length) {
            const t = targets[i % targets.length];
            a = Math.atan2(t.y - t.def.size * t.scale * 0.35 - (p.y - 30), t.x - p.x) + (i >= targets.length ? g.rr(-0.2, 0.2) : 0);
          } else a = Math.atan2(p.moving ? p.dirY : 0, p.moving ? p.dirX : p.face) + (i - (n - 1) / 2) * 0.18;
          g.spawnProj({
            tex: 'ember', w, x: p.x + p.face * 6, y: p.y - 30, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, r: 8 * p.stats.area,
            dmg, pierce, life: 1.5 * p.stats.duration, scale: 0.3 * p.stats.area * (w.evo ? 1.25 : 1), light: 30, spin: 8, knock: 0.8,
            explode: w.evo ? 48 * p.stats.area : 0,
          });
        }
        audio.sfx('shoot', 0.35);
      });
    },
    projUpdate(g, p, dt) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (g.frameCount % 3 === 0) g.particle(p.x, p.y, g.fx.glow, { add: true, life: 0.25, s0: 0.18, s1: 0.02, tint: 0xff8a2a });
    },
    projHit(g, p, e) {
      if (p.explode > 0) g.blast(p.x, p.y, p.explode, p.dmg * 0.6, p.w, 0xffb040, false, 4);
      void e;
    },
  },

  whip: {
    id: 'whip', name: 'Flame Lash', icon: 'whip',
    desc: 'Cracks a whip of fire to your side.',
    levels: ['Also lashes behind you', '+5 damage', '+15% length', '+5 damage', '+15% length', '+5 damage', '+5 damage, faster'],
    evo: { passive: 'oil', name: 'Inferno Lash', desc: 'Huge burning lashes that leave walls of fire.' },
    update(g, w, dt) {
      const cd = L(w, [1.3, 1.3, 1.3, 1.25, 1.25, 1.2, 1.2, 1.05]) * (w.evo ? 0.85 : 1);
      if (w.data.queue && (w.data.queueT -= dt) <= 0) {
        w.data.queue = 0;
        lash(g, w, -w.data.side);
      }
      cooldown(g, w, dt, cd, () => {
        const side = g.player.face;
        lash(g, w, side);
        if (w.level >= 2) { w.data.queue = 1; w.data.queueT = 0.16; w.data.side = side; }
      });
    },
  },

  ring: {
    id: 'ring', name: 'Smoke Rings', icon: 'ring',
    desc: 'Puffs expanding smoke rings that slow and push enemies.',
    levels: ['+15% size', '+3 damage', '+1 ring', '+3 damage', '+15% size', '+1 ring', '+5 damage'],
    evo: { passive: 'ash', name: 'Smog Cyclone', desc: 'A choking vortex of smog swirls around you, dragging enemies in.' },
    update(g, w, dt) {
      const p = g.player;
      if (w.evo && !w.data.vortex?.alive) {
        const z = g.spawnZone({ kind: 3, w, x: p.x, y: p.y, r: 150, dmg: 10, tick: 0.35, life: 1e9, follow: true, slow: 0.5, data: { pool: 'vortex', puffs: [] } });
        z.sp = g.pool('vortex', g.projLayer, g.fx.softring);
        z.sp.anchor.set(0.5);
        z.sp.tint = 0x8a8478;
        w.data.vortex = z;
      }
      if (w.evo && w.data.vortex) {
        const z = w.data.vortex as Zone;
        z.r = 160 * p.stats.area;
        z.dmg = 14 + w.level;
      }
      const count = L(w, [1, 1, 1, 2, 2, 2, 3, 3]) + Math.min(1, p.stats.amount);
      if (w.data.left > 0 && (w.data.t -= dt) <= 0) {
        w.data.left--;
        w.data.t = 0.28;
        smokeRing(g, w);
      }
      cooldown(g, w, dt, L(w, [2.6, 2.6, 2.5, 2.5, 2.4, 2.4, 2.3, 2.2]), () => {
        w.data.left = count - 1;
        w.data.t = 0.28;
        smokeRing(g, w);
      });
    },
    zoneUpdate(g, z, dt) {
      if (z.kind === 2) {
        // expanding ring
        const f = Math.min(1, z.t / z.maxLife);
        const ease = 1 - (1 - f) * (1 - f);
        z.r = z.r0 + (z.r1 - z.r0) * ease;
        g.query(z.x, z.y, z.r + 40, (e) => {
          if (z.hitSet!.has(e.id)) return;
          const d = Math.hypot(e.x - z.x, e.y - z.y);
          if (Math.abs(d - z.r) < 20 + e.r) {
            z.hitSet!.add(e.id);
            g.damageEnemy(e, z.dmg, z.w, { knock: 2.2, slow: z.slow, fromX: z.x, fromY: z.y });
          }
        });
      } else if (z.kind === 3) {
        z.tickT -= dt;
        const pullK = 70 * dt;
        g.query(z.x, z.y, z.r + 20, (e) => {
          if (e.boss) return;
          const dx = z.x - e.x, dy = z.y - e.y;
          const d = Math.hypot(dx, dy) || 1;
          if (d < z.r) {
            // swirl + pull
            e.x += (dx / d) * pullK + (-dy / d) * pullK * 0.8;
            e.y += (dy / d) * pullK + (dx / d) * pullK * 0.8;
            if (z.tickT <= 0) g.damageEnemy(e, z.dmg, z.w, { noKnock: true, slow: z.slow, small: true });
          }
        });
        if (z.tickT <= 0) z.tickT = z.tick;
      }
    },
    zoneRender(g, z) {
      if (z.kind === 2 && z.sp) {
        const f = z.t / z.maxLife;
        z.sp.x = z.x; z.sp.y = z.y - 10;
        z.sp.scale.set((z.r * 2) / 216, (z.r * 2) / 216 * 0.82);
        z.sp.rotation = z.t * 0.8;
        z.sp.alpha = 0.95 * (1 - f * f * f);
      } else if (z.kind === 3 && z.sp) {
        z.sp.x = z.x; z.sp.y = z.y - 10;
        z.sp.scale.set((z.r * 2.1) / 256);
        z.sp.rotation += 0.05;
        z.sp.alpha = 0.55 + 0.1 * Math.sin(g.time * 3);
        if (g.frameCount % 2 === 0) {
          const a = g.time * 4 + Math.random() * 6.28;
          const rr = z.r * vrange(0.5, 1);
          g.particle(z.x + Math.cos(a) * rr, z.y + Math.sin(a) * rr * 0.8, g.fx.puff, { vx: -Math.sin(a) * 120, vy: Math.cos(a) * 100, life: 0.7, s0: 0.3, s1: 0.6, a0: 0.45, tint: 0x6f685e, drag: 1 });
        }
      }
    },
  },

  halo: {
    id: 'halo', name: 'Firefly Halo', icon: 'halo',
    desc: 'Fireflies circle you, scorching whatever they touch.',
    levels: ['+1 firefly', '+3 damage, longer', '+1 firefly', '+3 damage, wider', '+1 firefly', '+3 damage, longer', '+1 firefly, +4 damage'],
    evo: { passive: 'coal', name: 'Solar Corona', desc: 'A permanent crown of tiny suns that sets enemies ablaze.' },
    update(g, w, dt) {
      const p = g.player;
      w.t += dt;
      const count = L(w, [2, 3, 3, 4, 4, 5, 5, 6]) + p.stats.amount + (w.evo ? 2 : 0);
      if (w.active > 0) {
        w.active -= dt;
        if (w.active <= 0 && !w.evo) {
          for (const pr of g.projs) if (pr.alive && pr.w === w) g.killProj(pr);
        }
        if (w.evo && w.data.count !== count) w.active = 0;
        return;
      }
      w.cd -= dt;
      if (w.cd > 0 && !w.evo) return;
      w.cd = 3.0 * p.stats.cooldown;
      const dur = (w.evo ? 1e9 : L(w, [3, 3, 3.5, 3.5, 4, 4, 4.5, 5]) * p.stats.duration);
      for (const pr of g.projs) if (pr.alive && pr.w === w) g.killProj(pr);
      w.active = dur;
      w.data.count = count;
      const R = L(w, [72, 72, 72, 72, 84, 84, 84, 92]) * p.stats.area * (w.evo ? 1.3 : 1);
      const dmg = L(w, [9, 9, 12, 12, 15, 15, 18, 22]) * (w.evo ? 1.4 : 1);
      for (let i = 0; i < count; i++) {
        g.spawnProj({
          tex: w.evo ? 'ember' : 'glow', w, x: p.x, y: p.y, r: 11 * p.stats.area, dmg, pierce: 999, life: dur, hitEvery: 0.45,
          scale: w.evo ? 0.36 : 0.32, tint: w.evo ? 0xffffff : 0xfff07a, light: w.evo ? 40 : 26, ang: (i / count) * Math.PI * 2, dist: R,
          knock: 0.6, burn: w.evo ? 8 : 0, data: { glowTint: w.evo ? 0xff7020 : 0xe8ff6a },
        });
      }
      audio.sfx('chime', 0.15, 2.2);
    },
    projUpdate(g, p, dt) {
      const pl = g.player;
      p.ang += dt * 3.4 * g.player.stats.projSpeed;
      const grow = Math.min(1, p.t * 4);
      p.x = pl.x + Math.cos(p.ang) * p.dist * grow;
      p.y = pl.y - 26 + Math.sin(p.ang) * p.dist * 0.8 * grow;
      p.rot = p.ang;
      if (g.frameCount % 4 === 0) g.particle(p.x, p.y, g.fx.glow, { add: true, life: 0.3, s0: 0.2, s1: 0.02, tint: p.data?.glowTint ?? 0xe8ff6a });
    },
  },

  volley: {
    id: 'volley', name: 'Match Volley', icon: 'volley',
    desc: 'Hurls burning matchsticks the way you are moving.',
    levels: ['+1 pierce', '+1 match', '+2 damage', '+1 match, +1 pierce', '+2 damage', '+1 match, +1 pierce', '+2 damage, faster'],
    evo: { passive: 'twinwick', name: 'Matchbook Barrage', desc: 'An endless stream of blazing matches that ignite everything.' },
    update(g, w, dt) {
      const p = g.player;
      const cd = w.evo ? 0.3 : L(w, [0.95, 0.95, 0.9, 0.9, 0.85, 0.85, 0.8, 0.72]);
      cooldown(g, w, dt, cd, () => {
        const n = (w.evo ? 4 : L(w, [2, 2, 3, 3, 4, 4, 5, 5])) + p.stats.amount;
        const base = Math.atan2(p.moving ? p.dirY : 0, p.moving ? p.dirX : p.face);
        const spd = 580 * p.stats.projSpeed;
        const dmg = L(w, [12, 12, 12, 15, 15, 18, 18, 22]) * (w.evo ? 1.3 : 1);
        const pierce = L(w, [3, 4, 4, 4, 5, 5, 6, 6]) + p.stats.pierce + (w.evo ? 3 : 0);
        for (let i = 0; i < n; i++) {
          const a = base + (i - (n - 1) / 2) * 0.11 + g.rr(-0.03, 0.03);
          g.spawnProj({
            tex: 'match', w, x: p.x + Math.cos(a) * 10, y: p.y - 28 + Math.sin(a) * 10, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
            r: 7 * p.stats.area, dmg, pierce, life: 1.1 * p.stats.duration, scale: 0.5 * p.stats.area, rot: a, light: w.evo ? 20 : 0,
            burn: w.evo ? 6 : 0, knock: 0.7,
          });
        }
        audio.sfx('whip', 0.18, 1.6);
      });
    },
    projUpdate(g, p, dt) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (g.frameCount % 3 === 0) g.particle(p.x - p.vx * 0.03, p.y - p.vy * 0.03, g.fx.puff, { life: 0.3, s0: 0.1, s1: 0.2, a0: 0.4, tint: 0xd8d0c0 });
    },
  },

  cracker: {
    id: 'cracker', name: 'Firecracker', icon: 'cracker',
    desc: 'Lobs firecrackers that explode where they land.',
    levels: ['+10% blast size', '+1 firecracker', '+6 damage', '+10% blast size', '+1 firecracker', '+6 damage', '+1 firecracker, +8 damage'],
    evo: { passive: 'powder', name: 'Grand Finale', desc: 'Fireworks that burst into a shower of smaller explosions.' },
    update(g, w, dt) {
      const p = g.player;
      cooldown(g, w, dt, L(w, [2.3, 2.3, 2.2, 2.2, 2.1, 2.1, 2.0, 1.85]), () => {
        const n = L(w, [1, 1, 2, 2, 2, 3, 3, 4]) + p.stats.amount + (w.evo ? 2 : 0);
        for (let i = 0; i < n; i++) {
          const t = g.randomOnScreenEnemy();
          let tx: number, ty: number;
          if (t) { tx = t.x + g.rr(-20, 20); ty = t.y + g.rr(-20, 20); }
          else { const a = g.rng.angle(); const r = g.rng.range(80, 240); tx = p.x + Math.cos(a) * r; ty = p.y + Math.sin(a) * r; }
          const T = 0.6;
          g.spawnProj({
            tex: 'cracker', w, x: p.x, y: p.y - 30, vx: (tx - p.x) / T, vy: (ty - p.y) / T, r: 1, dmg: 0, life: T, scale: 0.55, spin: 10,
            ox: p.x, oy: p.y - 30, a: tx, b: ty, explode: L(w, [52, 58, 58, 64, 64, 70, 70, 78]) * p.stats.area * (w.evo ? 1.15 : 1),
            data: { dmg: L(w, [22, 22, 22, 28, 28, 28, 34, 42]) * (w.evo ? 1.25 : 1), T },
          });
        }
        audio.sfx('pop', 0.3, 0.6);
      });
    },
    projUpdate(g, p) {
      const f = Math.min(1, p.t / p.data.T);
      p.x = p.ox + (p.a - p.ox) * f;
      p.y = p.oy + (p.b - p.oy) * f - Math.sin(f * Math.PI) * 90;
      if (g.frameCount % 2 === 0) g.spark(p.x, p.y - 12, 0xffd040, 1, 40);
    },
    projExpire(g, p) {
      if (p.data?.mini) {
        g.blast(p.x, p.y, p.explode, p.data.dmg, p.w, p.data.col, false);
        audio.sfx('pop', 0.35, 1.2);
        return;
      }
      g.blast(p.x, p.y, p.explode, p.data.dmg, p.w, 0xffa53a, true);
      audio.sfx('explode', 0.45, 1.1, 0.06);
      g.shake(3, 0.12);
      if (p.w?.evo) {
        const cols = [0xff5a8a, 0x7ad0ff, 0xffe066, 0x9cff7a, 0xd28aff];
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2 + g.rr(-0.3, 0.3);
          const r = g.rr(60, 100);
          const T = 0.35;
          g.spawnProj({
            tex: 'spark', w: p.w, x: p.x, y: p.y, vx: 0, vy: 0, r: 1, dmg: 0, life: T, scale: 0.8, tint: cols[i], spin: 12, light: 20,
            ox: p.x, oy: p.y, a: p.x + Math.cos(a) * r, b: p.y + Math.sin(a) * r, explode: 38, data: { dmg: p.data.dmg * 0.5, T, mini: true, col: cols[i] },
          });
        }
      }
    },
  },

  trail: {
    id: 'trail', name: 'Hot Foot', icon: 'trail',
    desc: 'Leaves burning footprints wherever you walk.',
    levels: ['Bigger flames', '+2 damage', 'Flames last longer', '+2 damage', 'Bigger flames', '+2 damage, longer', '+3 damage, bigger'],
    evo: { passive: 'shoes', name: 'Wildfire', desc: 'Huge fires; burning enemies burst into new flames.' },
    update(g, w, dt) {
      const p = g.player;
      if (w.data.lx === undefined) { w.data.lx = p.x; w.data.ly = p.y; }
      const lx = w.data.lx, ly = w.data.ly;
      const moved = Math.hypot(p.x - lx, p.y - ly);
      const spacing = w.evo ? 30 : 34;
      if (moved > spacing || (!p.moving && (w.t += dt) > 0.8)) {
        w.t = 0;
        w.data.lx = p.x; w.data.ly = p.y;
        const r = L(w, [22, 25, 25, 25, 25, 28, 28, 31]) * p.stats.area * (w.evo ? 1.45 : 1);
        const life = L(w, [1.6, 1.6, 1.6, 2.0, 2.0, 2.0, 2.4, 2.6]) * p.stats.duration * (w.evo ? 1.3 : 1);
        const dmg = L(w, [6, 6, 8, 8, 10, 10, 12, 15]) * (w.evo ? 1.4 : 1);
        fireZone(g, w, p.x + g.rr(-4, 4), p.y + g.rr(-3, 3), r, dmg, life, w.evo ? 6 : 2);
      }
    },
    zoneRender(g, z) { renderFireZone(g, z); },
  },

  aura: {
    id: 'aura', name: 'Warm Glow', icon: 'aura',
    desc: 'A circle of heat that damages nearby enemies.',
    levels: ['+10% radius', '+2 damage', '+10% radius', '+2 damage', 'Ticks faster', '+10% radius', '+3 damage'],
    evo: { passive: 'varnish', name: 'Hearth Furnace', desc: 'A roaring furnace aura that slows enemies and warms you back to health.' },
    update(g, w, dt) {
      const p = g.player;
      if (!w.data.zone?.alive) {
        const z = g.spawnZone({ kind: 4, w, x: p.x, y: p.y, r: 60, dmg: 5, tick: 0.5, life: 1e9, follow: true, data: { pool: 'aura', pool2: 'aura2', light: 0xff9a40 } });
        z.sp = g.pool('aura', g.addLayer, g.fx.glow);
        z.sp.anchor.set(0.5);
        z.sp2 = g.pool('aura2', g.projLayer, g.fx.ring);
        z.sp2.anchor.set(0.5);
        w.data.zone = z;
      }
      const z = w.data.zone as Zone;
      z.r = L(w, [62, 68, 68, 75, 75, 75, 83, 83]) * p.stats.area * (w.evo ? 1.55 : 1);
      z.dmg = L(w, [7, 7, 9, 9, 11, 11, 11, 15]) * (w.evo ? 1.7 : 1);
      z.tick = (w.level >= 6 ? 0.4 : 0.5) * Math.max(0.6, p.stats.cooldown);
      z.slow = w.evo ? 0.35 : 0;
      z.knock = 0.35;
      void dt;
    },
    zoneUpdate(g, z, dt) {
      z.tickT -= dt;
      if (z.tickT > 0) return;
      z.tickT = z.tick;
      let hits = 0;
      g.query(z.x, z.y - 10, z.r + 30, (e) => {
        const dx = e.x - z.x, dy = e.y - z.y;
        if (dx * dx + dy * dy < (z.r + e.r * 0.5) ** 2) {
          g.damageEnemy(e, z.dmg, z.w, { knock: z.knock, slow: z.slow, fromX: z.x, fromY: z.y, small: true });
          hits++;
        }
      });
      if (hits && z.w?.evo) g.heal(Math.min(1.2, 0.25 * hits));
    },
    zoneRender(g, z) {
      const pulse = 1 + 0.06 * Math.sin(g.time * 6);
      if (z.sp) {
        z.sp.x = z.x; z.sp.y = z.y - 8;
        z.sp.scale.set(((z.r * 2.3) / 128) * pulse, ((z.r * 2.0) / 128) * pulse);
        z.sp.tint = z.w?.evo ? 0xff5a1a : 0xff9a3a;
        z.sp.alpha = 0.32;
      }
      if (z.sp2) {
        z.sp2.x = z.x; z.sp2.y = z.y - 8;
        z.sp2.scale.set((z.r * 2) / 112 * pulse, (z.r * 1.7) / 112 * pulse);
        z.sp2.tint = 0xffb040;
        z.sp2.alpha = 0.22;
      }
    },
  },

  spark: {
    id: 'spark', name: 'Static Crackle', icon: 'spark',
    desc: 'A spark that jumps from enemy to enemy.',
    levels: ['+1 jump', '+3 damage', '+1 jump', '+3 damage', '+1 jump', '+3 damage', '+2 jumps, faster'],
    evo: { passive: 'wool', name: 'Ball Lightning', desc: 'Rolling balls of lightning zap everything around them.' },
    update(g, w, dt) {
      const p = g.player;
      cooldown(g, w, dt, L(w, [1.6, 1.6, 1.5, 1.5, 1.45, 1.45, 1.4, 1.25]), () => {
        const chains = L(w, [4, 5, 5, 6, 6, 7, 7, 9]) + p.stats.amount;
        const dmg = L(w, [16, 16, 20, 20, 24, 24, 28, 28]) * (w.evo ? 1.25 : 1);
        const hit = new Set<number>();
        let cx = p.x, cy = p.y - 34;
        let first = g.nearestEnemy(p.x, p.y, 320);
        if (!first) return;
        const pts = [cx, cy];
        let cur: Enemy | null = first;
        for (let i = 0; i < chains && cur; i++) {
          const ex = cur.x, ey = cur.y - cur.def.size * cur.scale * 0.4;
          // jagged segment
          const segs = 4;
          for (let s = 1; s <= segs; s++) {
            const f = s / segs;
            pts.push(cx + (ex - cx) * f + (s < segs ? vrange(-12, 12) : 0), cy + (ey - cy) * f + (s < segs ? vrange(-12, 12) : 0));
          }
          hit.add(cur.id);
          g.damageEnemy(cur, dmg, w, { knock: 0.5 });
          g.spark(ex, ey, 0xfff27a, 3, 120);
          g.addLight(ex, ey, 80, 0.15, 0xfff3a0);
          cx = ex; cy = ey;
          cur = g.nearestEnemy(cx, cy + 10, 180 * p.stats.area, hit);
        }
        g.bolt(pts, 0xfff27a, 2.5);
        audio.sfx('zap', 0.35);
        if (w.evo) {
          const a = g.rng.angle();
          g.spawnProj({
            tex: 'glow', w, x: p.x, y: p.y - 30, vx: Math.cos(a) * 70, vy: Math.sin(a) * 70, r: 1, dmg: 0, life: 4.5 * p.stats.duration,
            scale: 0.5, tint: 0xfff27a, light: 60, kind: 1, data: { glowTint: 0xfff27a, zap: 0 },
          });
        }
      });
    },
    projUpdate(g, p, dt) {
      if (p.kind !== 1) { p.x += p.vx * dt; p.y += p.vy * dt; return; }
      // ball lightning: wander + zap
      const pl = g.player;
      p.vx += (pl.x - p.x) * 0.15 * dt; p.vy += (pl.y - 30 - p.y) * 0.15 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.sp.scale.set(0.45 + 0.08 * Math.sin(g.time * 30));
      p.data.zap -= dt;
      if (p.data.zap <= 0) {
        p.data.zap = 0.3;
        let n = 0;
        g.query(p.x, p.y, 110, (e) => {
          if (n >= 3) return true;
          if (Math.hypot(e.x - p.x, e.y - p.y) < 110) {
            n++;
            g.damageEnemy(e, 9 + (p.w?.level ?? 0), p.w, { noKnock: true, small: true });
            g.bolt([p.x, p.y, (p.x + e.x) / 2 + vrange(-10, 10), (p.y + e.y - 20) / 2 + vrange(-10, 10), e.x, e.y - 20], 0xfff27a, 2);
          }
        });
        if (n) audio.sfx('zap', 0.15, 1.3);
      }
    },
  },

  glare: {
    id: 'glare', name: 'Glare', icon: 'glare', locked: true,
    desc: 'Novaki glares through his glasses: a piercing beam of focused light.',
    levels: ['+6 damage', 'Wider beam', '+1 beam', '+6 damage', 'Wider beam', '+1 beam', '+8 damage, faster'],
    evo: { passive: 'lens', name: 'Burning Gaze', desc: 'A long, sweeping beam that sets everything it touches on fire.' },
    update(g, w, dt) {
      const p = g.player;
      if (w.active > 0) {
        w.active -= dt;
        w.data.tick -= dt;
        const base = w.data.base + Math.sin((1 - w.active / w.data.dur) * Math.PI * 2) * 0.9;
        const hit = w.data.tick <= 0 ? w.data.dmg * 0.5 : 0;
        drawBeam(g, w, base, w.data.len, w.data.width, hit);
        drawBeam(g, w, base + Math.PI, w.data.len * 0.8, w.data.width, hit);
        if (w.data.tick <= 0) w.data.tick = 0.12;
        w.cd -= dt;
        return;
      }
      cooldown(g, w, dt, L(w, [2.8, 2.8, 2.7, 2.7, 2.6, 2.6, 2.5, 2.2]), () => {
        const beams = L(w, [1, 1, 1, 2, 2, 2, 3, 3]) + Math.min(1, p.stats.amount);
        const dmg = L(w, [28, 34, 34, 34, 40, 40, 40, 48]) * (w.evo ? 1.3 : 1);
        const width = L(w, [12, 12, 15, 15, 15, 18, 18, 20]) * p.stats.area * (w.evo ? 1.4 : 1);
        const len = 470 * p.stats.area;
        const targets = g.nearestN(p.x, p.y, beams, 700);
        if (w.evo) {
          const a = targets[0] ? Math.atan2(targets[0].y - 20 - (p.y - 50), targets[0].x - p.x) : Math.atan2(p.dirY, p.dirX);
          w.active = w.data.dur = 1.6 * p.stats.duration;
          w.data = { ...w.data, base: a, len, width, dmg, tick: 0, dur: w.active };
          audio.sfx('zap', 0.4, 0.5);
          return;
        }
        for (let i = 0; i < beams; i++) {
          const t = targets[i];
          const a = t ? Math.atan2(t.y - 20 - (p.y - 50), t.x - p.x) : Math.atan2(p.dirY, p.dirX) + (i * Math.PI * 2) / beams;
          drawBeam(g, w, a, len, width, dmg);
        }
        audio.sfx('zap', 0.35, 0.6);
      });
    },
  },

  cinders: {
    id: 'cinders', name: 'Falling Cinders', icon: 'cinders', locked: true,
    desc: 'Glowing cinders rain down on random enemies.',
    levels: ['+6 damage', '+1 cinder', 'Bigger impacts', '+1 cinder', '+6 damage', '+1 cinder', '+1 cinder, +8 damage'],
    evo: { passive: 'luckybox', name: 'Meteor Shower', desc: 'A storm of meteors that leave the ground burning.' },
    update(g, w, dt) {
      const p = g.player;
      cooldown(g, w, dt, L(w, [2.4, 2.4, 2.3, 2.3, 2.2, 2.2, 2.1, 1.9]), () => {
        const n = L(w, [2, 2, 3, 3, 4, 4, 5, 6]) + p.stats.amount + (w.evo ? 3 : 0);
        const dmg = L(w, [24, 30, 30, 30, 30, 36, 36, 44]) * (w.evo ? 1.2 : 1);
        const r = L(w, [40, 40, 40, 48, 48, 48, 48, 52]) * p.stats.area * (w.evo ? 1.4 : 1);
        for (let i = 0; i < n; i++) {
          const t = g.randomOnScreenEnemy();
          let tx: number, ty: number;
          if (t) { tx = t.x; ty = t.y; } else { tx = p.x + g.rng.range(-300, 300); ty = p.y + g.rng.range(-200, 200); }
          const delay = 0.45 + i * 0.07;
          g.tele({ kind: 'circle', x: tx, y: ty, r, dur: delay, color: 0xff7a2a, onDone: () => {
            g.blast(tx, ty, r, dmg, w, 0xff7a2a, w.evo, 4);
            audio.sfx('explode', 0.3, 1.4, 0.05);
            if (w.evo) fireZone(g, w, tx, ty, r * 0.7, dmg * 0.15, 2.0, 4);
          } });
          g.spawnProj({ tex: 'flame', w, x: tx - 160, y: ty - 420, vx: 160 / delay, vy: 420 / delay, r: 1, dmg: 0, life: delay, scale: 0.5, rot: Math.PI + Math.atan2(420, 160) - Math.PI / 2 + Math.PI, light: 40, kind: 2 });
        }
      });
    },
    projUpdate(g, p, dt) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot = Math.atan2(p.vy, p.vx) - Math.PI / 2 + Math.PI;
      if (g.frameCount % 2 === 0) g.particle(p.x, p.y, g.fx.glow, { add: true, life: 0.3, s0: 0.3, s1: 0.05, tint: 0xff7a2a });
    },
    zoneRender(g, z) { renderFireZone(g, z); },
  },

  breath: {
    id: 'breath', name: 'Lighter Breath', icon: 'breath', locked: true,
    desc: 'Breathes a short-range cone of fire at the closest enemy.',
    levels: ['+2 damage', 'Longer reach', 'Wider cone', '+2 damage', 'Longer reach', 'Lasts longer', '+3 damage, wider'],
    evo: { passive: 'bellows', name: 'Dragon Breath', desc: 'A long, roaring torrent of flame.' },
    update(g, w, dt) {
      const p = g.player;
      if (w.active > 0) {
        w.active -= dt;
        const ev = w.evo ? 1 : 0;
        const range = L(w, [110, 110, 125, 125, 125, 140, 140, 150]) * p.stats.area * (ev ? 1.5 : 1);
        const cone = L(w, [0.45, 0.45, 0.45, 0.55, 0.55, 0.55, 0.55, 0.65]) * (ev ? 1.3 : 1);
        const dmg = L(w, [8, 10, 10, 10, 12, 12, 12, 16]) * (ev ? 1.3 : 1);
        const aim = aimAt(g, range + 80);
        const a = Math.atan2(aim.y, aim.x);
        w.data.a = w.data.a === undefined ? a : w.data.a + Math.atan2(Math.sin(a - w.data.a), Math.cos(a - w.data.a)) * Math.min(1, dt * 8);
        const ox = p.x + p.face * 8, oy = p.y - 34;
        // particles
        for (let i = 0; i < 2; i++) {
          const pa = w.data.a + vrange(-cone, cone) * 0.8;
          const sp = range * vrange(2.4, 3.2);
          g.particle(ox, oy, g.fx.flame, { vx: Math.cos(pa) * sp, vy: Math.sin(pa) * sp, life: 0.36, s0: 0.12, s1: 0.42 * (ev ? 1.3 : 1), drag: 2, rot: pa + Math.PI / 2, layer: 0 });
        }
        if (g.frameCount % 2 === 0) g.addLight(ox + Math.cos(w.data.a) * range * 0.5, oy + Math.sin(w.data.a) * range * 0.5, range * 1.4, 0.1, 0xff9a40);
        g.query(ox, oy, range + 30, (e) => {
          const dx = e.x - ox, dy = e.y - 20 - oy;
          const d = Math.hypot(dx, dy);
          if (d > range + e.r) return;
          const da = Math.abs(Math.atan2(Math.sin(Math.atan2(dy, dx) - w.data.a), Math.cos(Math.atan2(dy, dx) - w.data.a)));
          if (da > cone + 0.15) return;
          if (e.hitCd[w.slot] > g.time) return;
          e.hitCd[w.slot] = g.time + 0.13;
          g.damageEnemy(e, dmg, w, { knock: 0.35, burn: ev ? 10 : 3, fromX: ox, fromY: oy, small: true });
        });
        if ((w.t -= dt) <= 0) { w.t = 0.25; audio.sfx('flame', 0.3); }
        return;
      }
      cooldown(g, w, dt, L(w, [1.9, 1.9, 1.85, 1.85, 1.8, 1.7, 1.7, 1.55]), () => {
        if (!g.nearestEnemy(p.x, p.y, 220)) { w.cd = 0.3; return; }
        w.active = L(w, [0.7, 0.7, 0.7, 0.7, 0.7, 0.9, 0.9, 1.0]) * p.stats.duration * (w.evo ? 1.6 : 1);
        w.data.a = undefined;
      });
    },
  },

  boomerang: {
    id: 'boomerang', name: 'Tinder Boomerang', icon: 'boomerang', locked: true,
    desc: 'A burning boomerang that slices out and back.',
    levels: ['Longer throw', '+1 boomerang', '+4 damage', 'Longer throw', '+1 boomerang', '+4 damage', '+5 damage, faster'],
    evo: { passive: 'foil', name: 'Golden Comet', desc: 'Gilded boomerangs that leave trails of fire.' },
    update(g, w, dt) {
      const p = g.player;
      cooldown(g, w, dt, L(w, [1.9, 1.9, 1.85, 1.85, 1.8, 1.8, 1.7, 1.5]), () => {
        const n = L(w, [1, 1, 2, 2, 2, 3, 3, 3]) + p.stats.amount + (w.evo ? 2 : 0);
        const aim = aimAt(g, 600);
        const base = Math.atan2(aim.y, aim.x);
        const range = L(w, [220, 245, 245, 245, 270, 270, 270, 290]) * p.stats.area;
        for (let i = 0; i < n; i++) {
          const a = base + (i - (n - 1) / 2) * 0.5;
          const spd = 470 * p.stats.projSpeed;
          g.spawnProj({
            tex: 'boomerang', w, x: p.x, y: p.y - 30, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, r: 15 * p.stats.area * (w.evo ? 1.3 : 1),
            dmg: L(w, [15, 15, 15, 19, 19, 19, 23, 28]) * (w.evo ? 1.35 : 1), pierce: 999, hitEvery: 0.35, life: 6, scale: 0.7 * p.stats.area * (w.evo ? 1.3 : 1),
            spin: 16, tint: w.evo ? 0xffe066 : 0xffffff, light: w.evo ? 40 : 22, knock: 1.2, burn: w.evo ? 6 : 2,
            data: { range, out: true, spd, trail: 0 },
          });
        }
        audio.sfx('whip', 0.25, 0.8);
      });
    },
    projUpdate(g, p, dt) {
      const pl = g.player;
      const d = p.data;
      if (d.out) {
        p.x += p.vx * dt; p.y += p.vy * dt;
        const k = Math.max(0, 1 - (p.t * d.spd) / d.range);
        if (k <= 0.05 || p.t > 1.5) d.out = false;
        p.vx *= 1 - dt * 1.6; p.vy *= 1 - dt * 1.6;
      } else {
        const dx = pl.x - p.x, dy = pl.y - 30 - p.y;
        const dist = Math.hypot(dx, dy) || 1;
        const sp = d.spd * 1.1;
        p.vx += ((dx / dist) * sp - p.vx) * Math.min(1, dt * 6);
        p.vy += ((dy / dist) * sp - p.vy) * Math.min(1, dt * 6);
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (dist < 22) return false;
      }
      if (p.w?.evo) {
        d.trail -= dt;
        if (d.trail <= 0) { d.trail = 0.12; fireZone(g, p.w, p.x, p.y + 30, 18, 5, 1.1, 3); }
      }
    },
    zoneRender(g, z) { renderFireZone(g, z); },
  },

  sentry: {
    id: 'sentry', name: 'Candle Sentry', icon: 'sentry', locked: true,
    desc: 'Plants a candle turret that flicks embers at enemies.',
    levels: ['+2 damage', 'Fires faster', '+1 turret', 'Lasts longer', '+2 damage, faster', '+1 turret', '+3 damage, lasts longer'],
    evo: { passive: 'kindling', name: 'Candelabra Fortress', desc: 'A ring of candelabras firing triple embers.' },
    update(g, w, dt) {
      const p = g.player;
      cooldown(g, w, dt, 7.5, () => {
        const n = L(w, [1, 1, 1, 2, 2, 2, 3, 3]) + (w.evo ? 2 : 0);
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + g.rng.next();
          const r = n > 1 ? 70 : 0;
          const x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r;
          const z = g.spawnZone({ kind: 5, w, x, y, r: 0, dmg: 0, tick: 0, life: L(w, [6, 6, 6, 6, 8, 8, 8, 10]) * p.stats.duration + (w.evo ? 4 : 0), data: { pool: 'sentry', pool2: 'sentryG', fireT: 0.3, light: 0xffb060 } });
          z.sp = g.pool('sentry', g.projLayer, g.fx.candle);
          z.sp.anchor.set(0.5, 1);
          z.sp.scale.set(0.6);
          z.sp2 = g.pool('sentryG', g.addLayer, g.fx.flame);
          z.sp2.anchor.set(0.5, 1);
          g.puff(x, y, 0xe0d8c8, 0.6, 0.6);
        }
        audio.sfx('strike', 0.35, 1.3);
      });
    },
    zoneUpdate(g, z, dt) {
      const w = z.w!;
      z.data.fireT -= dt;
      if (z.data.fireT > 0) return;
      z.data.fireT = L(w, [0.45, 0.45, 0.38, 0.38, 0.38, 0.32, 0.32, 0.28]) * g.player.stats.cooldown;
      const t = g.nearestEnemy(z.x, z.y, 300);
      if (!t) return;
      const a = Math.atan2(t.y - 20 - (z.y - 44), t.x - z.x);
      const shots = w.evo ? 3 : 1;
      for (let i = 0; i < shots; i++) {
        const aa = a + (i - (shots - 1) / 2) * 0.2;
        g.spawnProj({
          tex: 'ember', w, x: z.x, y: z.y - 44, vx: Math.cos(aa) * 420, vy: Math.sin(aa) * 420, r: 7, dmg: L(w, [13, 16, 16, 16, 16, 20, 20, 24]),
          pierce: 1, life: 1.2, scale: 0.26, light: 24, kind: 3,
        });
      }
      audio.sfx('shoot', 0.15, 1.3);
    },
    zoneRender(g, z) {
      const f = z.t / z.maxLife;
      const pop = Math.min(1, z.t * 5);
      if (z.sp) { z.sp.x = z.x; z.sp.y = z.y; z.sp.scale.set(0.55 * pop); z.sp.alpha = f > 0.9 ? (1 - f) * 10 : 1; }
      if (z.sp2) {
        const fl = 0.9 + 0.2 * Math.sin(g.time * 30 + z.x);
        z.sp2.x = z.x; z.sp2.y = z.y - 48 * pop;
        z.sp2.scale.set(0.2 * fl * pop, 0.24 * fl * pop);
        z.sp2.alpha = f > 0.9 ? (1 - f) * 10 : 1;
      }
    },
    projUpdate(g, p, dt) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    },
  },
};

/* ---------------------------------------------------------------- helpers */

function lash(g: Game, w: WeaponInst, side: number) {
  const p = g.player;
  const len = L(w, [140, 140, 140, 161, 161, 185, 185, 185]) * p.stats.area * (w.evo ? 1.35 : 1);
  const h = 48 * p.stats.area * (w.evo ? 1.4 : 1);
  const dmg = L(w, [16, 16, 21, 21, 26, 26, 31, 36]) * (w.evo ? 1.5 : 1);
  const x0 = p.x + side * 10, y0 = p.y - 30;
  g.query(x0 + (side * len) / 2, y0, len / 2 + 40, (e) => {
    const ex = e.x, ey = e.y - e.def.size * e.scale * 0.4;
    const along = (ex - x0) * side;
    if (along < -10 || along > len + e.r) return;
    if (Math.abs(ey - y0) > h / 2 + e.r) return;
    g.damageEnemy(e, dmg, w, { kx: side, ky: 0, knock: 1.6, burn: w.evo ? 10 : 3, fromX: p.x, fromY: p.y });
  });
  // visual: swooping flame crescent
  const pt = g.particle(x0 + (side * len) / 2, y0, g.fx.slash, { life: 0.22, s0: len / 256, s1: (len / 256) * 1.08, a0: 1, layer: 0 });
  if (pt) { pt.aspect = side; pt.sy = (h / 64) / (len / 256); }
  g.particle(x0 + (side * len) / 2, y0, g.fx.glow, { add: true, life: 0.2, s0: len / 100, s1: len / 90, a0: 0.5, tint: 0xff8a2a });
  for (let i = 0; i < 6; i++) g.spark(x0 + side * len * vrange(0.2, 1), y0 + vrange(-h / 3, h / 3), 0xffb040, 1, 80);
  if (w.evo) {
    for (let i = 1; i <= 4; i++) fireZone(g, w, x0 + side * len * (i / 4.5), p.y + g.rr(-6, 6), 22, dmg * 0.18, 1.6, 6);
  }
  audio.sfx('whip', 0.4);
}

function smokeRing(g: Game, w: WeaponInst) {
  const p = g.player;
  const maxR = L(w, [150, 172, 172, 172, 172, 198, 198, 198]) * p.stats.area;
  const z = g.spawnZone({
    kind: 2, w, x: p.x, y: p.y, r: 14, r0: 14, r1: maxR, dmg: L(w, [8, 8, 11, 11, 14, 14, 14, 19]), life: 0.85 * p.stats.duration,
    slow: 0.45, hitSet: new Set<number>(), data: { pool: 'ring' },
  });
  z.sp = g.pool('ring', g.projLayer, g.fx.smokering);
  z.sp.anchor.set(0.5);
  z.sp.tint = 0xffffff;
  audio.sfx('ring', 0.35);
}

function drawBeam(g: Game, w: WeaponInst, a: number, len: number, width: number, dmg: number) {
  const p = g.player;
  const ox = p.x + p.face * 6, oy = p.y - 50;
  const cx = Math.cos(a), cy = Math.sin(a);
  if (dmg > 0) {
    g.query(ox + (cx * len) / 2, oy + (cy * len) / 2, len / 2 + 40, (e) => {
      const ex = e.x - ox, ey = e.y - e.def.size * e.scale * 0.4 - oy;
      const along = ex * cx + ey * cy;
      if (along < 0 || along > len) return;
      const perp = Math.abs(-ex * cy + ey * cx);
      if (perp > width / 2 + e.r) return;
      g.damageEnemy(e, dmg, w, { kx: cx, ky: cy, knock: 0.6, burn: w.evo ? 10 : 0, fromX: ox, fromY: oy });
    });
  }
  const mx = ox + (cx * len) / 2, my = oy + (cy * len) / 2;
  const pt = g.particle(mx, my, g.fx.beam, { add: true, life: w.evo ? 0.08 : 0.22, s0: len / 256, s1: len / 256, a0: 1, rot: a, tint: w.evo ? 0xffb050 : 0xfff6c0 });
  if (pt) { pt.sy = (width * 2.2 / 32) / (len / 256); }
  g.particle(ox, oy, g.fx.glow, { add: true, life: 0.2, s0: 0.6, s1: 0.3, tint: 0xfff6c0 });
  for (let i = 0; i < 4; i++) g.addLight(ox + cx * len * (i / 4), oy + cy * len * (i / 4), 120, 0.15, 0xfff0b0);
}

export function updateWeapon(g: Game, w: WeaponInst, dt: number) {
  WEAPONS[w.id]?.update(g, w, dt);
}
