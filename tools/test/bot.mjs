// Fast-forward bot: plays a full run by stepping the simulation directly, logs pacing/balance.
import { chromium } from 'playwright';
const URL = process.env.URL || 'http://localhost:4317/games/novaki/';
const SEED = Number(process.env.SEED || 7);
const INVINCIBLE = process.env.INV === '1';
const browser = await chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + e.stack));
await page.goto(URL);
await page.waitForFunction(() => window.NOVAKI_QA, null, { timeout: 30000 });
await page.evaluate(([seed, inv, weapon]) => { window.NOVAKI_QA.start({ seed, weapon }); window.NOVAKI_QA.setInvincible(inv); }, [SEED, INVINCIBLE, process.env.WEAPON || 'ember']);
let last = '';
const log = [];
for (let iter = 0; iter < 3000; iter++) {
  const r = await page.evaluate((n) => {
    const A = window.__novaki; const g = A.game;
    const out = { events: [] };
    for (let i = 0; i < n; i++) {
      if (A.screen === 'levelup') {
        // prefer evolutions, then upgrades of owned weapons, then new weapons, then passives that evolve owned weapons
        const owned = new Set(g.player.weapons.map((w) => w.id));
        const score = (c) => c.kind === 'evo' ? 100 : c.kind === 'weapon' && !c.isNew ? 50 - c.level : c.kind === 'weapon' ? 40 : c.kind === 'passive' ? 30 : 0;
        let best = 0; A.choices.forEach((c, j) => { if (score(c) > score(A.choices[best])) best = j; });
        out.events.push('pick ' + A.choices[best].kind + ':' + A.choices[best].id + ' L' + A.choices[best].level + ' @' + g.time.toFixed(0));
        A.pickChoice(best);
        continue;
      }
      if (A.screen === 'chest') { A.closeChest(); continue; }
      if (A.screen === 'stageclear') { A.nextStage(); out.events.push('next stage @' + g.time.toFixed(0)); continue; }
      if (A.screen !== 'playing') break;
      const p = g.player;
      let fx = 0, fy = 0, danger = 0;
      for (const e of g.enemies) {
        if (!e.alive || e.prop) continue;
        const dx = p.x - e.x, dy = p.y - e.y; const d2 = dx * dx + dy * dy;
        if (d2 < 200 * 200) { const d = Math.sqrt(d2) || 1; const w = (e.boss ? 3 : 1) * 1 / (d * d) * 4000; fx += dx / d * w; fy += dy / d * w; if (d < 60) danger++; }
      }
      for (const b of g.bullets) {
        if (!b.alive) continue;
        const dx = p.x - b.x, dy = p.y - 26 - b.y; const d2 = dx * dx + dy * dy;
        if (d2 < 140 * 140) { const d = Math.sqrt(d2) || 1; const w = 1 / (d * d) * 6000; fx += dx / d * w; fy += dy / d * w; if (d < 40) danger++; }
      }
      for (const t of g.teles) {
        if (!t.alive || t.kind !== 'circle') continue;
        const dx = p.x - t.x, dy = p.y - t.y; const d = Math.hypot(dx, dy) || 1;
        if (d < t.r + 30) { fx += dx / d * 3; fy += dy / d * 3; }
      }
      // gentle attraction to xp
      let best = null, bd = 1e9;
      for (const q of g.pickups) { if (!q.alive) continue; const d = (q.x - p.x) ** 2 + (q.y - p.y) ** 2; if (d < bd) { bd = d; best = q; } }
      if (best && bd < 400 * 400) { const d = Math.sqrt(bd) || 1; fx += (best.x - p.x) / d * 0.6; fy += (best.y - p.y) / d * 0.6; }
      // drift in a big circle so the bot keeps moving
      const a = g.time * 0.15;
      fx += Math.cos(a) * 0.35; fy += Math.sin(a) * 0.35;
      if (g.arena) { const dx = g.arena.x - p.x, dy = g.arena.y - p.y; const d = Math.hypot(dx, dy); if (d > g.arena.r * 0.6) { fx += dx / d * 1.5; fy += dy / d * 1.5; } }
      const m = Math.hypot(fx, fy) || 1;
      g.input.x = fx / m; g.input.y = fy / m;
      if (danger >= 2) g.input.dash = true;
      g.update(1 / 60);
      if (g.slowmoT > 0) g.slowmoT -= 1 / 60;
      if (g.director && g.director.bossStarted && !g.bossActive) { out.bossDone = true; break; }
      if (!g.running) break;
    }
    out.state = window.NOVAKI_QA.state();
    out.boss = g.boss && g.boss.alive ? { hp: Math.round(g.boss.hp), max: g.boss.maxHp } : null;
    out.dmg = g.player.weapons.map((w) => w.id + (w.evo ? '*' : '') + ':' + w.level + '=' + Math.round(w.dmg)).join(' ');
    out.hp = Math.round(g.player.hp); out.taken = Math.round(g.stats.dmgTaken);
    return out;
  }, 900);
  for (const e of r.events) if (!e.startsWith('pick')) console.log(e);
  const s = r.state;
  const line = `taken=${r.taken} t=${s.time.toFixed(0)} st=${s.stage} scr=${s.screen} lv=${s.player.level} hp=${r.hp}/${s.player.maxHp} foes=${s.enemies} kills=${s.kills} boss=${r.boss ? r.boss.hp + '/' + r.boss.max : '-'}`;
  if (iter % 4 === 0) console.log(line);
  if (r.bossDone) { console.log('BOSS DOWN at', s.time.toFixed(0), ' weapons:', r.dmg); await page.waitForTimeout(4700); }
  if (s.screen === 'gameover' || s.screen === 'victory' || s.screen === 'menu') { console.log('END', s.screen, line, '\n', r.dmg); break; }
  if (['gameover', 'victory'].includes(s.screen)) break;
  await page.waitForTimeout(5);
  if (!r.state || s.screen === 'loadout') break;
}
const fin = await page.evaluate(() => window.NOVAKI_QA.state());
console.log('FINAL', JSON.stringify({ screen: fin.screen, stage: fin.stage, time: fin.time, level: fin.player.level, upgrades: fin.upgrades, meta: fin.meta.currency }));
console.log('ERRORS:', errors.join('\n'));
await browser.close();
