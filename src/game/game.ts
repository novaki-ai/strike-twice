/** Core game simulation + rendering for a run. */
import { Application, Container, Graphics, RenderTexture, Sprite, Texture, TilingSprite } from 'pixi.js';
import { RNG, vrange } from '../core/rng';
import { audio } from '../core/audio';
import type { Bolt, Bullet, DmgNum, Enemy, Particle, Pickup, Player, Proj, Stats, Tele, WeaponInst, Zone } from './types';
import type { FxTex, TexSet } from './textures';
import { ENEMIES, updateEnemy, onEnemyDeath } from './enemies';
import { WEAPONS, updateWeapon } from './weapons';
import { PASSIVES, applyPassives } from './upgrades';
import { STAGES, StageDirector } from './stages';
import { updateBoss, BOSSES } from './bosses';
import { NovakiRig } from './rig';
import { FRAME_B } from './frames';
import { applyRelics, relicDamageMul, relicOnCrit, relicOnKill, relicOnHurt, relicUpdate } from './relics';

export const STEP = 1 / 60;
const GRID = 64;
const MAX_ENEMIES = 520;

export interface Hooks {
  levelUp(): void;
  bossSpawn(bossId: string): void;
  bossPhase(bossId: string, phase: number): void;
  bossDefeated(bossId: string): void;
  playerDied(): void;
  chest(contents: { id: string; evo: boolean; name: string }[]): void;
  toast(text: string, kind?: string): void;
  stageIntro(stage: number): void;
  warning(text: string): void;
}

export interface RunStats {
  kills: number;
  dmgTaken: number;
  coins: number;
  maxLevel: number;
  bossesKilled: string[];
  chests: number;
  heals: number;
  stageReached: number;
  evolutions: number;
  dmgBy: Record<string, number>;
  assisted: boolean;
}

export class Game {
  app: Application;
  T: TexSet;
  fx: FxTex;
  icons: Record<string, Texture>;
  tiles: Record<string, Texture>;
  digits: { digits: Texture[]; w: number[] };
  hooks: Hooks;

  rng = new RNG(1);
  seed = 1;
  time = 0;
  stageTime = 0;
  stage = 1;
  timeScale = 1;
  slowmoT = 0;
  hitstop = 0;
  running = false;
  over = false;
  settings = { shake: true, dmgNumbers: true, flashes: true };

  player!: Player;
  baseStats!: Stats;
  enemies: Enemy[] = [];
  private enemyPool: Enemy[] = [];
  projs: Proj[] = [];
  zones: Zone[] = [];
  bullets: Bullet[] = [];
  teles: Tele[] = [];
  pickups: Pickup[] = [];
  particles: Particle[] = [];
  nums: DmgNum[] = [];
  bolts: Bolt[] = [];
  boss: Enemy | null = null;
  bossActive = false;
  arena: { x: number; y: number; r: number } | null = null;
  director!: StageDirector;
  stats!: RunStats;
  nextEnemyId = 1;
  pendingLevels = 0;
  freezeT = 0;
  darkness = 0.2;
  darkTarget = 0.2;
  extraDark = 0;
  blackout = 0;
  flashT = 0;
  flashColor = 0xffffff;
  coinsRun = 0;
  weaponSlotsMax = 6;
  passiveSlotsMax = 6;
  rerolls = 0;
  banishes = 0;
  banished = new Set<string>();
  unlockedWeapons: string[] = [];
  metaBonus: Partial<Stats> = {};
  choiceCount = 3;
  inferno = false;
  daily = false;
  runWon = false;
  lightningReadyAt = 0;
  seenTypes = new Set<string>();
  relics = new Set<string>();
  wardT = 0;
  danceT = 0;
  kindlingCount = 0;
  wardSprite: Sprite | null = null;
  chestArrows: Container[] = [];

  // grid
  private grid = new Map<number, Enemy[]>();
  private gridPool: Enemy[][] = [];

  // camera
  camX = 0;
  camY = 0;
  zoom = 1;
  shakeT = 0;
  shakeAmp = 0;
  viewW = 1200;
  viewH = 700;

  // layers
  root = new Container();
  worldA = new Container();
  worldB = new Container();
  ground!: TilingSprite;
  decalLayer = new Container();
  pickupLayer = new Container();
  shadowLayer = new Container();
  actorLayer = new Container();
  projLayer = new Container();
  addLayer = new Container();
  teleLayer = new Graphics();
  bulletLayer = new Container();
  topLayer = new Container();
  numLayer = new Container();
  screenLayer = new Container();
  lightRT!: RenderTexture;
  lightScene = new Container();
  lightSprite!: Sprite;
  lightPool: Sprite[] = [];
  lightUsed = 0;
  grain!: TilingSprite;
  vignette!: Sprite;
  flashSprite!: Sprite;
  rainLayer = new Container();
  rain: { sp: Sprite; x: number; y: number; v: number }[] = [];
  arenaG = new Graphics();
  rig!: NovakiRig;
  decor = new Map<string, Sprite[]>();
  litProps = new Set<string>();
  lightsRelit = 0;
  flamePool: Sprite[] = [];
  decorPool: Sprite[] = [];
  stageDef: any;
  private spritePools: Record<string, Sprite[]> = {};
  frameCount = 0;
  aliveCount = 0;

  constructor(app: Application, T: TexSet, fx: FxTex, icons: Record<string, Texture>, tiles: Record<string, Texture>, digits: { digits: Texture[]; w: number[] }, hooks: Hooks) {
    this.app = app;
    this.T = T;
    this.fx = fx;
    this.icons = icons;
    this.tiles = tiles;
    this.digits = digits;
    this.hooks = hooks;
    this.buildLayers();
  }

  /* ------------------------------------------------------------------ setup */

  private buildLayers() {
    const r = this.root;
    this.ground = new TilingSprite({ texture: this.tiles.tile_forest || Texture.WHITE, width: 100, height: 100 });
    r.addChild(this.ground);
    r.addChild(this.worldA);
    this.actorLayer.sortableChildren = true;
    this.addLayer.blendMode = 'add';
    this.worldA.addChild(this.decalLayer, this.arenaG, this.pickupLayer, this.shadowLayer, this.actorLayer, this.projLayer, this.addLayer);
    this.lightRT = RenderTexture.create({ width: 64, height: 64 });
    this.lightSprite = new Sprite(this.lightRT);
    this.lightSprite.blendMode = 'multiply';
    r.addChild(this.lightSprite);
    r.addChild(this.worldB);
    this.worldB.addChild(this.teleLayer, this.bulletLayer, this.topLayer, this.numLayer);
    r.addChild(this.screenLayer);
    this.screenLayer.addChild(this.rainLayer);
    this.vignette = new Sprite(this.fx.vignette);
    this.screenLayer.addChild(this.vignette);
    this.grain = new TilingSprite({ texture: this.fx.grain, width: 100, height: 100 });
    this.grain.alpha = 0.22;
    this.screenLayer.addChild(this.grain);
    this.flashSprite = new Sprite(Texture.WHITE);
    this.flashSprite.alpha = 0;
    this.screenLayer.addChild(this.flashSprite);
    this.rig = new NovakiRig(this.T.tex.novaki_torso, this.fx);
    this.actorLayer.addChild(this.rig.root);
    // light scene background (ambient)
    const amb = new Sprite(Texture.WHITE);
    amb.label = 'ambient';
    this.lightScene.addChild(amb);
  }

  resize(w: number, h: number) {
    const area = (w * h) / (1150 * 680);
    this.zoom = Math.max(0.45, Math.min(3, Math.sqrt(area)));
    this.viewW = w / this.zoom;
    this.viewH = h / this.zoom;
    this.ground.width = w;
    this.ground.height = h;
    this.vignette.width = w;
    this.vignette.height = h;
    this.grain.width = w;
    this.grain.height = h;
    this.flashSprite.width = w;
    this.flashSprite.height = h;
    const lw = Math.max(16, Math.ceil(w / 4)), lh = Math.max(16, Math.ceil(h / 4));
    this.lightRT.resize(lw, lh);
    this.lightSprite.width = w;
    this.lightSprite.height = h;
    this.screenW = w;
    this.screenH = h;
  }
  screenW = 1280;
  screenH = 720;

  pool(name: string, layer: Container, tex: Texture): Sprite {
    const p = (this.spritePools[name] ||= []);
    let s = p.pop();
    if (!s) {
      s = new Sprite(tex);
      layer.addChild(s);
    } else {
      s.texture = tex;
      s.visible = true;
    }
    s.alpha = 1;
    s.rotation = 0;
    s.tint = 0xffffff;
    s.scale.set(1);
    return s;
  }
  unpool(name: string, s: Sprite) {
    s.visible = false;
    (this.spritePools[name] ||= []).push(s);
  }

  /** seeded random in [a, b) for anything that affects gameplay (positions, aims, drops) */
  rr(a: number, b: number): number {
    return this.rng.range(a, b);
  }

  /* ------------------------------------------------------------------ run lifecycle */

  newRun(seed: number, meta: { stats: Partial<Stats>; weapons: string[]; startWeapon: string; rerolls: number; banishes: number; choices: number; inferno?: boolean }) {
    this.clearAll();
    this.seed = seed >>> 0;
    this.rng = new RNG(this.seed);
    this.time = 0;
    this.over = false;
    this.timeScale = 1;
    this.slowmoT = 0;
    this.hitstop = 0;
    this.pendingLevels = 0;
    this.coinsRun = 0;
    this.metaBonus = meta.stats;
    this.unlockedWeapons = meta.weapons;
    this.rerolls = meta.rerolls;
    this.banishes = meta.banishes;
    this.banished.clear();
    this.choiceCount = meta.choices;
    this.inferno = !!meta.inferno;
    this.daily = !!(meta as any).daily;
    this.runWon = false;
    this.lightningReadyAt = 0;
    this.seenTypes.clear();
    this.relics.clear();
    this.wardT = 0;
    this.danceT = 0;
    this.kindlingCount = 0;
    this.stats = { kills: 0, dmgTaken: 0, coins: 0, maxLevel: 1, bossesKilled: [], chests: 0, heals: 0, stageReached: 1, evolutions: 0, dmgBy: {}, assisted: false };
    this.lightsRelit = 0;
    const base: Stats = {
      maxHp: 120, regen: 0, armor: 0, speed: 150, might: 1, area: 1, cooldown: 1, amount: 0, projSpeed: 1,
      duration: 1, magnet: 100, luck: 1, growth: 1, greed: 1, crit: 0.05, critMult: 1.75, burn: 1, ignite: 0,
      revives: 0, dashCd: 1.8, pierce: 0,
    };
    for (const [k, v] of Object.entries(meta.stats)) {
      if (k === 'speed' || k === 'magnet') (base as any)[k] *= 1 + (v as number);
      else (base as any)[k] += v as number;
    }
    this.baseStats = base;
    this.player = {
      x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, r: 13,
      hp: base.maxHp, level: 1, xp: 0, xpNext: xpFor(1),
      face: 1, dirX: 1, dirY: 0, aimX: 1, aimY: 0, moving: false,
      iframes: 0, dashT: 0, dashCd: 0, dashX: 0, dashY: 0, hurtT: 0, animT: 0,
      stats: { ...base }, weapons: [], passives: [], revives: base.revives, invincible: false, goldT: 0, regenAcc: 0,
      ignite: 0,
    };
    this.addWeapon(meta.startWeapon || 'ember');
    this.rig.reset();
    this.running = true;
  }

  /** retire every enemy object (each is in the live list exactly once) */
  private retireAllEnemies() {
    for (const e of this.enemies) { this.releaseEnemy(e); this.enemyPool.push(e); }
    this.enemies.length = 0;
  }

  clearAll() {
    this.retireAllEnemies();
    for (const p of this.projs) if (p.alive) this.killProj(p);
    this.projs.length = 0;
    for (const z of this.zones) if (z.alive) this.killZone(z);
    this.zones.length = 0;
    for (const b of this.bullets) if (b.alive) this.killBullet(b);
    this.bullets.length = 0;
    this.teles.length = 0;
    for (const p of this.pickups) if (p.alive) this.killPickup(p);
    this.pickups.length = 0;
    for (const p of this.particles) if (p.alive) { p.alive = false; this.unpool('part' + p.layer, p.sp); }
    this.particles.length = 0;
    for (const n of this.nums) { n.alive = false; n.c.visible = false; }
    this.numsActive = 0;
    for (const b of this.bolts) { b.alive = false; b.g.visible = false; }
    this.boss = null;
    this.bossActive = false;
    this.arena = null;
    this.arenaG.clear();
    this.teleLayer.clear();
    this.freezeT = 0;
    this.extraDark = 0;
    this.clearDecor();
  }

  startStage(n: number, quiet = false) {
    // clear field but keep player build
    this.retireAllEnemies();
    for (const b of this.bullets) if (b.alive) this.killBullet(b);
    this.bullets.length = 0;
    this.teles.length = 0;
    for (const z of this.zones) if (z.alive && z.hostile) this.killZone(z);
    for (const p of this.pickups) if (p.alive) this.killPickup(p);
    this.pickups.length = 0;
    this.boss = null;
    this.bossActive = false;
    this.arena = null;
    this.arenaG.clear();
    this.extraDark = 0;
    this.stage = n;
    this.stageTime = 0;
    this.stats.stageReached = Math.max(this.stats.stageReached, n);
    this.stageDef = STAGES[n - 1];
    this.player.x = this.player.px = 0;
    this.player.y = this.player.py = 0;
    this.camX = 0;
    this.camY = 0;
    this.ground.texture = this.tiles[this.stageDef.tile] || Texture.WHITE;
    this.ground.tint = this.stageDef.groundTint ?? 0xffffff;
    this.darkTarget = this.darkness = this.stageDef.darkness;
    this.clearDecor();
    this.director = new StageDirector(this, this.stageDef);
    this.buildRain(this.stageDef.rain ? 90 : 0);
    if (!quiet) this.hooks.stageIntro(n);
  }

  /* ------------------------------------------------------------------ weapons & stats */

  addWeapon(id: string) {
    const used = new Set(this.player.weapons.map((w) => w.slot));
    let slot = 0;
    while (used.has(slot)) slot++;
    const w: WeaponInst = { id, level: 1, evo: false, cd: 0.3, slot, t: 0, active: 0, data: {}, dmg: 0, kills: 0 };
    this.player.weapons.push(w);
    return w;
  }

  recalcStats() {
    const s: Stats = { ...this.baseStats };
    applyPassives(s, this.player.passives);
    applyRelics(s, this.relics);
    const p = this.player;
    const hpFrac = p.hp / p.stats.maxHp;
    const oldMax = p.stats.maxHp;
    p.stats = s;
    if (s.maxHp > oldMax) p.hp += s.maxHp - oldMax;
    p.hp = Math.min(p.hp, s.maxHp);
    if (!isFinite(p.hp)) p.hp = hpFrac * s.maxHp;
  }

  /* ------------------------------------------------------------------ main update */

  update(dt: number) {
    if (!this.running) return;
    this.frameCount++;
    if (this.hitstop > 0) { this.hitstop -= dt; return; }
    this.time += dt;
    this.stageTime += dt;
    const p = this.player;

    this.updatePlayer(dt);
    if (this.relics.size) relicUpdate(this, dt);
    this.buildGrid();
    if (this.freezeT > 0) this.freezeT -= dt;

    // director: spawns, events, boss trigger
    this.director.update(dt);

    // weapons
    for (const w of p.weapons) updateWeapon(this, w, dt);

    // enemies
    const frozen = this.freezeT > 0;
    let alive = 0;
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (!e.alive) continue;
      e.px = e.x; e.py = e.y;
      if (e.flash > 0) e.flash -= dt;
      if (e.contactCd > 0) e.contactCd -= dt;
      if (e.spawnT > 0) e.spawnT -= dt;
      // status effects
      if (e.burnT > 0) {
        e.burnT -= dt;
        e.burnTick -= dt;
        if (e.burnTick <= 0) {
          e.burnTick = 0.5;
          this.damageEnemy(e, e.burnDps * 0.5, null, { noKnock: true, burnTick: true });
          if (!e.alive) continue;
        }
      }
      if (e.slowT > 0) e.slowT -= dt;
      if (frozen && !e.boss) {
        e.vx *= 0.8; e.vy *= 0.8;
        e.x += e.vx * dt; e.y += e.vy * dt;
      } else if (e.boss) {
        updateBoss(this, e, dt);
      } else {
        updateEnemy(this, e, dt);
      }
      if (!e.alive) continue;
      alive++;
      // contact damage
      if (!e.prop && e.dmg > 0 && !e.intangible && e.spawnT <= 0 && !(frozen && !e.boss)) {
        const dx = e.x - p.x, dy = e.y - p.y;
        const rr = e.r + p.r;
        if (dx * dx + dy * dy < rr * rr) {
          this.hurtPlayer(e.dmg, e);
        }
      }
      // arena clamp
      if (this.arena && !e.boss) this.clampToArena(e, 10);
    }
    this.aliveCount = alive;
    // separation
    this.separate();
    // compact enemy list occasionally (dead objects return to the pool here, never earlier)
    if (this.frameCount % 30 === 0) this.compactEnemies();

    this.updateProjs(dt);
    this.updateZones(dt);
    this.updateBullets(dt);
    this.updateTeles(dt);
    this.updatePickups(dt);

    // level-ups queued -> UI
    if (this.pendingLevels > 0 && !this.over && p.hp > 0 && !this.runWon) {
      this.hooks.levelUp();
    }
  }

  /* ------------------------------------------------------------------ player */

  input = { x: 0, y: 0, dash: false };

  private updatePlayer(dt: number) {
    const p = this.player;
    const s = p.stats;
    p.px = p.x; p.py = p.y;
    p.animT += dt;
    if (p.iframes > 0) p.iframes -= dt;
    if (p.hurtT > 0) p.hurtT -= dt;
    if (p.dashCd > 0) p.dashCd -= dt;
    if (p.goldT > 0) p.goldT -= dt;
    if (p.ignite > 0) p.ignite -= dt;
    let ix = this.input.x, iy = this.input.y;
    const mag = Math.hypot(ix, iy);
    p.moving = mag > 0.05;
    if (p.moving) {
      p.dirX = ix / mag; p.dirY = iy / mag;
      if (Math.abs(ix) > 0.1) p.face = ix > 0 ? 1 : -1;
    }
    if (this.input.dash && p.dashCd <= 0 && p.dashT <= 0) {
      p.dashT = 0.2;
      p.dashCd = s.dashCd;
      p.dashX = p.moving ? p.dirX : p.face;
      p.dashY = p.moving ? p.dirY : 0;
      p.iframes = Math.max(p.iframes, 0.32);
      audio.sfx('dash', 0.7);
      for (let i = 0; i < 6; i++) this.puff(p.x + vrange(-10, 10), p.y + vrange(-4, 4), 0xd8d0c0, 0.5, 0.9);
      this.director?.onDash?.();
    }
    this.input.dash = false;
    let speed = s.speed * (p.goldT > 0 ? 1.25 : 1);
    if (p.dashT > 0) {
      p.dashT -= dt;
      p.vx = p.dashX * speed * 3.6;
      p.vy = p.dashY * speed * 3.6;
      if (this.frameCount % 2 === 0) this.puff(p.x, p.y - 20, 0xbfb6a6, 0.35, 0.6);
    } else {
      // slight acceleration smoothing
      const tx = ix * speed, ty = iy * speed;
      const k = 1 - Math.exp(-dt * 22);
      p.vx += (tx - p.vx) * k;
      p.vy += (ty - p.vy) * k;
    }
    // hostile slow zones
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (this.arena) {
      const a = this.arena;
      const dx = p.x - a.x, dy = p.y - a.y;
      const d = Math.hypot(dx, dy);
      const lim = a.r - 24;
      if (d > lim) { p.x = a.x + (dx / d) * lim; p.y = a.y + (dy / d) * lim; }
    }
    // aim = nearest enemy direction, fallback to move dir
    // regen
    if (s.regen > 0 && p.hp < s.maxHp) {
      p.regenAcc += s.regen * dt;
      if (p.regenAcc >= 1) { p.hp = Math.min(s.maxHp, p.hp + p.regenAcc); p.regenAcc = 0; }
    }
  }

  hurtPlayer(dmg: number, src: Enemy | null, opts: { pierceArmor?: boolean; by?: string } = {}) {
    const p = this.player;
    if (p.iframes > 0 || p.invincible || p.goldT > 0 || this.over) return;
    if (this.relics.size && relicOnHurt(this, src)) return;
    const armor = opts.pierceArmor ? 0 : p.stats.armor;
    const d = Math.max(1, dmg - armor);
    p.hp -= d;
    const by = opts.by || (src ? src.type : 'bullet');
    this.stats.dmgBy[by] = (this.stats.dmgBy[by] || 0) + d;
    p.iframes = 0.75;
    p.hurtT = 0.3;
    this.stats.dmgTaken += d;
    audio.sfx('hurt', 0.8);
    this.shake(7, 0.25);
    this.dmgNumber(p.x, p.y - 60, d, 0xff5a3c, 1.1);
    if (this.settings.flashes) { this.flashT = 0.12; this.flashColor = 0xc8361d; }
    if (src) {
      const dx = src.x - p.x, dy = src.y - p.y;
      const dd = Math.hypot(dx, dy) || 1;
      if (!src.boss) { src.vx += (dx / dd) * 160; src.vy += (dy / dd) * 160; }
    }
    if (p.hp <= 0) {
      if (p.revives > 0) {
        p.revives--;
        p.hp = p.stats.maxHp * 0.5;
        p.iframes = 2.5;
        audio.sfx('revive', 1);
        this.hooks.toast('SECOND STRIKE! Novaki relights!', 'gold');
        this.blast(p.x, p.y, 220, 9999, null, 0xffc23a, true);
        p.ignite = 3;
        return;
      }
      p.hp = 0;
      this.over = true;
      this.running = false;
      this.rig.knockOut(this);
      this.shake(12, 0.5);
      for (let i = 0; i < 8; i++) this.puff(p.x + vrange(-20, 20), p.y - vrange(10, 50), 0xbfb6a6, 0.8, 1.2);
      this.hooks.playerDied();
    }
  }

  heal(amount: number) {
    const p = this.player;
    const before = p.hp;
    p.hp = Math.min(p.stats.maxHp, p.hp + amount);
    if (p.hp > before) {
      this.dmgNumber(p.x, p.y - 64, p.hp - before, 0x7ddc6a, 1);
      this.stats.heals += p.hp - before;
    }
  }

  /* ------------------------------------------------------------------ enemies */

  spawnEnemy(type: string, x: number, y: number, opts: { elite?: boolean; small?: boolean; hpMul?: number; noXp?: boolean; boss?: any } = {}): Enemy | null {
    const def: any = ENEMIES[type] || BOSSES[type];
    if (!def) return null;
    let e = this.enemyPool.pop();
    if (!e) {
      e = {
        id: 0, type, def, x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, mx: 0, my: 0, hp: 1, maxHp: 1, r: 10, speed: 0, dmg: 0, xp: 0,
        scale: 1, state: 0, t: 0, t2: 0, ang: 0, tx: 0, ty: 0, flash: 0, burnT: 0, burnDps: 0, burnTick: 0, slowT: 0, slowF: 1,
        freezeT: 0, elite: false, boss: null, prop: false, alive: true, sp: null as any, sh: null as any, intangible: false,
        alpha: 1, hop: 0, face: 1, spawnT: 0, hitCd: new Float32Array(16), small: false, noXp: false, contactCd: 0, phase: 0, kbRes: 1,
      };
      e.sp = new Sprite(this.T.tex[def.tex] || Texture.WHITE);
      e.sp.anchor.set(0.5, def.anchorY ?? 0.92);
      this.actorLayer.addChild(e.sp);
      e.sh = new Sprite(this.fx.shadow);
      e.sh.anchor.set(0.5);
      this.shadowLayer.addChild(e.sh);
    }
    const st = this.stageDef || STAGES[0];
    const hpScale = opts.boss ? 1 : st.hpMul * (1 + this.stageTime / 360);
    e.id = this.nextEnemyId++;
    e.type = type;
    if (!def.prop) this.seenTypes.add(type);
    e.def = def;
    e.x = e.px = x; e.y = e.py = y;
    e.vx = e.vy = 0; e.mx = 0; e.my = 0;
    e.small = !!opts.small;
    e.elite = !!opts.elite;
    e.prop = !!def.prop;
    const sizeMul = (e.elite ? 1.55 : 1) * (e.small ? 0.6 : 1);
    e.scale = sizeMul;
    e.maxHp = e.hp = Math.max(1, def.hp * hpScale * (e.elite ? 10 : 1) * (e.small ? 0.35 : 1) * (opts.hpMul || 1) * (this.inferno && !opts.boss ? 1.6 : 1));
    e.r = def.r * sizeMul;
    e.speed = def.speed * (1 + (this.stage - 1) * 0.06) * (e.elite ? 0.85 : 1);
    e.dmg = def.dmg * st.dmgMul * (e.elite ? 1.5 : 1) * (e.small ? 0.6 : 1) * (this.inferno ? 1.4 : 1);
    e.xp = def.xp * (e.elite ? 20 : 1) * (e.small ? 0.5 : 1) * (1 + (this.stage - 1) * 0.5);
    e.state = 0; e.t = 0; e.t2 = 0; e.ang = this.rng.angle(); e.tx = 0; e.ty = 0;
    e.flash = 0; e.burnT = 0; e.burnDps = 0; e.burnTick = 0; e.slowT = 0; e.slowF = 1; e.freezeT = 0;
    e.boss = opts.boss || null;
    e.alive = true; e.intangible = false; e.alpha = 1; e.hop = 0; e.face = 1;
    e.spawnT = opts.boss ? 0 : 0.35;
    e.hitCd.fill(0);
    e.noXp = !!opts.noXp;
    e.contactCd = 0;
    e.phase = this.rng.next() * 10;
    e.kbRes = def.kbRes ?? 1;
    const tex = this.T.tex[def.tex] || Texture.WHITE;
    e.sp.texture = tex;
    e.sp.anchor.set(0.5, def.anchorY ?? 0.92);
    const h = def.size * sizeMul;
    const sc = h / tex.height;
    e.sp.scale.set(sc);
    e.sp.visible = true;
    e.sp.alpha = 1;
    e.sp.tint = e.elite ? 0xffe6a0 : 0xffffff;
    e.sp.rotation = 0;
    e.sh.visible = !def.noShadow;
    const shw = (def.shadowW ?? def.r * 2.6) * sizeMul;
    e.sh.width = shw;
    e.sh.height = shw * 0.38;
    this.enemies.push(e);
    return e;
  }

  /** mark dead + hide; the object goes back to the pool when compacted out of the live list */
  releaseEnemy(e: Enemy) {
    e.alive = false;
    e.sp.visible = false;
    e.sh.visible = false;
  }

  private compactEnemies() {
    let j = 0;
    const arr = this.enemies;
    for (let i = 0; i < arr.length; i++) {
      const e = arr[i];
      if (e.alive) arr[j++] = e;
      else this.enemyPool.push(e);
    }
    arr.length = j;
  }

  enemyCount(): number {
    let n = 0;
    for (const e of this.enemies) if (e.alive && !e.prop) n++;
    return n;
  }

  canSpawn(extra = 0): boolean {
    return this.enemyCount() + extra < MAX_ENEMIES * 4;
  }

  /** Spawn position on a ring just outside the view. */
  spawnPoint(angle?: number): { x: number; y: number } {
    const a = angle ?? this.rng.angle();
    const rx = this.viewW / 2 + 70, ry = this.viewH / 2 + 70;
    // ellipse-ish ring matching the view aspect
    let x = this.player.x + Math.cos(a) * rx;
    let y = this.player.y + Math.sin(a) * ry;
    const k = Math.max(Math.abs(Math.cos(a)) * rx / rx, Math.abs(Math.sin(a)) * ry / ry);
    x = this.player.x + (Math.cos(a) * rx) / Math.max(0.7, k);
    y = this.player.y + (Math.sin(a) * ry) / Math.max(0.7, k);
    if (this.arena) {
      const ar = this.arena;
      const dx = x - ar.x, dy = y - ar.y;
      const d = Math.hypot(dx, dy);
      if (d > ar.r - 30) { x = ar.x + (dx / d) * (ar.r - 40); y = ar.y + (dy / d) * (ar.r - 40); }
    }
    return { x, y };
  }

  clampToArena(e: { x: number; y: number }, pad: number) {
    const a = this.arena!;
    const dx = e.x - a.x, dy = e.y - a.y;
    const d = Math.hypot(dx, dy);
    const lim = a.r - pad;
    if (d > lim) { e.x = a.x + (dx / d) * lim; e.y = a.y + (dy / d) * lim; }
  }

  private buildGrid() {
    for (const arr of this.grid.values()) { arr.length = 0; this.gridPool.push(arr); }
    this.grid.clear();
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const k = this.gkey(Math.floor(e.x / GRID), Math.floor(e.y / GRID));
      let arr = this.grid.get(k);
      if (!arr) { arr = this.gridPool.pop() || []; this.grid.set(k, arr); }
      arr.push(e);
    }
  }
  private gkey(cx: number, cy: number) {
    return ((cx + 32768) << 16) | ((cy + 32768) & 0xffff);
  }

  /** Iterate enemies near a point (radius r). Callback returns true to stop. */
  query(x: number, y: number, r: number, cb: (e: Enemy) => boolean | void) {
    const x0 = Math.floor((x - r) / GRID), x1 = Math.floor((x + r) / GRID);
    const y0 = Math.floor((y - r) / GRID), y1 = Math.floor((y + r) / GRID);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const arr = this.grid.get(this.gkey(cx, cy));
        if (!arr) continue;
        for (let i = 0; i < arr.length; i++) {
          const e = arr[i];
          if (e.alive && cb(e)) return;
        }
      }
    }
  }

  nearestEnemy(x: number, y: number, maxR = 9999, exclude?: Set<number>): Enemy | null {
    let best: Enemy | null = null;
    let bd = maxR * maxR;
    if (maxR < 400) {
      this.query(x, y, maxR, (e) => {
        if (e.intangible || e.prop || (exclude && exclude.has(e.id))) return;
        let d = (e.x - x) ** 2 + (e.y - y) ** 2;
        if (e.boss) d *= 0.3;
        if (d < bd) { bd = d; best = e; }
      });
      const b = this.boss;
      if (b && b.alive && !b.intangible && !(exclude && exclude.has(b.id))) {
        const d = ((b.x - x) ** 2 + (b.y - y) ** 2) * 0.3;
        if (d < bd && d < maxR * maxR) best = b;
      }
      return best;
    }
    for (const e of this.enemies) {
      if (!e.alive || e.intangible || e.prop || (exclude && exclude.has(e.id))) continue;
      let d = (e.x - x) ** 2 + (e.y - y) ** 2;
      if (e.boss) d *= 0.3;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  /** n nearest enemies (distinct) */
  nearestN(x: number, y: number, n: number, maxR = 600): Enemy[] {
    const out: { e: Enemy; d: number }[] = [];
    for (const e of this.enemies) {
      if (!e.alive || e.intangible || e.prop) continue;
      let d = (e.x - x) ** 2 + (e.y - y) ** 2;
      if (d > maxR * maxR) continue;
      if (e.boss) d *= 0.2;
      if (out.length < n) { out.push({ e, d }); out.sort((a, b) => a.d - b.d); }
      else if (d < out[n - 1].d) { out[n - 1] = { e, d }; out.sort((a, b) => a.d - b.d); }
    }
    return out.map((o) => o.e);
  }

  randomOnScreenEnemy(): Enemy | null {
    const hw = this.viewW / 2, hh = this.viewH / 2;
    const cands: Enemy[] = [];
    for (const e of this.enemies) {
      if (!e.alive || e.intangible || e.prop) continue;
      if (Math.abs(e.x - this.player.x) < hw && Math.abs(e.y - this.player.y) < hh) cands.push(e);
      if (cands.length > 60) break;
    }
    if (!cands.length) return null;
    return cands[Math.floor(this.rng.next() * cands.length)];
  }

  private separate() {
    // push overlapping enemies apart (cheap, grid based)
    for (const arr of this.grid.values()) {
      for (let i = 0; i < arr.length; i++) {
        const a = arr[i];
        if (!a.alive || a.boss || a.prop) continue;
        for (let j = i + 1; j < arr.length; j++) {
          const b = arr[j];
          if (!b.alive || b.boss || b.prop) continue;
          const dx = b.x - a.x, dy = b.y - a.y;
          const rr = (a.r + b.r) * 0.85;
          const d2 = dx * dx + dy * dy;
          if (d2 < rr * rr && d2 > 0.0001) {
            const d = Math.sqrt(d2);
            const push = (rr - d) * 0.35;
            const nx = dx / d, ny = dy / d;
            a.x -= nx * push; a.y -= ny * push;
            b.x += nx * push; b.y += ny * push;
          }
        }
      }
    }
  }

  /** Central damage pipeline for player-sourced damage. Returns damage dealt. */
  damageEnemy(e: Enemy, amount: number, w: WeaponInst | null, o: { kx?: number; ky?: number; knock?: number; burn?: number; noKnock?: boolean; burnTick?: boolean; noCrit?: boolean; slow?: number; fromX?: number; fromY?: number; small?: boolean } = {}): number {
    if (!e.alive || e.intangible) return 0;
    const p = this.player;
    const s = p.stats;
    let dmg = amount * (o.burnTick ? s.burn : s.might) * (this.relics.size ? relicDamageMul(this, e) : 1);
    if (p.goldT > 0) dmg *= 1.5;
    let crit = false;
    if (!o.burnTick && !o.noCrit && this.rng.next() < s.crit) { dmg *= s.critMult; crit = true; }
    // frontal shield (wax knight)
    let blocked = false;
    if (e.def.shield && !o.burnTick) {
      const fx = o.fromX ?? p.x, fy = o.fromY ?? p.y;
      const hx = fx - e.x, hy = fy - e.y;
      const hd = Math.hypot(hx, hy) || 1;
      const tx = p.x - e.x, ty = p.y - e.y;
      const td = Math.hypot(tx, ty) || 1;
      if ((hx * tx + hy * ty) / (hd * td) > 0.35) { dmg *= 0.45; blocked = true; }
    }
    if (e.boss && e.boss.invuln) { dmg = 0; blocked = true; }
    e.hp -= dmg;
    if (!o.burnTick && !o.small) e.flash = 0.07;
    if (w) w.dmg += dmg;
    // knockback
    if (!o.noKnock && !e.boss) {
      let kx = o.kx, ky = o.ky;
      if (kx === undefined || ky === undefined) {
        const dx = e.x - (o.fromX ?? p.x), dy = e.y - (o.fromY ?? p.y);
        const d = Math.hypot(dx, dy) || 1;
        kx = dx / d; ky = dy / d;
      }
      const k = (o.knock ?? 1) * 90 * e.kbRes * (e.elite ? 0.3 : 1);
      e.vx += kx * k; e.vy += ky * k;
    }
    // burn
    const ign = s.ignite;
    if ((o.burn && o.burn > 0) || (ign > 0 && !o.burnTick && this.rng.next() < ign)) {
      const b = Math.max(o.burn || 0, amount * 0.35 + 2);
      if (e.burnT <= 0) e.burnTick = 0.5;
      e.burnT = 2.6;
      e.burnDps = Math.max(e.burnDps, b);
    }
    if (o.slow) { e.slowT = 1.2; e.slowF = Math.min(e.slowF < 1 && e.slowT > 0 ? e.slowF : 1, 1 - o.slow); }
    const quiet = (o.burnTick && dmg < 6) || (o.small && !crit && dmg < 12) || (!crit && this.numsActive > 32 && dmg < 40);
    if (this.settings.dmgNumbers && dmg >= 0.5 && !quiet) {
      const col = blocked ? 0x9a9a9a : o.burnTick ? 0xff9a3c : crit ? 0xffd23a : 0xffffff;
      this.dmgNumber(e.x + vrange(-8, 8), e.y - e.def.size * e.scale * 0.8, dmg, col, crit ? 1.25 : o.burnTick ? 0.7 : 0.85);
    }
    if (!o.burnTick) audio.sfx(blocked ? 'tick' : 'hit', 0.32, crit ? 1.25 : 1, 0.05);
    if (crit && this.relics.size) relicOnCrit(this, e, dmg);
    if (e.hp <= 0) this.killEnemy(e, w);
    return dmg;
  }

  killEnemy(e: Enemy, w: WeaponInst | null) {
    if (!e.alive) return;
    if (e.boss) {
      e.hp = 0;
      e.boss.dying = true;
      return; // boss module handles death
    }
    e.alive = false;
    e.sp.visible = false;
    e.sh.visible = false;
    if (!e.prop) {
      this.stats.kills++;
      if (w) w.kills++;
      if (this.relics.size) relicOnKill(this);
      if (e.elite) {
        // a beat of impact for big kills
        this.hitstop = 0.07;
        this.shake(9, 0.3);
        this.explosionFx(e.x, e.y - 30, 70, 0xffd23a, true);
        audio.sfx('explode', 0.6, 0.9);
      }
    }
    if (!e.prop && this.particles.length < 1200) {
      const tex = this.T.flash[e.def.tex];
      if (tex) {
        const base = (e.def.size * e.scale) / tex.height;
        const pt = this.particle(e.x, e.y - e.def.size * e.scale * 0.45, tex, { life: 0.14, s0: base, s1: base * 1.45, a0: 0.85, layer: 0 });
        if (pt) pt.sp.anchor.set(0.5);
      }
    }
    onEnemyDeath(this, e, w);
  }

  /** Remove enemy without rewards (despawn) */
  despawn(e: Enemy, poof = true) {
    if (!e.alive) return;
    if (poof) this.puff(e.x, e.y - 20, 0xcfc6b6, 0.8, 1);
    this.releaseEnemy(e);
  }

  /** AoE damage helper (player sourced) */
  blast(x: number, y: number, r: number, dmg: number, w: WeaponInst | null, color = 0xffa53a, big = false, burn = 0) {
    this.query(x, y, r + 30, (e) => {
      const dx = e.x - x, dy = e.y - y;
      if (dx * dx + dy * dy < (r + e.r) ** 2) this.damageEnemy(e, dmg, w, { fromX: x, fromY: y, knock: 1.6, burn });
    });
    this.explosionFx(x, y, r, color, big);
  }

  /* ------------------------------------------------------------------ player projectiles */

  spawnProj(o: Partial<Proj> & { tex: string }): Proj {
    let p: Proj | undefined;
    for (let i = 0; i < this.projs.length; i++) if (!this.projs[i].alive) { p = this.projs[i]; break; }
    if (!p) {
      p = {
        alive: true, kind: 0, w: null, x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, r: 8, dmg: 1, pierce: 1, life: 1, t: 0,
        hits: [], sp: null as any, glow: null, rot: 0, spin: 0, ox: 0, oy: 0, ang: 0, dist: 0, a: 0, b: 0, burn: 0, knock: 1,
        explode: 0, tex: 'ember', scale: 1, tint: 0xffffff, light: 0, hitEvery: 0, data: null,
      };
      this.projs.push(p);
    }
    Object.assign(p, {
      alive: true, kind: 0, w: null, vx: 0, vy: 0, r: 8, dmg: 1, pierce: 1, life: 1, t: 0, rot: 0, spin: 0, ox: 0, oy: 0,
      ang: 0, dist: 0, a: 0, b: 0, burn: 0, knock: 1, explode: 0, scale: 1, tint: 0xffffff, light: 0, hitEvery: 0, data: null,
    }, o);
    p.px = p.x; p.py = p.y;
    p.hits.length = 0;
    const tex = this.fx[p.tex] || this.icons[p.tex] || Texture.WHITE;
    p.sp = this.pool('proj', this.projLayer, tex);
    p.sp.anchor.set(0.5);
    p.sp.tint = p.tint;
    p.sp.scale.set(p.scale);
    if (p.light > 0) {
      p.glow = this.pool('pglow', this.addLayer, this.fx.glow);
      p.glow.anchor.set(0.5);
      p.glow.tint = o.data?.glowTint ?? 0xff8a2a;
      p.glow.alpha = 0.55;
      p.glow.scale.set(p.light / 64);
    } else p.glow = null;
    return p;
  }

  killProj(p: Proj) {
    p.alive = false;
    this.unpool('proj', p.sp);
    if (p.glow) { this.unpool('pglow', p.glow); p.glow = null; }
  }

  private updateProjs(dt: number) {
    for (let i = 0; i < this.projs.length; i++) {
      const p = this.projs[i];
      if (!p.alive) continue;
      p.px = p.x; p.py = p.y;
      p.t += dt;
      // behaviour (weapons module sets kind and may override motion)
      const def = p.w ? WEAPONS[p.w.id] : null;
      if (def && def.projUpdate) {
        if (def.projUpdate(this, p, dt) === false) { this.killProj(p); continue; }
      } else {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
      p.rot += p.spin * dt;
      if (p.t >= p.life) {
        if (def && def.projExpire) def.projExpire(this, p);
        this.killProj(p);
        continue;
      }
      if (p.dmg <= 0) continue;
      // collisions
      const pr = p.r;
      let dead = false;
      this.query(p.x, p.y, pr + 40, (e) => {
        if (e.intangible) return;
        const dx = e.x - p.x, dy = (e.y - e.def.size * e.scale * 0.35) - p.y;
        const rr = pr + e.r;
        if (dx * dx + dy * dy > rr * rr) return;
        if (p.hitEvery > 0) {
          const slot = p.w ? p.w.slot : 15;
          if (e.hitCd[slot] > this.time) return;
          e.hitCd[slot] = this.time + p.hitEvery;
        } else {
          if (p.hits.indexOf(e.id) >= 0) return;
          p.hits.push(e.id);
        }
        const sp = Math.hypot(p.vx, p.vy);
        const kx = sp > 1 ? p.vx / sp : undefined, ky = sp > 1 ? p.vy / sp : undefined;
        this.damageEnemy(e, p.dmg, p.w, { kx, ky, knock: p.knock, burn: p.burn, fromX: p.x, fromY: p.y });
        if (def && def.projHit) def.projHit(this, p, e);
        if (p.hitEvery <= 0) {
          p.pierce--;
          if (p.pierce <= 0) { dead = true; return true; }
        }
      });
      if (dead) {
        if (def && def.projExpire) def.projExpire(this, p);
        this.killProj(p);
      }
    }
  }

  /* ------------------------------------------------------------------ zones (areas) */

  spawnZone(o: Partial<Zone>): Zone {
    let z: Zone | undefined;
    for (let i = 0; i < this.zones.length; i++) if (!this.zones[i].alive) { z = this.zones[i]; break; }
    if (!z) {
      z = {
        alive: true, kind: 0, w: null, x: 0, y: 0, r: 30, dmg: 1, tick: 0.5, tickT: 0, life: 1, t: 0, maxLife: 1, slow: 0, pull: 0,
        burn: 0, knock: 0, follow: false, hostile: false, sp: null, sp2: null, hitSet: null, r0: 0, r1: 0, data: null,
      };
      this.zones.push(z);
    }
    Object.assign(z, {
      alive: true, kind: 0, w: null, r: 30, dmg: 1, tick: 0.5, tickT: 0, life: 1, t: 0, slow: 0, pull: 0, burn: 0, knock: 0,
      follow: false, hostile: false, sp: null, sp2: null, hitSet: null, r0: 0, r1: 0, data: null,
    }, o);
    z.maxLife = z.life;
    return z;
  }

  killZone(z: Zone) {
    z.alive = false;
    if (z.sp) { this.unpool(z.data?.pool || 'zone', z.sp); z.sp = null; }
    if (z.sp2) { this.unpool(z.data?.pool2 || 'zone2', z.sp2); z.sp2 = null; }
  }

  private updateZones(dt: number) {
    for (let i = 0; i < this.zones.length; i++) {
      const z = this.zones[i];
      if (!z.alive) continue;
      z.t += dt;
      if (z.follow) { z.x = this.player.x; z.y = this.player.y; }
      const def = z.w ? WEAPONS[z.w.id] : null;
      if (z.hostile) {
        if (z.data?.update) z.data.update(this, z, dt);
      } else if (def && def.zoneUpdate) {
        def.zoneUpdate(this, z, dt);
      } else {
        z.tickT -= dt;
        if (z.tickT <= 0) {
          z.tickT = z.tick;
          const slot = z.w ? z.w.slot : 15;
          this.query(z.x, z.y, z.r + 30, (e) => {
            const dx = e.x - z.x, dy = e.y - z.y;
            if (dx * dx + dy * dy >= (z.r + e.r * 0.6) ** 2) return;
            // overlapping zones from the same weapon don't stack damage
            if (e.hitCd[slot] > this.time) return;
            e.hitCd[slot] = this.time + z.tick * 0.9;
            this.damageEnemy(e, z.dmg, z.w, { knock: z.knock, burn: z.burn, slow: z.slow, fromX: z.x, fromY: z.y, noKnock: z.knock <= 0, small: true });
          });
        }
      }
      if (z.t >= z.life) this.killZone(z);
    }
  }

  /* ------------------------------------------------------------------ enemy bullets */

  spawnBullet(x: number, y: number, vx: number, vy: number, o: Partial<Bullet> = {}): Bullet | null {
    if (this.bullets.length > 900) return null;
    let b: Bullet | undefined;
    for (let i = 0; i < this.bullets.length; i++) if (!this.bullets[i].alive) { b = this.bullets[i]; break; }
    if (!b) {
      b = { alive: true, x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, r: 7, dmg: 8, life: 4, t: 0, acc: 0, turn: 0, homing: 0, sp: null as any, core: null as any, tint: 0xffffff, slow: 0, grow: 0, src: 'bullet' };
      this.bullets.push(b);
    }
    Object.assign(b, { alive: true, x, y, px: x, py: y, vx, vy, r: 7, dmg: 8, life: 4, t: 0, acc: 0, turn: 0, homing: 0, tint: 0xb9e3ff, slow: 0, grow: 0, src: this.boss && this.boss.alive && this.boss.boss?.attack ? this.boss.boss.id + ':' + this.boss.boss.attack : 'bullet' }, o);
    b.sp = this.pool('bullet', this.bulletLayer, this.fx.bullet);
    b.sp.anchor.set(0.5);
    b.sp.tint = b.tint;
    b.core = this.pool('bcore', this.bulletLayer, this.fx.bulletCore);
    b.core.anchor.set(0.5);
    return b;
  }

  killBullet(b: Bullet) {
    b.alive = false;
    this.unpool('bullet', b.sp);
    this.unpool('bcore', b.core);
  }

  clearBullets(poof = true) {
    for (const b of this.bullets) {
      if (!b.alive) continue;
      if (poof) this.spark(b.x, b.y, b.tint, 2, 60);
      this.killBullet(b);
    }
  }

  private updateBullets(dt: number) {
    const p = this.player;
    for (let i = 0; i < this.bullets.length; i++) {
      const b = this.bullets[i];
      if (!b.alive) continue;
      b.px = b.x; b.py = b.y;
      b.t += dt;
      if (this.freezeT > 0) { if (b.t >= b.life) this.killBullet(b); continue; }
      if (b.acc) { const s = Math.hypot(b.vx, b.vy) || 1; const ns = Math.max(10, s + b.acc * dt); b.vx *= ns / s; b.vy *= ns / s; }
      if (b.turn) { const c = Math.cos(b.turn * dt), s = Math.sin(b.turn * dt); const vx = b.vx * c - b.vy * s; b.vy = b.vx * s + b.vy * c; b.vx = vx; }
      if (b.homing) {
        const dx = p.x - b.x, dy = p.y - 30 - b.y; const d = Math.hypot(dx, dy) || 1;
        const sp = Math.hypot(b.vx, b.vy);
        b.vx += (dx / d) * b.homing * dt * sp; b.vy += (dy / d) * b.homing * dt * sp;
        const ns = Math.hypot(b.vx, b.vy) || 1; b.vx *= sp / ns; b.vy *= sp / ns;
      }
      if (b.grow) b.r += b.grow * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.t >= b.life) { this.killBullet(b); continue; }
      // hit player (player hitbox centered at torso)
      const dx = b.x - p.x, dy = b.y - (p.y - 26);
      const rr = b.r + p.r * 0.75;
      if (dx * dx + dy * dy < rr * rr) {
        if (p.iframes <= 0 && !p.invincible && p.goldT <= 0) {
          this.hurtPlayer(b.dmg, null, { by: b.src });
          if (b.slow) { /* slow handled through iframes/hurt */ }
          this.spark(b.x, b.y, b.tint, 6, 120);
          this.killBullet(b);
        }
      }
    }
  }

  /* ------------------------------------------------------------------ telegraphs */

  tele(o: Partial<Tele> & { kind: Tele['kind']; dur: number }): Tele {
    const t: Tele = { alive: true, x: 0, y: 0, r: 40, ang: 0, len: 300, w: 30, t: 0, color: 0xe8501c, follow: false, onDone: null, ...o };
    this.teles.push(t);
    return t;
  }

  private updateTeles(dt: number) {
    for (const t of this.teles) {
      if (!t.alive) continue;
      t.t += dt;
      if (t.follow) { t.x = this.player.x; t.y = this.player.y; }
      if (t.t >= t.dur) {
        t.alive = false;
        t.onDone?.();
      }
    }
    if (this.frameCount % 60 === 0) this.teles = this.teles.filter((t) => t.alive);
  }

  /* ------------------------------------------------------------------ pickups */

  dropPickup(kind: string, x: number, y: number, value = 1): Pickup | null {
    // merge xp when too many
    if (kind === 'xp') {
      let count = 0;
      for (const q of this.pickups) if (q.alive && q.kind === 'xp') count++;
      if (count > 260) {
        let best: Pickup | null = null; let bd = 1e12;
        for (const q of this.pickups) {
          if (!q.alive || q.kind !== 'xp' || q.magnet) continue;
          const d = (q.x - x) ** 2 + (q.y - y) ** 2;
          if (d < bd) { bd = d; best = q; }
        }
        if (best) { best.value += value; this.styleGem(best); return best; }
      }
    }
    let pk: Pickup | undefined;
    for (let i = 0; i < this.pickups.length; i++) if (!this.pickups[i].alive) { pk = this.pickups[i]; break; }
    if (!pk) {
      pk = { alive: true, kind, x, y, px: x, py: y, vx: 0, vy: 0, value, sp: null as any, magnet: false, t: 0 };
      this.pickups.push(pk);
    }
    Object.assign(pk, { alive: true, kind, x, y, px: x, py: y, vx: 0, vy: 0, value, magnet: false, t: 0 });
    let tex: Texture;
    if (kind === 'xp') tex = this.fx.gem;
    else tex = this.icons[PICKUP_ICON[kind]] || this.fx.circle;
    pk.sp = this.pool('pickup', this.pickupLayer, tex);
    pk.sp.anchor.set(0.5, 0.7);
    if (kind === 'xp') this.styleGem(pk);
    else {
      const size = kind === 'chest' ? 54 : kind === 'coin' ? 20 : 32;
      pk.sp.scale.set(size / Math.max(tex.width, tex.height));
    }
    if (kind !== 'xp' && kind !== 'coin') { pk.vx = this.rr(-60, 60); pk.vy = this.rr(-60, 60); }
    return pk;
  }

  private styleGem(pk: Pickup) {
    const v = pk.value;
    const col = v >= 60 ? 0x7ff3ff : v >= 20 ? 0xc77dff : v >= 5 ? 0xff4a3a : 0xffa53a;
    const sz = v >= 60 ? 26 : v >= 20 ? 22 : v >= 5 ? 18 : 14;
    pk.sp.tint = col;
    pk.sp.scale.set(sz / 48);
  }

  killPickup(pk: Pickup) {
    pk.alive = false;
    this.unpool('pickup', pk.sp);
  }

  magnetAll() {
    for (const pk of this.pickups) if (pk.alive && (pk.kind === 'xp' || pk.kind === 'coin')) pk.magnet = true;
  }

  private updatePickups(dt: number) {
    const p = this.player;
    const mr = p.stats.magnet;
    for (let i = 0; i < this.pickups.length; i++) {
      const pk = this.pickups[i];
      if (!pk.alive) continue;
      pk.px = pk.x; pk.py = pk.y;
      pk.t += dt;
      const dx = p.x - pk.x, dy = (p.y - 20) - pk.y;
      const d2 = dx * dx + dy * dy;
      if (!pk.magnet && pk.kind !== 'chest' && d2 < mr * mr) pk.magnet = true;
      if (pk.magnet) {
        const d = Math.sqrt(d2) || 1;
        const sp = 260 + pk.t * 120 + (p.stats.speed * 1.2);
        pk.vx += ((dx / d) * sp - pk.vx) * Math.min(1, dt * 10);
        pk.vy += ((dy / d) * sp - pk.vy) * Math.min(1, dt * 10);
      } else {
        pk.vx *= 0.9; pk.vy *= 0.9;
      }
      pk.x += pk.vx * dt;
      pk.y += pk.vy * dt;
      const cr = pk.kind === 'chest' ? 34 : 22;
      if (d2 < cr * cr) this.collect(pk);
    }
    if (this.frameCount % 120 === 0) this.pickups = this.pickups.filter((q) => q.alive);
  }

  private collect(pk: Pickup) {
    const p = this.player;
    this.killPickup(pk);
    switch (pk.kind) {
      case 'xp':
        this.gainXp(pk.value);
        audio.sfx('xp', 0.25, 1 + Math.min(0.5, (this.frameCount % 20) * 0.02), 0.03);
        break;
      case 'coin': {
        const v = Math.max(1, Math.round(pk.value * p.stats.greed * (this.inferno ? 1.5 : 1)));
        this.coinsRun += v;
        this.stats.coins += v;
        audio.sfx('coin', 0.35);
        break;
      }
      case 'heal':
        this.heal(30 + p.stats.maxHp * 0.1);
        audio.sfx('heal', 0.7);
        this.sparkleAt(p.x, p.y - 30, 0x7ddc6a);
        break;
      case 'magnet':
        this.magnetAll();
        audio.sfx('levelup', 0.4, 1.4);
        this.hooks.toast('Static charge! All embers attracted', 'info');
        break;
      case 'bomb': {
        audio.sfx('explode', 1);
        this.shake(14, 0.5);
        if (this.settings.flashes) { this.flashT = 0.25; this.flashColor = 0xfff1c4; }
        for (const e of this.enemies) {
          if (!e.alive || e.boss || e.prop) continue;
          const dx = e.x - p.x, dy = e.y - p.y;
          if (Math.abs(dx) < this.viewW * 0.6 && Math.abs(dy) < this.viewH * 0.6) this.damageEnemy(e, 400, null, { noCrit: true });
        }
        this.hooks.toast('KA-BOOM! Firecracker cleared the screen', 'info');
        break;
      }
      case 'freeze':
        this.freezeT = 6;
        audio.sfx('levelup', 0.5, 0.6);
        this.hooks.toast('Pocket watch! Enemies frozen in time', 'info');
        break;
      case 'goldmatch':
        p.goldT = 8;
        p.ignite = 8;
        audio.sfx('strike', 0.9);
        this.hooks.toast('GOLDEN MATCH! Novaki is ablaze', 'gold');
        break;
      case 'chest':
        this.openChest();
        break;
    }
  }

  gainXp(v: number) {
    const p = this.player;
    p.xp += v * p.stats.growth;
    while (p.xp >= p.xpNext) {
      p.xp -= p.xpNext;
      p.level++;
      p.xpNext = xpFor(p.level);
      this.pendingLevels++;
      this.stats.maxLevel = Math.max(this.stats.maxLevel, p.level);
    }
  }

  openChest(bossChest = false) {
    this.stats.chests++;
    // contents from upgrades module via hook
    this.hooks.chest(bossChest ? [{ id: 'boss', evo: false, name: '' }] : []);
  }

  /* ------------------------------------------------------------------ FX helpers */

  shake(amp: number, t: number) {
    if (!this.settings.shake) return;
    this.shakeAmp = Math.max(this.shakeAmp * (this.shakeT > 0 ? 1 : 0), amp);
    this.shakeT = Math.max(this.shakeT, t);
  }

  particle(x: number, y: number, tex: Texture, o: Partial<Particle> & { add?: boolean; tint?: number } = {}): Particle | null {
    if (this.particles.length > 1400) {
      // recycle
      const old = this.particles.find((q) => !q.alive);
      if (!old) return null;
    }
    let pt: Particle | undefined;
    for (let i = 0; i < this.particles.length; i++) if (!this.particles[i].alive) { pt = this.particles[i]; break; }
    const layer = o.add ? 1 : (o.layer ?? 0);
    if (!pt) {
      pt = { alive: true, x, y, vx: 0, vy: 0, life: 1, max: 1, sp: null as any, s0: 1, s1: 0, a0: 1, rot: 0, vrot: 0, drag: 0, grav: 0, z: 0, vz: 0, layer, aspect: 1, sy: 1 };
      this.particles.push(pt);
    }
    Object.assign(pt, { alive: true, x, y, vx: 0, vy: 0, life: 1, s0: 1, s1: 0, a0: 1, rot: 0, vrot: 0, drag: 0, grav: 0, z: 0, vz: 0, aspect: 1, sy: 1 }, o);
    pt.layer = layer;
    pt.max = pt.life;
    const L = layer === 1 ? this.addLayer : layer === 2 ? this.topLayer : this.projLayer;
    pt.sp = this.pool('part' + layer, L, tex);
    pt.sp.anchor.set(0.5);
    pt.sp.tint = o.tint ?? 0xffffff;
    return pt;
  }

  puff(x: number, y: number, tint = 0xd8d0c0, size = 0.6, life = 0.8) {
    this.particle(x, y, this.fx.puff, { vx: vrange(-30, 30), vy: vrange(-50, -10), life: life * vrange(0.7, 1.2), s0: size * 0.5, s1: size, a0: 0.75, tint, drag: 2, vrot: vrange(-1, 1) });
  }

  spark(x: number, y: number, tint: number, n: number, speed: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * vrange(0.4, 1);
      this.particle(x, y, this.fx.spark, { add: true, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: vrange(0.2, 0.45), s0: vrange(0.4, 0.7), s1: 0.05, tint, drag: 4, vrot: vrange(-8, 8) });
    }
  }

  sparkleAt(x: number, y: number, tint: number) {
    for (let i = 0; i < 10; i++) {
      this.particle(x + vrange(-20, 20), y + vrange(-20, 20), this.fx.star, { add: true, vx: vrange(-20, 20), vy: vrange(-90, -30), life: vrange(0.5, 0.9), s0: 0.6, s1: 0.1, tint, vrot: vrange(-4, 4) });
    }
  }

  explosionFx(x: number, y: number, r: number, color = 0xffa53a, big = false) {
    this.particle(x, y, this.fx.glow, { add: true, life: 0.3, s0: (r / 64) * 1.0, s1: (r / 64) * 1.8, a0: 0.45, tint: color });
    // inked cartoon "boom" cloud
    const b = this.particle(x, y, this.fx.boom, { life: 0.28, s0: (r / 64) * 0.45, s1: (r / 64) * 1.05, a0: 1, vrot: 1.5, layer: 2 });
    if (b) { b.rot = Math.random() * 6.28; if (color !== 0xffa53a && color !== 0xff7a2a && color !== 0xffb040) b.sp.tint = color; }
    this.particle(x, y, this.fx.smokering, { life: 0.3, s0: (r / 128) * 0.5, s1: (r / 128) * 1.25, a0: 0.55, layer: 0 });
    const n = big ? 14 : 7;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = r * vrange(1.5, 3.5);
      this.particle(x, y, this.fx.flame, { add: false, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: vrange(0.25, 0.5), s0: vrange(0.25, 0.4) * (r / 50), s1: 0.02, drag: 5, rot: a + Math.PI / 2 });
    }
    for (let i = 0; i < (big ? 6 : 3); i++) this.puff(x + vrange(-r / 2, r / 2), y + vrange(-r / 2, r / 2), 0x8a8072, 0.5 + r / 120, 0.9);
    this.addLight(x, y, r * 3, 0.35, color);
  }

  /** transient light (decays) */
  lights: { x: number; y: number; r: number; life: number; max: number; tint: number }[] = [];
  addLight(x: number, y: number, r: number, life: number, tint = 0xffc070) {
    if (this.lights.length > 80) return;
    this.lights.push({ x, y, r, life, max: life, tint });
  }

  numsActive = 0;
  dmgNumber(x: number, y: number, v: number, tint: number, scale = 1) {
    let n: DmgNum | undefined;
    for (let i = 0; i < this.nums.length; i++) if (!this.nums[i].alive) { n = this.nums[i]; break; }
    if (n || this.nums.length < 90) this.numsActive++;
    if (!n) {
      if (this.nums.length >= 90) {
        // recycle oldest (lowest life)
        n = this.nums.reduce((a, b) => (a.life < b.life ? a : b));
      } else {
        const c = new Container();
        for (let i = 0; i < 5; i++) { const s = new Sprite(this.digits.digits[0]); s.anchor.set(0.5); c.addChild(s); }
        this.numLayer.addChild(c);
        n = { alive: true, c, x, y, vy: 0, life: 0, scale };
        this.nums.push(n);
      }
    }
    const str = String(Math.max(1, Math.round(v)));
    const c = n.c;
    let total = 0;
    const ws: number[] = [];
    for (let i = 0; i < 5; i++) {
      const s = c.children[i] as Sprite;
      if (i < str.length) {
        const d = str.charCodeAt(i) - 48;
        s.texture = this.digits.digits[d];
        s.visible = true;
        s.tint = tint;
        ws.push(this.digits.w[d] * 0.8);
        total += this.digits.w[d] * 0.8;
      } else s.visible = false;
    }
    let xx = -total / 2;
    for (let i = 0; i < str.length; i++) {
      const s = c.children[i] as Sprite;
      s.x = xx + ws[i] / 2;
      s.y = 0;
      xx += ws[i];
    }
    n.alive = true;
    n.x = x; n.y = y;
    n.vy = -70;
    n.life = 0.6;
    n.scale = scale * 0.4;
    c.visible = true;
    c.alpha = 1;
  }

  bolt(points: number[], color: number, width = 3) {
    let b: Bolt | undefined;
    for (const q of this.bolts) if (!q.alive) { b = q; break; }
    if (!b) {
      const g = new Graphics();
      g.blendMode = 'add';
      this.topLayer.addChild(g);
      b = { alive: true, g, life: 0, max: 0 };
      this.bolts.push(b);
    }
    const g = b.g;
    g.clear();
    g.moveTo(points[0], points[1]);
    for (let i = 2; i < points.length; i += 2) g.lineTo(points[i], points[i + 1]);
    g.stroke({ width: width * 2.5, color, alpha: 0.35, cap: 'round', join: 'round' });
    g.moveTo(points[0], points[1]);
    for (let i = 2; i < points.length; i += 2) g.lineTo(points[i], points[i + 1]);
    g.stroke({ width, color: 0xffffff, alpha: 1, cap: 'round', join: 'round' });
    g.visible = true;
    g.alpha = 1;
    b.alive = true;
    b.life = b.max = 0.16;
  }

  /* ------------------------------------------------------------------ rain & decor */

  private buildRain(n: number) {
    for (const r of this.rain) r.sp.destroy();
    this.rain = [];
    for (let i = 0; i < n; i++) {
      const sp = new Sprite(this.fx.streak);
      sp.anchor.set(0.5, 1);
      sp.alpha = 0.35;
      sp.tint = 0xbcd4ea;
      sp.rotation = 0.25;
      this.rainLayer.addChild(sp);
      this.rain.push({ sp, x: Math.random() * this.screenW, y: Math.random() * this.screenH, v: vrange(900, 1300) });
    }
  }

  private clearDecor() {
    for (const arr of this.decor.values()) for (const s of arr) this.recycleDecor(s);
    this.decor.clear();
    this.litProps.clear();
  }

  private recycleDecor(s: Sprite) {
    s.visible = false;
    const d = s as any;
    if (d.flames) { for (const f of d.flames) { f.visible = false; this.flamePool.push(f); } d.flames = null; }
    d.lamp = null; d.glow = 0; d.lit = false;
    this.decorPool.push(s);
  }

  private igniteDecor(s: Sprite, silent = false) {
    const d = s as any;
    if (d.lit || !d.lamp) return;
    d.lit = true;
    d.flames = [];
    const h = Math.abs(s.height), w = Math.abs(s.width);
    for (const [fx, fy] of d.lamp as [number, number][]) {
      const f = this.flamePool.pop() || new Sprite(this.fx.flame);
      if (!f.parent) this.actorLayer.addChild(f);
      f.texture = this.fx.flame;
      f.anchor.set(0.5, 0.9);
      f.visible = true;
      f.x = s.x + fx * w * Math.sign(s.scale.x || 1);
      f.y = s.y - fy * h;
      f.zIndex = s.y + 1;
      (f as any).base = 0.16 + h / 1000;
      d.flames.push(f);
      if (!silent) { this.spark(f.x, f.y, 0xffc040, 5, 90); this.puff(f.x, f.y - 6, 0xd8d0c0, 0.3, 0.6); }
    }
    if (!silent) {
      this.litProps.add(d.key);
      this.lightsRelit++;
      audio.sfx('strike', 0.25, 1.4, 0.2);
    }
  }

  private updateDecor() {
    const st = this.stageDef;
    if (!st) return;
    const C = 520;
    const cx0 = Math.floor((this.camX - this.viewW / 2 - 200) / C), cx1 = Math.floor((this.camX + this.viewW / 2 + 200) / C);
    const cy0 = Math.floor((this.camY - this.viewH / 2 - 200) / C), cy1 = Math.floor((this.camY + this.viewH / 2 + 300) / C);
    const keep = new Set<string>();
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const key = cx + ',' + cy;
        keep.add(key);
        if (this.decor.has(key)) continue;
        const arr: Sprite[] = [];
        let h = hash3(cx, cy, this.stage * 7919);
        const n = 2 + (h % 3);
        for (let i = 0; i < n; i++) {
          h = hash3(h, i, 17);
          const px = cx * C + (h % 1000) / 1000 * C;
          h = hash3(h, i, 31);
          const py = cy * C + (h % 1000) / 1000 * C;
          if (Math.abs(px) < 120 && Math.abs(py) < 120) continue; // keep spawn clear
          h = hash3(h, i, 53);
          const pr = st.props[h % st.props.length];
          const tex = this.T.tex[pr.tex];
          if (!tex) continue;
          const s = this.decorPool.pop() || new Sprite(tex);
          s.texture = tex;
          s.anchor.set(0.5, pr.flat ? 0.5 : 0.95);
          const hh = pr.size * (0.85 + ((h >> 8) % 30) / 100);
          if (pr.flat) s.scale.set(hh / tex.width, (hh / tex.width) * 0.62);
          else s.scale.set(hh / tex.height);
          if ((h >> 4) & 1) s.scale.x *= -1;
          s.rotation = 0;
          s.x = px; s.y = py;
          s.zIndex = py;
          s.visible = true;
          s.alpha = 1;
          s.tint = st.propTint ?? 0xffffff;
          (s as any).flat = !!pr.flat;
          const dk = Math.round(px) + ':' + Math.round(py);
          (s as any).key = dk;
          (s as any).lamp = pr.lamp || null;
          (s as any).glow = pr.glow || 0;
          (s as any).lit = false;
          if (pr.flat) { s.zIndex = -100000; this.decalLayer.addChild(s); }
          else this.actorLayer.addChild(s);
          if (pr.lamp && this.litProps.has(dk)) this.igniteDecor(s, true);
          arr.push(s);
        }
        this.decor.set(key, arr);
      }
    }
    for (const [k, arr] of this.decor) {
      if (keep.has(k)) continue;
      for (const s of arr) this.recycleDecor(s);
      this.decor.delete(k);
    }
    // relight snuffed lamps that Novaki walks past; glowing props light the dark
    const p = this.player;
    const t = this.time;
    for (const arr of this.decor.values()) {
      for (const s of arr) {
        const d = s as any;
        if (d.lamp && !d.lit && (s.x - p.x) ** 2 + (s.y - 30 - p.y) ** 2 < 115 * 115) this.igniteDecor(s);
        if (d.lit && d.flames) {
          for (const f of d.flames) {
            const k = 0.85 + 0.2 * Math.sin(t * 17 + f.x * 0.1) + 0.08 * Math.sin(t * 31 + f.y);
            f.scale.set(f.base * k, f.base * 1.15 * k);
            if (this.darkness > 0.05) this.pushLight(f.x, f.y - 10, 150, 0xffc070, 0.75);
          }
        } else if (d.glow && this.darkness > 0.05) {
          this.pushLight(s.x, s.y - Math.abs(s.height) * 0.4, 120, d.glow, 0.45 + 0.1 * Math.sin(t * 2 + s.x));
        }
      }
    }
  }

  /* ------------------------------------------------------------------ render */

  render(alpha: number, frameDt: number) {
    const p = this.player;
    if (!p) return;
    const ix = (a: number, b: number) => a + (b - a) * alpha;
    const pxi = ix(p.px, p.x), pyi = ix(p.py, p.y);
    // camera
    const k = 1 - Math.exp(-frameDt * 9);
    this.camX += (pxi - this.camX) * k;
    this.camY += (pyi - 20 - this.camY) * k;
    let sx = 0, sy = 0;
    if (this.shakeT > 0) {
      this.shakeT -= frameDt;
      const a = this.shakeAmp * Math.min(1, this.shakeT * 4);
      sx = (Math.random() * 2 - 1) * a;
      sy = (Math.random() * 2 - 1) * a;
    }
    const z = this.zoom;
    const W = this.screenW, H = this.screenH;
    const tx = W / 2 - (this.camX + sx) * z;
    const ty = H / 2 - (this.camY + sy) * z;
    for (const w of [this.worldA, this.worldB]) {
      w.scale.set(z);
      w.position.set(tx, ty);
    }
    this.ground.tileScale.set(z);
    this.ground.tilePosition.set(tx, ty);

    this.updateDecor();

    // player rig
    this.rig.update(this, pxi, pyi, frameDt);
    const wardOn = this.relics.has('ward') && this.wardT <= 0 && !this.over;
    if (wardOn && !this.wardSprite) {
      this.wardSprite = new Sprite(this.fx.smokering);
      this.wardSprite.anchor.set(0.5);
      this.topLayer.addChild(this.wardSprite);
    }
    if (this.wardSprite) {
      this.wardSprite.visible = wardOn;
      if (wardOn) {
        this.wardSprite.x = pxi; this.wardSprite.y = pyi - 34;
        this.wardSprite.scale.set(0.42, 0.36);
        this.wardSprite.rotation = this.time * 0.6;
        this.wardSprite.alpha = 0.45 + 0.1 * Math.sin(this.time * 4);
        this.wardSprite.tint = 0xcfc6b6;
      }
    }

    // enemies
    const t = this.time;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const ex = ix(e.px, e.x), ey = ix(e.py, e.y);
      const def = e.def;
      const sp = e.sp;
      let texName = def.tex;
      if (e.boss) {
        const B = e.boss;
        if (B.dying && def.koTex && this.T.tex[def.koTex]) texName = def.koTex;
        else if (B.attack && def.posed && def.posed.includes(B.attack) && def.atkTex && this.T.tex[def.atkTex]) texName = def.atkTex;
      }
      // two-frame animation for enemies that have a second generated frame
      let frameK = 1;
      const kB = FRAME_B[texName];
      const frozenNow = this.freezeT > 0 && !e.boss;
      if (kB && !e.boss) {
        const ph0 = frozenNow ? e.phase : t * (def.animSpeed ?? 8) + e.phase;
        let useB: boolean;
        if (def.ai === 'hop') useB = e.hop > 6;
        else if (def.anim === 'fly') useB = Math.floor(ph0 * 1.6 / Math.PI) % 2 === 1;
        else if (def.anim === 'stomp') useB = Math.floor(ph0 * 0.5 / Math.PI) % 2 === 1;
        else useB = Math.floor(ph0 / Math.PI) % 2 === 1;
        if (useB && this.T.tex[texName + '_b']) {
          // keep B at A's world-units-per-pixel, corrected so both frames have the same visual mass
          const baseH = this.T.tex[texName].height;
          texName = texName + '_b';
          frameK = kB * (this.T.tex[texName].height / baseH);
        }
      }
      const tex = e.flash > 0 && !e.boss ? this.T.flash[texName] : this.T.tex[texName];
      if (tex && sp.texture !== tex) sp.texture = tex;
      const base = ((def.size * e.scale) / (this.T.tex[texName]?.height || 100)) * frameK;
      let bob = 0, sqx = 1, sqy = 1, rot = 0;
      const ph = frozenNow ? e.phase : t * (def.animSpeed ?? 8) + e.phase;
      switch (def.anim) {
        case 'fly': bob = -10 - Math.sin(ph) * 6; rot = Math.sin(ph * 0.5) * 0.12; sqx = 0.82 + 0.18 * Math.abs(Math.sin(ph * 1.6)); sqy = 1 + Math.sin(ph * 2) * 0.04; break;
        case 'float': bob = -14 - Math.sin(ph * 0.5) * 6; rot = Math.sin(ph * 0.3) * 0.06; break;
        case 'hop': bob = -e.hop; sqy = 1 + Math.min(0.15, e.hop * 0.01) - (e.hop === 0 ? 0.06 : 0); sqx = 2 - sqy; break;
        case 'wobble': sqy = 1 + Math.sin(ph) * 0.07; sqx = 1 - Math.sin(ph) * 0.07; break;
        case 'stomp': bob = -Math.abs(Math.sin(ph * 0.5)) * 4; rot = Math.sin(ph * 0.5) * 0.06; break;
        default: bob = -Math.abs(Math.sin(ph)) * 5; rot = Math.sin(ph) * 0.08; sqy = 1 + Math.abs(Math.cos(ph)) * 0.05; break;
      }
      if (def.anim !== 'hop') bob -= e.hop;
      if (e.boss) {
        const id = e.boss.id;
        if (id === 'duchess') { sqx *= 0.88 + 0.12 * Math.abs(Math.sin(t * 7)); if (this.frameCount % 5 === 0) this.particle(ex + vrange(-80, 80), ey - vrange(40, 150), this.fx.puff, { vy: 30, vx: vrange(-20, 20), life: 1, s0: 0.15, s1: 0.3, a0: 0.5, tint: 0xe8d8b0 }); }
        else if (id === 'baron') { if (this.frameCount % 2 === 0) this.particle(ex + vrange(-60, 60), ey - 30 + vrange(-10, 10), this.fx.streak, { vy: 420, life: 0.35, s0: 0.5, s1: 0.5, a0: 0.6, tint: 0x9fd0ff, layer: 0 }); if (Math.random() < 0.01) { this.bolt([ex + vrange(-40, 40), ey - 140, ex + vrange(-30, 30), ey - 80, ex + vrange(-40, 40), ey - 20], 0xfff3a0, 2); } }
        else if (id === 'snuffer') { if (this.frameCount % 3 === 0) this.particle(ex + vrange(-50, 50), ey - vrange(0, 120), this.fx.puff, { vy: -40, vx: vrange(-15, 15), life: 1.2, s0: 0.25, s1: 0.6, a0: 0.55, tint: 0x2a2430 }); }
      }
      if (e.state === 9) { // generic windup shake
        rot += Math.sin(t * 60) * 0.12;
      }
      let spawnS = 1;
      if (e.spawnT > 0) spawnS = 1 - e.spawnT / 0.35;
      const face = def.faceRight ? (e.face >= 0 ? 1 : -1) : (def.noFlip ? 1 : (e.face >= 0 ? -1 : 1) * (def.flipInvert ? -1 : 1));
      sp.x = ex;
      sp.y = ey + bob;
      sp.scale.set(base * sqx * face * spawnS, base * sqy * spawnS);
      sp.rotation = rot + (e.boss?.rot || 0);
      sp.alpha = e.alpha;
      if (e.boss) sp.tint = e.flash > 0 ? 0xff8f7a : 0xffffff;
      else if (!e.elite) sp.tint = e.burnT > 0 ? 0xffb38a : e.freezeT > 0 || this.freezeT > 0 ? 0x9fd8ff : e.slowT > 0 ? 0xdfe6f6 : 0xffffff;
      sp.zIndex = ey;
      e.sh.x = ex;
      e.sh.y = ey;
      e.sh.alpha = e.alpha * (def.anim === 'fly' || def.anim === 'float' ? 0.6 : 1);
      if (e.elite && this.frameCount % 3 === 0) {
        this.particle(ex + vrange(-e.r, e.r), ey - def.size * e.scale * vrange(0.1, 0.9), this.fx.star, { add: true, vy: -30, life: 0.5, s0: 0.35, s1: 0, tint: 0xffd23a });
      }
      // burn flicker particles
      if (e.burnT > 0 && Math.random() < 0.08) {
        this.particle(ex + vrange(-e.r, e.r), ey - def.size * e.scale * vrange(0.2, 0.7), this.fx.flame, { vy: -60, life: 0.35, s0: 0.18, s1: 0.02, drag: 1 });
      }
    }

    // projectiles
    for (const pr of this.projs) {
      if (!pr.alive) continue;
      const x = ix(pr.px, pr.x), y = ix(pr.py, pr.y);
      pr.sp.x = x; pr.sp.y = y;
      pr.sp.rotation = pr.rot;
      if (pr.glow) { pr.glow.x = x; pr.glow.y = y; }
      if (pr.light > 0 && this.darkness > 0.05) this.pushLight(x, y, pr.light * 1.6, 0xffb060, 0.8);
    }
    // zones visuals handled by weapons; update sprite positions for follow zones
    for (const zn of this.zones) {
      if (!zn.alive) continue;
      const def = zn.w ? WEAPONS[zn.w.id] : null;
      if (def?.zoneRender) def.zoneRender(this, zn, frameDt);
      else if (zn.data?.render) zn.data.render(this, zn, frameDt);
      if (zn.data?.light && this.darkness > 0.05) this.pushLight(zn.x, zn.y, zn.r * 2.2, zn.data.light, 0.7);
    }
    // bullets
    for (const b of this.bullets) {
      if (!b.alive) continue;
      const x = ix(b.px, b.x), y = ix(b.py, b.y);
      const s = (b.r * 2.4) / 48;
      b.sp.x = x; b.sp.y = y; b.sp.scale.set(s);
      b.core.x = x; b.core.y = y; b.core.scale.set(s);
      if (this.darkness > 0.3 && this.frameCount % 2 === 0) this.pushLight(x, y, 40, b.tint, 0.5);
    }
    // pickups
    for (const pk of this.pickups) {
      if (!pk.alive) continue;
      const x = ix(pk.px, pk.x), y = ix(pk.py, pk.y);
      pk.sp.x = x;
      pk.sp.y = y - 6 - Math.sin(t * 4 + x * 0.05) * 3;
      if (pk.kind === 'chest') {
        pk.sp.rotation = Math.sin(t * 3) * 0.08;
        if (this.frameCount % 6 === 0) this.particle(x + vrange(-20, 20), y - vrange(10, 40), this.fx.star, { add: true, vy: -40, life: 0.7, s0: 0.5, s1: 0, tint: 0xffd23a });
      }
      if (this.darkness > 0.25 && pk.kind === 'xp' && this.frameCount % 3 === 0) this.pushLight(x, y, 26, 0xff9040, 0.35);
    }
    // particles
    for (const pt of this.particles) {
      if (!pt.alive) continue;
      pt.life -= frameDt;
      if (pt.life <= 0) { pt.alive = false; this.unpool('part' + pt.layer, pt.sp); continue; }
      const f = 1 - pt.life / pt.max;
      if (pt.drag) { const d = Math.exp(-pt.drag * frameDt); pt.vx *= d; pt.vy *= d; }
      pt.vy += pt.grav * frameDt;
      pt.x += pt.vx * frameDt;
      pt.y += pt.vy * frameDt;
      if (pt.vz || pt.z) { pt.vz -= 600 * frameDt; pt.z = Math.max(0, pt.z + pt.vz * frameDt); }
      pt.rot += pt.vrot * frameDt;
      const s = pt.s0 + (pt.s1 - pt.s0) * f;
      pt.sp.x = pt.x; pt.sp.y = pt.y - pt.z;
      pt.sp.scale.set(s * pt.aspect, s * pt.sy);
      pt.sp.rotation = pt.rot;
      pt.sp.alpha = pt.a0 * (f < 0.7 ? 1 : 1 - (f - 0.7) / 0.3);
    }
    if (this.frameCount % 90 === 0 && this.particles.length > 300) this.particles = this.particles.filter((q) => q.alive);
    // damage numbers
    for (const n of this.nums) {
      if (!n.alive) continue;
      n.life -= frameDt;
      if (n.life <= 0) { n.alive = false; n.c.visible = false; this.numsActive = Math.max(0, this.numsActive - 1); continue; }
      n.y += n.vy * frameDt;
      n.vy *= Math.exp(-3 * frameDt);
      const age = 0.6 - n.life;
      const pop = age < 0.1 ? 0.6 + age * 6 : 1.2 - Math.min(0.2, (age - 0.1) * 0.8);
      n.c.x = n.x; n.c.y = n.y;
      n.c.scale.set(n.scale * pop);
      n.c.alpha = n.life < 0.25 ? n.life / 0.25 : 1;
    }
    for (const b of this.bolts) {
      if (!b.alive) continue;
      b.life -= frameDt;
      if (b.life <= 0) { b.alive = false; b.g.visible = false; continue; }
      b.g.alpha = b.life / b.max;
    }
    this.renderChestArrows();
    this.renderTeles();
    this.renderArena();
    this.renderLight(frameDt);
    // screen fx
    if (this.flashT > 0) {
      this.flashT -= frameDt;
      this.flashSprite.tint = this.flashColor;
      this.flashSprite.alpha = Math.max(0, Math.min(0.45, this.flashT * 3));
    } else this.flashSprite.alpha = 0;
    if (this.frameCount % 3 === 0) this.grain.tilePosition.set(Math.random() * 256, Math.random() * 256);
    // rain
    if (this.rain.length) {
      for (const r of this.rain) {
        r.y += r.v * frameDt;
        r.x += r.v * 0.25 * frameDt;
        if (r.y > H + 20) { r.y = -Math.random() * 60; r.x = Math.random() * (W + 200) - 200; }
        r.sp.x = r.x; r.sp.y = r.y;
        r.sp.scale.set(1, 0.5 + r.v / 2400);
      }
      if (Math.random() < 0.5) {
        const wx = this.camX + vrange(-this.viewW / 2, this.viewW / 2), wy = this.camY + vrange(-this.viewH / 2, this.viewH / 2);
        this.particle(wx, wy, this.fx.ring, { life: 0.4, s0: 0.03, s1: 0.18, a0: 0.4, tint: 0xbcd4ea });
      }
    }
  }

  /** edge-of-screen arrows pointing at off-screen treasure chests */
  private renderChestArrows() {
    let used = 0;
    const W = this.screenW, H = this.screenH, z = this.zoom;
    for (const pk of this.pickups) {
      if (!pk.alive || pk.kind !== 'chest' || used >= 3) continue;
      const sx = (pk.x - this.camX) * z + W / 2, sy = (pk.y - this.camY) * z + H / 2;
      const m = 48;
      if (sx > m && sx < W - m && sy > 140 && sy < H - m) continue;
      let c = this.chestArrows[used];
      if (!c) {
        c = new Container();
        const arrow = new Graphics();
        arrow.poly([26, 0, 6, -12, 6, 12]).fill(0xffd23a).stroke({ width: 3, color: 0x1b1612 });
        const ic = new Sprite(this.icons.chest || Texture.WHITE);
        ic.anchor.set(0.5);
        ic.scale.set(30 / Math.max(ic.texture.width, ic.texture.height));
        c.addChild(arrow, ic);
        this.screenLayer.addChild(c);
        this.chestArrows.push(c);
      }
      used++;
      const cx = Math.max(m, Math.min(W - m, sx)), cy = Math.max(150, Math.min(H - m, sy));
      const ang = Math.atan2(sy - cy, sx - cx);
      c.visible = true;
      c.x = cx; c.y = cy;
      const arrow = c.children[0] as Graphics;
      arrow.rotation = ang;
      arrow.x = Math.cos(ang) * 4; arrow.y = Math.sin(ang) * 4;
      c.scale.set(1 + 0.08 * Math.sin(this.time * 6));
    }
    for (let i = used; i < this.chestArrows.length; i++) this.chestArrows[i].visible = false;
  }

  private teleDrawn = false;
  private renderTeles() {
    const g = this.teleLayer;
    let any = false;
    for (const t of this.teles) if (t.alive) { any = true; break; }
    if (!any) { if (this.teleDrawn) { g.clear(); this.teleDrawn = false; } return; }
    this.teleDrawn = true;
    g.clear();
    for (const t of this.teles) {
      if (!t.alive) continue;
      const f = Math.min(1, t.t / t.dur);
      const pulse = 0.55 + 0.25 * Math.sin(this.time * 30);
      if (t.kind === 'circle') {
        g.circle(t.x, t.y, t.r).fill({ color: t.color, alpha: 0.12 + 0.08 * pulse });
        g.circle(t.x, t.y, t.r * f).fill({ color: t.color, alpha: 0.28 });
        g.circle(t.x, t.y, t.r).stroke({ width: 3, color: t.color, alpha: 0.8 });
      } else if (t.kind === 'line' && t.subtle) {
        // thin dashed arrow for regular enemies
        const cx = Math.cos(t.ang), cy = Math.sin(t.ang);
        const a = 0.35 + 0.45 * f;
        for (let d = 0; d < t.len - 14; d += 18) {
          g.moveTo(t.x + cx * d, t.y + cy * d).lineTo(t.x + cx * Math.min(t.len - 14, d + 10), t.y + cy * Math.min(t.len - 14, d + 10));
        }
        g.stroke({ width: 3, color: t.color, alpha: a, cap: 'round' });
        const ex = t.x + cx * t.len, ey = t.y + cy * t.len;
        g.poly([ex, ey, ex - cx * 16 - cy * 9, ey - cy * 16 + cx * 9, ex - cx * 16 + cy * 9, ey - cy * 16 - cx * 9]).fill({ color: t.color, alpha: a });
      } else if (t.kind === 'line') {
        const cx = Math.cos(t.ang), cy = Math.sin(t.ang);
        const nx = -cy * t.w / 2, ny = cx * t.w / 2;
        const x2 = t.x + cx * t.len, y2 = t.y + cy * t.len;
        g.poly([t.x + nx, t.y + ny, x2 + nx, y2 + ny, x2 - nx, y2 - ny, t.x - nx, t.y - ny]).fill({ color: t.color, alpha: 0.12 + 0.1 * pulse });
        const x3 = t.x + cx * t.len * f, y3 = t.y + cy * t.len * f;
        g.poly([t.x + nx, t.y + ny, x3 + nx, y3 + ny, x3 - nx, y3 - ny, t.x - nx, t.y - ny]).fill({ color: t.color, alpha: 0.25 });
        g.poly([t.x + nx, t.y + ny, x2 + nx, y2 + ny, x2 - nx, y2 - ny, t.x - nx, t.y - ny]).stroke({ width: 2, color: t.color, alpha: 0.7 });
      } else if (t.kind === 'ring') {
        g.circle(t.x, t.y, t.r).stroke({ width: t.w, color: t.color, alpha: 0.2 + 0.2 * pulse });
      }
    }
  }

  private arenaDrawn = false;
  private renderArena() {
    if (!this.arena) { if (this.arenaDrawn) { this.arenaG.clear(); this.arenaDrawn = false; } return; }
    if (this.arenaDrawn && this.frameCount % 4 !== 0) return;
    const a = this.arena;
    const g = this.arenaG;
    g.clear();
    const col = this.stageDef?.arenaColor ?? 0xe8501c;
    // dark outside
    g.circle(a.x, a.y, a.r + 900).stroke({ width: 1800, color: 0x0d0907, alpha: 0.55 });
    g.circle(a.x, a.y, a.r).stroke({ width: 10, color: 0x1b1612, alpha: 0.9 });
    const n = 48;
    const ph = this.time * 0.4;
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + ph;
      g.circle(a.x + Math.cos(ang) * a.r, a.y + Math.sin(ang) * a.r, 7).fill({ color: col, alpha: 0.9 });
    }
    g.circle(a.x, a.y, a.r).stroke({ width: 3, color: col, alpha: 0.8 });
    this.arenaDrawn = true;
  }

  pushLight(x: number, y: number, r: number, tint: number, a: number) {
    if (this.lightUsed >= 260) return;
    let s = this.lightPool[this.lightUsed];
    if (!s) {
      s = new Sprite(this.fx.light);
      s.anchor.set(0.5);
      s.blendMode = 'add';
      this.lightScene.addChild(s);
      this.lightPool.push(s);
    }
    this.lightUsed++;
    const z = this.zoom / 4;
    s.visible = true;
    s.x = (x - this.camX) * z + this.screenW / 8;
    s.y = (y - this.camY) * z + this.screenH / 8;
    s.scale.set((r * z) / 64);
    s.tint = tint;
    s.alpha = a;
  }

  private renderLight(frameDt: number) {
    // ease darkness
    const target = Math.min(0.95, this.darkTarget + this.extraDark);
    this.darkness += (target - this.darkness) * Math.min(1, frameDt * 2);
    const d = this.darkness;
    // transient lights
    for (let i = this.lights.length - 1; i >= 0; i--) {
      const L = this.lights[i];
      L.life -= frameDt;
      if (L.life <= 0) { this.lights.splice(i, 1); continue; }
      if (d > 0.05) this.pushLight(L.x, L.y, L.r, L.tint, L.life / L.max);
    }
    if (d <= 0.05) {
      this.lightSprite.visible = false;
      this.lightUsed = 0;
      for (const s of this.lightPool) s.visible = false;
      return;
    }
    this.lightSprite.visible = true;
    const p = this.player;
    // player light
    const pr = 230 * (this.player.goldT > 0 || this.player.ignite > 0 ? 1.5 : 1) * (1 - this.blackout * 0.3);
    this.pushLight(this.rig.x, this.rig.y - 40, pr * 2.3, 0xfff0d8, 1);
    this.pushLight(this.rig.x, this.rig.y - 40, pr * 1.1, 0xffffff, 0.5);
    if (this.boss && this.boss.alive) this.pushLight(this.boss.x, this.boss.y - 60, 300, this.boss.def.light ?? 0xb0c0ff, 0.6);
    const amb = this.lightScene.children[0] as Sprite;
    amb.width = this.screenW / 4 + 4;
    amb.height = this.screenH / 4 + 4;
    const c = this.stageDef?.ambient ?? [0.3, 0.3, 0.5];
    // "lights out" (extra darkness) pushes the ambient towards black on top of the stage darkness
    this.blackout += ((this.extraDark > 0 ? 1 : 0) - this.blackout) * Math.min(1, frameDt * 2.5);
    const bo = 1 - 0.78 * this.blackout;
    const ch = (k: number) => Math.max(0, Math.min(255, Math.round(255 * (1 - d + d * c[k]) * bo)));
    const r = ch(0), gg = ch(1), b = ch(2);
    amb.tint = (r << 16) | (gg << 8) | b;
    for (let i = this.lightUsed; i < this.lightPool.length; i++) this.lightPool[i].visible = false;
    this.app.renderer.render({ container: this.lightScene, target: this.lightRT, clear: true });
    this.lightUsed = 0;
    void p;
  }
}

export const PICKUP_ICON: Record<string, string> = {
  coin: 'coin', heal: 'marshmallow', magnet: 'magnet', chest: 'chest', bomb: 'firecracker', freeze: 'watch', goldmatch: 'goldmatch',
};

export function xpFor(level: number): number {
  const L = level - 1;
  return Math.floor(6 + L * 8 + Math.pow(L, 1.8) * 0.55);
}

export function hash3(a: number, b: number, c: number): number {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return h >>> 0;
}
