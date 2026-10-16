/** Enemy roster and AI. */
import type { Game } from './game';
import type { Enemy, WeaponInst } from './types';
import { audio } from '../core/audio';
import { vrange } from '../core/rng';

export interface EnemyDef {
  name: string;
  tex: string;
  hp: number;
  speed: number;
  dmg: number;
  r: number;
  size: number; // world height
  xp: number;
  ai: string;
  anim?: string;
  animSpeed?: number;
  faceRight?: boolean; // sprite drawn facing right
  noFlip?: boolean;
  kbRes?: number;
  shield?: boolean;
  prop?: boolean;
  noShadow?: boolean;
  shadowW?: number;
  anchorY?: number;
  light?: number;
  gilded?: boolean;
  desc: string;
}

export const ENEMIES: Record<string, EnemyDef> = {
  // ---- Stage 1: The Mothwood
  moth: { name: 'Mothling', tex: 'e_moth', hp: 6, speed: 84, dmg: 3, r: 13, size: 36, xp: 1, ai: 'weave', anim: 'fly', animSpeed: 14, noFlip: true, desc: 'Flutters toward any light in a wobbly zig-zag.' },
  mold: { name: 'Mold Blob', tex: 'e_mold', hp: 9, speed: 56, dmg: 5, r: 14, size: 38, xp: 1, ai: 'chase', anim: 'wobble', animSpeed: 6, desc: 'Damp, slow and relentless.' },
  toadstool: { name: 'Toadstool', tex: 'e_toadstool', hp: 24, speed: 44, dmg: 7, r: 16, size: 50, xp: 2, ai: 'spore', anim: 'walk', desc: 'Stops to puff rings of soggy spores.' },
  beetle: { name: 'Stag Beetle', tex: 'e_beetle', hp: 34, speed: 52, dmg: 9, r: 17, size: 40, xp: 3, ai: 'charge', anim: 'walk', animSpeed: 12, faceRight: true, desc: 'Lowers its horns, then charges in a straight line.' },
  stump: { name: 'Soggy Stump', tex: 'e_stump', hp: 110, speed: 34, dmg: 11, r: 24, size: 72, xp: 6, ai: 'chase', anim: 'stomp', animSpeed: 5, kbRes: 0.25, desc: 'A waterlogged brute. Barely flinches.' },
  // ---- Stage 2: Drizzleport
  raindrop: { name: 'Raindrop', tex: 'e_raindrop', hp: 10, speed: 102, dmg: 5, r: 12, size: 38, xp: 1, ai: 'chase', anim: 'walk', animSpeed: 13, desc: 'Fast, angry and very wet.' },
  slime: { name: 'Puddle Slime', tex: 'e_slime', hp: 34, speed: 48, dmg: 6, r: 19, size: 48, xp: 2, ai: 'chase', anim: 'wobble', animSpeed: 5, desc: 'Splits into two smaller puddles when popped.' },
  frog: { name: 'Bullfrog', tex: 'e_frog', hp: 30, speed: 0, dmg: 8, r: 17, size: 44, xp: 3, ai: 'hop', anim: 'hop', faceRight: true, desc: 'Leaps at you in big bounding hops.' },
  cloud: { name: 'Storm Cloud', tex: 'e_cloud', hp: 26, speed: 70, dmg: 0, r: 18, size: 48, xp: 3, ai: 'artillery', anim: 'float', noFlip: true, desc: 'Keeps its distance and calls down lightning.' },
  balloon: { name: 'Water Balloon', tex: 'e_balloon', hp: 14, speed: 100, dmg: 0, r: 15, size: 44, xp: 2, ai: 'kamikaze', anim: 'wobble', animSpeed: 9, desc: 'Rushes in and bursts with a big splash.' },
  wateringcan: { name: 'Watering Can', tex: 'e_wateringcan', hp: 46, speed: 46, dmg: 6, r: 18, size: 46, xp: 4, ai: 'healer', anim: 'walk', faceRight: true, desc: 'Sprinkles its friends back to health.' },
  // ---- Stage 3: The Snuffer's Spire
  waxghost: { name: 'Wax Ghost', tex: 'e_waxghost', hp: 34, speed: 66, dmg: 8, r: 15, size: 56, xp: 3, ai: 'blink', anim: 'float', noFlip: true, desc: 'Vanishes, then reappears right beside you.' },
  snufflet: { name: 'Snufflet', tex: 'e_snufflet', hp: 26, speed: 120, dmg: 9, r: 12, size: 54, xp: 2, ai: 'orbit', anim: 'walk', animSpeed: 14, noFlip: true, desc: 'Circles its prey, then dives in to snuff it.' },
  wisp: { name: 'Frost Wisp', tex: 'e_wisp', hp: 30, speed: 62, dmg: 0, r: 14, size: 50, xp: 3, ai: 'shooter', anim: 'float', noFlip: true, light: 0x9fd8ff, desc: 'Hangs back and fires bursts of frost.' },
  knight: { name: 'Wax Knight', tex: 'e_knight', hp: 190, speed: 33, dmg: 16, r: 22, size: 74, xp: 10, ai: 'chase', anim: 'stomp', animSpeed: 4, kbRes: 0.15, shield: true, noFlip: true, desc: 'Its shield blocks hits from the front. Flank it!' },
  wraith: { name: 'Smoke Wraith', tex: 'e_wraith', hp: 44, speed: 80, dmg: 10, r: 16, size: 60, xp: 4, ai: 'phase', anim: 'float', noFlip: true, desc: 'Turns to smoke and drifts through attacks.' },
  // ---- treasure runner: flees, drops a chest if caught
  goldmoth: { name: 'Gilded Moth', tex: 'e_moth', hp: 50, speed: 128, dmg: 0, r: 15, size: 44, xp: 0, ai: 'flee', anim: 'fly', animSpeed: 18, noFlip: true, gilded: true, kbRes: 0.2, desc: 'Flees with a belly full of gold. Catch it!' },
  // ---- destructible props (drop goodies)
  lanternprop: { name: 'Lantern Stump', tex: 'p1_lantern', hp: 18, speed: 0, dmg: 0, r: 22, size: 70, xp: 0, ai: 'prop', prop: true, desc: '' },
  barrelprop: { name: 'Barrel', tex: 'p2_barrel', hp: 22, speed: 0, dmg: 0, r: 20, size: 58, xp: 0, ai: 'prop', prop: true, desc: '' },
  candleprop: { name: 'Melted Candles', tex: 'p3_candles', hp: 26, speed: 0, dmg: 0, r: 22, size: 60, xp: 0, ai: 'prop', prop: true, desc: '' },
};

function moveToward(g: Game, e: Enemy, tx: number, ty: number, speed: number, dt: number) {
  const dx = tx - e.x, dy = ty - e.y;
  const d = Math.hypot(dx, dy) || 1;
  const sl = e.slowT > 0 ? e.slowF : 1;
  const vx = (dx / d) * speed * sl, vy = (dy / d) * speed * sl;
  e.x += (vx + e.vx) * dt;
  e.y += (vy + e.vy) * dt;
  e.mx = vx; e.my = vy;
  if (Math.abs(vx) > 2) e.face = vx > 0 ? 1 : -1;
  return d;
}

function decayKnock(e: Enemy, dt: number) {
  const k = Math.exp(-dt * 7);
  e.vx *= k;
  e.vy *= k;
}

export function updateEnemy(g: Game, e: Enemy, dt: number) {
  const p = g.player;
  decayKnock(e, dt);
  e.t += dt;
  const dxp = p.x - e.x, dyp = p.y - e.y;
  const distP = Math.hypot(dxp, dyp);
  // relocate stragglers far behind (keeps pressure on a moving player)
  if (!e.prop && !e.def.gilded && !g.arena && distP > Math.max(g.viewW, g.viewH) * 0.95 + 200 && e.state !== 9) {
    const ang = Math.atan2(p.dirY, p.dirX) + g.rr(-1, 1);
    const sp = g.spawnPoint(p.moving ? ang : undefined);
    e.x = e.px = sp.x;
    e.y = e.py = sp.y;
    return;
  }
  if (e.state === 7) {
    // migrating swarm: fly straight across, then leave without rewards
    e.x += (e.tx + e.vx) * dt;
    e.y += (e.ty + e.vy) * dt;
    if (Math.abs(e.tx) > 2) e.face = e.tx > 0 ? 1 : -1;
    if (e.t > 9 || (e.t > 2 && distP > Math.max(g.viewW, g.viewH) * 0.9)) g.despawn(e, false);
    return;
  }
  switch (e.def.ai) {
    case 'chase':
      moveToward(g, e, p.x, p.y, e.speed, dt);
      break;
    case 'weave': {
      const d = moveToward(g, e, p.x, p.y, e.speed, dt);
      const nx = -dyp / (d || 1), ny = dxp / (d || 1);
      const w = Math.sin(e.t * 3.2 + e.phase) * 70;
      e.x += nx * w * dt;
      e.y += ny * w * dt;
      break;
    }
    case 'spore': {
      // walk, stop, puff ring
      if (e.state === 0) {
        moveToward(g, e, p.x, p.y, e.speed, dt);
        if (e.t > 3.2 + (e.id % 5) * 0.3 && distP < 520) { e.state = 9; e.t = 0; }
      } else if (e.state === 9) {
        if (e.t > 0.6) {
          const n = 8;
          for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2 + e.phase;
            g.spawnBullet(e.x, e.y - 22, Math.cos(a) * 85, Math.sin(a) * 85, { r: 7, dmg: 6 * g.stageDef.dmgMul, life: 3.2, tint: 0xb7d36b });
          }
          for (let i = 0; i < 4; i++) g.puff(e.x, e.y - 30, 0xc9d98a, 0.5, 0.8);
          audio.sfx('pop', 0.25, 0.8);
          e.state = 0; e.t = 0;
        }
      }
      break;
    }
    case 'charge': {
      if (e.state === 0) {
        moveToward(g, e, p.x, p.y, e.speed, dt);
        if (e.t > 2 && distP < 300) {
          e.state = 9; e.t = 0; e.tx = dxp / distP; e.ty = dyp / distP; e.face = e.tx > 0 ? 1 : -1;
          g.tele({ kind: 'line', subtle: true, x: e.x, y: e.y - 6, ang: Math.atan2(e.ty, e.tx), len: 430 * 0.55 + 30, w: e.r * 2, dur: 0.8, color: 0xe8501c });
        }
      } else if (e.state === 9) { // windup
        if (e.t > 0.8) { e.state = 2; e.t = 0; audio.sfx('dash', 0.3, 1.4); }
      } else if (e.state === 2) {
        const sl = e.slowT > 0 ? e.slowF : 1;
        e.x += (e.tx * 430 * sl + e.vx) * dt;
        e.y += (e.ty * 430 * sl + e.vy) * dt;
        if (g.frameCount % 3 === 0) g.puff(e.x, e.y, 0xa89a80, 0.35, 0.5);
        if (e.t > 0.55) { e.state = 3; e.t = 0; }
      } else if (e.t > 0.7) { e.state = 0; e.t = 0; }
      break;
    }
    case 'hop': {
      if (e.state === 0) {
        e.hop = 0;
        if (e.t > 0.75 + (e.id % 4) * 0.1) {
          e.state = 2; e.t = 0;
          const lead = Math.min(1, distP / 260);
          e.tx = (dxp / (distP || 1)) * 290 * lead + g.rr(-30, 30);
          e.ty = (dyp / (distP || 1)) * 290 * lead + g.rr(-30, 30);
          e.face = e.tx > 0 ? 1 : -1;
        }
      } else {
        const T = 0.42;
        const f = e.t / T;
        e.hop = Math.sin(Math.min(1, f) * Math.PI) * 26;
        const sl = e.slowT > 0 ? e.slowF : 1;
        e.x += (e.tx * sl + e.vx) * dt;
        e.y += (e.ty * sl + e.vy) * dt;
        if (f >= 1) { e.state = 0; e.t = 0; e.hop = 0; g.puff(e.x, e.y, 0x9db0b8, 0.4, 0.5); }
      }
      break;
    }
    case 'artillery': {
      // keep distance, strafe, call lightning on the player
      const want = 240;
      const d = distP || 1;
      const dir = d > want + 50 ? 1 : d < want - 60 ? -1 : 0;
      const nx = dxp / d, ny = dyp / d;
      const strafe = Math.sin(e.t * 0.7 + e.phase) > 0 ? 1 : -1;
      const sl = e.slowT > 0 ? e.slowF : 1;
      e.x += ((nx * dir + -ny * strafe * 0.5) * e.speed * sl + e.vx) * dt;
      e.y += ((ny * dir + nx * strafe * 0.5) * e.speed * sl + e.vy) * dt;
      e.face = nx > 0 ? 1 : -1;
      if (e.t > 3.6 && d < 480 && g.time >= g.lightningReadyAt) {
        e.t = 0;
        g.lightningReadyAt = g.time + 1.1; // clouds share one strike budget so a crowd can't chain-stun you
        const tx = p.x + p.vx * 0.35, ty = p.y + p.vy * 0.35;
        const dmg = 9 * g.stageDef.dmgMul;
        g.tele({
          kind: 'circle', x: tx, y: ty, r: 42, dur: 1.05, color: 0xffd23a,
          onDone: () => {
            const ddx = g.player.x - tx, ddy = g.player.y - ty;
            if (ddx * ddx + ddy * ddy < 46 * 46) g.hurtPlayer(dmg, null, { by: 'lightning' });
            g.bolt([tx + vrange(-20, 20), ty - 420, tx + vrange(-30, 30), ty - 260, tx + vrange(-20, 20), ty - 120, tx, ty], 0xfff3a0, 3); // visual only
            g.explosionFx(tx, ty, 34, 0xfff3a0);
            audio.sfx('zap', 0.5, 0.7);
          },
        });
      }
      break;
    }
    case 'kamikaze': {
      if (e.state === 0) {
        moveToward(g, e, p.x, p.y, e.speed, dt);
        if (distP < 58) {
          e.state = 9; e.t = 0; audio.sfx('buzz', 0.3, 1.6);
          g.tele({ kind: 'circle', x: e.x, y: e.y, r: 72, dur: 0.6, color: 0x7fb6e6 });
        }
      } else if (e.state === 9) {
        e.scale = (e.elite ? 1.55 : 1) * (1 + e.t * 0.5);
        moveToward(g, e, p.x, p.y, e.speed * 0.25, dt);
        if (e.t > 0.6) {
          const r = 72;
          const ddx = p.x - e.x, ddy = p.y - e.y;
          if (ddx * ddx + ddy * ddy < r * r) g.hurtPlayer(14 * g.stageDef.dmgMul, null, { by: 'balloon' });
          splashFx(g, e.x, e.y, r);
          e.noXp = true;
          g.killEnemy(e, null);
        }
      }
      break;
    }
    case 'healer': {
      const want = 200;
      const d = distP || 1;
      if (d > want) moveToward(g, e, p.x, p.y, e.speed, dt);
      else { moveToward(g, e, e.x - dxp, e.y - dyp, e.speed * 0.6, dt); e.face = dxp > 0 ? 1 : -1; }
      if (e.t > 3.2) {
        e.t = 0;
        let healed = 0;
        g.query(e.x, e.y, 170, (o) => {
          if (o === e || o.prop || o.boss || o.hp >= o.maxHp) return;
          o.hp = Math.min(o.maxHp, o.hp + o.maxHp * 0.3);
          healed++;
          g.particle(o.x, o.y - 30, g.fx.drop, { vy: -40, life: 0.6, s0: 0.4, s1: 0.2, tint: 0x7fd0ff });
        });
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          g.particle(e.x + Math.cos(a) * 20, e.y - 30, g.fx.drop, { vx: Math.cos(a) * 140, vy: Math.sin(a) * 140, life: 0.5, s0: 0.35, s1: 0.1, tint: 0x7fd0ff, drag: 2 });
        }
        if (healed) audio.sfx('heal', 0.25, 0.7);
      }
      break;
    }
    case 'blink': {
      if (e.state === 0) {
        moveToward(g, e, p.x, p.y, e.speed, dt);
        e.alpha = Math.min(1, e.alpha + dt * 3);
        if (e.t > 3.4 + (e.id % 3) * 0.4 && distP < 600) { e.state = 1; e.t = 0; }
      } else if (e.state === 1) { // fade out
        e.alpha = Math.max(0, 1 - e.t / 0.3);
        e.intangible = e.t > 0.15;
        if (e.t > 0.3) {
          const a = g.rng.angle();
          const r = g.rr(125, 165);
          e.x = e.px = p.x + Math.cos(a) * r;
          e.y = e.py = p.y + Math.sin(a) * r;
          if (g.arena) g.clampToArena(e, 30);
          e.state = 2; e.t = 0;
          e.contactCd = 0.55;
          g.puff(e.x, e.y - 30, 0xf3ead8, 0.6, 0.6);
        }
      } else if (e.state === 2) { // fade in (telegraph), then lunge
        e.alpha = Math.min(1, e.t / 0.5);
        e.intangible = e.t < 0.25;
        if (e.t > 0.65) { e.state = 3; e.t = 0; e.tx = (p.x - e.x); e.ty = (p.y - e.y); const d = Math.hypot(e.tx, e.ty) || 1; e.tx /= d; e.ty /= d; }
        else if (e.t > 0.3 && !e.t2) { e.t2 = 1; const a = Math.atan2(p.y - e.y, p.x - e.x); g.tele({ kind: 'line', subtle: true, x: e.x, y: e.y - 6, ang: a, len: 100, w: 24, dur: 0.35, color: 0xf3ead8 }); }
      } else {
        e.x += (e.tx * 250 + e.vx) * dt;
        e.y += (e.ty * 250 + e.vy) * dt;
        if (e.t > 0.4) { e.state = 0; e.t = 0; e.t2 = 0; }
      }
      break;
    }
    case 'orbit': {
      if (e.state === 0) {
        // approach to ring then circle
        const R = 165;
        const ang = Math.atan2(e.y - p.y, e.x - p.x) + (e.id % 2 ? 1 : -1) * 0.9 * dt * 2;
        const tx = p.x + Math.cos(ang) * R, ty = p.y + Math.sin(ang) * R;
        moveToward(g, e, tx, ty, e.speed, dt);
        if (e.t > 2.4 + (e.id % 4) * 0.5 && distP < 260) {
          e.state = 9; e.t = 0; e.tx = dxp / (distP || 1); e.ty = dyp / (distP || 1);
          g.tele({ kind: 'line', subtle: true, x: e.x, y: e.y - 6, ang: Math.atan2(e.ty, e.tx), len: 330 * 0.75, w: 26, dur: 0.55, color: 0xb48aff });
        }
      } else if (e.state === 9) {
        if (e.t > 0.55) { e.state = 2; e.t = 0; }
      } else if (e.state === 2) {
        e.x += (e.tx * 330 + e.vx) * dt;
        e.y += (e.ty * 330 + e.vy) * dt;
        if (e.t > 0.75) { e.state = 0; e.t = 0; }
      }
      break;
    }
    case 'shooter': {
      const want = 270;
      const d = distP || 1;
      const nx = dxp / d, ny = dyp / d;
      const dir = d > want + 40 ? 1 : d < want - 60 ? -1 : 0;
      const sl = e.slowT > 0 ? e.slowF : 1;
      const strafe = Math.sin(e.t * 0.5 + e.phase);
      e.x += ((nx * dir - ny * strafe * 0.6) * e.speed * sl + e.vx) * dt;
      e.y += ((ny * dir + nx * strafe * 0.6) * e.speed * sl + e.vy) * dt;
      if (e.state === 0 && e.t > 2.6 && d < 520) { e.state = 1; e.t = 0; e.t2 = 0; }
      if (e.state === 1) {
        e.t2 -= dt;
        if (e.t2 <= 0) {
          e.t2 = 0.16;
          const a = Math.atan2(p.y - 26 - (e.y - 30), p.x - e.x);
          g.spawnBullet(e.x, e.y - 30, Math.cos(a) * 185, Math.sin(a) * 185, { r: 7, dmg: 8 * g.stageDef.dmgMul, life: 3.5, tint: 0x9fd8ff });
          audio.sfx('eshoot', 0.25);
          e.ang++;
        }
        if (e.ang >= 3) { e.ang = 0; e.state = 0; e.t = 0; }
      }
      break;
    }
    case 'phase': {
      const cycle = (e.t + e.phase) % 4;
      const phased = cycle > 2.8;
      if (e.intangible && !phased) e.contactCd = 0.4; // grace period while it re-forms
      e.intangible = phased;
      e.alpha = phased ? 0.3 : Math.min(1, e.alpha + dt * 4);
      moveToward(g, e, p.x, p.y, e.speed * (phased ? 1.7 : 1), dt);
      if (phased && g.frameCount % 4 === 0) g.puff(e.x, e.y - 30, 0x3a3430, 0.5, 0.7);
      break;
    }
    case 'flee': {
      // run away from Novaki in a wobbly arc; escape after a while
      const d = distP || 1;
      const away = Math.atan2(-dyp, -dxp) + Math.sin(e.t * 2.3 + e.phase) * 0.9;
      const sl = e.slowT > 0 ? e.slowF : 1;
      const sp = e.speed * (d < 170 ? 1.15 : 0.85) * sl;
      e.x += (Math.cos(away) * sp + e.vx) * dt;
      e.y += (Math.sin(away) * sp + e.vy) * dt;
      e.face = Math.cos(away) > 0 ? 1 : -1;
      if (g.frameCount % 4 === 0) g.particle(e.x + vrange(-12, 12), e.y - 30 + vrange(-8, 8), g.fx.star, { add: true, vy: -25, life: 0.5, s0: 0.35, s1: 0, tint: 0xffd23a });
      if (e.t > 13) {
        g.hooks.toast('The gilded moth got away!', 'warn');
        g.despawn(e, true);
      }
      break;
    }
    case 'prop':
      e.vx = e.vy = 0;
      break;
  }
}

export function splashFx(g: Game, x: number, y: number, r: number) {
  audio.sfx('splash', 0.6);
  g.particle(x, y, g.fx.softring, { life: 0.35, s0: 0.1, s1: (r / 128) * 1.3, a0: 0.8, tint: 0x8fd0ff });
  for (let i = 0; i < 14; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = vrange(100, 260);
    g.particle(x, y - 10, g.fx.drop, { vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60, life: vrange(0.3, 0.6), s0: vrange(0.3, 0.5), s1: 0.1, tint: 0x8fd0ff, drag: 3, grav: 400 });
  }
}

/** Rewards & special death effects. */
export function onEnemyDeath(g: Game, e: Enemy, w: WeaponInst | null) {
  const def = e.def as EnemyDef;
  const p = g.player;
  // pop + puff
  if (!e.prop) {
    audio.sfx('kill', 0.3, e.small ? 1.3 : 1, 0.045);
    g.puff(e.x, e.y - def.size * e.scale * 0.4, 0xe9e1cf, 0.45 + e.r / 50, 0.6);
    g.spark(e.x, e.y - def.size * e.scale * 0.4, 0xffc070, 3, 140);
  } else {
    audio.sfx('pop', 0.5, 0.7);
    for (let i = 0; i < 5; i++) g.puff(e.x + vrange(-20, 20), e.y - vrange(0, 40), 0xb8a886, 0.6, 0.9);
  }
  // split
  if (def.ai === 'chase' && e.type === 'slime' && !e.small) {
    for (let i = 0; i < 2; i++) {
      const s = g.spawnEnemy('slime', e.x + (i ? 14 : -14), e.y + g.rr(-6, 6), { small: true });
      if (s) { s.vx = (i ? 1 : -1) * 160; s.spawnT = 0; }
    }
    splashFx(g, e.x, e.y, 40);
  }
  if (e.type === 'balloon' && !e.noXp) splashFx(g, e.x, e.y, 40);
  // wildfire evolution: burning enemies spread fire
  if (e.burnT > 0 && g.director?.wildfire) g.director.wildfire(e.x, e.y);
  // drops
  if (def.gilded) {
    g.dropPickup('chest', e.x, e.y);
    for (let i = 0; i < 10; i++) g.dropPickup('coin', e.x + g.rr(-40, 40), e.y + g.rr(-40, 40), 2);
    g.hooks.toast('Caught the gilded moth!', 'gold');
    audio.sfx('chest', 0.6, 1.2);
    return;
  }
  if (e.prop) {
    const r = g.rng.next();
    const kind = r < 0.42 ? 'heal' : r < 0.6 ? 'coin' : r < 0.73 ? 'magnet' : r < 0.84 ? 'bomb' : r < 0.93 ? 'freeze' : 'goldmatch';
    g.dropPickup(kind, e.x, e.y - 10, kind === 'coin' ? 5 : 1);
    return;
  }
  if (e.elite) {
    g.dropPickup('chest', e.x, e.y);
    for (let i = 0; i < 6; i++) g.dropPickup('coin', e.x + g.rr(-30, 30), e.y + g.rr(-30, 30), 2);
  }
  if (!e.noXp && e.xp > 0) g.dropPickup('xp', e.x + g.rr(-4, 4), e.y + g.rr(-4, 4), e.xp);
  const luck = p.stats.luck;
  const r = g.rng.next();
  if (r < 0.022 * luck) g.dropPickup('coin', e.x + 8, e.y, 1);
  else if (r < 0.022 * luck + 0.004 * luck) g.dropPickup('heal', e.x, e.y);
  void w;
}
