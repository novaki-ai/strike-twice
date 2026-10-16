/**
 * window.NOVAKI_QA: the automated-test / judge interface required by the brief.
 * Every function drives the real game through the same code paths a player uses
 * (normal defeat path for killBoss, the real level-up screen for chooseUpgrade, ...).
 */
import type { App } from './main';
import { audio } from './core/audio';
import { RNG } from './core/rng';
import { WEAPONS } from './game/weapons';
import { STAGES } from './game/stages';
import { rollChoices, applyChoice } from './game/upgrades';
import { xpFor } from './game/game';

export function installQA(self: App) {
  const qa = {
    state() {
      const g = self.game;
      const p = g.player;
      const inRun = self.runActive || self.screen === 'gameover' || self.screen === 'victory' || self.screen === 'ending';
      const live = self.runActive && !!p;
      return {
        screen: self.screen === 'ending' ? 'victory' : self.screen,
        stage: inRun && p ? g.stage : 1,
        time: inRun && p ? Math.round(g.time * 100) / 100 : 0,
        player: p && inRun ? { x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10, hp: Math.round(p.hp * 10) / 10, maxHp: Math.round(p.stats.maxHp), level: p.level, xp: Math.round(p.xp * 10) / 10, xpNext: p.xpNext } : { x: 0, y: 0, hp: 0, maxHp: 0, level: 0, xp: 0, xpNext: 0 },
        enemies: live ? g.enemyCount() : 0,
        bossActive: !!(live && g.bossActive && g.boss && g.boss.alive),
        boss: live && g.boss && g.boss.alive && g.boss.boss ? { id: g.boss.boss.id, hp: Math.round(g.boss.hp), maxHp: g.boss.maxHp, phase: g.boss.boss.phase } : null,
        upgrades: p ? [...p.weapons.map((w) => w.id), ...p.passives.map((q) => q.id), ...p.weapons.filter((w) => w.evo).map((w) => 'evo_' + w.id), ...[...g.relics].map((r) => 'relic_' + r)] : [],
        relics: [...g.relics],
        relicChoices: self.screen === 'stageclear' ? self.relicChoices.map((r) => r.id) : [],
        weapons: p ? p.weapons.map((w) => ({ id: w.id, level: w.level, evolved: w.evo })) : [],
        passives: p ? p.passives.map((q) => ({ id: q.id, level: q.level })) : [],
        levelUpChoices: self.screen === 'levelup' ? self.choices.map((c) => ({ id: c.id, kind: c.kind, level: c.level, name: c.name })) : [],
        kills: g.stats?.kills ?? 0,
        flare: Math.round((g.flare || 0) * 100) / 100,
        seed: g.seed,
        fps: Math.round(self.fps),
        perf: { updateMs: Math.round(self.perfUpdate * 100) / 100, renderMs: Math.round(self.perfRender * 100) / 100, bullets: g.bullets?.filter((b) => b.alive).length ?? 0, projectiles: g.projs?.filter((p) => p.alive).length ?? 0, particles: g.particles?.filter((p) => p.alive).length ?? 0 },
        meta: { currency: self.save.coins, unlocks: [...self.save.unlocks], shop: { ...self.save.shop }, stats: { ...self.save.stats } },
      };
    },
    start(options: { seed?: number; weapon?: string; inferno?: boolean } = {}) {
      audio.unlock();
      self.cutsceneToken++;
      self.cutsceneDone = null;
      audio.stopVoice();
      self.hideSubtitle();
      if (self.runActive) { self.runActive = false; self.game.running = false; }
      self.qaRng = null;
      self.startRun({ seed: typeof options.seed === 'number' ? options.seed : undefined, weapon: options.weapon && WEAPONS[options.weapon] ? options.weapon : undefined, inferno: !!options.inferno });
      return true;
    },
    setInvincible(on: boolean) {
      self.qaInvincible = !!on;
      if (self.game.player) self.game.player.invincible = !!on;
      return !!on;
    },
    addXp(amount: number) {
      const g = self.game;
      if (!g.player || !self.runActive) return false;
      const p = g.player;
      p.xp += Number(amount) || 0;
      while (p.xp >= p.xpNext) { p.xp -= p.xpNext; p.level++; p.xpNext = xpFor(p.level); g.pendingLevels++; g.stats.maxLevel = Math.max(g.stats.maxLevel, p.level); }
      if (g.pendingLevels > 0 && self.screen === 'playing') self.openLevelUp();
      return true;
    },
    chooseUpgrade(index: number) {
      if (self.screen === 'stageclear') return self.pickRelic(index);
      return self.pickChoice(index);
    },
    skipTo(stage: number, point: 'start' | 'boss' = 'start') {
      stage = Math.max(1, Math.min(3, Math.floor(stage) || 1));
      if (!self.runActive) qa.start({ seed: self.game.seed || undefined });
      const g = self.game;
      self.pendingClear = null;
      self.relicChoices = [];
      self.transitionToken++;
      if (self.deathTimer) { clearTimeout(self.deathTimer); self.deathTimer = 0; }
      g.rig.reset();
      g.runWon = false;
      g.slowmoT = 0;
      g.hitstop = 0;
      g.freezeT = 0;
      self.cutsceneToken++;
      self.lineQueue.length = 0;
      // catch-up build so later stages are fair when jumping ahead
      const target = stage === 1 ? 1 : stage === 2 ? 12 : 22;
      let guard = 0;
      while (g.player.level < target && guard++ < 60) {
        g.player.level++;
        g.player.xpNext = xpFor(g.player.level);
        const c = rollChoices(g, 1)[0];
        if (c) applyChoice(g, c);
      }
      g.pendingLevels = 0;
      g.player.hp = g.player.stats.maxHp;
      g.running = true;
      g.over = false;
      self.interruptBarks();
      self.clearBanners();
      g.stats.assisted = true;
      g.startStage(stage, point === 'boss');
      if (point === 'boss') {
        audio.playMusic('stage' + stage, STAGES[stage - 1].music, 0.5);
        audio.ambience(STAGES[stage - 1].ambience, stage === 2 ? 0.55 : 0.4);
        g.stageTime = STAGES[stage - 1].duration;
        g.director.startBoss();
      }
      self.acc = 0;
      self.show('playing');
      return true;
    },
    killBoss() {
      const g = self.game;
      if (!g.boss || !g.boss.alive || !g.boss.boss) return false;
      g.boss.boss.entry = 99;
      g.boss.boss.invuln = false;
      g.boss.hp = 0;
      g.boss.boss.dying = true;
      if (self.screen !== 'playing' && ['levelup', 'chest', 'paused'].includes(self.screen)) self.show('playing');
      return true;
    },
    spawnEnemies(count: number) {
      const g = self.game;
      if (!self.runActive || !g.player) return 0;
      const w = g.director.currentWave();
      const types = Object.keys(w.mix);
      // separate seeded stream so QA spawns are reproducible without touching the gameplay RNG
      self.qaRng = self.qaRng || new RNG((g.seed ^ 0x5bd1e995) >>> 0);
      let n = 0;
      count = Math.max(0, Math.min(2000, Math.floor(Number(count) || 0)));
      for (let i = 0; i < count; i++) {
        if (!g.canSpawn()) break;
        const a = self.qaRng.angle();
        const r = 160 + self.qaRng.next() * 420;
        const e = g.spawnEnemy(types[i % types.length], g.player.x + Math.cos(a) * r, g.player.y + Math.sin(a) * r);
        if (e) n++;
      }
      return n;
    },
  };
  (window as any).NOVAKI_QA = qa;
}
