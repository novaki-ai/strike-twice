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
      // horde centroid (for circling)
      { let sx = 0, sy = 0, n = 0; for (const e of g.enemies) { if (!e.alive || e.prop) continue; const d = Math.hypot(e.x - p.x, e.y - p.y); if (d < 450) { sx += e.x; sy += e.y; n++; } } if (n > 3) { g.__cx = sx / n; g.__cy = sy / n; } else { g.__cx = undefined; } }
      // sample 16 directions, score danger 0.35s ahead
      let bestDir = -1, bestScore = 1e9, danger = 0;
      const look = 0.35, spd = p.stats.speed;
      for (let k = -1; k < 16; k++) {
        const ax = k < 0 ? 0 : Math.cos(k / 16 * Math.PI * 2), ay = k < 0 ? 0 : Math.sin(k / 16 * Math.PI * 2);
        const fx = p.x + ax * spd * look, fy = p.y + ay * spd * look;
        let s = 0;
        for (const e of g.enemies) {
          if (!e.alive || e.prop || e.intangible) continue;
          const dx = e.x - p.x, dy = e.y - p.y; const d0 = Math.hypot(dx, dy) || 1;
          if (d0 > 220) continue;
          const ex = e.x - dx / d0 * Math.min(d0, e.speed * look), ey = e.y - dy / d0 * Math.min(d0, e.speed * look);
          const d = Math.hypot(ex - fx, ey - fy);
          const rr = e.r + 16;
          s += (e.boss ? 4 : e.elite ? 2 : 1) * (d < rr ? 50 : 1) * 2000 / (d * d + 100);
        }
        for (const bl of g.bullets) {
          if (!bl.alive) continue;
          const bx = bl.x + bl.vx * look, by = bl.y + bl.vy * look;
          const d = Math.hypot(bx - fx, by - (fy - 26));
          if (d > 200) continue;
          s += (d < bl.r + 14 ? 60 : 1) * 1800 / (d * d + 60);
        }
        for (const t of g.teles) {
          if (!t.alive) continue;
          if (t.kind === 'circle') { const d = Math.hypot(t.x - fx, t.y - fy); if (d < t.r + 18) s += 80; }
          else if (t.kind === 'line') {
            const cx = Math.cos(t.ang), cy = Math.sin(t.ang); const rx = fx - t.x, ry = fy - t.y;
            const al = rx * cx + ry * cy, pe = Math.abs(-rx * cy + ry * cx);
            if (al > 0 && al < t.len && pe < t.w / 2 + 16) s += 80;
          }
        }
        if (g.arena) { const d = Math.hypot(fx - g.arena.x, fy - g.arena.y); if (d > g.arena.r * 0.75) s += (d - g.arena.r * 0.75) * 0.5; }
        // pickups pull
        for (const q of g.pickups) { if (!q.alive) continue; const d = Math.hypot(q.x - fx, q.y - fy); if (d < 320) s -= (q.kind === 'heal' && p.hp < p.stats.maxHp * 0.6 ? 6 : q.kind === 'chest' ? 5 : 1.2) * 30 / (d + 30); }
        // prefer continuing direction a bit (smooth kiting) and circling around the horde
        if (k >= 0) {
          s -= 0.15 * (ax * (g.__botX || 0) + ay * (g.__botY || 0));
          if (g.__cx !== undefined) {
            const rx = p.x - g.__cx, ry = p.y - g.__cy; const rl = Math.hypot(rx, ry) || 1;
            const tx = -ry / rl, ty = rx / rl; // tangent
            s -= 0.6 * (ax * tx + ay * ty);
            const want = 230; const radial = (want - rl) / want; // push out if too close, in if too far
            s -= 0.5 * radial * (ax * rx / rl + ay * ry / rl);
          }
        }
        if (s < bestScore) { bestScore = s; bestDir = k; }
        if (k < 0) danger = s;
      }
      const ax = bestDir < 0 ? 0 : Math.cos(bestDir / 16 * Math.PI * 2), ay = bestDir < 0 ? 0 : Math.sin(bestDir / 16 * Math.PI * 2);
      g.__botX = ax; g.__botY = ay;
      g.input.x = ax; g.input.y = ay;
      if (bestScore > 40) g.input.dash = true;
      g.update(1 / 60);
      if (g.slowmoT > 0) g.slowmoT -= 1 / 60;
      if (g.director && g.director.bossStarted && !g.bossActive) { out.bossDone = true; break; }
      if (!g.running) break;
    }
    out.state = window.NOVAKI_QA.state();
    out.boss = g.boss && g.boss.alive ? { hp: Math.round(g.boss.hp), max: g.boss.maxHp } : null;
    out.dmg = g.player.weapons.map((w) => w.id + (w.evo ? '*' : '') + ':' + w.level + '=' + Math.round(w.dmg)).join(' ');
    out.hp = Math.round(g.player.hp); out.taken = Math.round(g.stats.dmgTaken); out.by = JSON.stringify(Object.fromEntries(Object.entries(g.stats.dmgBy).map(([k, v]) => [k, Math.round(v)])));
    return out;
  }, 900);
  for (const e of r.events) if (!e.startsWith('pick')) console.log(e);
  const s = r.state;
  const line = `taken=${r.taken} t=${s.time.toFixed(0)} st=${s.stage} scr=${s.screen} lv=${s.player.level} hp=${r.hp}/${s.player.maxHp} foes=${s.enemies} kills=${s.kills} boss=${r.boss ? r.boss.hp + '/' + r.boss.max : '-'}`;
  if (iter % 4 === 0) console.log(line);
  if (r.bossDone) { console.log('BOSS DOWN at', s.time.toFixed(0), ' weapons:', r.dmg, ' dmgBy:', r.by); await page.waitForTimeout(4700); }
  if (s.screen === 'gameover' || s.screen === 'victory' || s.screen === 'menu') { console.log('END', s.screen, line, '\n', r.dmg, '\n dmgBy', r.by); break; }
  if (['gameover', 'victory'].includes(s.screen)) break;
  await page.waitForTimeout(5);
  if (!r.state || s.screen === 'loadout') break;
}
const fin = await page.evaluate(() => window.NOVAKI_QA.state());
console.log('FINAL', JSON.stringify({ screen: fin.screen, stage: fin.stage, time: fin.time, level: fin.player.level, upgrades: fin.upgrades, meta: fin.meta.currency }));
console.log('ERRORS:', errors.join('\n'));
await browser.close();
