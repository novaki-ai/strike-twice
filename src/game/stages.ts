/** Stage definitions and the director that runs waves, events and the boss trigger. */
import type { Game } from './game';
import { audio } from '../core/audio';
import { BOSSES, startBossFight } from './bosses';

export interface Wave {
  t: number; // start time
  rate: number; // spawns per second
  max: number; // max alive
  mix: Record<string, number>;
}

export interface StageEvent {
  t: number;
  kind: 'swarm' | 'ring' | 'elite' | 'warning' | 'prop' | 'gilded';
  type?: string;
  n?: number;
  text?: string;
  done?: boolean;
}

export interface StageDef {
  id: number;
  name: string;
  chapter: string;
  subtitle: string;
  tile: string;
  groundTint?: number;
  props: { tex: string; size: number; flat?: boolean; lamp?: [number, number][]; glow?: number }[];
  propTint?: number;
  darkness: number;
  ambient: [number, number, number];
  rain?: boolean;
  music: string[];
  bossMusic: string[];
  hpMul: number;
  dmgMul: number;
  duration: number;
  boss: string;
  arenaColor: number;
  waves: Wave[];
  events: StageEvent[];
  propEnemy: string;
  voice: string;
  ambience: string;
}

export const STAGES: StageDef[] = [
  {
    id: 1, name: 'The Mothwood', chapter: 'Chapter One', subtitle: 'Where every little light draws hungry wings',
    tile: 'tile_forest', groundTint: 0xf4efe0,
    props: [
      { tex: 'p1_tree', size: 150 }, { tex: 'p1_shrooms', size: 70, glow: 0x7ff0e0 }, { tex: 'p1_boulder', size: 64 },
      { tex: 'p1_log', size: 52 }, { tex: 'p1_fern', size: 60 }, { tex: 'p1_tree', size: 170 }, { tex: 'p1_fern', size: 50 }, { tex: 'p1_shrooms', size: 60, glow: 0x7ff0e0 },
      { tex: 'd1_moss', size: 100, flat: true }, { tex: 'd1_leaves', size: 85, flat: true }, { tex: 'd1_ring', size: 115, flat: true },
    ],
    darkness: 0.22, ambient: [0.35, 0.55, 0.55], music: ['stage1_a', 'stage1_b', 'stage1_c'], bossMusic: ['boss1', 'boss1_b'],
    hpMul: 1, dmgMul: 0.9, duration: 270, boss: 'duchess', arenaColor: 0xd9a35a, propEnemy: 'lanternprop', voice: 'chapter1', ambience: 'forest',
    waves: [
      { t: 0, rate: 1.2, max: 40, mix: { mold: 3, moth: 1 } },
      { t: 35, rate: 2.3, max: 75, mix: { mold: 3, moth: 2.5 } },
      { t: 80, rate: 3.2, max: 120, mix: { mold: 2, moth: 3, toadstool: 1.5 } },
      { t: 140, rate: 3.3, max: 130, mix: { mold: 2.6, moth: 2, toadstool: 1.2, beetle: 0.85 } },
      { t: 200, rate: 3.9, max: 160, mix: { mold: 2.6, moth: 2, toadstool: 1, beetle: 0.85, stump: 0.75 } },
    ],
    events: [
      { t: 60, kind: 'swarm', type: 'moth', n: 16 },
      { t: 95, kind: 'gilded' },
      { t: 118, kind: 'elite', type: 'beetle' },
      { t: 175, kind: 'ring', type: 'mold', n: 30 },
      { t: 200, kind: 'elite', type: 'stump' },
      { t: 238, kind: 'swarm', type: 'moth', n: 22 },
      { t: 255, kind: 'warning', text: 'Something flutters in the dark...' },
    ],
  },
  {
    id: 2, name: 'Drizzleport', chapter: 'Chapter Two', subtitle: 'It has not stopped raining in a hundred years',
    tile: 'tile_docks', groundTint: 0xe4e8f0,
    props: [
      { tex: 'p2_lamp', size: 130, lamp: [[0, 0.86]] }, { tex: 'p2_crates', size: 80 }, { tex: 'p2_anchor', size: 62 },
      { tex: 'p2_hydrant', size: 50 }, { tex: 'p2_bollard', size: 60 }, { tex: 'p2_lamp', size: 120, lamp: [[0, 0.86]] }, { tex: 'p2_lamp', size: 125, lamp: [[0, 0.86]] },
      { tex: 'd2_puddle', size: 120, flat: true }, { tex: 'd2_manhole', size: 72, flat: true }, { tex: 'd2_net', size: 95, flat: true },
    ],
    darkness: 0.4, ambient: [0.3, 0.4, 0.75], rain: true, music: ['stage2_a', 'stage2_b', 'stage2_c'], bossMusic: ['boss2', 'boss2_b'],
    hpMul: 2.3, dmgMul: 1.25, duration: 300, boss: 'baron', arenaColor: 0x7fb6e6, propEnemy: 'barrelprop', voice: 'chapter2', ambience: 'rain',
    waves: [
      { t: 0, rate: 1.9, max: 70, mix: { raindrop: 3, slime: 1 } },
      { t: 45, rate: 2.4, max: 95, mix: { raindrop: 2.6, slime: 2, frog: 1.5 } },
      { t: 105, rate: 2.9, max: 120, mix: { raindrop: 2, slime: 2, frog: 1.5, balloon: 1.5, cloud: 0.8 } },
      { t: 170, rate: 3.5, max: 150, mix: { raindrop: 2, slime: 1.5, frog: 1.4, balloon: 2, cloud: 1, wateringcan: 0.8 } },
      { t: 235, rate: 4.2, max: 185, mix: { raindrop: 2.5, slime: 1.5, frog: 1.5, balloon: 2, cloud: 1.1, wateringcan: 0.9 } },
    ],
    events: [
      { t: 70, kind: 'swarm', type: 'raindrop', n: 26 },
      { t: 125, kind: 'elite', type: 'frog' },
      { t: 160, kind: 'gilded' },
      { t: 185, kind: 'ring', type: 'slime', n: 20 },
      { t: 225, kind: 'elite', type: 'wateringcan' },
      { t: 260, kind: 'swarm', type: 'balloon', n: 16 },
      { t: 285, kind: 'warning', text: 'Thunder rumbles... a top hat appears in the clouds' },
    ],
  },
  {
    id: 3, name: "The Snuffer's Spire", chapter: 'Chapter Three', subtitle: 'Cold wax, black smoke, and not one candle burning',
    tile: 'tile_spire', groundTint: 0xe0d8e8,
    props: [
      { tex: 'p3_candelabra', size: 110, lamp: [[-0.33, 0.9], [0, 0.97], [0.33, 0.9]] }, { tex: 'p3_pillar', size: 120 }, { tex: 'p3_gargoyle', size: 80 },
      { tex: 'p3_brazier', size: 60, lamp: [[0, 0.78]] }, { tex: 'p3_books', size: 56 }, { tex: 'p3_candelabra', size: 95, lamp: [[-0.33, 0.9], [0, 0.97], [0.33, 0.9]] }, { tex: 'p3_brazier', size: 64, lamp: [[0, 0.78]] },
      { tex: 'd3_wax', size: 85, flat: true }, { tex: 'd3_rug', size: 140, flat: true }, { tex: 'd3_bones', size: 95, flat: true },
    ],
    darkness: 0.58, ambient: [0.3, 0.22, 0.5], music: ['stage3_a', 'stage3_b', 'stage3_c'], bossMusic: ['boss3'],
    hpMul: 4.6, dmgMul: 1.4, duration: 300, boss: 'snuffer', arenaColor: 0xb48aff, propEnemy: 'candleprop', voice: 'chapter3', ambience: 'tower',
    waves: [
      { t: 0, rate: 2.2, max: 80, mix: { waxghost: 2, snufflet: 2 } },
      { t: 50, rate: 2.8, max: 110, mix: { waxghost: 2, snufflet: 2, wisp: 1.4 } },
      { t: 115, rate: 3.4, max: 140, mix: { waxghost: 2, snufflet: 2, wisp: 1.4, wraith: 1.4, knight: 0.4 } },
      { t: 185, rate: 4.2, max: 180, mix: { waxghost: 1.8, snufflet: 2, wisp: 1.4, wraith: 1.6, knight: 0.8, moth: 1 } },
      { t: 245, rate: 4.6, max: 200, mix: { waxghost: 2, snufflet: 2, wisp: 1.5, wraith: 1.6, knight: 0.9, raindrop: 1 } },
    ],
    events: [
      { t: 80, kind: 'swarm', type: 'snufflet', n: 24 },
      { t: 110, kind: 'gilded' },
      { t: 140, kind: 'elite', type: 'knight' },
      { t: 200, kind: 'ring', type: 'wraith', n: 22 },
      { t: 240, kind: 'elite', type: 'wisp' },
      { t: 268, kind: 'swarm', type: 'waxghost', n: 24 },
      { t: 285, kind: 'warning', text: 'The candles gutter. The Snuffer is coming.' },
    ],
  },
];

export class StageDirector {
  g: Game;
  def: StageDef;
  acc = 0;
  propT = 12;
  bossStarted = false;
  events: StageEvent[];
  wildfire: ((x: number, y: number) => void) | null = null;
  onDash: (() => void) | null = null;
  trickle = 0;

  constructor(g: Game, def: StageDef) {
    this.g = g;
    this.def = def;
    this.events = def.events.map((e) => ({ ...e, done: false }));
    // weapon hooks (evolutions with global side effects)
    this.wildfire = (x, y) => {
      const w = g.player.weapons.find((q) => q.id === 'trail' && q.evo);
      if (!w) return;
      if (g.rng.next() < 0.35) {
        const z = g.spawnZone({ kind: 1, w, x, y, r: 30, dmg: 8, tick: 0.4, life: 1.6, burn: 6, data: { pool: 'fireA', pool2: 'fireB', light: 0xff9a40 } });
        z.sp = g.pool('fireA', g.addLayer, g.fx.glow); z.sp.anchor.set(0.5); z.sp.tint = 0xff7a2a;
        z.sp2 = g.pool('fireB', g.projLayer, g.fx.flame); z.sp2.anchor.set(0.5, 0.9);
      }
    };
    this.onDash = () => {
      const w = g.player.weapons.find((q) => q.id === 'trail' && q.evo);
      if (!w) return;
      const p = g.player;
      for (let i = 0; i < 6; i++) {
        const x = p.x + p.dashX * i * 22, y = p.y + p.dashY * i * 22;
        const z = g.spawnZone({ kind: 1, w, x, y, r: 30, dmg: 12, tick: 0.4, life: 2.2, burn: 8, data: { pool: 'fireA', pool2: 'fireB', light: 0xff9a40 } });
        z.sp = g.pool('fireA', g.addLayer, g.fx.glow); z.sp.anchor.set(0.5); z.sp.tint = 0xff7a2a;
        z.sp2 = g.pool('fireB', g.projLayer, g.fx.flame); z.sp2.anchor.set(0.5, 0.9);
      }
    };
  }

  currentWave(): Wave {
    const t = this.g.stageTime;
    let w = this.def.waves[0];
    for (const x of this.def.waves) if (t >= x.t) w = x;
    return w;
  }

  update(dt: number) {
    const g = this.g;
    const t = g.stageTime;
    if (g.bossActive || this.bossStarted) {
      // light trickle of fodder during boss fights (keeps XP flowing)
      if (g.boss && g.boss.alive && !g.boss.boss?.dying) {
        this.trickle += dt;
        if (this.trickle > 2.2 && g.enemyCount() < 30) {
          this.trickle = 0;
          const w = this.def.waves[0];
          const type = g.rng.weighted(Object.keys(w.mix), (k) => w.mix[k]);
          const sp = g.spawnPoint();
          g.spawnEnemy(type, sp.x, sp.y);
        }
      }
      return;
    }
    // timed events
    for (const ev of this.events) {
      if (ev.done || t < ev.t) continue;
      ev.done = true;
      this.runEvent(ev);
    }
    // continuous spawns
    const w = this.currentWave();
    const next = this.def.waves[this.def.waves.indexOf(w) + 1];
    const span = next ? next.t - w.t : 60;
    const f = Math.min(1, (t - w.t) / span);
    const rate = w.rate * (1 + f * 0.35);
    const alive = g.enemyCount();
    if (alive < w.max) {
      this.acc += rate * dt;
      // spawn faster if the field is nearly empty
      if (alive < w.max * 0.25) this.acc += rate * dt;
      while (this.acc >= 1) {
        this.acc -= 1;
        let type = g.rng.weighted(Object.keys(w.mix), (k) => w.mix[k]);
        // support/ranged types are capped so they can't pile up
        const cap: Record<string, number> = { cloud: 5, wateringcan: 4, wisp: 7 };
        if (cap[type] !== undefined) {
          let n = 0;
          for (const o of g.enemies) if (o.alive && o.type === type) n++;
          if (n >= cap[type]) type = Object.keys(w.mix)[0];
        }
        const sp = g.spawnPoint();
        // small clusters for swarmers
        const cluster = type === 'moth' || type === 'raindrop' || type === 'snufflet' ? 2 : 1;
        for (let i = 0; i < cluster; i++) g.spawnEnemy(type, sp.x + g.rr(-20, 20), sp.y + g.rr(-20, 20));
      }
    }
    // destructible props
    this.propT -= dt;
    if (this.propT <= 0) {
      this.propT = 20;
      let props = 0;
      for (const e of g.enemies) if (e.alive && e.prop) props++;
      if (props < 3) {
        const a = g.rng.angle();
        const r = g.rng.range(260, 380);
        g.spawnEnemy(this.def.propEnemy, g.player.x + Math.cos(a) * r, g.player.y + Math.sin(a) * r);
      }
    }
    if (t >= this.def.duration) this.startBoss();
  }

  runEvent(ev: StageEvent) {
    const g = this.g;
    const p = g.player;
    switch (ev.kind) {
      case 'swarm': {
        // a column of enemies charging across the screen
        const a = g.rng.angle();
        const n = ev.n || 20;
        const dx = Math.cos(a), dy = Math.sin(a);
        const startR = Math.max(g.viewW, g.viewH) * 0.6;
        for (let i = 0; i < n; i++) {
          const off = (i - n / 2) * 26;
          const x = p.x - dx * startR - dy * off + g.rr(-15, 15);
          const y = p.y - dy * startR + dx * off + g.rr(-15, 15);
          const e = g.spawnEnemy(ev.type!, x, y);
          if (e) { e.state = 7; e.tx = dx * 165; e.ty = dy * 165; e.kbRes = 0.3; }
        }
        g.hooks.toast('A swarm is passing through - get out of the way!', 'warn');
        break;
      }
      case 'ring': {
        const n = ev.n || 24;
        const R = Math.max(g.viewW, g.viewH) * 0.55;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          g.spawnEnemy(ev.type!, p.x + Math.cos(a) * R, p.y + Math.sin(a) * R * 0.8);
        }
        g.hooks.toast("You're surrounded!", 'warn');
        break;
      }
      case 'elite': {
        const sp = g.spawnPoint();
        g.spawnEnemy(ev.type!, sp.x, sp.y, { elite: true });
        g.hooks.toast('An elite foe appears - it carries treasure!', 'gold');
        break;
      }
      case 'gilded': {
        // appears on screen, a little away from Novaki, and runs
        const a = g.rng.angle();
        const r = Math.min(g.viewW, g.viewH) * 0.32;
        g.spawnEnemy('goldmoth', p.x + Math.cos(a) * r, p.y + Math.sin(a) * r * 0.8);
        g.hooks.toast('A gilded moth! Catch it before it flies off!', 'gold');
        audio.sfx('buzz', 0.4, 1.8);
        break;
      }
      case 'warning':
        g.hooks.warning(ev.text || 'Boss incoming');
        audio.sfx('warning', 0.6);
        audio.preloadMusic(this.def.bossMusic);
        break;
      case 'prop':
        break;
    }
  }

  startBoss() {
    if (this.bossStarted) return;
    this.bossStarted = true;
    const g = this.g;
    // clear the field: the horde scatters before the boss
    for (const e of g.enemies) if (e.alive && !e.boss) g.despawn(e, true);
    g.clearBullets(false);
    startBossFight(g, this.def.boss);
    void BOSSES;
  }
}
