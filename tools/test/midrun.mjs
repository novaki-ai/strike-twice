import { chromium } from 'playwright';
const OUT = process.env.OUT;
const browser = await chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(process.env.URL || 'http://localhost:4317/games/novaki/');
await page.waitForFunction(() => window.NOVAKI_QA, null, { timeout: 30000 });
await page.evaluate(() => {
  const Q = window.NOVAKI_QA; Q.skipTo(2, 'start'); Q.setInvincible(true);
  const A = window.__novaki, g = A.game;
  g.player.weapons.length = 0;
  for (const [id, evo] of [['ember', true], ['ring', false], ['spark', true], ['whip', false], ['cracker', false]]) { const w = g.addWeapon(id); w.level = evo ? 8 : 6; w.evo = evo; }
  g.player.xpNext = 1e12;
  // fast-forward the director to the busiest wave
  for (let i = 0; i < 60 * 150; i++) { if (A.screen !== 'playing') { if (A.screen === 'chest') { A.navLockUntil = 0; A.closeChest(); } else break; } g.input.x = Math.cos(i / 200); g.input.y = Math.sin(i / 260); g.update(1 / 60); }
});
await page.keyboard.down('KeyD'); await page.waitForTimeout(1500); await page.keyboard.up('KeyD');
await page.screenshot({ path: OUT + '/midrun.png' });
console.log(JSON.stringify(await page.evaluate(() => { const s = window.NOVAKI_QA.state(); return { t: s.time, enemies: s.enemies, fps: s.fps, perf: s.perf }; })));
console.log('ERRORS', errors.join('\n'));
await browser.close();
