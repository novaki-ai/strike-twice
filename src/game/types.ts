/** Shared shapes of the simulation: stats, the player, enemies, projectiles, zones, bullets, telegraphs, pickups, particles. */
import type { Container, Graphics, Sprite } from 'pixi.js';

export interface Stats {
  maxHp: number;
  regen: number;
  armor: number;
  speed: number;
  might: number;
  area: number;
  cooldown: number;
  amount: number;
  projSpeed: number;
  duration: number;
  magnet: number;
  luck: number;
  growth: number;
  greed: number;
  crit: number;
  critMult: number;
  burn: number;
  ignite: number;
  revives: number;
  dashCd: number;
  pierce: number;
}

export interface WeaponInst {
  id: string;
  level: number;
  evo: boolean;
  cd: number;
  slot: number;
  t: number; // generic timer
  active: number; // generic active-phase timer
  data: any;
  dmg: number; // damage dealt (stats)
  kills: number;
}

export interface PassiveInst {
  id: string;
  level: number;
}

export interface Player {
  x: number; y: number; px: number; py: number;
  vx: number; vy: number;
  r: number;
  hp: number;
  level: number; xp: number; xpNext: number;
  face: number;
  dirX: number; dirY: number;
  aimX: number; aimY: number;
  moving: boolean;
  iframes: number;
  dashT: number; dashCd: number; dashX: number; dashY: number;
  hurtT: number;
  animT: number;
  stats: Stats;
  weapons: WeaponInst[];
  passives: PassiveInst[];
  revives: number;
  invincible: boolean;
  goldT: number; // golden match power-up timer
  regenAcc: number;
  ignite: number; // head flame visual timer
}

export interface Enemy {
  id: number;
  type: string;
  def: any;
  x: number; y: number; px: number; py: number;
  vx: number; vy: number; // knockback / impulse velocity
  mx: number; my: number; // last move dir for facing
  hp: number; maxHp: number;
  r: number; speed: number; dmg: number; xp: number;
  scale: number;
  state: number; t: number; t2: number; ang: number; tx: number; ty: number;
  flash: number;
  burnT: number; burnDps: number; burnTick: number;
  slowT: number; slowF: number;
  freezeT: number;
  elite: boolean;
  boss: any;
  prop: boolean;
  alive: boolean;
  sp: Sprite; sh: Sprite;
  intangible: boolean;
  alpha: number;
  hop: number; // visual vertical offset
  face: number;
  spawnT: number;
  hitCd: Float32Array;
  small: boolean;
  noXp: boolean;
  contactCd: number;
  phase: number; // anim phase
  kbRes: number;
}

export interface Proj {
  alive: boolean;
  kind: number;
  w: WeaponInst | null;
  x: number; y: number; px: number; py: number;
  vx: number; vy: number;
  r: number; dmg: number; pierce: number; life: number; t: number;
  hits: number[];
  sp: Sprite; glow: Sprite | null;
  rot: number; spin: number;
  ox: number; oy: number; ang: number; dist: number; a: number; b: number;
  burn: number; knock: number; explode: number;
  tex: string; scale: number; tint: number; light: number;
  hitEvery: number; // >0 means re-hit with cooldown instead of pierce list
  data: any;
}

export interface Zone {
  alive: boolean;
  kind: number;
  w: WeaponInst | null;
  x: number; y: number;
  r: number; dmg: number;
  tick: number; tickT: number;
  life: number; t: number; maxLife: number;
  slow: number; pull: number; burn: number; knock: number;
  follow: boolean;
  hostile: boolean; // damages player instead
  sp: Sprite | null; sp2: Sprite | null;
  hitSet: Set<number> | null;
  r0: number; r1: number;
  data: any;
}

export interface Bullet {
  alive: boolean;
  x: number; y: number; px: number; py: number;
  vx: number; vy: number;
  r: number; dmg: number; life: number; t: number;
  acc: number; turn: number; homing: number;
  sp: Sprite; core: Sprite;
  tint: number; slow: number;
  grow: number;
  src: string;
}

export interface Tele {
  alive: boolean;
  kind: 'circle' | 'line' | 'ring';
  x: number; y: number; r: number; ang: number; len: number; w: number;
  t: number; dur: number; color: number;
  follow: boolean;
  subtle?: boolean;
  onDone: (() => void) | null;
}

export interface Pickup {
  alive: boolean;
  kind: string;
  x: number; y: number; px: number; py: number;
  vx: number; vy: number;
  value: number;
  sp: Sprite;
  magnet: boolean;
  t: number;
}

export interface Particle {
  alive: boolean;
  x: number; y: number; vx: number; vy: number;
  life: number; max: number;
  sp: Sprite;
  s0: number; s1: number; a0: number;
  rot: number; vrot: number;
  drag: number; grav: number;
  z: number; vz: number; // fake height
  layer: number;
  aspect: number;
  sy: number;
}

export interface DmgNum {
  alive: boolean;
  c: Container;
  x: number; y: number; vy: number;
  life: number;
  scale: number;
}

export interface Bolt {
  alive: boolean;
  g: Graphics;
  life: number; max: number;
}
