// Same seed + same scripted input in two fresh pages -> identical simulation state. Also checks enemy-pool integrity.
import { chromium } from 'playwright';
const URL = process.env.URL || 'http://localhost:4317/games/novaki/';
const browser = await chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan'] });
async function run(seed) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL);
  await page.waitForFunction(() => window.NOVAKI_QA, null, { timeout: 30000 });
  const res = await page.evaluate((seed) => {
    const A = window.__novaki, g = A.game, Q = window.NOVAKI_QA;
    Q.start({ seed });
    Q.setInvincible(true);
    let dup = 0, steps = 0;
    for (let i = 0; i < 60 * 240; i++) {
      if (A.screen === 'levelup') { A.pickChoice(i % 3); continue; }
      if (A.screen === 'chest') { A.navLockUntil = 0; A.closeChest(); continue; }
      if (A.screen !== 'playing') break;
      g.input.x = Math.cos(i / 90); g.input.y = Math.sin(i / 130);
      g.input.dash = i % 400 === 0;
      g.update(1 / 60); steps++;
      if (i % 120 === 0) { const s = new Set(); for (const e of g.enemies) { if (s.has(e)) dup++; s.add(e); } }
    }
    const p = g.player;
    return { steps, t: g.time.toFixed(3), kills: g.stats.kills, lvl: p.level, x: p.x.toFixed(3), y: p.y.toFixed(3), hp: p.hp.toFixed(2), enemies: g.enemyCount(), rng: g.rng.next().toFixed(8), weapons: p.weapons.map((w) => w.id + w.level).join(','), dup };
  }, seed);
  await page.close();
  return { res, errors };
}
const a = await run(1234), b = await run(1234), c = await run(999);
console.log('A', JSON.stringify(a.res));
console.log('B', JSON.stringify(b.res));
console.log('C', JSON.stringify(c.res));
const same = JSON.stringify(a.res) === JSON.stringify(b.res);
console.log(same ? 'DETERMINISTIC: identical' : 'NOT DETERMINISTIC');
console.log('dup enemy entries:', a.res.dup, b.res.dup, c.res.dup);
console.log('ERRORS', [...a.errors, ...b.errors, ...c.errors].join('\n'));
await browser.close();
