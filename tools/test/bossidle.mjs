import fs from 'node:fs';
import { chromium } from 'playwright';
const OUT = process.env.OUT || 'test-results';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(process.env.URL || 'http://localhost:4317/games/novaki/');
await page.waitForFunction(() => window.NOVAKI_QA, null, { timeout: 30000 });
for (const st of [1, 2, 3]) {
  await page.evaluate((s) => { window.__novaki.game.running = true; window.NOVAKI_QA.skipTo(s, 'boss'); window.NOVAKI_QA.setInvincible(true); window.__novaki.clearBanners(); window.__novaki.interruptBarks(); const g = window.__novaki.game; g.player.weapons.length = 0; }, st);
  await page.waitForTimeout(2600);
  // freeze the boss in idle: keep the attack cooldown up and park it beside Novaki
  await page.evaluate(() => { const g = window.__novaki.game; const b = g.boss; b.boss.cdT = 99; b.boss.attack = null; g.player.x = g.player.px = b.x + 230; g.player.y = g.player.py = b.y + 20; });
  await page.waitForTimeout(700);
  for (let k = 0; k < 2; k++) {
    await page.evaluate((k) => { const g = window.__novaki.game; g.running = false; const per = g.boss.boss.id === 'duchess' ? 0.16 : g.boss.boss.id === 'baron' ? 0.4 : 0.55; g.time = (2 * Math.floor(g.time / per / 2) + k) * per + per * 0.5; }, k);
    await page.waitForTimeout(150);
    const box = await page.evaluate(() => { const g = window.__novaki.game; const b = g.boss; const sx = (b.x - g.camX) * g.zoom + g.screenW / 2, sy = (b.y - g.camY) * g.zoom + g.screenH / 2; return { x: Math.max(0, sx - 170), y: Math.max(0, sy - 300) }; });
    await page.screenshot({ path: `${OUT}/bi_${st}_${k}.png`, clip: { x: box.x, y: box.y, width: 340, height: 340 } });
  }
}
console.log('ERRORS', errors.join('\n'));
await browser.close();
